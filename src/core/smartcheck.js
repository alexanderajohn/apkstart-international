'use strict';
/**
 * ApkStart SmartCheck — offline, read-only APK preflight.
 *
 * Static metadata and SHA-256 are NOT a virus scan, signature verification,
 * Play Protect verdict or a guarantee of runtime compatibility.
 * Do not execute an APK or provision the Android runtime from here.
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { ZipFile } = require('./zip');
const { parseApk } = require('./apk');
const { parseAxml, attrValue, children } = require('./axml');

const GUEST_API = 34; // Current fork targets Android 14.
const MANIFEST_LIMIT = 4 * 1024 * 1024;
const SENSITIVE_PERMISSIONS = new Set([
  'android.permission.CAMERA',
  'android.permission.RECORD_AUDIO',
  'android.permission.READ_CONTACTS',
  'android.permission.WRITE_CONTACTS',
  'android.permission.GET_ACCOUNTS',
  'android.permission.READ_SMS',
  'android.permission.SEND_SMS',
  'android.permission.RECEIVE_SMS',
  'android.permission.READ_CALL_LOG',
  'android.permission.WRITE_CALL_LOG',
  'android.permission.ACCESS_FINE_LOCATION',
  'android.permission.ACCESS_BACKGROUND_LOCATION',
  'android.permission.READ_MEDIA_IMAGES',
  'android.permission.READ_MEDIA_VIDEO',
  'android.permission.READ_EXTERNAL_STORAGE',
  'android.permission.MANAGE_EXTERNAL_STORAGE',
  'android.permission.SYSTEM_ALERT_WINDOW',
  'android.permission.REQUEST_INSTALL_PACKAGES',
  'android.permission.QUERY_ALL_PACKAGES',
]);

async function sha256File(file) {
  const hash = crypto.createHash('sha256');
  for await (const chunk of fs.createReadStream(file, { highWaterMark: 1024 * 1024 })) {
    hash.update(chunk);
  }
  return hash.digest('hex');
}

function readManifestSignals(zip) {
  const entry = zip.entries.get('AndroidManifest.xml');
  if (!entry) throw new Error('Not a single APK: AndroidManifest.xml is missing');
  if (entry.uncompSize > MANIFEST_LIMIT || entry.compSize > MANIFEST_LIMIT) {
    throw new Error('Android manifest is too large for safe preview analysis');
  }
  const manifest = parseAxml(zip.read('AndroidManifest.xml'));
  const permissionNodes = [
    ...children(manifest, 'uses-permission'),
    ...children(manifest, 'uses-permission-sdk-23'),
    ...children(manifest, 'uses-permission-sdk-m'),
  ];
  const permissions = [...new Set(permissionNodes
    .map((node) => attrValue(node, 'name'))
    .filter((value) => typeof value === 'string' && value.length <= 160))].sort();
  const features = [...new Set(children(manifest, 'uses-feature')
    .filter((node) => attrValue(node, 'required') !== false)
    .map((node) => attrValue(node, 'name'))
    .filter((value) => typeof value === 'string' && value.length <= 160))].sort();
  return { permissions, features };
}

/** Detect ZIP certificate files or APK Signing Block presence; never verify or trust them. */
function signingEvidence(zip) {
  const v1Files = zip.names().some((name) => /^META-INF\/[^/]+\.(?:RSA|DSA|EC)$/i.test(name));
  let signingBlock = false;
  const tailSize = Math.min(zip.size, 65557);
  const tail = Buffer.alloc(tailSize);
  fs.readSync(zip.fd, tail, 0, tailSize, zip.size - tailSize);
  for (let i = tail.length - 22; i >= 0; i -= 1) {
    if (tail.readUInt32LE(i) !== 0x06054b50) continue;
    const commentLength = tail.readUInt16LE(i + 20);
    if (i + 22 + commentLength !== tail.length) continue;
    const cdOffset = tail.readUInt32LE(i + 16);
    if (cdOffset !== 0xffffffff && cdOffset >= 16 && cdOffset <= zip.size) {
      const magic = Buffer.alloc(16);
      fs.readSync(zip.fd, magic, 0, magic.length, cdOffset - 16);
      signingBlock = magic.toString('ascii') === 'APK Sig Block 42';
    }
    break;
  }
  return {
    evidence: signingBlock ? 'apk-signing-block' : v1Files ? 'v1-certificate-files' : 'not-detected',
    v1Files,
    signingBlock,
    verified: false,
  };
}

