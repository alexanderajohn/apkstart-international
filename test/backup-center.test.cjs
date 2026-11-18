'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),p=fs.promises,path=require('node:path'),os=require('node:os');
const {createRegistry}=require('../src/core/profiles');
const {BackupCenter,checkManifest,validRelative}=require('../src/core/backup-center');
async function fixture(fn){
  const root=await p.mkdtemp(path.join(os.tmpdir(),'asi-backup-test-'));
  const data=path.join(root,'data'),out=path.join(root,'exports'),avd=path.join(root,'vms');
  await Promise.all([p.mkdir(data),p.mkdir(out),p.mkdir(avd)]);
  const registry=createRegistry(data);let running=false;const flags=[];
  const svc=new BackupCenter({registry,dataDir:data,getAvdHome:()=>avd,
    assertIdle:async()=>{if(running)throw Error('Android must be stopped');},
    onBusy:x=>flags.push(x)});
  const x={root,data,out,avd,registry,svc,flags,setRunning:v=>{running=v;}};
  try{return await fn(x);}finally{await p.rm(root,{recursive:true,force:true});}
}
async function write(f,value){await p.mkdir(path.dirname(f),{recursive:true});await p.writeFile(f,value);}
async function source(x){
  await write(path.join(x.data,'apps.json'),'DEFAULT APPS');
  await write(path.join(x.data,'apks','app.apk'),'APK BINARY');
  await write(path.join(x.data,'icons','app.png'),'ICON');
  await write(path.join(x.avd,'apkstart.avd','userdata-qemu.img'),'PRIVATE USER DATA');
  await write(path.join(x.avd,'apkstart.avd','snapshots','quickboot','ram.bin'),'SNAPSHOT');
}
test('Backup has SHA-256 manifest and leaves original Default data untouched',async()=>fixture(async x=>{
  await source(x);
  const b=await x.svc.create(x.out),v=await x.svc.verify(b.path);
  assert.equal(x.flags.join(','),'true,false');
  assert.equal(b.profileId,'default');
  assert.equal(v.manifest.totalBytes,b.bytes);
  assert.ok(v.manifest.files.some(f=>f.path==='avd/userdata-qemu.img'));
  assert.equal(await p.readFile(path.join(x.data,'apps.json'),'utf8'),'DEFAULT APPS');
  assert.equal(await p.readFile(path.join(x.avd,'apkstart.avd','userdata-qemu.img'),'utf8'),'PRIVATE USER DATA');
}));
test('Restore needs one-time preview approval and preserves original content',async()=>fixture(async x=>{
  await source(x);const b=await x.svc.create(x.out);
  await write(path.join(x.data,'apps.json'),'NEW CATALOG');
  await write(path.join(x.avd,'apkstart.avd','userdata-qemu.img'),'NEW USER DATA');
  await assert.rejects(()=>x.svc.restore('guessed'),/approval expired/);
  const v=await x.svc.previewRestore(b.path),r=await x.svc.restore(v.token);
  assert.equal(r.ok,true);
  assert.ok(r.preserved.length>=3);
  assert.equal(await p.readFile(path.join(x.data,'apps.json'),'utf8'),'DEFAULT APPS');
  const savedCatalog=r.preserved.find(f=>f.includes('apps.json'));
  const savedAvd=r.preserved.find(f=>f.includes('apkstart.avd'));
  assert.equal(await p.readFile(savedCatalog,'utf8'),'NEW CATALOG');
  assert.equal(await p.readFile(path.join(savedAvd,'userdata-qemu.img'),'utf8'),'NEW USER DATA');
  assert.equal(await p.readFile(path.join(x.avd,'apkstart.avd','userdata-qemu.img'),'utf8'),'PRIVATE USER DATA');
  await assert.rejects(()=>x.svc.restore(v.token),/approval expired/);
}));
test('Corrupt backup SHA-256 blocks preview without touching live data',async()=>fixture(async x=>{
  await source(x);const b=await x.svc.create(x.out);
  await write(path.join(b.path,'apps.json'),'ATTACKER MODIFIED');
  await write(path.join(x.data,'apps.json'),'CURRENT');
  await assert.rejects(()=>x.svc.previewRestore(b.path),/SHA-256/);
  assert.equal(await p.readFile(path.join(x.data,'apps.json'),'utf8'),'CURRENT');
}));
test('Profile identity mismatch blocks cross-profile recovery',async()=>fixture(async x=>{
  await source(x);const b=await x.svc.create(x.out);
  const newer=x.registry.create('Games');x.registry.activate(newer.id);
  await assert.rejects(()=>x.svc.previewRestore(b.path),/another profile/);
  assert.equal(x.registry.currentId(),newer.id);
}));
test('Running Android blocks backup and restore at server layer',async()=>fixture(async x=>{
  await source(x);x.setRunning(true);
  await assert.rejects(()=>x.svc.create(x.out),/Android must be stopped/);
  x.setRunning(false);const b=await x.svc.create(x.out),v=await x.svc.previewRestore(b.path);
  x.setRunning(true);
  await assert.rejects(()=>x.svc.restore(v.token),/Android must be stopped/);
  assert.equal(await p.readFile(path.join(x.data,'apps.json'),'utf8'),'DEFAULT APPS');
}));
test('Unsafe paths, unsupported filenames and recursive backup destinations are rejected',async()=>fixture(async x=>{
  await source(x);
  await assert.rejects(()=>x.svc.create(x.data),/external folder/);
  assert.equal(validRelative('../secret'),false);
  assert.equal(validRelative('apks/CON.txt'),false);
  assert.equal(validRelative('avd/C:\\evil'),false);
  assert.equal(validRelative('avd/userdata-qemu.img'),true);
  assert.throws(()=>checkManifest({
    format:'apkstart-international-profile-backup',version:1,profileId:'default',avdName:'apkstart',
    components:['apks'],files:[{path:'apks/../oops',size:1,sha256:'a'.repeat(64)}],directories:['apks'],totalBytes:1,
  }),/Invalid backup file/);
  if(process.platform!=='win32'){
    await p.symlink(path.join(x.data,'apps.json'),path.join(x.data,'apks','alias.apk'));
    await assert.rejects(()=>x.svc.create(x.out),/Symlinks/);
  }
}));
test('Restoring a snapshot without AVD keeps later existing userdata in safety copy',async()=>fixture(async x=>{
  await write(path.join(x.data,'apps.json'),'EMPTY GUEST');
  const b=await x.svc.create(x.out);
  await write(path.join(x.avd,'apkstart.avd','userdata-qemu.img'),'NEW DATA');
  const v=await x.svc.previewRestore(b.path),r=await x.svc.restore(v.token);
  assert.equal(fs.existsSync(path.join(x.avd,'apkstart.avd')),false);
  const saved=r.preserved.find(f=>f.includes('apkstart.avd'));
  assert.equal(await p.readFile(path.join(saved,'userdata-qemu.img'),'utf8'),'NEW DATA');
}));
test('IPC is fixed to selected directories and two-phase explicit consent',()=>{
  const root=path.join(__dirname,'..');
  const main=fs.readFileSync(path.join(root,'src/main.js'),'utf8');
  const preload=fs.readFileSync(path.join(root,'src/preload.js'),'utf8');
  const ui=fs.readFileSync(path.join(root,'src/ui/backup-ui.js'),'utf8');
  const html=fs.readFileSync(path.join(root,'src/ui/index.html'),'utf8');
  for(const channel of ['backup:status','backup:create','backup:pickRestore','backup:restore'])
    assert.ok(main.includes("ipcMain.handle('"+channel+"'"),channel);
  assert.ok(main.includes('backupIdleCheck()'));
  assert.ok(main.includes('backupCenter.previewRestore('));
  assert.ok(main.includes('backupCenter.restore(token)'));
  assert.ok(preload.includes("backupRestore: (token)"));
  assert.ok(ui.includes("window.prompt(L.ask)!=='RESTORE'"));
  assert.ok(ui.includes('window.confirm(L.confirm)'));
  assert.ok(!ui.includes('innerHTML'),'Renderer must display backup paths via textContent');
  for(const id of ['backupCenter','btnBackupCreate','btnBackupPick','btnBackupRestore','backupPreview'])
    assert.ok(html.includes('id="'+id+'"'));
});

test('Windows CI starts verified snapshot UI but never runs restore against live profile',()=>{
  const root=path.join(__dirname,'..');
  const main=fs.readFileSync(path.join(root,'src/main.js'),'utf8');
  const ci=fs.readFileSync(path.join(root,'.github/workflows/ci.yml'),'utf8');
  assert.ok(main.includes("process.argv.includes('--backup')"));
  assert.ok(main.includes('const snapshot=await backupCenter.create(exportRoot)'));
  assert.ok(main.includes('const inspected=await backupCenter.previewRestore(snapshot.path)'));
  assert.ok(main.includes('no restore executed'));
  assert.ok(ci.includes("'--backup'"));
  assert.ok(ci.includes('asi-backup-smoke.png'));
});

test('Final restore action requires a native main-process confirmation',()=>{
  const main=fs.readFileSync(path.join(__dirname,'../src/main.js'),'utf8');
  assert.ok(main.includes("title:'Confirm Android profile restore'"));
  assert.ok(main.includes("cancelId:0"));
  assert.ok(main.includes("if(approval.response!==1)return {canceled:true}"));
  assert.ok(main.includes('return backupCenter.restore(token)'));
});
