'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),p=fs.promises,path=require('node:path'),os=require('node:os');
const {createRegistry}=require('../src/core/profiles');
const {EncryptedBackupCenter,parseAvdConfig,requireCompatible}=require('../src/core/encrypted-backup');
const PASSWORD='a strong portable migration password 2026';
const CONFIG='image.sysdir.1=system-images/android-34/google_apis/x86_64/\nabi.type=x86_64\nhw.cpu.arch=x86_64\ntag.id=google_apis\ntarget=android-34\n';
async function write(file,data){await p.mkdir(path.dirname(file),{recursive:true});await p.writeFile(file,data);}
async function fixture(fn){
  const root=await p.mkdtemp(path.join(os.tmpdir(),'asi-migration-'));
  const data=path.join(root,'data'),avd=path.join(root,'avds'),out=path.join(root,'export');
  await Promise.all([p.mkdir(data),p.mkdir(avd),p.mkdir(out)]);
  const registry=createRegistry(data);
  let online=false;
  const svc=new EncryptedBackupCenter({registry,dataDir:data,getAvdHome:()=>avd,
    assertIdle:async()=>{if(online)throw Error('Android must be stopped');}});
  try{await fn({data,avd,out,registry,svc,setOnline:v=>online=v});}
  finally{await p.rm(root,{recursive:true,force:true});}
}
async function prepare(x){
  await write(path.join(x.data,'apps.json'),'SOURCE_APPS_PRIVATE');
  await write(path.join(x.avd,'apkstart.avd','config.ini'),CONFIG);
  await write(path.join(x.avd,'apkstart.avd','userdata-qemu.img'),'SOURCE_USERDATA');
  const b=await x.svc.create(x.out,PASSWORD);
  const target=x.registry.create('Moved Windows Profile');
  x.registry.activate(target.id);
  const targetAvd=path.join(x.avd,x.registry.avdName(target.id)+'.avd');
  const local=CONFIG+'path=C:/Users/Destination/Android/avd\n';
  await write(path.join(targetAvd,'config.ini'),local);
  await write(path.join(targetAvd,'userdata-qemu.img'),'EXISTING_USERDATA');
  await write(x.registry.paths(target.id).appsFile,'EXISTING_APPS');
  return {b,target,targetAvd,local};
}
test('portable migration authenticates source, checks AVD and preserves destination config and safety data',()=>fixture(async x=>{
  const {b,target,targetAvd,local}=await prepare(x);
  const preview=await x.svc.previewMigration(b.path,PASSWORD);
  assert.equal(preview.migration,true);assert.equal(preview.sourceProfileId,'default');
  assert.equal(preview.profileId,target.id);assert.ok(preview.token);
  const result=await x.svc.restore(preview.token,PASSWORD);
  assert.equal(result.migration,true);assert.equal(result.ok,true);
  assert.equal(await p.readFile(path.join(targetAvd,'config.ini'),'utf8'),local);
  assert.equal(await p.readFile(path.join(targetAvd,'userdata-qemu.img'),'utf8'),'SOURCE_USERDATA');
  assert.equal(await p.readFile(x.registry.paths(target.id).appsFile,'utf8'),'SOURCE_APPS_PRIVATE');
  const safety=result.preserved.find(v=>v.includes('.avd.'));
  assert.ok(safety);assert.equal(await p.readFile(path.join(safety,'userdata-qemu.img'),'utf8'),'EXISTING_USERDATA');
  assert.equal(await p.readFile(x.registry.paths('default').appsFile,'utf8'),'SOURCE_APPS_PRIVATE');
  await assert.rejects(()=>x.svc.restore(preview.token,PASSWORD),/expired/);
}));
test('wrong password and incompatible AVD cannot touch existing destination',()=>fixture(async x=>{
  const {b,targetAvd}=await prepare(x);
  await assert.rejects(()=>x.svc.previewMigration(b.path,'different long password 2026'),/authentication/);
  await write(path.join(targetAvd,'config.ini'),CONFIG.replace('android-34','android-35'));
  await assert.rejects(()=>x.svc.previewMigration(b.path,PASSWORD),/Incompatible/);
  assert.equal(await p.readFile(path.join(targetAvd,'userdata-qemu.img'),'utf8'),'EXISTING_USERDATA');
}));
test('changes after preview, active Android or a missing AVD abort import without mutation',()=>fixture(async x=>{
  const {b,targetAvd}=await prepare(x);
  const first=await x.svc.previewMigration(b.path,PASSWORD);
  x.setOnline(true);
  await assert.rejects(()=>x.svc.restore(first.token,PASSWORD),/Android must be stopped/);
  x.setOnline(false);
  const second=await x.svc.previewMigration(b.path,PASSWORD);
  await write(path.join(targetAvd,'config.ini'),CONFIG.replace('x86_64','arm64-v8a'));
  await assert.rejects(()=>x.svc.restore(second.token,PASSWORD),/Incompatible/);
  assert.equal(await p.readFile(path.join(targetAvd,'userdata-qemu.img'),'utf8'),'EXISTING_USERDATA');
  await p.rm(path.join(targetAvd,'config.ini'));
  await assert.rejects(()=>x.svc.previewMigration(b.path,PASSWORD),/compatibility cannot be verified/);
}));
test('Default cannot be migrated over; unknown AVD metadata fails closed',()=>fixture(async x=>{
  await write(path.join(x.data,'apps.json'),'SOURCE');
  await write(path.join(x.avd,'apkstart.avd','config.ini'),CONFIG);
  const b=await x.svc.create(x.out,PASSWORD);
  await assert.rejects(()=>x.svc.previewMigration(b.path,PASSWORD),/separate Android profile/);
  assert.throws(()=>requireCompatible(parseAvdConfig(CONFIG),parseAvdConfig('target=android-34')),/Incompatible/);
}));
