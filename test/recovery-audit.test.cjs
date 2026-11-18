'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),p=fs.promises,path=require('node:path'),os=require('node:os');
const {createRegistry}=require('../src/core/profiles');
const {RecoveryAudit,GENESIS,causeCode}=require('../src/core/recovery-audit');

async function fixture(fn){
  const root=await p.mkdtemp(path.join(os.tmpdir(),'asi-audit-test-'));
  const data=path.join(root,'data'),out=path.join(root,'reports');
  await p.mkdir(data);await p.mkdir(out);
  const registry=createRegistry(data);
  const audit=new RecoveryAudit({dataDir:data,getProfileId:()=>registry.currentId()});
  try{return await fn({root,data,out,registry,audit});}
  finally{await p.rm(root,{recursive:true,force:true});}
}
function auditFile(x,id='default'){
  return path.join(x.data,'recovery-audit',id,'events.jsonl');
}
test('read-only first look at empty per-profile history creates no audit files',()=>fixture(async x=>{
  const r=await x.audit.summary();
  assert.equal(r.integrity,'verified');
  assert.equal(r.eventsCount,0);
  assert.equal(r.head,GENESIS);
  assert.deepEqual(r.totals,{passed:0,failed:0,cancelled:0});
  assert.equal(fs.existsSync(auditFile(x)),false);
}));
test('append forms a valid ordered SHA-256 chain with only allowed metadata',()=>fixture(async x=>{
  await x.audit.append('readiness-verify','passed',{
    source:'sealed',files:4,bytes:2048,evidenceId:'a'.repeat(64),
    bootTested:false,synthetic:false
  });
  await x.audit.append('restore-drill','passed',{
    source:'synthetic',files:4,bytes:2048,evidenceId:'a'.repeat(64),synthetic:true
  });
  await x.audit.append('health-verify','failed',{source:'sealed',reason:'auth'});
  const summary=await x.audit.summary();
  assert.equal(summary.integrity,'verified');
  assert.equal(summary.eventsCount,3);
  assert.deepEqual(summary.totals,{passed:2,failed:1,cancelled:0});
  assert.equal(summary.events[0].event,'health-verify');
  const lines=(await p.readFile(auditFile(x),'utf8')).trimEnd().split('\n').map(JSON.parse);
  assert.equal(lines[0].previous,GENESIS);
  assert.equal(lines[1].previous,lines[0].hash);
  assert.equal(lines[2].previous,lines[1].hash);
  assert.equal(summary.head,lines[2].hash);
  for(const e of lines)assert.deepEqual(
    Object.keys(e).sort(),
    ['version','index','previous','timestamp','event','status','source','reason',
      'files','bytes','evidenceId','bootTested','synthetic','hash'].sort());
}));
test('passwords, paths, arbitrary messages, tokens and APK data are rejected by schema',()=>fixture(async x=>{
  const credential='user password never should be persisted';
  for(const bad of [
    {source:'sealed',password:credential},
    {source:'external',path:'C:\\Private\\Android\\userdata.img'},
    {token:'a'.repeat(48)},
    {error:'Android private file'},
    {evidenceId:'C:\\Private'},
    {files:-1},{bytes:1.3},{source:'C:\\Private'},
    {reason:'user-login'},
    {synthetic:'yes'},null
  ])await assert.rejects(()=>x.audit.append('restore-drill','passed',bad),/Invalid|Unsupported|required|digest/);
  for(const event of ['file-delete','password-log','unknown'])
    await assert.rejects(()=>x.audit.append(event,'passed',{}),/Invalid audit event/);
  await x.audit.append('restore','failed',{
    source:'encrypted',reason:causeCode(Error('wrong password at C:\\secret\\profile'))
  });
  const raw=await p.readFile(auditFile(x),'utf8');
  assert.ok(!raw.includes(credential));
  assert.ok(!raw.includes('secret'));
  assert.ok(!raw.includes('password'));
  assert.ok(!raw.includes('userdata'));
}));
test('concurrent writes are serialized, verified and never interleaved',()=>fixture(async x=>{
  await Promise.all(Array.from({length:35},(_,i)=>
    x.audit.append('sealed-verify',i%7===0?'failed':'passed',{
      source:'sealed',files:i,bytes:i*100,reason:i%7===0?'integrity':'none'
    })));
  const r=await x.audit.summary(100);
  assert.equal(r.integrity,'verified');
  assert.equal(r.eventsCount,35);
  const indexes=r.events.map(e=>e.index).sort((a,b)=>a-b);
  assert.deepEqual(indexes,Array.from({length:35},(_,i)=>i+1));
}));
test('tampered record cannot be displayed as verified or exported',()=>fixture(async x=>{
  await x.audit.append('health-verify','passed',{source:'sealed'});
  const f=auditFile(x);
  const record=JSON.parse((await p.readFile(f,'utf8')).trim());
  record.status='failed';
  await p.writeFile(f,JSON.stringify(record)+'\n');
  const summary=await x.audit.summary();
  assert.equal(summary.integrity,'failed');
  assert.equal(summary.head,null);
  assert.deepEqual(summary.events,[]);
  await assert.rejects(()=>x.audit.append('restore','passed',{source:'encrypted'}),/hash mismatch/);
  const dest=path.join(x.out,'report.json');
  await assert.rejects(()=>x.audit.exportReport(dest),/hash mismatch/);
  assert.equal(fs.existsSync(dest),false);
}));
test('truncated or truncated-last JSON lines are rejected without automatic data deletion',()=>fixture(async x=>{
  await x.audit.append('restore','passed',{source:'legacy'});
  const f=auditFile(x),original=await p.readFile(f,'utf8');
  await p.writeFile(f,original.slice(0,-4));
  assert.equal((await x.audit.summary()).integrity,'failed');
  assert.equal(await p.readFile(f,'utf8'),original.slice(0,-4));
}));
test('profile isolation never shows or rewrites an adjacent profile audit',()=>fixture(async x=>{
  await x.audit.append('health-verify','passed',{source:'sealed'});
  const mainRaw=await p.readFile(auditFile(x),'utf8');
  const second=x.registry.create('Second Profile');
  x.registry.activate(second.id);
  assert.equal((await x.audit.summary()).eventsCount,0);
  await x.audit.append('restore-drill','cancelled',{source:'synthetic'});
  assert.equal((await x.audit.summary()).eventsCount,1);
  x.registry.activate('default');
  assert.equal((await x.audit.summary()).eventsCount,1);
  assert.equal(await p.readFile(auditFile(x),'utf8'),mainRaw);
}));
test('verified privacy-minimized report requires native-selected outside destination and never overwrites',()=>fixture(async x=>{
  await x.audit.append('readiness-verify','passed',{
    source:'sealed',files:2,bytes:300,evidenceId:'b'.repeat(64)
  });
  await x.audit.append('restore-drill','passed',{source:'synthetic',synthetic:true});
  const dest=path.join(x.out,'recovery-verification.json');
  const result=await x.audit.exportReport(dest);
  assert.equal(result.ok,true);assert.equal(result.events,2);
  const raw=await p.readFile(dest,'utf8'),r=JSON.parse(raw);
  assert.equal(r.format,'apkstart-international-recovery-verification-report');
  assert.equal(r.verification.status,'verified-local-hash-chain');
  assert.equal(r.events.length,2);
  for(const privateField of ['password','approvalToken','C:\\Private\\',
    'userdata-qemu.img','secret.apk','profileId','backupDirectory'])
    assert.ok(!raw.includes(privateField),'Private field in report: '+privateField);
  await assert.rejects(()=>x.audit.exportReport(dest),/overwrite/);
  assert.equal(await p.readFile(dest,'utf8'),raw);
  await assert.rejects(()=>x.audit.exportReport(path.join(x.data,'internal.json')),/outside application data/);
  await assert.rejects(()=>x.audit.exportReport(path.join(x.out,'not-json.txt')),/JSON report destination/);
}));
test('a local administrator can rehash or truncate the unkeyed chain; report warns explicitly',()=>fixture(async x=>{
  await x.audit.append('restore-verify','passed',{source:'encrypted'});
  await x.audit.append('restore-drill','failed',{source:'synthetic',reason:'other'});
  const warnings=(await x.audit.summary()).warning;
  assert.match(warnings,/rewritten or truncated|rewritten|truncated/);
  const f=auditFile(x);
  const first=(await p.readFile(f,'utf8')).split('\n')[0]+'\n';
  await p.writeFile(f,first);
  const s=await x.audit.summary();
  assert.equal(s.integrity,'verified');
  assert.equal(s.eventsCount,1);
  // This demonstrates why audit records are local diagnostics, NOT signed proof.
}));
test('symlinks cannot redirect the audit file or event folder where host permits symlinks',async t=>fixture(async x=>{
  const target=path.join(x.out,'redirect.jsonl');
  await p.writeFile(target,'CONFIDENTIAL_OTHER_FILE');
  const folder=path.dirname(auditFile(x));
  await p.mkdir(folder,{recursive:true});
  try{await p.symlink(target,auditFile(x),'file');}
  catch(e){if(['EPERM','EACCES','ENOSYS'].includes(e.code)){t.skip('Host symlink permission denied');return;}throw e;}
  assert.equal((await x.audit.summary()).integrity,'failed');
  await assert.rejects(()=>x.audit.append('restore','passed',{source:'encrypted'}),/symlinks/);
  assert.equal(await p.readFile(target,'utf8'),'CONFIDENTIAL_OTHER_FILE');
}));
test('error reasons are classified into finite safe codes, not stored as raw messages',()=>{
  for(const [msg,expected] of [
    ['Incorrect backup password at C:\\Apps','auth'],
    ['Encrypted SHA-256 mismatch at /user/home','integrity'],
    ['Another Android profile was selected','scope'],
    ['Approval token expired','approval'],
    ['Insufficient disk space','disk'],
    ['Android must be stopped','busy'],
    ['File ENOENT','missing'],
    ['A very unexpected private path /secret','scope']
  ])assert.equal(causeCode(Error(msg)),expected);
});
test('main-process handlers capture verification, real restore and drill outcomes; renderer exposes no report path',()=>{
  const root=path.join(__dirname,'..');
  const main=fs.readFileSync(path.join(root,'src/main.js'),'utf8');
  const preload=fs.readFileSync(path.join(root,'src/preload.js'),'utf8');
  const ui=fs.readFileSync(path.join(root,'src/ui/backup-ui.js'),'utf8');
  const html=fs.readFileSync(path.join(root,'src/ui/index.html'),'utf8');
  for(const name of ['backup:auditSummary','backup:auditExport'])
    assert.ok(main.includes("ipcMain.handle('"+name+"'"));
  for(const feature of ["audited('readiness-verify'","audited('restore-drill'",
    "audited('restore-verify'","audited('health-verify'","audited('cleanup'",
    "audited('rescue'","audited('recovery'","audited('backup-create'"])
    assert.ok(main.includes(feature),'Missing audit integration: '+feature);
  assert.ok(main.includes("dialog.showSaveDialog(mainWindow"));
  assert.ok(main.includes("return recoveryAudit.exportReport(chosen.filePath)"));
  assert.ok(preload.includes("auditExport: () => invoke('backup:auditExport')"));
  assert.ok(ui.includes('api.auditSummary()'));
  assert.ok(ui.includes('api.auditExport()'));
  assert.ok(!ui.includes('innerHTML'));
  for(const id of ['btnBackupAuditToggle','btnBackupAuditView','btnBackupAuditExport','backupAuditSummary'])
    assert.ok(html.includes('id="'+id+'"'));
});