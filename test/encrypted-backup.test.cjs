'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),p=fs.promises,path=require('node:path'),os=require('node:os');
const {createRegistry}=require('../src/core/profiles');
const {EncryptedBackupCenter,checkHeader,validatePassword}=require('../src/core/encrypted-backup');
const PASSWORD='a deliberately long local backup password 2026';
const WRONG='a different deliberately long password 2026';
async function fixture(fn){
  const root=await p.mkdtemp(path.join(os.tmpdir(),'asi-encrypted-test-'));
  const data=path.join(root,'data'),avd=path.join(root,'avds'),out=path.join(root,'export');
  await Promise.all([p.mkdir(data),p.mkdir(avd),p.mkdir(out)]);
  const registry=createRegistry(data);let running=false;
  const svc=new EncryptedBackupCenter({registry,dataDir:data,getAvdHome:()=>avd,
    assertIdle:async()=>{if(running)throw Error('Android must be stopped');}});
  const x={root,data,avd,out,registry,svc,setRunning:(v)=>{running=v;}};
  try{return await fn(x);}finally{await p.rm(root,{recursive:true,force:true});}
}
async function write(file,text){await p.mkdir(path.dirname(file),{recursive:true});await p.writeFile(file,text);}
async function source(x){
  await write(path.join(x.data,'apps.json'),'PRIVATE_APPS_SECRET');
  await write(path.join(x.data,'apks','secret.apk'),'PRIVATE_APK_CONTENT');
  await write(path.join(x.data,'icons','icon.png'),'PRIVATE_ICON');
  await write(path.join(x.avd,'apkstart.avd','userdata-qemu.img'),'SECRET_USERDATA_TOKEN');
  await write(path.join(x.avd,'apkstart.avd','snapshots','quickboot','ram.bin'),'SECRET_MEMORY');
}
test('Encrypted exports contain no readable names or Android secrets',()=>fixture(async x=>{
  await source(x);
  const b=await x.svc.create(x.out,PASSWORD);
  assert.equal(b.encrypted,true);assert.equal(b.cipher,'AES-256-GCM');
  assert.ok(!fs.existsSync(path.join(b.path,'manifest.json')));
  assert.ok(!fs.existsSync(path.join(b.path,'apps.json')));
  checkHeader(JSON.parse(await p.readFile(path.join(b.path,'header.json'),'utf8')));
  const names=await p.readdir(path.join(b.path,'payload'));
  assert.equal(names.length,b.files);
  assert.ok(names.every(name=>/^[a-f0-9]{32}\.bin$/.test(name)));
  const packed=Buffer.concat([await p.readFile(path.join(b.path,'header.json')),
    await p.readFile(path.join(b.path,'manifest.enc')),
    ...await Promise.all(names.map(n=>p.readFile(path.join(b.path,'payload',n))))]);
  for(const word of ['PRIVATE_APPS_SECRET','SECRET_USERDATA_TOKEN','secret.apk','userdata-qemu.img'])
    assert.ok(!packed.includes(Buffer.from(word)),'Expected encryption of '+word);
  const report=await x.svc._verify(b.path,PASSWORD,x.svc.layout());
  assert.ok(report.manifest.files.some(f=>f.path==='avd/userdata-qemu.img'));
  assert.equal(await p.readFile(path.join(x.data,'apps.json'),'utf8'),'PRIVATE_APPS_SECRET');
}));
test('Correct password restores data while keeping before-restore copies',()=>fixture(async x=>{
  await source(x);
  const b=await x.svc.create(x.out,PASSWORD);
  await write(path.join(x.data,'apps.json'),'CURRENT_APPS');
  await write(path.join(x.avd,'apkstart.avd','userdata-qemu.img'),'CURRENT_USERDATA');
  const v=await x.svc.previewRestore(b.path,PASSWORD);
  assert.equal(v.encrypted,true);assert.equal(v.profileId,'default');
  assert.ok(v.space.length>=1);
  const r=await x.svc.restore(v.token,PASSWORD);
  assert.equal(r.ok,true);assert.ok(r.preserved.length>=2);
  assert.equal(await p.readFile(path.join(x.data,'apps.json'),'utf8'),'PRIVATE_APPS_SECRET');
  assert.equal(await p.readFile(path.join(x.avd,'apkstart.avd','userdata-qemu.img'),'utf8'),'SECRET_USERDATA_TOKEN');
  assert.equal(await p.readFile(r.preserved.find(k=>k.includes('apps.json')),'utf8'),'CURRENT_APPS');
  assert.equal(await p.readFile(path.join(r.preserved.find(k=>k.includes('apkstart.avd')),'userdata-qemu.img'),'utf8'),'CURRENT_USERDATA');
  await assert.rejects(()=>x.svc.restore(v.token,PASSWORD),/expired/);
}));
test('Wrong passwords and damaged ciphertext cannot change current Android data',()=>fixture(async x=>{
  await source(x);
  const b=await x.svc.create(x.out,PASSWORD);
  await write(path.join(x.data,'apps.json'),'LIVE_PRIVATE');
  await assert.rejects(()=>x.svc.previewRestore(b.path,WRONG),/authentication/);
  const v=await x.svc.previewRestore(b.path,PASSWORD);
  await assert.rejects(()=>x.svc.restore(v.token,WRONG),/authentication/);
  assert.equal(await p.readFile(path.join(x.data,'apps.json'),'utf8'),'LIVE_PRIVATE');
  const file=(await p.readdir(path.join(b.path,'payload')))[0],target=path.join(b.path,'payload',file);
  const payload=await p.readFile(target);
  payload[0]^=0x40;
  await p.writeFile(target,payload);
  await assert.rejects(()=>x.svc.previewRestore(b.path,PASSWORD),/authentication|mismatch/);
  assert.equal(await p.readFile(path.join(x.data,'apps.json'),'utf8'),'LIVE_PRIVATE');
}));
test('Cross-profile restore, unexpected files and KDF tampering are rejected',()=>fixture(async x=>{
  await source(x);
  const b=await x.svc.create(x.out,PASSWORD);
  const second=x.registry.create('Games');
  x.registry.activate(second.id);
  await assert.rejects(()=>x.svc.previewRestore(b.path,PASSWORD),/another Android profile/);
  x.registry.activate('default');
  const extra=path.join(b.path,'payload','surprise.bin');
  await p.writeFile(extra,'bad');
  await assert.rejects(()=>x.svc.previewRestore(b.path,PASSWORD),/unexpected|Unexpected/);
  await p.rm(extra);
  const hf=path.join(b.path,'header.json'),header=JSON.parse(await p.readFile(hf,'utf8'));
  header.kdf.N=1048576;
  await p.writeFile(hf,JSON.stringify(header));
  await assert.rejects(()=>x.svc.previewRestore(b.path,PASSWORD),/header/);
}));
test('Password limits, idle runtime and recursive backup paths fail closed',()=>fixture(async x=>{
  await source(x);
  for(const bad of ['', 'short', null, 120]){
    assert.throws(()=>validatePassword(bad),/password/i);
  }
  x.setRunning(true);
  await assert.rejects(()=>x.svc.create(x.out,PASSWORD),/Android must be stopped/);
  x.setRunning(false);
  await assert.rejects(()=>x.svc.create(x.data,PASSWORD),/external/);
  const b=await x.svc.create(x.out,PASSWORD);
  x.setRunning(true);
  await assert.rejects(()=>x.svc.previewRestore(b.path,PASSWORD),/Android must be stopped/);
}));

