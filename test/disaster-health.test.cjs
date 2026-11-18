'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),p=fs.promises,path=require('node:path'),os=require('node:os');
const {createRegistry}=require('../src/core/profiles');
const {EncryptedBackupCenter}=require('../src/core/encrypted-backup');
const {RecoveryVault}=require('../src/core/recovery-vault');
const {DisasterHealth}=require('../src/core/disaster-health');

const PASS='A strong synthetic disaster recovery password 2026';
const WRONG='A different invalid disaster recovery password 2026';
const HASH='abcdef0123456789abcd',TX='fedcba9876543210abcd',POINT='restore:'+HASH;
async function write(file,content){
  await p.mkdir(path.dirname(file),{recursive:true});await p.writeFile(file,content);
}
async function fixture(fn){
  const root=await p.mkdtemp(path.join(os.tmpdir(),'asi-health-'));
  const data=path.join(root,'data'),avd=path.join(root,'avd');
  await Promise.all([p.mkdir(data),p.mkdir(avd)]);
  let running=false,locks=0;
  const registry=createRegistry(data);
  const cfg={registry,dataDir:data,getAvdHome:()=>avd,
    assertIdle:async()=>{if(running)throw Error('Android must be stopped');},
    onBusy:busy=>{locks+=busy?1:-1;if(locks<0)throw Error('Lock underflow');}};
  const encrypted=new EncryptedBackupCenter(cfg);
  const vault=new RecoveryVault({...cfg,encryptedBackupCenter:encrypted});
  const health=new DisasterHealth({vault,encryptedBackupCenter:encrypted});
  const layout=vault.layout();
  const live=layout.targets['apps.json'];
  await write(live,'LIVE_ANDROID_PROFILE_DATA');
  const safety=live+'.asi-'+HASH+'.before-restore';
  await write(safety,'OLD_PLAINTEXT_RECOVERY');
  const pending=live+'.asi-'+HASH+'.before-restore.asi-'+TX+'.cleanup-pending';
  const x={root,data,avd,registry,encrypted,vault,health,layout,live,safety,pending,
    setRunning:v=>running=v,getLocks:()=>locks};
  try{return await fn(x);}
  finally{await p.rm(root,{recursive:true,force:true});}
}
async function archive(x){
  const result=await x.vault.sealPoint(POINT,PASS);
  const current=(await x.vault.listSealed()).archives[0];
  return {result,id:current.id};
}
async function quarantine(x){
  await p.rename(x.safety,x.pending);
  return 'pending:restore:'+HASH+':'+TX;
}
test('health report is offline and read only; detects quarantine, stage and partial archive',()=>fixture(async x=>{
  const {id}=await archive(x);
  const qid=await quarantine(x);
  const staged=x.live+'.asi-'+TX+'.stage';
  await write(staged,'STAGE_PRIVATE');
  const partialRoot=await x.vault.sealedFolder();
  const partial='ASI-Sealed-2026-11-18-abcdef012345.partial';
  await p.mkdir(path.join(partialRoot,partial));
  const report=await x.health.report();
  assert.equal(report.profileId,'default');
  assert.equal(report.archivesAuthenticated,false);
  assert.equal(report.automaticRepair,false);
  assert.equal(report.automaticCleanup,false);
  assert.equal(report.localRecoveryPoints,0);
  assert.equal(report.encryptedArchives,1);
  assert.equal(report.archives[0].id,id);
  assert.equal(report.quarantine.length,1);
  assert.equal(report.quarantine[0].id,qid);
  assert.equal(report.quarantine[0].rescuable,true);
  assert.equal(report.stages.length,1);
  assert.equal(report.partialArchives.length,1);
  assert.equal(await p.readFile(x.pending,'utf8'),'OLD_PLAINTEXT_RECOVERY');
  assert.equal(await p.readFile(x.live,'utf8'),'LIVE_ANDROID_PROFILE_DATA');
  assert.equal(x.getLocks(),0);
}));
test('full encrypted health verification authenticates every ciphertext and enforces password',()=>fixture(async x=>{
  const {id,result}=await archive(x);
  const okay=await x.health.verifyArchive(id,PASS);
  assert.equal(okay.ok,true);assert.equal(okay.authenticated,true);
  assert.equal(okay.sourcePointId,POINT);
  assert.equal(okay.files,1);
  await assert.rejects(()=>x.health.verifyArchive(id,WRONG),/authentication/);
  const blobs=path.join(result.path,'payload');
  const file=path.join(blobs,(await p.readdir(blobs))[0]);
  const raw=await p.readFile(file);raw[0]^=0xf0;await p.writeFile(file,raw);
  await assert.rejects(()=>x.health.verifyArchive(id,PASS),/authentication/);
  assert.equal(await p.readFile(x.safety,'utf8'),'OLD_PLAINTEXT_RECOVERY');
  assert.equal(await p.readFile(x.live,'utf8'),'LIVE_ANDROID_PROFILE_DATA');
}));
test('explicit rescue renames only surviving cleanup quarantine back to safety location',()=>fixture(async x=>{
  await archive(x);
  const qid=await quarantine(x);
  const preview=await x.health.previewRescue(qid);
  assert.equal(preview.healthRescue,true);assert.equal(preview.pointId,POINT);
  assert.equal(preview.files,1);
  assert.match(preview.token,/^[a-f0-9]{48}$/);
  assert.equal(fs.existsSync(x.safety),false);
  const outcome=await x.health.applyRescue(preview.token);
  assert.equal(outcome.ok,true);
  assert.equal(outcome.liveDataUnchanged,true);
  assert.equal(outcome.encryptedArchivesUntouched,true);
  assert.equal(outcome.sourceWasPartial,true);
  assert.equal(fs.existsSync(x.pending),false);
  assert.equal(await p.readFile(x.safety,'utf8'),'OLD_PLAINTEXT_RECOVERY');
  assert.equal(await p.readFile(x.live,'utf8'),'LIVE_ANDROID_PROFILE_DATA');
  assert.equal((await x.vault.listSealed()).archives.length,1);
  await assert.rejects(()=>x.health.applyRescue(preview.token),/expired/);
}));
test('rescue can restore surviving subset without claiming complete recovery',()=>fixture(async x=>{
  await archive(x);
  const qid=await quarantine(x);
  const apksFragment=x.layout.targets.apks+'.asi-'+HASH+'.before-restore.asi-'+TX+'.cleanup-pending';
  await write(path.join(apksFragment,'old.apk'),'ONLY_FRAGMENT');
  const preview=await x.health.previewRescue(qid);
  assert.equal(preview.components.length,2);
  const outcome=await x.health.applyRescue(preview.token);
  assert.equal(outcome.sourceWasPartial,true);
  assert.equal(outcome.restoredFragments,2);
  assert.equal(await p.readFile(path.join(x.layout.targets.apks+'.asi-'+HASH+'.before-restore','old.apk'),'utf8'),'ONLY_FRAGMENT');
  assert.equal(await p.readFile(x.live,'utf8'),'LIVE_ANDROID_PROFILE_DATA');
}));
test('rescue preview and apply reject changes after preview and original destination collisions',()=>fixture(async x=>{
  const qid=await quarantine(x);
  const preview=await x.health.previewRescue(qid);
  await write(x.pending,'NEW_PRIVATE_FRAGMENT');
  await assert.rejects(()=>x.health.applyRescue(preview.token),/changed since rescue preview/);
  assert.equal(fs.existsSync(x.safety),false);
  const next=await x.health.previewRescue(qid);
  await write(x.safety,'SOMEONE_ELSE_SAFE');
  await assert.rejects(()=>x.health.applyRescue(next.token),/exists/);
  assert.equal(await p.readFile(x.pending,'utf8'),'NEW_PRIVATE_FRAGMENT');
  assert.equal(await p.readFile(x.safety,'utf8'),'SOMEONE_ELSE_SAFE');
}));
test('other profile never exposes cleanup fragments, and moving profile invalidates preview',()=>fixture(async x=>{
  const qid=await quarantine(x);
  const preview=await x.health.previewRescue(qid);
  const next=x.registry.create('New Host');
  x.registry.activate(next.id);
  assert.equal((await x.health.report()).quarantine.length,0);
  await assert.rejects(()=>x.health.previewRescue(qid),/no longer exists/);
  await assert.rejects(()=>x.health.applyRescue(preview.token),/Active profile changed/);
  assert.equal(fs.existsSync(x.pending),true);
}));
test('running Android blocks read-only verification, inspection and rescue',()=>fixture(async x=>{
  const qid=await quarantine(x);
  x.setRunning(true);
  await assert.rejects(()=>x.health.report(),/Android must be stopped/);
  await assert.rejects(()=>x.health.previewRescue(qid),/Android must be stopped/);
  x.setRunning(false);
  const preview=await x.health.previewRescue(qid);
  x.setRunning(true);
  await assert.rejects(()=>x.health.applyRescue(preview.token),/Android must be stopped/);
  assert.equal(fs.existsSync(x.pending),true);
}));
test('invalid, stale or canceled rescue token cannot move files',()=>fixture(async x=>{
  const qid=await quarantine(x);
  for(const id of [null,'../data','pending:restore:../../', 'pending:restore:abc:abc'])
    await assert.rejects(()=>x.health.previewRescue(id),/Invalid interrupted-cleanup/);
  const pending=await x.health.previewRescue(qid);
  assert.equal(x.health.cancelRescue(pending.token),true);
  await assert.rejects(()=>x.health.applyRescue(pending.token),/expired/);
  const next=await x.health.previewRescue(qid);
  x.health.pending.at=Date.now()-11*60*1000;
  await assert.rejects(()=>x.health.applyRescue(next.token),/expired/);
  assert.equal(await p.readFile(x.pending,'utf8'),'OLD_PLAINTEXT_RECOVERY');
}));
test('invalid symlink quarantine cannot be rescued where symlinks supported',async t=>fixture(async x=>{
  const qid=await quarantine(x);
  await p.rm(x.pending);
  try{await p.symlink(x.live,x.pending,'file');}
  catch(e){if(['EPERM','EACCES','ENOSYS'].includes(e.code)){t.skip('Windows symlink privilege denied');return;}throw e;}
  const report=await x.health.report();
  assert.ok(report.issues.length>0);
  await assert.rejects(()=>x.health.previewRescue(qid),/no longer exists|Symlinks|special files/);
  assert.equal(await p.readFile(x.live,'utf8'),'LIVE_ANDROID_PROFILE_DATA');
}));
test('native and renderer require typed RESCUE; smoke never invokes destructive rescue',()=>{
  const root=path.join(__dirname,'..');
  const main=fs.readFileSync(path.join(root,'src/main.js'),'utf8');
  const ui=fs.readFileSync(path.join(root,'src/ui/backup-ui.js'),'utf8');
  const html=fs.readFileSync(path.join(root,'src/ui/index.html'),'utf8');
  const preload=fs.readFileSync(path.join(root,'src/preload.js'),'utf8');
  for(const name of ['backup:healthReport','backup:healthVerify','backup:rescuePreview','backup:rescueApply','backup:rescueCancel'])
    assert.ok(main.includes("ipcMain.handle('"+name+"'"),name);
  assert.ok(main.includes("request?.ack!=='RESCUE'"));
  assert.ok(main.includes("title:'Confirm manual disaster rescue'"));
  assert.ok(main.includes("defaultId:0,cancelId:0"));
  assert.ok(preload.includes("rescueApply: (token,ack)"));
  assert.ok(ui.includes("window.prompt(L.healthAsk)!=='RESCUE'"));
  assert.ok(!ui.includes('innerHTML'));
  for(const id of ['btnBackupHealthRun','backupHealthArchiveSelect','btnBackupRescuePreview','btnBackupRescueApply'])
    assert.ok(html.includes('id="'+id+'"'));
});