function assessCompatibility({ minSdk, targetSdk, abis, sensitivePermissions, features }) {
  const findings = [];
  let level = 'ready'; // "No obvious static blocker", NOT "APK is safe".
  const caution = (code) => { findings.push(code); if (level === 'ready') level = 'caution'; };
  if (minSdk > GUEST_API) {
    level = 'blocked';
    findings.push('MIN_SDK_ABOVE_RUNTIME');
  }
  if (!targetSdk || targetSdk < 23) caution('OLD_OR_UNKNOWN_TARGET_SDK');
  const lower = abis.map((abi) => String(abi).toLowerCase());
  if (lower.length > 0 && !lower.some((abi) => abi === 'x86' || abi === 'x86_64')) {
    caution(lower.every((abi) => /^(?:arm|armeabi|arm64)/.test(abi))
      ? 'ARM_TRANSLATION_REQUIRED' : 'UNSUPPORTED_NATIVE_ABI');
  }
  if (sensitivePermissions.length) caution('SENSITIVE_PERMISSIONS');
  if (features.length) caution('REQUIRES_DEVICE_FEATURES');
  return { level, findings };
}

async function inspectApk(filePath) {
  if (typeof filePath !== 'string' || !/\.(?:apk|apks|xapk)$/i.test(filePath)) {
    throw new Error('Please select an .apk, .apks or .xapk file');
  }
  const stat = fs.statSync(filePath);
  if (!stat.isFile() || stat.size < 1024) throw new Error('File is not a valid Android package');
  const fileName = path.basename(filePath);
  const sha256 = await sha256File(filePath);
  if (!/\.apk$/i.test(filePath)) {
    return {
      format: path.extname(filePath).slice(1).toLowerCase(),
      supported: false, canProceed: true,
      fileName, sizeBytes: stat.size, sha256,
      signing: { evidence: 'not-inspected', verified: false },
      compatibility: { level: 'caution', findings: ['SPLIT_PACKAGE_NOT_ANALYZED'] },
    };
  }

  const zip = new ZipFile(filePath);
  let manifestInfo, signing;
  try {
    manifestInfo = readManifestSignals(zip);
    signing = signingEvidence(zip);
  } finally {
    zip.close();
  }
  const meta = parseApk(filePath); // Existing streaming APK metadata parser; icon omitted from IPC.
  const sensitivePermissions = manifestInfo.permissions.filter((p) => SENSITIVE_PERMISSIONS.has(p));
  const compatibility = assessCompatibility({
    minSdk: meta.minSdk, targetSdk: meta.targetSdk, abis: meta.abis,
    sensitivePermissions, features: manifestInfo.features,
  });
  return {
    format: 'apk',
    supported: true,
    canProceed: compatibility.level !== 'blocked',
    fileName, sizeBytes: stat.size,
    package: meta.package, label: meta.label, versionName: meta.versionName,
    minSdk: meta.minSdk, targetSdk: meta.targetSdk, guestApi: GUEST_API,
    abis: meta.abis, permissions: manifestInfo.permissions,
    sensitivePermissions, features: manifestInfo.features,
    signing, sha256, compatibility,
  };
}
module.exports = {
  inspectApk, sha256File, signingEvidence, readManifestSignals,
  assessCompatibility, GUEST_API,
};
