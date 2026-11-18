'use strict';
const fs = require('node:fs');
const { createHash } = require('node:crypto');
const { Transform } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const { execFile } = require('node:child_process');
const { validPackageName } = require('./pkgname');

// Hash the bytes written to the child's stdin. An uncommitted Android session
// can receive bytes before the digest is known, but cannot publish the package.
async function writePart(client, session, index, part) {
  const hash = createHash('sha256');
  let count = 0;
  const meter = new Transform({ transform(chunk, _enc, cb) {
    count += chunk.length;
    hash.update(chunk);
    cb(count > part.bytes ? Error('APK grew during transfer') : null, chunk);
  } });
  const args = ['shell', '-T', 'pm', 'install-write', '-S', String(part.bytes),
    session, 'part' + index + '.apk', '-'];
  let child;
  const reply = new Promise((resolve, reject) => {
    child = execFile(client.adbPath, client._args(args), {
      env: client._adbEnv(), windowsHide: true, timeout: 1200000, maxBuffer: 65536
    }, (error, stdout, stderr) => {
      if (error || !/^Success(?:[: ]|$)/.test(stdout.trim())) {
        reject(Error('Android install-write failed: ' + String(stderr || stdout || error).slice(0, 400)));
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
    if (commitSent) throw Error('Check the package in this Profile before retrying. Android commit result: ' + error.message);
    throw error;
  }
}
module.exports = { installSession, writePart };
