'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),p=fs.promises,path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {createRegistry}=require('../src/core/profiles');
const {RecoveryAudit}=require('../src/core/recovery-audit');
const {AuditSigning,verifyEnvelope}=require('../src/core/audit-signing');
const PASS='A long strong Ed25519 signing password 2026';
const WRONG='Different signing password 2026 separate';
async function fixture(fn){
  const root=await p.mkdtemp(path.join(os.tmpdir(),'asi-signing-test-'));
  const data=path.join(root,'data'),outside=path.join(root,'outside');
  await p.mkdir(data);await p.mkdir(outside);
  const registry=createRegistry(data);
  const audit=new RecoveryAudit({dataDir:data,getProfileId:()=>registry.currentId()});
  const signing=new AuditSigning({audit});
  try{return await fn({root,data,outside,registry,audit,signing});}
  finally{await p.rm(root,{recursive:true,force:true});}
}
async function init(x){return x.signing.initialize(PASS);}
async function add(x){await x.audit.append('readiness-verify','passed',{source:'sealed',files:2,bytes:300});}
test('signing is explicitly opt-in; status reads do not generate private keys',()=>fixture(async x=>{
  const status=await x.signing.status();
  assert.equal(status.initialized,false);
  assert.equal(fs.existsSync(path.join(x.data,'recovery-audit')),false);
  await add(x);
  const key=await init(x);
  assert.equal(key.initialized,true);
  assert.match(key.fingerprint,/^[a-f0-9]{64}$/);
  assert.equal((await x.signing.status()).fingerprint,key.fingerprint);
  const priv=await p.readFile(path.join(x.data,'recovery-audit','default','audit-ed25519-private.pem'),'utf8');
  assert.match(priv,/ENCRYPTED PRIVATE KEY/);
  assert.ok(!priv.includes('BEGIN PRIVATE KEY-----\n'));
  assert.ok(!priv.includes(PASS));
  await assert.rejects(()=>init(x),/already exists/);
}));
test('signed checkpoint validates Ed25519 and externally held head against current append-only history',()=>fixture(async x=>{
  await add(x);await init(x);
  const dest=path.join(x.outside,'checkpoint.json');
  const out=await x.signing.exportCheckpoint(dest,PASS);
  assert.equal(out.ok,true);assert.equal(out.kind,'checkpoint');
  const body=JSON.parse(await p.readFile(dest,'utf8'));
  assert.equal(verifyEnvelope(body).eventsCount,1);
  assert.equal(body.payload.reportDigest,null);
  assert.ok(!JSON.stringify(body).includes(PASS));
  assert.equal((await x.signing.verifyExternal(dest)).localHistoryMatches,true);
  await x.audit.append('restore-drill','passed',{source:'synthetic',synthetic:true});
  const checked=await x.signing.verifyExternal(dest);
  assert.equal(checked.currentEvents,2);
  assert.equal(checked.checkpointEvents,1);
  assert.equal(checked.signatureValid,true);
}));
test('externally held checkpoint rejects tail truncation even when the remaining local chain is valid',()=>fixture(async x=>{
  await init(x);await add(x);
  await x.audit.append('restore-drill','passed',{source:'synthetic',synthetic:true});
  const dest=path.join(x.outside,'prior.json');
  await x.signing.exportCheckpoint(dest,PASS);
  const auditFile=path.join(x.data,'recovery-audit','default','events.jsonl');
  const records=(await p.readFile(auditFile,'utf8')).trimEnd().split('\n');
  await p.writeFile(auditFile,records[0]+'\n');
  assert.equal((await x.audit.summary()).integrity,'verified');
  await assert.rejects(()=>x.signing.verifyExternal(dest),/truncated below external checkpoint/);
}));
test('checkpoint catches a rewritten hash chain before the independent checkpoint position',()=>fixture(async x=>{
  await init(x);await add(x);
  const dest=path.join(x.outside,'checkpoint.json');
  await x.signing.exportCheckpoint(dest,PASS);
  const f=path.join(x.data,'recovery-audit','default','events.jsonl');
  const record=JSON.parse((await p.readFile(f,'utf8')).trim());
  record.status='failed';
  const {hashRecord}=require('../src/core/recovery-audit');
  record.hash=hashRecord(record);
  await p.writeFile(f,JSON.stringify(record)+'\n');
  assert.equal((await x.audit.summary()).integrity,'verified');
  await assert.rejects(()=>x.signing.verifyExternal(dest),/diverges/);
}));
test('a modified signature or checkpoint field is rejected before local comparison',()=>fixture(async x=>{
  await init(x);await add(x);
  const dest=path.join(x.outside,'checkpoint.json');
  await x.signing.exportCheckpoint(dest,PASS);
  const original=JSON.parse(await p.readFile(dest,'utf8'));
  original.payload.eventsCount=0;
  const modified=path.join(x.outside,'modified.json');
  await p.writeFile(modified,JSON.stringify(original));
  await assert.rejects(()=>x.signing.verifyExternal(modified),/signature verification failed/);
  const forged=JSON.parse(await p.readFile(dest,'utf8'));
  const bytes=Buffer.from(forged.signature,'base64');
  bytes[0]^=1;
  forged.signature=bytes.toString('base64');
  const fake=path.join(x.outside,'signature.json');
  await p.writeFile(fake,JSON.stringify(forged));
  await assert.rejects(()=>x.signing.verifyExternal(fake),/signature verification failed/);
}));
test('signed reports verify entire JSON body and fail on any report tampering',()=>fixture(async x=>{
  await add(x);await init(x);
  const dest=path.join(x.outside,'signed-report.json');
  const out=await x.signing.exportSignedReport(dest,PASS);
  assert.equal(out.kind,'report');
  const original=JSON.parse(await p.readFile(dest,'utf8'));
  assert.equal(original.report.events.length,1);
  assert.equal((await x.signing.verifyExternal(dest)).kind,'report');
  original.report.events[0].status='failed';
  const fake=path.join(x.outside,'tampered-report.json');
  await p.writeFile(fake,JSON.stringify(original));
  await assert.rejects(()=>x.signing.verifyExternal(fake),/contents were modified/);
}));
test('wrong signing password and invalid key identity do not write output or replace private key',()=>fixture(async x=>{
  await init(x);await add(x);
  const dest=path.join(x.outside,'checkpoint.json');
  await assert.rejects(()=>x.signing.exportCheckpoint(dest,WRONG),/passphrase is invalid/);
  assert.equal(fs.existsSync(dest),false);
  await x.signing.exportCheckpoint(dest,PASS);
  await assert.rejects(()=>x.signing.exportCheckpoint(dest,PASS),/overwrite/);
}));
test('signed evidence cannot be applied to another Android Profile even with valid signature',()=>fixture(async x=>{
  await init(x);await add(x);
  const dest=path.join(x.outside,'checkpoint.json');
  await x.signing.exportCheckpoint(dest,PASS);
  const other=x.registry.create('Separate');
  x.registry.activate(other.id);
  await assert.rejects(()=>x.signing.verifyExternal(dest),/another Android profile/);
  assert.equal((await x.signing.status()).initialized,false);
  x.registry.activate('default');
  assert.equal((await x.signing.verifyExternal(dest)).ok,true);
}));
test('checkpoint signed by another key for same profile cannot substitute local key identity',()=>fixture(async x=>{
  await init(x);await add(x);
  const checkpoint=path.join(x.outside,'checkpoint.json');
  await x.signing.exportCheckpoint(checkpoint,PASS);
  const raw=JSON.parse(await p.readFile(checkpoint,'utf8'));
  const second=crypto.generateKeyPairSync('ed25519',{publicKeyEncoding:{format:'pem',type:'spki'},privateKeyEncoding:{format:'pem',type:'pkcs8'}});
  const {fingerprint}=require('../src/core/audit-signing');
  raw.publicKey=second.publicKey;raw.payload.keyFingerprint=fingerprint(second.publicKey);
  raw.signature=crypto.sign(null,Buffer.from('ASI-AUDIT-SIGNED-v1\n'+JSON.stringify(raw.payload)),second.privateKey).toString('base64');
  const dest=path.join(x.outside,'other-key.json');
  await p.writeFile(dest,JSON.stringify(raw));
  await assert.rejects(()=>x.signing.verifyExternal(dest),/different local key/);
}));
test('signed exports reject application-data output paths, unsafe extension and existing targets',()=>fixture(async x=>{
  await init(x);
  await assert.rejects(()=>x.signing.exportCheckpoint(path.join(x.data,'bad.json'),PASS),/outside application data/);
  await assert.rejects(()=>x.signing.exportSignedReport(path.join(x.outside,'bad.txt'),PASS),/JSON export file/);
  const dest=path.join(x.outside,'export.json');
  await p.writeFile(dest,'KEEP');
  await assert.rejects(()=>x.signing.exportCheckpoint(dest,PASS),/overwrite/);
  assert.equal(await p.readFile(dest,'utf8'),'KEEP');
}));
test('malformed JSON, symlinks and oversize checkpoint files fail without mutating local audit',async t=>fixture(async x=>{
  await init(x);await add(x);
  const bad=path.join(x.outside,'bad.json');
  await p.writeFile(bad,'{incomplete');
  await assert.rejects(()=>x.signing.verifyExternal(bad),/Unexpected|JSON|position|property/);
  const big=path.join(x.outside,'big.json');
  await p.writeFile(big,'X'.repeat(9*1024*1024+1));
  await assert.rejects(()=>x.signing.verifyExternal(big),/size cap/);
  const symlink=path.join(x.outside,'linked.json');
  try{await p.symlink(bad,symlink,'file');}
  catch(e){if(['EPERM','EACCES','ENOSYS'].includes(e.code)){t.skip('Symlink privileges unavailable');return;}throw e;}
  await assert.rejects(()=>x.signing.verifyExternal(symlink),/symlink|unsafe|Unexpected|JSON/);
  assert.equal((await x.audit.summary()).eventsCount,1);
}));
test('UI IPC only accepts signed actions with OS file picker and typed key setup consent',()=>{
  const dir=path.join(__dirname,'..');
  const main=fs.readFileSync(path.join(dir,'src/main.js'),'utf8');
  const preload=fs.readFileSync(path.join(dir,'src/preload.js'),'utf8');
  const ui=fs.readFileSync(path.join(dir,'src/ui/backup-ui.js'),'utf8');
  const html=fs.readFileSync(path.join(dir,'src/ui/index.html'),'utf8');
  for(const c of ['backup:signingStatus','backup:signingInitialize','backup:signingExport','backup:signingVerifyExternal'])
    assert.ok(main.includes("ipcMain.handle('"+c+"'"));
  assert.ok(main.includes("request?.ack!=='CREATE SIGNING KEY'"));
  assert.ok(main.includes('defaultId:0,cancelId:0'));
  assert.ok(main.includes('dialog.showSaveDialog(mainWindow'));
  assert.ok(main.includes('dialog.showOpenDialog(mainWindow'));
  assert.ok(preload.includes("signingExport: (kind,password)"));
  assert.ok(ui.includes("window.prompt(L.signingAsk)!=='CREATE SIGNING KEY'"));
  assert.ok(!ui.includes('innerHTML'));
  for(const id of ['btnBackupSigningCreate','btnBackupSigningCheckpoint','btnBackupSigningVerify'])
    assert.ok(html.includes('id="'+id+'"'));
});
