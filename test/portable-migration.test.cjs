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
const pkg='org.example.migrated';
const sourceCatalog=JSON.stringify({apps:[{package:pkg,label:'Backup test',pinned:true,
  apkPath:'C:/Source/Profile/apks/'+pkg+'-cur.apk',iconPath:'C:/Source/Profile/icons/'+pkg+'.png',
  icoPath:'C:/Source/Profile/icons/'+pkg+'.ico',shortcutPath:'C:/Source/Desktop/App.lnk',startMenuPath:'C:/Source/Menu/App.lnk'}]});
async function prepare(x,catalog=sourceCatalog){
  await write(path.join(x.data,'apps.json'),catalog);
  await write(path.join(x.data,'icons',pkg+'.png'),'test icon');
  await write(path.join(x.data,'apks',pkg+'-cur.apk'),'test APK cache');
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
  const dest=x.registry.paths(target.id);
  const [app]=JSON.parse(await p.readFile(dest.appsFile,'utf8')).apps;
  assert.equal(app.package,pkg);assert.equal(app.pinned,true);
  assert.equal(app.apkPath,path.join(dest.apkDir,pkg+'-cur.apk'));
  assert.equal(await p.readFile(app.apkPath,'utf8'),'test APK cache');
  assert.equal(app.iconPath,path.join(dest.iconsDir,pkg+'.png'));
  assert.equal(app.icoPath,null);assert.equal(app.shortcutPath,null);assert.equal(app.startMenuPath,null);
  const safety=result.preserved.find(v=>v.includes('.avd.'));
  assert.ok(safety);assert.equal(await p.readFile(path.join(safety,'userdata-qemu.img'),'utf8'),'EXISTING_USERDATA');
  assert.equal(await p.readFile(x.registry.paths('default').appsFile,'utf8'),sourceCatalog);
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

test('migration reads the actual AVD descriptor target and refuses conflicting sources',()=>fixture(async x=>{
  const {targetAvd,b}=await prepare(x);
  await write(path.join(targetAvd,'config.ini'),CONFIG.replace('target=android-34',''));
  await write(targetAvd.slice(0,-4)+'.ini','target=android-34');
  assert.equal((await x.svc.previewMigration(b.path,PASSWORD)).compatibility.target,'android-34');
  await write(path.join(targetAvd,'config.ini'),CONFIG);
  await write(targetAvd.slice(0,-4)+'.ini','target=android-35');
  await assert.rejects(()=>x.svc.previewMigration(b.path,PASSWORD),/Incompatible platform targets/);
}));
test('invalid migration catalog leaves the destination and source untouched',()=>fixture(async x=>{
  const {target,b,targetAvd}=await prepare(x,'malformed catalog');
  const approval=await x.svc.previewMigration(b.path,PASSWORD);
  await assert.rejects(()=>x.svc.restore(approval.token,PASSWORD),SyntaxError);
  assert.equal(await p.readFile(x.registry.paths(target.id).appsFile,'utf8'),'EXISTING_APPS');
  assert.equal(await p.readFile(path.join(targetAvd,'userdata-qemu.img'),'utf8'),'EXISTING_USERDATA');
  assert.equal(await p.readFile(x.registry.paths('default').appsFile,'utf8'),'malformed catalog');
}));

test('file references do not bind to another package in the same authenticated backup',()=>fixture(async x=>{
  const catalog=JSON.stringify({apps:[{package:'org.example.other',
    apkPath:'C:/Old/apks/'+pkg+'-cur.apk',iconPath:'C:/Old/icons/'+pkg+'.png'}]});
  const {target,b}=await prepare(x,catalog);
  const preview=await x.svc.previewMigration(b.path,PASSWORD);
  await x.svc.restore(preview.token,PASSWORD);
  const [app]=JSON.parse(await p.readFile(x.registry.paths(target.id).appsFile,'utf8')).apps;
  for(const field of ['apkPath','iconPath','icoPath','shortcutPath','startMenuPath'])assert.equal(app[field],null);
  assert.equal(await p.readFile(x.registry.paths('default').appsFile,'utf8'),catalog);
}));
