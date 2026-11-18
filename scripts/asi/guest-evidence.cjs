'use strict';
const { validPackageName } = require('../../src/core/pkgname');

async function packagePresent(client, pkg) {
  if (!validPackageName(pkg)) throw Error('Invalid test package');
  // pm path uses the same unsuccessful exit on some guests for absence and
  // transport failure. A successful package listing distinguishes these cases.
  const { stdout } = await client.exec(['shell','pm','list','packages','--user','0',pkg]);
  const rows = stdout.trim().split(/\r?\n/).filter(Boolean);
  if (rows.some(row => !/^package:[\w.]+$/.test(row))) throw Error('Unexpected package-manager response');
  return rows.includes('package:' + pkg);
}
async function verifyCanary(client, pkg, expected) {
  if (!validPackageName(pkg) || !/^[a-f0-9]{64}$/i.test(expected)) throw Error('Invalid canary parameters');
  const { stdout } = await client.exec(['shell','run-as',pkg,'sha256sum','files/asi-canary']);
  const match = /^([a-f0-9]{64})\s+files\/asi-canary$/i.exec(stdout.trim());
  if (!match || match[1].toLowerCase() !== expected.toLowerCase()) throw Error('Private app data canary differs or is missing');
  return true;
}
async function launchAndObserve(client,pkg,check) {
  if (!validPackageName(pkg)) throw Error('Invalid test package');
  await check();
  const started = await client.exec(['shell','monkey','-p',pkg,'-c','android.intent.category.LAUNCHER','1']);
  if (!/Events injected:\s*1\b/.test(started.stdout)) throw Error('Android launcher did not issue an event');
  await new Promise(resolve=>setTimeout(resolve,4000));
  const pid = await client.exec(['shell','pidof',pkg]);
  if (!/^\d+(?:\s+\d+)*$/.test(pid.stdout.trim())) throw Error('App process did not survive the observation period');
}
module.exports = { packagePresent, verifyCanary, launchAndObserve };
