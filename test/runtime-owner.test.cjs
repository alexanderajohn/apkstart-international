'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { randomUUID } = require('node:crypto');
const { createRegistry } = require('../src/core/profiles');
const { identifyGuest, readOwner, recordOwner, verifyOwner } = require('../src/core/runtime-owner');

test('only the recorded profile, serial, AVD and boot can be resumed after host restart', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(),'asi-owner-'));
  try {
    const profiles = createRegistry(root);
    const id = profiles.create('First').id;
    profiles.activate(id);
    let boot = randomUUID();
    let name = profiles.avdName(id);
    const client = { serial:'emulator-5554', deviceState:async()=>'device',
      exec: async args => ({stdout:args[0]==='emu' ? name+'\nOK' : boot}) };
    await assert.rejects(verifyOwner(client, profiles, id), /Unmanaged/);
    recordOwner(profiles, await identifyGuest(client,profiles,id));
    const restarted = createRegistry(root);
    await verifyOwner(client, restarted,id);
    assert.equal(readOwner(restarted,'default'),null);
    name = 'another-avd';
    await assert.rejects(verifyOwner(client,restarted,id), /AVD/);
    name = profiles.avdName(id);
    boot = randomUUID();
    await assert.rejects(verifyOwner(client,restarted,id), /boot identity/);
    client.serial = 'emulator-5560';
    await assert.rejects(verifyOwner(client,restarted,id), /Unmanaged/);
  } finally { fs.rmSync(root,{recursive:true,force:true}); }
});
