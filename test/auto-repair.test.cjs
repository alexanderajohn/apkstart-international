'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildRepairPlan, applySafeRepair } = require('../src/core/auto-repair');

const baseEnv = () => ({
  adb:{ok:true}, emulator:{ok:true,version:'37.1.0'},
  sysimg:{ok:true}, accel:{ok:true},
});
const settings = {engine:{keepSnapshot:true,gpuMode:'auto'}};
function make(overrides={}) {
  return buildRepairPlan({env:baseEnv(), settings, ...overrides});
}
test('Offline detection of GPU crash produces software-rendering plan without editing settings', () => {
  const p=make({failure:{exitCode:3221225477,diagnosis:{code:'ACCESS_VIOLATION'}}});
  assert.ok(p.items.some(x=>x.code==='GPU_FAILURE'&&x.action==='gpu-software'));
  assert.ok(p.safeActions.includes('gpu-software'));
  assert.equal(p.requiresUserApproval,true);
  assert.equal(p.dataPolicy,'No Android app data or snapshots are deleted.');
});
test('Precise snapshot failures suggest only disabling next-boot Quick Boot', () => {
  const p=make({logLines:['INFO: snapshot saved','ERROR: failed to load snapshot: incompatible ram.img']});
  assert.ok(p.items.some(x=>x.code==='SNAPSHOT_FAILURE'));
  const normal=make({logLines:['INFO: Quick Boot snapshot saved successfully']});
  assert.ok(!normal.items.some(x=>x.code==='SNAPSHOT_FAILURE'));
  const alreadyOff=make({settings:{engine:{keepSnapshot:false}},failure:{diagnosis:{code:'SNAPSHOT'}}});
  assert.ok(!alreadyOff.safeActions.includes('snapshot-disable'));
});
test('GPU/ADB/hypervisor classification distinguishes guidance from safe repair', () => {
  const p=make({vmRunning:false,logLines:['WHPX failed to initialize','Failed to initialize GL emulation']});
  assert.ok(p.items.some(x=>x.code==='HYPERVISOR' && x.action===null));
  assert.ok(p.items.some(x=>x.code==='GPU_FAILURE' && x.action==='gpu-software'));
  const offline=make({vmRunning:true,adbState:'offline'});
  assert.deepEqual(offline.safeActions,['adb-reconnect']);
  const denied=make({vmRunning:true,adbState:'unauthorized'});
  assert.deepEqual(denied.safeActions,[],'Do not auto-approve Android USB debugging');
});
test('A live running runtime never shows stale persisted boot crashes', () => {
  const p=make({vmRunning:true,adbState:'device',failure:{diagnosis:{code:'GPU_INIT'}},logLines:['emulator exit 3221225477']});
  assert.equal(p.items.length,0);
});
test('Missing components are advisory and never silently downloaded', () => {
  const p=make({env:{adb:{ok:false},emulator:{ok:false},sysimg:{ok:false},accel:{ok:false}}});
  assert.deepEqual(p.safeActions,[]);
  assert.ok(p.items.some(x=>x.code==='MISSING_ADB'));
  assert.ok(p.items.some(x=>x.code==='MISSING_IMAGE'));
});
test('Permission-gated GPU repair selects version-appropriate software mode only', async () => {
  const planned=make({failure:{diagnosis:{code:'GPU_INIT'}}});
  const patches=[];
  const saveSettings=(p)=>patches.push(p);
  const r=await applySafeRepair('gpu-software',{plan:planned,settings,saveSettings,emulatorVersion:'37.1.0'});
  assert.equal(r.ok,true);
  assert.equal(r.nextBoot,true);
  assert.deepEqual(patches,[{engine:{gpuMode:'software'}}]);
  patches.length=0;
  const older=await applySafeRepair('gpu-software',{plan:planned,settings,saveSettings,emulatorVersion:'35.1.0'});
  assert.equal(older.ok,true);
  assert.deepEqual(patches,[{engine:{gpuMode:'swiftshader_indirect'}}]);
});
test('Opt-in Quick Boot change never wipes snapshots or userdata', async () => {
  const patches=[];
  const r=await applySafeRepair('snapshot-disable',{
    plan:make({failure:{diagnosis:{code:'SNAPSHOT'}}}),
    settings,saveSettings:(x)=>patches.push(x),
  });
  assert.equal(r.ok,true);
  assert.deepEqual(patches,[{engine:{keepSnapshot:false}}]);
});
test('ADB repair is scoped to running app-owned server port 5044', async () => {
  let resets=0;let stateChecks=0;
  const runtime={
    vmRunning:true,
    emulator:{async resetAdbServer(){resets++;return true;}},
    client(){return {async isOnline(){stateChecks++;return true;}};},
  };
  const p=make({vmRunning:true,adbState:'offline'});
  const args={plan:p,settings,saveSettings:()=>{throw Error('ADB must not modify settings');},runtime};
  await assert.rejects(()=>applySafeRepair('adb-reconnect',{...args,adbPort:5037}),{code:'ASI_ADB_ISOLATION_REQUIRED'});
  assert.equal(resets,0);
  const r=await applySafeRepair('adb-reconnect',{...args,adbPort:5044});
  assert.equal(r.ok,true);assert.equal(resets,1);assert.equal(stateChecks,1);
});
test('Whitelisted actions cannot be invoked without a matching plan', async () => {
  const p=make();
  const noop=()=>{};
  await assert.rejects(()=>applySafeRepair('wipe-data',{plan:p,saveSettings:noop}),{code:'ASI_REPAIR_NOT_ALLOWED'});
  await assert.rejects(()=>applySafeRepair('gpu-software',{plan:p,saveSettings:noop}),{code:'ASI_REPAIR_NOT_ALLOWED'});
});
test('Source never contains destructive repair commands or unsafe elevation operations', () => {
  const code=fs.readFileSync(path.join(__dirname,'../src/core/auto-repair.js'),'utf8');
  for (const command of ['-wipe-data','fs.rmSync(', 'taskkill', 'Enable-WindowsOptionalFeature', 'Start-Process -Verb RunAs']) {
    // Comments documenting prohibited behavior do not count as executing it.
    assert.ok(!code.split('\n').some(line=>!line.trim().startsWith('//')&&line.includes(command)), command);
  }
});


