"""Build device-targeted test containers from pinned, unchanged upstream split APKs."""
import hashlib
import json
import os
import re
import subprocess
import sys
import zipfile
from pathlib import Path

RELEASES = {
    'current': ('4.1.1', '390cd6d35ca8429bd4c7f77727ee909b2c99e4f830237cd5c1940195b7b189f2', 'config.vi'),
    'legacy': ('2.5.22-PRE', 'ad6081ae579491d6e2b1eb93b415d0985e963dd733a3bad8b201e34160462f43', 'feat_docs'),
}
PACKAGE = 'io.github.muntashirakon.AppManager'
PARTS = ('base', 'config.en', 'config.x86_64', 'config.xhdpi')


def verified_signer(signer_jar, apk):
    check = subprocess.run(['java', '-jar', str(signer_jar), 'verify', '--print-certs', str(apk)],
                           capture_output=True, text=True, check=True)
    signers = re.findall(r'^Signer #\d+ certificate SHA-256 digest: ([0-9a-f]{64})$', check.stdout, re.M)
    if len(signers) != 1:
        raise ValueError('Expected a single verified signer for ' + apk.name)
    return signers[0]


def package_version(tool, apk):
    check = subprocess.run([str(tool), 'dump', 'badging', str(apk)], capture_output=True, check=True)
    header = next((line for line in check.stdout.decode('utf-8').splitlines() if line.startswith('package: ')), '')
    values = dict(re.findall(r"(\w+)='([^']*)'", header))
    if values.get('name') != PACKAGE or not values.get('versionCode') or values.get('versionName') != '4.1.1':
        raise ValueError('Unexpected App Manager identity for ' + apk.name)
    return values['name'], values['versionCode'], values['versionName'], values.get('versionCodeMajor', '0')


def prepare(directory, signer_jar, compare=False):
    version, digest, extra = RELEASES[os.environ.get('ASI_SPLIT_FIXTURE', 'current')]
    parts = (*PARTS, extra)
    source = directory / 'upstream.apks'
    if hashlib.sha256(source.read_bytes()).hexdigest() != digest:
        raise ValueError('Upstream AppManager archive digest differs')
    manifest = {'xapk_version': 2, 'package_name': PACKAGE, 'version_name': version,
                'split_apks': [{'file': part + '.apk', 'id': part} for part in parts]}
    certificates = set()
    with (zipfile.ZipFile(source) as upstream,
          zipfile.ZipFile(directory / 'device.apks', 'x') as apks,
          zipfile.ZipFile(directory / 'device.xapk', 'x') as xapk):
        for part in parts:
            name = part + '.apk'
            payload = upstream.read(name)
            apk = directory / name
            with apk.open('xb') as target:
                target.write(payload)
            certificates.add(verified_signer(signer_jar, apk))
            for container in (apks, xapk):
                container.writestr(zipfile.ZipInfo(name), payload)
        if len(certificates) != 1:
            raise ValueError('The APK signers differ across splits')
        xapk.writestr(zipfile.ZipInfo('manifest.json'), json.dumps(manifest))
    certificate = certificates.pop()
    if compare:
        universal = directory / 'universal.apk'
        if hashlib.sha256(universal.read_bytes()).hexdigest() != '2540d6d9352acd8b04d6210140630a380abb1bc46ad4745c89ad97603dee3c40':
            raise ValueError('Unexpected universal APK digest')
        aapt = signer_jar.parent.parent / ('aapt2.exe' if os.name == 'nt' else 'aapt2')
        identity = package_version(aapt, universal)
        if verified_signer(signer_jar, universal) != certificate or package_version(aapt, directory / 'base.apk') != identity:
            raise ValueError('Universal and split fixtures differ in signer or package version')
        print('Matched universal and split fixtures', identity)
    print('Verified five upstream APKs. Signer SHA-256', certificate)


if __name__ == '__main__':
    prepare(Path(sys.argv[1]), Path(os.environ['ANDROID_HOME']) / 'build-tools/35.0.0/lib/apksigner.jar',
            compare='--compare-universal' in sys.argv[2:])
