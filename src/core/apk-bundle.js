'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { ZipFile } = require('./zip');
const { parseApk } = require('./apk');

async function parseBundle(file) {
  const zip = new ZipFile(file);
  let dir;
  const files = [];
  const cleanup = () => {
    if (!dir) return;
    if (fs.realpathSync(dir) !== dir) throw Error('Split staging directory changed');
    for (const f of files) fs.rmSync(f, {force:true});
    fs.rmdirSync(dir);
  };
  try {
    const names = zip.names().filter(n => /\.apk$/i.test(n));
    if (!names.length) throw Error('没有找到 APK 分片 (no APK parts)');
    if (names.length > 128 || zip.names().some(n => /\.obb$/i.test(n)))
      throw Error('Select a device-specific set of APK splits without external OBB assets');
    const total = names.reduce((sum,n) => sum + zip.entries.get(n).uncompSize,0);
    if (!Number.isSafeInteger(total) || total > 16 * 1024 ** 3) throw Error('Split APK set is too large');
    dir = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'asi-splits-'));
    const parts = [];
    for (const [i,name] of names.entries()) {
      const target = path.join(dir,'part-' + i + '.apk');
      files.push(target);
      const hash = createHash('sha256');
      const bytes = await zip.extractChecked(name, target, hash);
      const meta = parseApk(target);
      parts.push({path:target, sha256:hash.digest('hex'), bytes, meta});
    }
    const bases = parts.filter(p => !p.meta.split);
    if (bases.length !== 1) throw Error('Choose a device-specific APK set containing exactly one base APK');
    const meta = bases[0].meta;
    const splits = new Set(parts.map(p => p.meta.split));
    if (splits.size !== parts.length) throw Error('Repeated Android split identity');
    for (const part of parts) {
      if (part.meta.package !== meta.package || part.meta.versionCode !== meta.versionCode ||
          part.meta.versionCodeMajor !== meta.versionCodeMajor) throw Error('Package or version differs between splits');
      if (part.meta.requiredSplits.some(id => !splits.has(id))) throw Error('Required Android split is missing');
    }
    return { files, parts, meta, cleanup };
  } catch (err) { cleanup(); throw err; }
  finally { zip.close(); }
}
module.exports = { parseBundle };