test('Backup IPC never exports new plaintext backups and retains native restore consent',()=>{
  const root=path.join(__dirname,'..');
  const main=fs.readFileSync(path.join(root,'src/main.js'),'utf8');
  const preload=fs.readFileSync(path.join(root,'src/preload.js'),'utf8');
  const ui=fs.readFileSync(path.join(root,'src/ui/backup-ui.js'),'utf8');
  const html=fs.readFileSync(path.join(root,'src/ui/index.html'),'utf8');
  assert.ok(main.includes('encryptedBackupCenter.create(picked.filePaths[0],password)'));
  assert.ok(main.includes("audited('backup-create'"), 'Encrypted export must be audited');
  assert.ok(main.includes('encryptedBackupCenter.previewRestore(folder,password)'));
  assert.ok(main.includes('encryptedBackupCenter.restore(token,password)'));
  assert.ok(main.includes('return audited(event,source'), 'Restore must retain audit wrapper');
  assert.ok(main.includes('backupCenter.restore(token)'), 'Legacy archives must remain readable');
  assert.ok(main.includes("title:'Confirm Android profile restore'"));
  assert.ok(main.includes('if(approval.response!==1)return {canceled:true}'));
  assert.ok(preload.includes('backupCreate: (password)'));
  assert.ok(preload.includes('backupRestore: (token, password'));
  assert.ok(ui.includes('api.backupCreate(secret)'));
  assert.ok(ui.includes('api.backupPickRestore(secret)'));
  assert.ok(ui.includes('api.backupRestore(token,secret)'));
  assert.ok(ui.includes('clearPasswords()'));
  assert.ok(ui.includes("window.prompt(L.ask)!=='RESTORE'"));
  assert.ok(ui.includes('window.confirm(L.confirm)'));
  assert.ok(!ui.includes('localStorage')&&!ui.includes('innerHTML'));
  assert.ok(html.includes('id="backupPassword"'));
  assert.ok(html.includes('id="backupPasswordConfirm"'));
});
test('Windows smoke creates only ciphertext and refuses to execute a real restore',()=>{
  const root=path.join(__dirname,'..');
  const main=fs.readFileSync(path.join(root,'src/main.js'),'utf8');
  assert.ok(main.includes("process.argv.includes('--backup')"));
  assert.ok(main.includes("fs.existsSync(path.join(snapshot.path,'manifest.json'))"));
  assert.ok(main.includes("fs.existsSync(path.join(snapshot.path,'manifest.enc'))"));
  assert.ok(main.includes('no restore executed'));
});

