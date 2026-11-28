'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),p=fs.promises,path=require('node:path'),os=require('node:os');
const {createRegistry}=require('../src/core/profiles');
const {EncryptedBackupCenter}=require('../src/core/encrypted-backup');
const {RecoveryVault}=require('../src/core/recovery-vault');
const {RestoreDrill,sandboxRehearsal}=require('../src/core/restore-drill');

const PASS='A strong recovery readiness drill password 2026';
const WRONG='Another long but incorrect readiness password 2026';
const POINT='restore:1234567890abcdef1234';
async function write(file,text){await p.mkdir(path.dirname(file),{recursive:true});await p.writeFile(file,text);}
async function fixture(fn){
  const root=await p.mkdtemp(path.join(os.tmpdir(),'asi-drill-test-'));
  const data=path.join(root,'data'),avd=path.join(root,'avds'),out=path.join(root,'outside');
  await Promise.all([p.mkdir(data),p.mkdir(avd),p.mkdir(out)]);
  const registry=createRegistry(data);let online=false,activity=0;
  const options={registry,dataDir:data,getAvdHome:()=>avd,
    assertIdle:async()=>{if(online)throw Error('Android must be stopped');},
    onBusy:on=>{activity+=on?1:-1;if(activity<0)throw Error('Busy lock underflow');}};
  const encrypted=new EncryptedBackupCenter(options);
  const vault=new RecoveryVault({...options,encryptedBackupCenter:encrypted});
  const drill=new RestoreDrill({vault,encryptedBackupCenter:encrypted});
  const layout=encrypted.layout();
  await write(layout.targets['apps.json'],'LIVE_APPS_PRIVATE_DO_NOT_MODIFY');
  await write(path.join(layout.targets.apks,'secret.apk'),'LIVE_APK_SECRET');
  await write(path.join(layout.targets.avd,'userdata-qemu.img'),'LIVE_USERDATA_SECRET');
  const x={root,data,avd,out,registry,encrypted,vault,drill,layout,
    setRunning:v=>online=v,getActivity:()=>activity};
  try{return await fn(x);}
  finally{await p.rm(root,{recursive:true,force:true});}
}
async function external(x){return x.encrypted.create(x.out,PASS);}
async function sealed(x){
  await write(x.layout.targets['apps.json']+'.asi-'+POINT.slice(8)+'.before-restore','SAVED_SAFETY_PRIVATE');
  await x.vault.sealPoint(POINT,PASS);
  return (await x.vault.listSealed()).archives[0];
}
async function assertLive(x){
  assert.equal(await p.readFile(x.layout.targets['apps.json'],'utf8'),'LIVE_APPS_PRIVATE_DO_NOT_MODIFY');
  assert.equal(await p.readFile(path.join(x.layout.targets.apks,'secret.apk'),'utf8'),'LIVE_APK_SECRET');
  assert.equal(await p.readFile(path.join(x.layout.targets.avd,'userdata-qemu.img'),'utf8'),'LIVE_USERDATA_SECRET');
}
test('external encrypted backup readiness checks all payloads and target-drive free space',()=>fixture(async x=>{
  const created=await external(x);
  const report=await x.drill.preview('external',created.path,PASS);
  assert.equal(report.authenticated,true);
  assert.equal(report.readiness,true);
  assert.equal(report.sourceType,'external');
  assert.equal(report.profileId,'default');
  assert.ok(report.diskSpace.length>=1);
  assert.ok(report.diskSpace.every(v=>v.availableBytes>=v.requiredBytes));
  assert.equal(report.guestBootTested,false);
  assert.equal(report.privatePlaintextWritten,false);
  await assertLive(x);
  assert.equal(x.getActivity(),0);
}));
test('isolated synthetic restore drill authenticates again, rehearses rollback and touches no live profile',()=>fixture(async x=>{
  const created=await external(x);
  const prev=await x.drill.preview('external',created.path,PASS);
  const result=await x.drill.run(prev.token,PASS);
  assert.equal(result.ok,true);assert.equal(result.drill,true);
  assert.equal(result.authenticated,true);
  assert.equal(result.syntheticSandboxCleaned,true);
  assert.equal(result.privatePlaintextWritten,false);
  assert.equal(result.liveProfileModified,false);
  assert.equal(result.guestBootTested,false);
  assert.deepEqual(result.syntheticStages,['apps.json','apks','avd']);
  assert.ok(result.filesVerified>=3);
  await assertLive(x);
  await assert.rejects(()=>x.drill.run(prev.token,PASS),/expired/);
  assert.ok(fs.existsSync(created.path));
  assert.equal(x.getActivity(),0);
}));
test('sealed local Safety Vault point supports same safe drill without touching plaintext recovery',()=>fixture(async x=>{
  const archive=await sealed(x);
  const prev=await x.drill.preview('sealed',archive.id,PASS);
  assert.equal(prev.sourceType,'sealed');
  const r=await x.drill.run(prev.token,PASS);
  assert.equal(r.ok,true);assert.equal(r.filesVerified,1);
  assert.deepEqual(r.syntheticStages,['apps.json']);
  assert.equal(await p.readFile(x.layout.targets['apps.json']+'.asi-'+POINT.slice(8)+'.before-restore','utf8'),'SAVED_SAFETY_PRIVATE');
  assert.equal((await x.vault.listSealed()).archives.length,1);
  await assertLive(x);
}));
test('wrong password, altered ciphertext and changed manifest are refused before staging',()=>fixture(async x=>{
  const created=await external(x);
  await assert.rejects(()=>x.drill.preview('external',created.path,WRONG),/authentication/);
  const prev=await x.drill.preview('external',created.path,PASS);
  await assert.rejects(()=>x.drill.run(prev.token,WRONG),/authentication/);
  const good=await x.drill.preview('external',created.path,PASS);
  const blob=path.join(created.path,'payload',(await p.readdir(path.join(created.path,'payload')))[0]);
  const contents=await p.readFile(blob);contents[0]^=0xaa;await p.writeFile(blob,contents);
  await assert.rejects(()=>x.drill.run(good.token,PASS),/authentication/);
  await assert.rejects(()=>x.drill.preview('external',created.path,PASS),/authentication/);
  await assertLive(x);
}));
test('preview token is single-use, cancellable and expires',()=>fixture(async x=>{
  const created=await external(x);
  const prev=await x.drill.preview('external',created.path,PASS);
  assert.equal(x.drill.cancel(prev.token),true);
  await assert.rejects(()=>x.drill.run(prev.token,PASS),/expired/);
  const fresh=await x.drill.preview('external',created.path,PASS);
  x.drill.pending.at=Date.now()-11*60*1000;
  await assert.rejects(()=>x.drill.run(fresh.token,PASS),/expired/);
  await assertLive(x);
}));
test('profile switch or running Android stops the drill without modifying either profile',()=>fixture(async x=>{
  const created=await external(x);
  x.setRunning(true);
  await assert.rejects(()=>x.drill.preview('external',created.path,PASS),/Android must be stopped/);
  x.setRunning(false);
  const prev=await x.drill.preview('external',created.path,PASS);
  x.setRunning(true);
  await assert.rejects(()=>x.drill.run(prev.token,PASS),/Android must be stopped/);
  x.setRunning(false);
  const next=await x.drill.preview('external',created.path,PASS);
  const second=x.registry.create('Separate DRILL Target');
  x.registry.activate(second.id);
  await assert.rejects(()=>x.drill.run(next.token,PASS),/profile changed/);
  await assertLive(x);
}));
test('encrypted sources inside live application data are never accepted as external archive',()=>fixture(async x=>{
  const entry=await sealed(x);
  const root=await x.vault.sealedFolder();
  const folder=path.join(root,entry.id.slice(7));
  await assert.rejects(()=>x.drill.preview('external',folder,PASS),/must be outside ApkStart data/);
  await assert.rejects(()=>x.drill.preview('sealed',x.out,PASS),/Invalid sealed drill archive identifier/);
  await assert.rejects(()=>x.drill.preview('sealed','sealed:../../userdata',PASS),/Invalid sealed drill archive identifier/);
  await assertLive(x);
}));
test('isolated synthetic stage/rename rollback runs independently with no original file material',async()=>{
  const fake={components:['apps.json','apks','icons','avd']};
  const tempRoot=os.tmpdir();
  const before=new Set((await p.readdir(tempRoot)).filter(v=>v.startsWith('asi-restore-drill-')));
  const result=await sandboxRehearsal(fake);
  assert.equal(result.syntheticOnly,true);
  assert.equal(result.privatePlaintextWritten,false);
  assert.deepEqual(result.componentsTested,['apps.json','apks','icons','avd']);
  const after=new Set((await p.readdir(tempRoot)).filter(v=>v.startsWith('asi-restore-drill-')));
  for(const entry of after)assert.ok(before.has(entry),'Synthetic sandbox leaked: '+entry);
});
test('unknown sealed archive, broken source and missing ciphertext fail closed',()=>fixture(async x=>{
  const entry=await sealed(x);
  await assert.rejects(()=>x.drill.preview('sealed','sealed:ASI-Sealed-2026-11-18-000000000000',PASS),/not found/);
  const selected=await x.drill.preview('sealed',entry.id,PASS);
  const archiveFolder=path.join(await x.vault.sealedFolder(),entry.id.slice(7));
  const manifest=path.join(archiveFolder,'manifest.enc');
  await p.rm(manifest);
  await assert.rejects(()=>x.drill.run(selected.token,PASS),/ENOENT|manifest/);
  assert.equal((await x.vault.listSealed()).archives.length,1);
  await assertLive(x);
}));
test('IPC and renderer enforce typed DRILL + native approval; no restore on drill path',()=>{
  const root=path.join(__dirname,'..');
  const main=fs.readFileSync(path.join(root,'src/main.js'),'utf8');
  const preload=fs.readFileSync(path.join(root,'src/preload.js'),'utf8');
  const ui=fs.readFileSync(path.join(root,'src/ui/backup-ui.js'),'utf8');
  const html=fs.readFileSync(path.join(root,'src/ui/index.html'),'utf8');
  for(const channel of ['backup:drillSealedPreview','backup:drillExternalPreview','backup:drillRun','backup:drillCancel'])
    assert.ok(main.includes("ipcMain.handle('"+channel+"'"),channel);
  assert.ok(main.includes("request?.ack!=='DRILL'"));
  assert.ok(main.includes("title:'Confirm safe restore drill'"));
  assert.ok(main.includes('defaultId:0,cancelId:0'));
  assert.ok(main.includes("restoreDrill.run(request.token,request.password)"));
  assert.ok(main.includes("audited('restore-drill'"), 'Drill must be audited');
  assert.ok(preload.includes("drillRun: (token,password,ack)"));
  assert.ok(ui.includes("window.prompt(L.drillAsk)!=='DRILL'"));
  assert.ok(!ui.includes('innerHTML'));
  for(const name of ['btnBackupDrillToggle','btnBackupDrillSealed','btnBackupDrillExternal','btnBackupDrillRun'])
    assert.ok(html.includes('id="'+name+'"'));
});
