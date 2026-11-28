'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const {randomUUID} = require('node:crypto');
const root = fs.mkdtempSync(path.join(os.tmpdir(),'asi-share-'));
process.env.APPDATA = root;
const store = require('../src/core/store');
const {Sharer,checkShareFolder} = require('../src/core/sharer');
const {recordOwner} = require('../src/core/runtime-owner');
const {AdbClient} = require('../src/core/adb');
test.after(()=>fs.rmSync(root,{recursive:true,force:true}));

test('Default keeps its legacy share and secondary folder choices survive unrelated settings writes', () => {
  store.profiles.activate('default');
  const original=path.join(root,'existing-share');
  store.saveSettings({sharedDir:original});
  const a=store.profiles.create('Share A').id, b=store.profiles.create('Share B').id;
  store.profiles.activate(a);
  assert.equal(store.getSettings().sharedDir,path.join(store.profiles.profileRoot(a),'shared'));
  assert.throws(()=>checkShareFolder(path.join(original,'child')),/overlaps/);
  const custom=path.join(root,'other-share');
  store.saveSettings({sharedDir:custom,deviceSharedDir:'/sdcard/Private'});
  store.profiles.activate(b);
  store.saveSettings({uiLocale:'vi'});
  assert.notEqual(store.getSettings().sharedDir,custom);
  assert.equal(store.getSettings(a).sharedDir,custom);
  assert.equal(store.getSettings(a).deviceSharedDir,'/sdcard/Private');
  assert.equal(store.getSettings('default').sharedDir,original);
});

test('pulls publish only complete bytes while the originally recorded guest remains active', async () => {
  const id=store.profiles.create('Transfer').id;
  store.profiles.activate(id);
  store.ensureDirs();
  const boot=randomUUID(), serial='emulator-5554';
  recordOwner(store.profiles,{profileId:id,serial,boot});
  let guestBoot=boot, mode='short', transfers=0;
  const client={serial,deviceState:async()=>'device',
    exec:async args=>({stdout:args[0]==='emu'?store.profiles.avdName(id)+'\nOK':guestBoot}),
    shellMkdir:async()=>{}, listRemoteStat:async()=>[{rel:'résultat.txt',size:3,mtime:3000}],
    pull:async(_src,dst)=>{
      transfers++;
      fs.writeFileSync(dst,mode==='short'?'x':'abc');
      if(mode==='switch') store.profiles.activate('default');
    }};
  const share=new Sharer({client:()=>client});
  const folder=store.getSettings().sharedDir, dest=path.join(folder,'résultat.txt');
  const index=path.join(store.profiles.profileRoot(id),'shared-state.json');
  let result=await share.sync();
  assert.deepEqual([result.pulled,fs.existsSync(dest)],[0,false]);
  assert.match(result.errors[0],/Incomplete/);
  mode='switch';
  result=await share.sync();
  assert.equal(result.pulled,0);
  assert.equal(fs.existsSync(dest),false);
  store.profiles.activate(id);
  mode='complete';
  result=await share.sync();
  assert.deepEqual([result.pulled,result.errors],[1,[]]);
  assert.equal(fs.readFileSync(dest,'utf8'),'abc');
  assert.ok(fs.existsSync(index));
  assert.equal(fs.existsSync(path.join(store.DATA_DIR,'shared-state.json')),false);
  guestBoot=randomUUID();
  const before=transfers;
  assert.match((await share.sync()).error,/boot identity/);
  assert.equal(transfers,before);
  assert.deepEqual(fs.readdirSync(folder),['résultat.txt']);
});

test('Android shared paths preserve apostrophes and spaces as literal filename characters', async () => {
  const calls=[];
  const client=Object.assign(Object.create(AdbClient.prototype),{shell:async command=>{calls.push(command);return '';}});
  await client.shellMkdir("/sdcard/An's folder");
  assert.equal(calls[0],"mkdir -p '/sdcard/An'\\''s folder'");
});

test('normal runtime preparation preserves the guest developer and window settings', async () => {
  const {Runtime}=require('../src/core/engine');
  const events=[];
  const runtime={settings:{engine:{chineseIme:false}},startWatchdog:()=>events.push('watchdog')};
  await Runtime.prototype.prepare.call(runtime,{ensureFreeform:()=>events.push('guest write')});
  assert.deepEqual(events,['watchdog']);
});

test('initial folder conflicts and linked host directories preserve both copies', async () => {
  const id=store.profiles.create('Conflict').id;
  store.profiles.activate(id);
  const dir=store.getSettings().sharedDir;
  fs.mkdirSync(dir,{recursive:true});
  fs.writeFileSync(path.join(dir,'notes.txt'),'local');
  const other=path.join(root,'outside');
  fs.mkdirSync(other);
  fs.symlinkSync(other,path.join(dir,'linked'),process.platform==='win32'?'junction':'dir');
  const boot=randomUUID(),serial='emulator-5554';
  recordOwner(store.profiles,{profileId:id,serial,boot});
  let transfers=0;
  const client={serial,deviceState:async()=>'device',exec:async a=>({stdout:a[0]==='emu'?store.profiles.avdName(id)+'\nOK':boot}),
    shellMkdir:async()=>{},listRemoteStat:async()=>[
      {rel:'notes.txt',size:4,mtime:1000},{rel:'linked/example.txt',size:1,mtime:1000}],
    pull:async()=>{transfers++;},push:async()=>{transfers++;}};
  const result=await new Sharer({client:()=>client}).sync();
  assert.equal(result.error,undefined);
  assert.equal(result.errors.length,2);
  assert.equal(transfers,0);
  assert.equal(fs.readFileSync(path.join(dir,'notes.txt'),'utf8'),'local');
  assert.deepEqual(fs.readdirSync(other),[]);
});
