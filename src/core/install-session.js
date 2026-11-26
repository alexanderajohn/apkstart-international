'use strict';
const fs = require('node:fs');
const { createHash } = require('node:crypto');
const { Transform } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const { execFile } = require('node:child_process');
const { validPackageName } = require('./pkgname');

// Hash the bytes written to the child's stdin. An uncommitted Android session
// can receive bytes before the digest is known, but cannot publish the package.
async function writePart(client, session, index, part, platform = process.platform) {
  if (!/^\d{1,10}$/.test(session) || !Number.isSafeInteger(index) || index < 0 ||
      !Number.isSafeInteger(part.bytes) || part.bytes < 1) throw Error('Invalid install-write arguments');
  // Windows adb shell reads redirected stdin in CRT text mode. Byte 0x1a
  // terminates the input and CRLF can change bytes. Send ASCII to that client
  // and decode inside Android before Package Manager reads the original APK.
  const encode = platform === 'win32';
  const hash = createHash('sha256');
  let count = 0;
  let tail = Buffer.alloc(0);
  const meter = new Transform({
    transform(chunk, _enc, cb) {
      count += chunk.length;
      if (count > part.bytes) return cb(Error('APK grew during transfer'));
      hash.update(chunk);
      if (!encode) return cb(null, chunk);
      const data = tail.length ? Buffer.concat([tail, chunk]) : chunk;
      const end = data.length - (data.length % 3);
      tail = data.subarray(end);
      cb(null, data.toString('base64', 0, end));
    },
    flush(cb) { cb(null, tail.length ? tail.toString('base64') : undefined); }
  });
  const args = ['shell', '-T', ...(encode ? ['base64', '-d', '|'] : []),
    'pm', 'install-write', '-S', String(part.bytes), session, 'part' + index + '.apk', '-'];
  let child;
  const reply = new Promise((resolve, reject) => {
    child = execFile(client.adbPath, client._args(args), {
      env: client._adbEnv(), windowsHide: true, timeout: 1200000, maxBuffer: 65536
    }, (error, stdout, stderr) => {
      if (error || !/^Success(?:[: ]|$)/.test(stdout.trim())) {
        const detail = String(stderr || stdout || error?.message || 'No package-manager reply').trim();
        const status = error ? ' (adb ' + (error.signal || 'exit ' + error.code) + ')' : '';
        reject(Error('Android install-write failed' + status + ': ' + detail.slice(0,400)));
      } else resolve();
    });
  });
  const transfer = pipeline(fs.createReadStream(part.path), meter, child.stdin);
  try {
    await Promise.all([reply, transfer]);
    if (count !== part.bytes || hash.digest('hex') !== part.sha256)
      throw Error('APK bytes changed during transfer. Installation was stopped.');
  } finally {
    if (child.exitCode === null) child.kill();
    await Promise.allSettled([reply, transfer]);
  }
}

async function installSession(client, parts, { pkg, replace, grant, checkGuest, write = writePart }) {
  if (!validPackageName(pkg) || !parts.length || parts.some(p =>
    !Number.isSafeInteger(p.bytes) || p.bytes < 1 || !/^[a-f0-9]{64}$/.test(p.sha256)))
    throw Error('Invalid approved Android installation');
  const command = async (args, timeout) =>
    (await client.exec(['shell', 'pm', ...args], { timeout })).stdout.trim();
  await checkGuest();
  const created = await command(['install-create', replace ? '-r' : '-R', '--pkg', pkg,
    ...(grant ? ['-g'] : []), '-S', String(parts.reduce((sum, p) => sum + p.bytes, 0))], 30000);
  const match = /^Success: created install session \[(\d{1,10})\]$/.exec(created);
  if (!match) throw Error('Android refused the install session: ' + created.slice(0, 400));
  const id = match[1];
  let commitSent = false;
  try {
    for (const [i, part] of parts.entries()) {
      await checkGuest();
      await write(client, id, i, part);
    }
    await checkGuest();
    commitSent = true;
    const result = await command(['install-commit', id], 1200000);
    if (result !== 'Success') throw Error(result.slice(0, 400));
  } catch (error) {
    try {
      await checkGuest();
      await command(['install-abandon', id], 15000);
    } catch { /* The emulator may have disconnected or already closed the session. */ }
    const tag = /INSTALL_(?:FAILED|PARSE_FAILED)_[A-Z_]+/.exec(String(error.raw || error.message))?.[0];
    const reason = {
      INSTALL_FAILED_VERSION_DOWNGRADE: 'Android already has a newer version.',
      INSTALL_FAILED_UPDATE_INCOMPATIBLE: 'Select an update signed by the original publisher.',
      INSTALL_PARSE_FAILED_INCONSISTENT_CERTIFICATES: 'APK signing certificates differ.',
      INSTALL_FAILED_INSUFFICIENT_STORAGE: 'Free space in this Android Profile before retrying.',
      INSTALL_FAILED_ALREADY_EXISTS: 'This install was approved only for a new package.'
    }[tag];
    if (reason) throw Error(reason + ' (' + tag + ')');
    if (commitSent) throw Error('Check the package in this Profile before retrying. Android commit result: ' + error.message);
    throw error;
  }
}
module.exports = { installSession, writePart };
