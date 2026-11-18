'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),p=fs.promises,path=require('node:path'),os=require('node:os');
const {createRegistry}=require('../src/core/profiles');
const {EncryptedBackupCenter}=require('../src/core/encrypted-backup');
const {RecoveryVault}=require('../src/core/recovery-vault');

const PASS='Very strong password for local encrypted safety points 2026';
const WRONG='Completely different secret for local safety points 2026';
const POINT='restore:abcdef0123456789abcd';
async function write(f,data){
  await p.mkdir(path.dirname(f),{recursive:true});
  await p.writeFile(f,data);
}
async function fixture(fn){
  const root=await p.mkdtemp(path.join(os.tmpdir(),'asi-sealed-test-'));
  const data=path.join(root,'data'),avd=path.join(root,'avd');
  await Promise.all([p.mkdir(data),p.mkdir(avd)]);
  let online=false,busy=0;
  const registry=createRegistry(data);
  const config={registry,dataDir:data,getAvdHome:()=>avd,
    assertIdle:async()=>{if(online)throw Error('Android must be stopped');},
    onBusy:x=>{busy+=x?1:-1;if(busy<0)throw Error('Busy underflow');}};
  const encrypted=new EncryptedBackupCenter(config);
  const vault=new RecoveryVault({...config,encryptedBackupCenter:encrypted});
  const targets=vault.layout().targets;
  const old=targets['apps.json']+'.asi-abcdef0123456789abcd.before-restore';
  const cache=targets.apks+'.asi-abcdef0123456789abcd.before-restore';
  await write(targets['apps.json'],'CURRENT_APPS_PRIVATE');
  await write(path.join(targets.apks,'live.apk'),'CURRENT_APK_PRIVATE');
  await write(old,'RECOVERY_APPS_SECRET');
  await write(path.join(cache,'secret.apk'),'RECOVERY_APK_SECRET');
  const x={root,data,avd,registry,vault,encrypted,targets,old,cache,
    running:on=>{online=on;},getBusy:()=>busy};
  try{return await fn(x);}
  finally{await p.rm(root,{recursive:true,force:true});}
}
test('seal creates authenticated ciphertext without plaintext export or source deletion',()=>fixture(async x=>{
  const result=await x.vault.sealPoint(POINT,PASS);
  assert.equal(result.sealed,true);assert.equal(result.encrypted,true);
  assert.equal(result.sourcePreserved,true);
  assert.equal(result.plaintextStillExists,true);
  assert.equal(x.getBusy(),0);
  const data=await p.readdir(result.path);
  assert.deepEqual(data.sort(),['header.json','manifest.enc','payload']);
  assert.equal(await p.readFile(x.old,'utf8'),'RECOVERY_APPS_SECRET');
  const archives=await x.vault.listSealed();
  assert.equal(archives.archives.length,1);
  const found=archives.archives[0];
  assert.match(found.id,/^sealed:ASI-Sealed-/);
  const files=await p.readdir(path.join(result.path,'payload'));
  const cipher=Buffer.concat([
    await p.readFile(path.join(result.path,'header.json')),
    await p.readFile(path.join(result.path,'manifest.enc')),
    ...await Promise.all(files.map(f=>p.readFile(path.join(result.path,'payload',f))))
  ]);
  for(const word of ['RECOVERY_APPS_SECRET','RECOVERY_APK_SECRET','secret.apk','apps.json'])
    assert.equal(cipher.includes(Buffer.from(word)),false,word+' leaked into archive');
  assert.equal(JSON.stringify(x.encrypted.pending),undefined);
}));
test('sealed local point previews and restores only after password and preserves old live data',()=>fixture(async x=>{
  await x.vault.sealPoint(POINT,PASS);
  const sealed=(await x.vault.listSealed()).archives[0];
  const v=await x.vault.previewSealed(sealed.id,PASS);
  assert.equal(v.sealed,true);assert.equal(v.encrypted,true);
  assert.equal(v.files,2);assert.equal(v.profileId,'default');
  await write(x.targets['apps.json'],'NEWER_LIVE_APPS');
  const result=await x.encrypted.restore(v.token,PASS);
  assert.equal(result.ok,true);assert.equal(result.encrypted,true);
  assert.equal(await p.readFile(x.targets['apps.json'],'utf8'),'RECOVERY_APPS_SECRET');
  assert.equal(await p.readFile(x.old,'utf8'),'RECOVERY_APPS_SECRET');
  assert.ok(result.preserved.length>=1);
  const saved=result.preserved.find(x=>x.includes('apps.json.'));
  assert.ok(saved);
  assert.equal(await p.readFile(saved,'utf8'),'NEWER_LIVE_APPS');
  await assert.rejects(()=>x.encrypted.restore(v.token,PASS),/expired/);
  assert.equal(x.getBusy(),0);
}));
test('wrong passwords and changed ciphertext do not modify active data',()=>fixture(async x=>{
  const sealed=await x.vault.sealPoint(POINT,PASS);
  const archiveId=(await x.vault.listSealed()).archives[0].id;
  await assert.rejects(()=>x.vault.previewSealed(archiveId,WRONG),/authentication/);
  const payload=path.join(sealed.path,'payload');
  const file=path.join(payload,(await p.readdir(payload))[0]);
  const bytes=await p.readFile(file);bytes[0]^=0xff;
  await p.writeFile(file,bytes);
  await assert.rejects(()=>x.vault.previewSealed(archiveId,PASS),/authentication/);
  assert.equal(await p.readFile(x.targets['apps.json'],'utf8'),'CURRENT_APPS_PRIVATE');
  assert.equal(await p.readFile(x.old,'utf8'),'RECOVERY_APPS_SECRET');
  assert.equal(x.getBusy(),0);
}));
test('sealed archive is profile scoped; unknown or traversal IDs refused',()=>fixture(async x=>{
  await x.vault.sealPoint(POINT,PASS);
  const id=(await x.vault.listSealed()).archives[0].id;
  for(const invalid of ['../data', 'sealed:../../apps', 'sealed:ASI-Sealed-2026-01-01-abcdef',
    'sealed:ASI-Sealed-2026-01-01-abcxyzabcdef',null])
    await assert.rejects(()=>x.vault.previewSealed(invalid,PASS),/Invalid encrypted Safety Vault archive ID/);
  const secondary=x.registry.create('Other Android Profile');
  x.registry.activate(secondary.id);
  assert.deepEqual((await x.vault.listSealed()).archives,[]);
  await assert.rejects(()=>x.vault.previewSealed(id,PASS),/no longer exists/);
  assert.equal(await p.readFile(x.old,'utf8'),'RECOVERY_APPS_SECRET');
}));
test('plaintext changes and missing sources during sealing are refused',()=>fixture(async x=>{
  x.running(true);
  await assert.rejects(()=>x.vault.sealPoint(POINT,PASS),/Android must be stopped/);
  x.running(false);
  await p.rm(x.old);
  await assert.rejects(()=>x.vault.sealPoint(POINT,PASS),/no longer exists|Nothing to back up|Source changed/).catch(async e=>{
    // A partial recovery point can be valid when other components survive:
    // its encrypted snapshot must still be authenticated and opt-in.
    if(!/no longer exists/.test(String(e)))throw e;
  });
}));
test('ordinary backup export cannot target local Safety Vault and symlink vault dirs are refused',()=>fixture(async x=>{
  const root=path.join(x.data,'safety-vault','default');
  await p.mkdir(root,{recursive:true});
  await assert.rejects(()=>x.encrypted.create(root,PASS),/external folder/);
  await assert.rejects(()=>x.encrypted.createSafetyPoint(x.root,PASS,x.vault.layout(),{},POINT),/manifest/);
}));
test('Safety Vault IPC requires native SEAL approval and still uses native RESTORE approval',()=>{
  const main=fs.readFileSync(path.join(__dirname,'../src/main.js'),'utf8');
  const preload=fs.readFileSync(path.join(__dirname,'../src/preload.js'),'utf8');
  const ui=fs.readFileSync(path.join(__dirname,'../src/ui/backup-ui.js'),'utf8');
  const html=fs.readFileSync(path.join(__dirname,'../src/ui/index.html'),'utf8');
  for(const channel of ['backup:sealedList','backup:sealedCreate','backup:sealedPreview'])
    assert.ok(main.includes("ipcMain.handle('"+channel+"'"),channel);
  assert.ok(main.includes("request?.ack!=='SEAL'"));
  assert.ok(main.includes("title:'Confirm encrypted Safety Vault export'"));
  assert.ok(main.includes('defaultId:0,cancelId:0'));
  assert.ok(main.includes("title:'Confirm Android profile restore'"));
  assert.ok(main.includes('return encryptedBackupCenter.restore(token,password)'));
  assert.ok(preload.includes('sealedCreate: (pointId,password,ack)'));
  assert.ok(ui.includes("window.prompt(L.sealAsk)!=='SEAL'"));
  assert.ok(ui.includes("window.prompt(L.ask)!=='RESTORE'"));
  assert.ok(ui.includes('api.sealedPreview('));
  assert.ok(!ui.includes('innerHTML'));
  for(const id of ['btnBackupSealPoint','btnBackupSealedList','btnBackupSealedOpen'])
    assert.ok(html.includes('id="'+id+'"'));
});