'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),p=fs.promises,path=require('node:path'),os=require('node:os');
const {createRegistry}=require('../src/core/profiles');
const {EncryptedBackupCenter}=require('../src/core/encrypted-backup');
const {RecoveryVault}=require('../src/core/recovery-vault');
const {SafetyRetention}=require('../src/core/safety-retention');

const PASSWORD='Strong retention and cleanup secret for Windows 2026';
const WRONG='Another strong but incorrect retention password 2026';
const POINT='restore:fedcba9876543210abcd';
const POINT2='restore:11111111111111111111';
async function put(f,v){await p.mkdir(path.dirname(f),{recursive:true});await p.writeFile(f,v);}
async function fixture(fn){
  const root=await p.mkdtemp(path.join(os.tmpdir(),'asi-retention-test-'));
  const data=path.join(root,'data'),avd=path.join(root,'avds');
  await Promise.all([p.mkdir(data),p.mkdir(avd)]);
  let online=false;
  let activity=0;
  const registry=createRegistry(data);
  const cfg={registry,dataDir:data,getAvdHome:()=>avd,
    assertIdle:async()=>{if(online)throw Error('Android must be stopped');},
    onBusy:on=>{activity+=on?1:-1;if(activity<0)throw Error('Nested lock underflow');}};
  const encrypted=new EncryptedBackupCenter(cfg);
  const vault=new RecoveryVault({...cfg,encryptedBackupCenter:encrypted});
  const retention=new SafetyRetention({vault,encryptedBackupCenter:encrypted});
  const layout=vault.layout();
  const live=layout.targets['apps.json'];
  const source=live+'.asi-'+POINT.slice(8)+'.before-restore';
  const sourceApks=layout.targets.apks+'.asi-'+POINT.slice(8)+'.before-restore';
  await put(live,'ACTIVE_APPS_NOT_TO_DELETE');
  await put(path.join(layout.targets.apks,'live.apk'),'ACTIVE_APK_NOT_TO_DELETE');
  await put(source,'PRIVATE_PLAINTEXT_CATALOG');
  await put(path.join(sourceApks,'old.apk'),'PRIVATE_APK_OLD');
  const x={root,data,avd,registry,encrypted,vault,retention,layout,live,source,sourceApks,
    running:on=>online=on,getActivity:()=>activity};
  try{return await fn(x);}
  finally{await p.rm(root,{recursive:true,force:true});}
}
async function sealed(x){
  const created=await x.vault.sealPoint(POINT,PASSWORD);
  const archive=(await x.vault.listSealed()).archives[0];
  return {created,archive};
}
test('retention report is read-only, age is advisory and sizes exclude active profile data',()=>fixture(async x=>{
  const {archive}=await sealed(x);
  const oldDate=new Date(Date.now()-45*86400000);
  await p.utimes(x.source,oldDate,oldDate);
  await p.utimes(x.sourceApks,oldDate,oldDate);
  const report=await x.retention.report(30);
  assert.equal(report.profileId,'default');
  assert.equal(report.automaticCleanup,false);
  assert.equal(report.totals.plaintextPoints,1);
  assert.equal(report.totals.encryptedArchives,1);
  assert.ok(report.totals.plaintextBytes>0);
  assert.ok(report.totals.encryptedBytes>0);
  assert.equal(report.totals.oldPlaintextBytes,report.totals.plaintextBytes);
  assert.equal(report.plaintext[0].oldEnough,true);
  assert.equal(report.encrypted[0].authenticated,false);
  assert.equal(report.encrypted[0].id,archive.id);
  assert.equal(await p.readFile(x.source,'utf8'),'PRIVATE_PLAINTEXT_CATALOG');
  assert.equal(await p.readFile(x.live,'utf8'),'ACTIVE_APPS_NOT_TO_DELETE');
  assert.equal(x.getActivity(),0);
}));
test('only a matching authenticated sealed archive can authorize preview',()=>fixture(async x=>{
  const {archive}=await sealed(x);
  const v=await x.retention.preview(POINT,archive.id,PASSWORD);
  assert.equal(v.authenticated,true);
  assert.equal(v.plaintextCleanup,true);
  assert.equal(v.files,2);
  assert.ok(v.bytes>0);
  assert.equal(v.profileId,'default');
  assert.match(v.token,/^[0-9a-f]{48}$/);
  assert.equal(await p.readFile(x.source,'utf8'),'PRIVATE_PLAINTEXT_CATALOG');
}));
test('confirmed cleanup removes only original plaintext recovery point; archive and live data survive',()=>fixture(async x=>{
  const {archive}=await sealed(x);
  const v=await x.retention.preview(POINT,archive.id,PASSWORD);
  const result=await x.retention.apply(v.token,PASSWORD);
  assert.equal(result.ok,true);
  assert.equal(result.encryptedArchivePreserved,true);
  assert.equal(result.liveDataUnchanged,true);
  assert.equal(result.secureErase,false);
  assert.equal(fs.existsSync(x.source),false);
  assert.equal(fs.existsSync(x.sourceApks),false);
  assert.equal(await p.readFile(x.live,'utf8'),'ACTIVE_APPS_NOT_TO_DELETE');
  assert.equal(await p.readFile(path.join(x.layout.targets.apks,'live.apk'),'utf8'),'ACTIVE_APK_NOT_TO_DELETE');
  const verify=await x.vault.previewSealed(archive.id,PASSWORD);
  assert.equal(verify.sealed,true);
  assert.equal(verify.encrypted,true);
  assert.deepEqual((await x.vault.list()).points,[]);
  assert.equal(x.getActivity(),0);
  await assert.rejects(()=>x.retention.apply(v.token,PASSWORD),/expired/);
}));
test('wrong password or mutated sealed ciphertext must never delete plaintext',()=>fixture(async x=>{
  const {created,archive}=await sealed(x);
  await assert.rejects(()=>x.retention.preview(POINT,archive.id,WRONG),/authentication/);
  const v=await x.retention.preview(POINT,archive.id,PASSWORD);
  await assert.rejects(()=>x.retention.apply(v.token,WRONG),/authentication/);
  assert.equal(await p.readFile(x.source,'utf8'),'PRIVATE_PLAINTEXT_CATALOG');
  const payload=path.join(created.path,'payload');
  const file=path.join(payload,(await p.readdir(payload))[0]);
  const data=await p.readFile(file);data[data.length-1]^=0xf0;await p.writeFile(file,data);
  await assert.rejects(()=>x.retention.preview(POINT,archive.id,PASSWORD),/authentication/);
  assert.equal(await p.readFile(x.source,'utf8'),'PRIVATE_PLAINTEXT_CATALOG');
  assert.equal(await p.readFile(x.live,'utf8'),'ACTIVE_APPS_NOT_TO_DELETE');
}));
test('plaintext changes after preview, even same-size replacement, block cleanup',()=>fixture(async x=>{
  const {archive}=await sealed(x);
  const v=await x.retention.preview(POINT,archive.id,PASSWORD);
  const txt=await p.readFile(x.source,'utf8');
  await put(x.source,txt.replace('PRIVATE','CHANGED'));
  await assert.rejects(()=>x.retention.apply(v.token,PASSWORD),/does not match|changed since preview|content mismatch/);
  assert.equal(fs.existsSync(x.source),true);
  assert.equal(await p.readFile(x.live,'utf8'),'ACTIVE_APPS_NOT_TO_DELETE');
}));
test('source point and sealed manifest IDs must match exactly',()=>fixture(async x=>{
  const {archive}=await sealed(x);
  const other=x.live+'.asi-'+POINT2.slice(8)+'.before-restore';
  await put(other,'PRIVATE_PLAINTEXT_CATALOG');
  await assert.rejects(()=>x.retention.preview(POINT2,archive.id,PASSWORD),/does not match/);
  assert.equal(fs.existsSync(other),true);
  assert.equal(fs.existsSync(x.source),true);
}));
test('other Android profile, expired token and canceled token cannot clean old profile',()=>fixture(async x=>{
  const {archive}=await sealed(x);
  const token=(await x.retention.preview(POINT,archive.id,PASSWORD)).token;
  assert.equal(x.retention.cancel(token),true);
  await assert.rejects(()=>x.retention.apply(token,PASSWORD),/expired/);
  const v=await x.retention.preview(POINT,archive.id,PASSWORD);
  const second=x.registry.create('Isolated');
  x.registry.activate(second.id);
  await assert.rejects(()=>x.retention.apply(v.token,PASSWORD),/profile changed/);
  await assert.rejects(()=>x.retention.preview(POINT,archive.id,PASSWORD),/not found/);
  assert.equal(fs.existsSync(x.source),true);
}));
test('invalid IDs and retention policies fail closed',()=>fixture(async x=>{
  const {archive}=await sealed(x);
  for(const age of [0,-1,3651,3.5,'30',null])
    await assert.rejects(()=>x.retention.report(age),/integer between/);
  for(const id of ['../profiles','restore:abc','recovery:../../',null])
    await assert.rejects(()=>x.retention.preview(id,archive.id,PASSWORD),/Invalid plaintext/);
  for(const id of ['../../archive',null,'sealed:ASI-Sealed-xxx'])
    await assert.rejects(()=>x.retention.preview(POINT,id,PASSWORD),/Invalid encrypted/);
  assert.equal(await p.readFile(x.source,'utf8'),'PRIVATE_PLAINTEXT_CATALOG');
}));
test('running Android blocks both retention checks and destructive commit',()=>fixture(async x=>{
  const {archive}=await sealed(x);
  x.running(true);
  await assert.rejects(()=>x.retention.report(),/Android must be stopped/);
  await assert.rejects(()=>x.retention.preview(POINT,archive.id,PASSWORD),/Android must be stopped/);
  x.running(false);
  const v=await x.retention.preview(POINT,archive.id,PASSWORD);
  x.running(true);
  await assert.rejects(()=>x.retention.apply(v.token,PASSWORD),/Android must be stopped/);
  x.running(false);
  assert.equal(fs.existsSync(x.source),true);
}));
test('symlinked plaintext point cannot be deleted',async t=>fixture(async x=>{
  const {archive}=await sealed(x);
  const rogue=path.join(x.sourceApks,'linked.apk');
  try{await p.symlink(x.live,rogue,'file');}
  catch(e){
    if(['EPERM','EACCES','ENOSYS'].includes(e.code)){t.skip('Windows symlink privilege unavailable');return;}
    throw e;
  }
  await assert.rejects(()=>x.retention.preview(POINT,archive.id,PASSWORD),/Symlinks|special files/);
  assert.equal(fs.existsSync(x.source),true);
}));
test('manual cleanup IPC keeps typed + native confirmations and no auto-delete schedule',()=>{
  const root=path.join(__dirname,'..');
  const main=fs.readFileSync(path.join(root,'src/main.js'),'utf8');
  const preload=fs.readFileSync(path.join(root,'src/preload.js'),'utf8');
  const ui=fs.readFileSync(path.join(root,'src/ui/backup-ui.js'),'utf8');
  const html=fs.readFileSync(path.join(root,'src/ui/index.html'),'utf8');
  for(const key of ['backup:retentionReport','backup:cleanupPreview','backup:cleanupApply','backup:cleanupCancel'])
    assert.ok(main.includes("ipcMain.handle('"+key+"'"),key);
  assert.ok(main.includes("request?.ack!=='DELETE PLAINTEXT'"));
  assert.ok(main.includes("title:'Confirm irreversible plaintext cleanup'"));
  assert.ok(main.includes("defaultId:0,cancelId:0"));
  assert.ok(preload.includes('cleanupApply: (token,password,ack)'));
  assert.ok(ui.includes("window.prompt(L.cleanupAsk)!=='DELETE PLAINTEXT'"));
  assert.ok(ui.includes('api.cleanupPreview('));
  assert.ok(!ui.includes('innerHTML'));
  for(const key of ['btnBackupRetentionReport','backupRetentionDays','btnBackupCleanupPreview','btnBackupCleanupApply'])
    assert.ok(html.includes('id="'+key+'"'));
});
