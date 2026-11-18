'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),p=fs.promises,path=require('node:path'),os=require('node:os');
const {createRegistry}=require('../src/core/profiles');
const {RecoveryVault}=require('../src/core/recovery-vault');

const TX='0123456789abcdef0123';
const pointId='restore:'+TX;
async function write(file,text){
  await p.mkdir(path.dirname(file),{recursive:true});
  await p.writeFile(file,text);
}
async function fixture(fn){
  const root=await p.mkdtemp(path.join(os.tmpdir(),'asi-recovery-test-'));
  const data=path.join(root,'data'),avd=path.join(root,'avds');
  await Promise.all([p.mkdir(data),p.mkdir(avd)]);
  let online=false;
  const registry=createRegistry(data);
  const vault=new RecoveryVault({registry,dataDir:data,getAvdHome:()=>avd,
    assertIdle:async()=>{if(online)throw Error('Android must be stopped');}});
  const x={root,data,avd,registry,vault,setOnline:value=>{online=value;}};
  try{return await fn(x);}
  finally{await p.rm(root,{recursive:true,force:true});}
}
function safety(target,kind='before-restore',tx=TX){
  return target+'.asi-'+tx+'.'+kind;
}
async function setup(x){
  const target=x.vault.layout().targets;
  await write(target['apps.json'],'LIVE_APPS');
  await write(path.join(target.apks,'current.apk'),'LIVE_APK');
  await write(path.join(target.avd,'userdata-qemu.img'),'LIVE_USERDATA');
  await write(safety(target['apps.json']),'RECOVERED_APPS');
  await write(path.join(safety(target.apks),'historic.apk'),'RECOVERED_APK');
  await write(path.join(safety(target.avd),'userdata-qemu.img'),'RECOVERED_USERDATA');
  return target;
}
test('Recovery Vault discovers safety copies only for the selected profile',()=>fixture(async x=>{
  const targets=await setup(x);
  const list=await x.vault.list();
  assert.equal(list.profileId,'default');
  assert.equal(list.points.length,1);
  assert.deepEqual(list.points[0].components,['apps.json','apks','avd']);
  assert.equal(list.points[0].id,pointId);
  const secondary=x.registry.create('Secondary Windows');
  x.registry.activate(secondary.id);
  const isolated=await x.vault.list();
  assert.equal(isolated.profileId,secondary.id);
  assert.deepEqual(isolated.points,[]);
  assert.equal(await p.readFile(targets['apps.json'],'utf8'),'LIVE_APPS');
}));
test('Verified local recovery preserves the original point and current files as before-recovery',()=>fixture(async x=>{
  const targets=await setup(x);
  const v=await x.vault.preview(pointId);
  assert.equal(v.recovery,true);assert.equal(v.profileId,'default');
  assert.equal(v.files,3);assert.ok(v.bytes>0);
  assert.ok(v.space.length>0);assert.equal(v.components.length,3);
  const result=await x.vault.apply(v.token);
  assert.equal(result.ok,true);assert.equal(result.restartRequired,true);
  assert.equal(result.sourcePreserved,true);
  assert.equal(await p.readFile(targets['apps.json'],'utf8'),'RECOVERED_APPS');
  assert.equal(await p.readFile(path.join(targets.apks,'historic.apk'),'utf8'),'RECOVERED_APK');
  assert.equal(await p.readFile(path.join(targets.avd,'userdata-qemu.img'),'utf8'),'RECOVERED_USERDATA');
  assert.equal(await p.readFile(safety(targets['apps.json']),'utf8'),'RECOVERED_APPS');
  assert.equal(await p.readFile(path.join(safety(targets.avd),'userdata-qemu.img'),'utf8'),'RECOVERED_USERDATA');
  assert.equal(result.preserved.length,3);
  assert.equal(await p.readFile(result.preserved.find(s=>s.includes('apps.json')),'utf8'),'LIVE_APPS');
  assert.ok((await x.vault.list()).points.some(p=>p.id.startsWith('recovery:')));
  await assert.rejects(()=>x.vault.apply(v.token),/expired/);
}));
test('Before-recovery safety copy supports undo without deleting the first recovery point',()=>fixture(async x=>{
  const target=await setup(x);
  const first=await x.vault.preview(pointId);
  await x.vault.apply(first.token);
  const list=await x.vault.list();
  const back=list.points.find(p=>p.id.startsWith('recovery:'));
  assert.ok(back);
  const v=await x.vault.preview(back.id);
  await x.vault.apply(v.token);
  assert.equal(await p.readFile(target['apps.json'],'utf8'),'LIVE_APPS');
  assert.equal(await p.readFile(safety(target['apps.json']),'utf8'),'RECOVERED_APPS');
  assert.ok((await x.vault.list()).points.some(p=>p.id===pointId));
}));
test('Changed or removed recovery files after preview cannot overwrite live data',()=>fixture(async x=>{
  const targets=await setup(x);
  const v=await x.vault.preview(pointId);
  await write(safety(targets['apps.json']),'CHANGED_POINT');
  await assert.rejects(()=>x.vault.apply(v.token),/changed since preview/);
  assert.equal(await p.readFile(targets['apps.json'],'utf8'),'LIVE_APPS');
  const fresh=await x.vault.preview(pointId);
  await p.rm(safety(targets['apps.json']));
  await assert.rejects(()=>x.vault.apply(fresh.token),/changed since preview|missing/);
  assert.equal(await p.readFile(targets['apps.json'],'utf8'),'LIVE_APPS');
}));
test('Active Android and profile changes abort recovery without mutation',()=>fixture(async x=>{
  const targets=await setup(x);
  x.setOnline(true);
  await assert.rejects(()=>x.vault.preview(pointId),/Android must be stopped/);
  x.setOnline(false);
  const v=await x.vault.preview(pointId);
  x.setOnline(true);
  await assert.rejects(()=>x.vault.apply(v.token),/Android must be stopped/);
  x.setOnline(false);
  const again=await x.vault.preview(pointId);
  const newProfile=x.registry.create('Other');
  x.registry.activate(newProfile.id);
  await assert.rejects(()=>x.vault.apply(again.token),/profile changed/);
  assert.equal(await p.readFile(targets['apps.json'],'utf8'),'LIVE_APPS');
}));
test('Untrusted point IDs, wrong approval tokens and unrelated paths are refused',()=>fixture(async x=>{
  const target=await setup(x);
  for(const invalid of ['../any','../../default','recovery:../../','restore:abc','',null])
    await assert.rejects(()=>x.vault.preview(invalid),/Invalid Recovery Vault point ID/);
  const v=await x.vault.preview(pointId);
  await assert.rejects(()=>x.vault.apply('b'.repeat(48)),/expired/);
  assert.equal(await p.readFile(target['apps.json'],'utf8'),'LIVE_APPS');
}));
test('Symbolic links inside safety copies are rejected when host permits symlink creation',async t=>fixture(async x=>{
  const targets=await setup(x);
  const linked=path.join(safety(targets.apks),'link.apk');
  try{await p.symlink(targets['apps.json'],linked,'file');}
  catch(e){
    if(['EPERM','EACCES','ENOSYS'].includes(e.code)){t.skip('Host does not permit symlink creation');return;}
    throw e;
  }
  await assert.rejects(()=>x.vault.preview(pointId),/Symlinks|special files|Unsupported/);
  assert.equal(await p.readFile(targets['apps.json'],'utf8'),'LIVE_APPS');
}));
test('Recovery approval must be typed and confirmed natively in Electron',()=>{
  const main=fs.readFileSync(path.join(__dirname,'../src/main.js'),'utf8');
  const preload=fs.readFileSync(path.join(__dirname,'../src/preload.js'),'utf8');
  const ui=fs.readFileSync(path.join(__dirname,'../src/ui/backup-ui.js'),'utf8');
  const html=fs.readFileSync(path.join(__dirname,'../src/ui/index.html'),'utf8');
  for(const channel of ['backup:recoveryList','backup:recoveryPreview','backup:recoveryApply'])
    assert.ok(main.includes("ipcMain.handle('"+channel+"'"));
  assert.ok(main.includes("request?.ack!=='RECOVER'"));
  assert.ok(main.includes("title:'Confirm Recovery Vault rollback'"));
  assert.ok(main.includes('defaultId:0,cancelId:0'));
  assert.ok(main.includes('return recoveryVault.apply(token)'));
  assert.ok(preload.includes("recoveryApply: (token,ack)"));
  assert.ok(ui.includes("window.prompt(L.recoveryAsk)!=='RECOVER'"));
  assert.ok(ui.includes('api.recoveryPreview('));
  assert.ok(ui.includes('api.recoveryApply(token'));
  assert.ok(!ui.includes('innerHTML'));
  for(const id of ['btnBackupRecoveryFind','btnBackupRecoveryInspect','backupRecoverySelect'])
    assert.ok(html.includes('id="'+id+'"'));
});
