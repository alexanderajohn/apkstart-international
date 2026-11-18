'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { constants } = require('node:fs');
const { prepareInstall } = require('./apk-install-guard');

async function withApprovedCopy(preview, activeProfile, consume) {
  if (preview.profileId !== activeProfile) throw Error('Android Profile changed after approval');
  const dir = await fs.mkdtemp(path.join(await fs.realpath(os.tmpdir()), 'asi-install-'));
  const target = path.join(dir, 'input' + path.extname(preview.path).toLowerCase());
  try {
    const source = await fs.lstat(preview.path);
    if (!source.isFile() || source.size !== preview.bytes || source.mtimeMs !== preview.modifiedAt)
      throw Error('APK source changed after approval');
    await fs.copyFile(preview.path, target, constants.COPYFILE_EXCL);
    await fs.chmod(target, 0o400);
    const staged = await prepareInstall(target, activeProfile);
    if (staged.sha256 !== preview.sha256 || staged.bytes !== preview.bytes ||
        staged.package !== preview.package || staged.version !== preview.version ||
        staged.format !== preview.format)
      throw Error('Staged APK differs from the approved file');
    return await consume(staged);
  } finally {
    // Never recursively remove unexpected contents, or follow a swapped directory.
    const st = await fs.lstat(dir);
    if (!st.isDirectory() || await fs.realpath(dir) !== dir) throw Error('Install staging directory changed');
    const file = await fs.lstat(target).catch(e => { if (e.code !== 'ENOENT') throw e; });
    if (file) {
      if (!file.isFile() || file.nlink !== 1) throw Error('Unexpected object in install staging');
      if (process.platform === 'win32') await fs.chmod(target, 0o600);
      await fs.unlink(target);
    }
    await fs.rmdir(dir);
  }
}
module.exports = { withApprovedCopy };
