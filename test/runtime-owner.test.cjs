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

test('concurrent snapshot saves coalesce and an invalidation during I/O survives the old completion', async () => {
  const {EmulatorEngine}=require('../src/core/emulator');
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'asi-quickboot-'));
  const marker=path.join(root,'quickboot.stale');
  let finish, count=0;
  const engine=Object.assign(Object.create(EmulatorEngine.prototype), {
    snapshotMarker:()=>marker, hasSnapshot:()=>true,
    _saveViaAdb:()=>{count++;return new Promise(r=>{finish=r;});}
  });
  try {
    const first=engine.saveSnapshotNow('adb'), second=engine.saveSnapshotNow('adb');
    assert.equal(count,1);
    engine.invalidateSnapshot();finish(true);
    assert.deepEqual(await Promise.all([first,second]),[false,false]);
    assert.ok(fs.existsSync(marker));
    const fresh=engine.saveSnapshotNow('adb');finish(true);
    assert.equal(await fresh,true);
    assert.equal(fs.existsSync(marker),false);
  } finally {fs.rmSync(root,{recursive:true,force:true});}
});

test('write recovery refuses a different boot or unauthorized transport on the same serial', async () => {
  const {waitForOwnedReconnect} = require('../src/core/runtime-owner');
  const id='p_0123456789abcdef', serial='emulator-5554', boot=randomUUID();
  const owner={profileId:id,serial,boot};
  const profiles={currentId:()=>id};
  const client={serial,deviceState:async()=>'unauthorized'};
  assert.equal(await waitForOwnedReconnect(client,profiles,id,owner),false);
  let probes=0;
  client.deviceState=async()=>probes++?'device':'offline';
  client.exec=async args=>({stdout:args[0]==='emu'?'apkstart_'+id+'\nOK':randomUUID()});
  await assert.rejects(waitForOwnedReconnect(client,profiles,id,owner), /boot identity/);
});