test('Partial decrypted staging paths are tracked before any file decryption',()=>{
  const core=fs.readFileSync(path.join(__dirname,'../src/core/encrypted-backup.js'),'utf8');
  const begin=core.indexOf('async restore(token,password)');
  const restore=core.slice(begin);
  assert.ok(restore.indexOf('stages.push({c,target,stage,safety,present})') <
    restore.indexOf('await decryptFile('),'Stage registered before decrypt can fail');
  assert.ok(restore.includes('if(fs.existsSync(stage.stage))await p.rm(stage.stage'),
    'All incomplete stage files removed on failure');

});

test('A ciphertext mutation after preflight removes partial plaintext staging without touching live data',()=>fixture(async x=>{
  await source(x);
  const backup=await x.svc.create(x.out,PASSWORD);
  await write(path.join(x.data,'apps.json'),'ACTIVE_CATALOG_MUST_SURVIVE');
  const preview=await x.svc.previewRestore(backup.path,PASSWORD);
  const manifest=(await x.svc._verify(backup.path,PASSWORD,x.svc.layout())).manifest;
  const catalog=manifest.files.find(f=>f.path==='apps.json');
  const blob=path.join(backup.path,'payload',catalog.blob+'.bin');
  let calls=0;
  x.svc.assertIdle=async()=>{
    calls++;
    if(calls===2){
      const altered=await p.readFile(blob);
      altered[0]^=0x20;
      await p.writeFile(blob,altered);
    }
  };
  await assert.rejects(()=>x.svc.restore(preview.token,PASSWORD),/authentication|mismatch/);
  assert.equal(await p.readFile(path.join(x.data,'apps.json'),'utf8'),'ACTIVE_CATALOG_MUST_SURVIVE');
  const entries=await p.readdir(x.data);
  assert.ok(!entries.some(name=>name.includes('.stage')),
    'Incomplete decrypted stage files must be removed immediately on failure');
  assert.ok(!entries.some(name=>name.includes('.before-restore')),
    'Uncommitted restoration must not move original user data');
}));


test('encrypted post-swap verification rolls back every installed component',()=>fixture(async x=>{
  await source(x);
  const backup=await x.svc.create(x.out,PASSWORD);
  const disk=path.join(x.avd,'apkstart.avd','userdata-qemu.img');
  await write(disk,'before restore');
  const approved=await x.svc.previewRestore(backup.path,PASSWORD);
  x.svc.onProgress=({phase})=>{if(phase==='restore-verify-installed')fs.writeFileSync(disk,'corrupt');};
  await assert.rejects(x.svc.restore(approved.token,PASSWORD),/Installed restore SHA-256/);
  assert.equal(await p.readFile(disk,'utf8'),'before restore');
}));