test('Backend repair handlers recompute the plan and restrict actions to an allowlist', () => {
  const main=fs.readFileSync(path.join(__dirname,'../src/main.js'),'utf8');
  const preload=fs.readFileSync(path.join(__dirname,'../src/preload.js'),'utf8');
  assert.ok(main.includes("ipcMain.handle('doctor:repairPlan'"));
  assert.ok(main.includes("ipcMain.handle('doctor:applySafeRepair'"));
  assert.ok(main.includes('const snap = await currentAutoRepairSnapshot();'));
  assert.ok(preload.includes("autoRepairPlan: () => invoke('doctor:repairPlan')"));
  assert.ok(preload.includes("autoRepairApply: (action) => invoke('doctor:applySafeRepair', action)"));
});
test('Settings panel exposes diagnostics before repair and warns of consent', () => {
  const html=fs.readFileSync(path.join(__dirname,'../src/ui/index.html'),'utf8');
  const ui=fs.readFileSync(path.join(__dirname,'../src/ui/auto-repair.js'),'utf8');
  for(const id of ['btnAutoRepairScan','autoRepairResults','autoRepairSection']) {
    assert.ok(html.includes('id="'+id+'"'),id);
  }
  assert.ok(html.includes('<script src="auto-repair.js"></script>'));
  assert.ok(ui.includes('window.confirm(L.confirm)'),'Manual explicit consent required');
  assert.ok(ui.includes('window.confirm(L.confirmAll)'),'Batch approval required');
  assert.ok(ui.includes("a==='gpu-software'||a==='snapshot-disable'"),'Batch excludes ADB restart');
  assert.ok(ui.includes('textContent'),'Never interpolate untrusted logs into innerHTML');
  assert.ok(!ui.includes('innerHTML'),'No HTML interpolation of untrusted logs');
  assert.ok(ui.includes("'zh-CN':")&&ui.includes('vi:')&&ui.includes('en:'),'Three supported UI languages');
});
