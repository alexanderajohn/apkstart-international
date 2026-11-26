'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { assertProfileGuest } = require('./profile-runtime-guard');
const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

async function identifyGuest(client, profiles, profileId) {
  const serial = client.serial;
  if (!/^emulator-\d{4,5}$/.test(serial)) throw Error('Unmanaged Android emulator detected');
  await assertProfileGuest({ expectedProfileId: profileId, getProfileId: profiles.currentId, client, serial, engine: 'emulator' });
  const boot = (await client.exec(['shell','cat','/proc/sys/kernel/random/boot_id'], { timeout: 8000 })).stdout.trim();
  if (!uuid.test(boot) || profiles.currentId() !== profileId || client.serial !== serial)
    throw Error('Cannot verify the active Android boot');
  return { profileId, serial, boot };
}
function ownerFile(profiles, id) { return path.join(profiles.profileRoot(id), 'runtime-owner.json'); }
function readOwner(profiles, id) {
  const file = ownerFile(profiles,id);
  try {
    const st = fs.lstatSync(file);
    if (!st.isFile() || st.size > 512) throw Error('Invalid runtime owner record');
    const owner = JSON.parse(fs.readFileSync(file,'utf8'));
    if (owner.profileId !== id || !/^emulator-\d{4,5}$/.test(owner.serial) || !uuid.test(owner.boot))
      throw Error('Invalid runtime owner record');
    return owner;
  } catch(e) { if (e.code === 'ENOENT') return null; throw e; }
}
function recordOwner(profiles, owner) {
  const dest = ownerFile(profiles,owner.profileId);
  const tmp = dest + '.' + randomUUID() + '.tmp';
  try {
    fs.writeFileSync(tmp, JSON.stringify(owner), { flag: 'wx', mode: 0o600 });
    fs.renameSync(tmp, dest);
  } finally { fs.rmSync(tmp,{force:true}); }
}
async function verifyOwner(client, profiles, id, owner = readOwner(profiles,id)) {
  if (!owner || owner.serial !== client.serial || owner.profileId !== id) throw Error('Unmanaged Android emulator detected');
  const actual = await identifyGuest(client, profiles, id);
  if (owner.boot !== actual.boot) throw Error('Android boot identity changed. Close the unverified emulator.');
}
// Wait only for a transport that was observed disconnected. Identity and
// authorization checks use the owner captured before any APK data was sent.
async function waitForOwnedReconnect(client, profiles, id, owner) {
  const deadline = Date.now() + 90000;
  let state = await client.deviceState();
  if (state !== 'offline' && state !== 'no-device') return false;
  while (Date.now() < deadline && profiles.currentId() === id && client.serial === owner.serial) {
    await new Promise(resolve => setTimeout(resolve,1000));
    state = await client.deviceState();
    if (state === 'device') {
      await verifyOwner(client,profiles,id,owner);
      return true;
    }
    if (state !== 'offline' && state !== 'no-device') return false;
  }
  return false;
}
module.exports = { identifyGuest, readOwner, recordOwner, verifyOwner, waitForOwnedReconnect };
