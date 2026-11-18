'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),p=fs.promises,path=require('node:path'),os=require('node:os');
const {createRegistry}=require('../src/core/profiles');
const {RecoveryAudit}=require('../src/core/recovery-audit');
const {AuditSigning}=require('../src/core/audit-signing');
const {SigningKeyManagement}=require('../src/core/signing-key-management');
const PASS='Strong signing passphrase 2026 example',BACKUP='Another strong backup secret 2026',NEW='New signing passphrase 2026 example';
async function withFixture(fn){
 const root=await p.mkdtemp(path.join(os.tmpdir(),'asi-key-rotation-'));
 const data=path.join(root,'data');await p.mkdir(data);
 const registry=createRegistry(data),audit=new RecoveryAudit({dataDir:data,getProfileId:()=>registry.currentId()});
 const signing=new AuditSigning({audit}),keys=new SigningKeyManagement({signing});
 try{return await fn({root,data,registry,audit,signing,keys});}finally{await p.rm(root,{force:true,recursive:true});}
}
test('encrypted export/import recovers exactly the same signing identity without saving passphrases',()=>withFixture(async x=>{
 await x.audit.append('readiness-verify','passed',{source:'sealed',files:1,bytes:1});
 const created=await x.signing.initialize(PASS);
 const out=path.join(x.root,'key-backup.json');await x.keys.exportEncrypted(out,PASS,BACKUP);
 const raw=await p.readFile(out,'utf8');
 assert.ok(!raw.includes('PRIVATE KEY'));assert.ok(!raw.includes(PASS));assert.ok(!raw.includes(BACKUP));
 await assert.rejects(()=>x.keys.importEncrypted(out,BACKUP,PASS),/never be overwritten/);
 const dir=path.join(x.data,'recovery-audit','default');
 const a=path.join(dir,'audit-ed25519-private.pem'),b=path.join(dir,'audit-ed25519-public.pem');
 await p.rm(a);await p.rm(b);
 await assert.rejects(()=>x.keys.importEncrypted(out,'Incorrect backup passphrase',PASS),/Incorrect backup password/);
 assert.equal(fs.existsSync(a),false);
 await assert.rejects(()=>x.keys.importEncrypted(out,BACKUP,'Wrong signing passphrase'),/Incorrect signing-key passphrase/);
 assert.equal(fs.existsSync(a),false);
 await x.keys.importEncrypted(out,BACKUP,PASS);
 assert.equal((await x.signing.status()).fingerprint,created.fingerprint);
}));
test('rotation retains original public-key fingerprint but changes active signer',()=>withFixture(async x=>{
 await x.signing.initialize(PASS);
 const before=await x.signing.status();
 const oldEvidence=path.join(x.root,'old-evidence.json');
 await x.signing.exportCheckpoint(oldEvidence,PASS);
 await assert.rejects(()=>x.keys.rotate('wrong signing password',NEW),/Incorrect signing-key passphrase/);
 assert.equal((await x.signing.status()).fingerprint,before.fingerprint);
 const r=await x.keys.rotate(PASS,NEW);
 assert.equal(r.oldFingerprint,before.fingerprint);
 assert.notEqual(r.newFingerprint,before.fingerprint);
 assert.equal((await x.signing.status()).fingerprint,r.newFingerprint);
 const archived=path.join(x.data,'recovery-audit','default','retired-signing-keys',r.oldFingerprint+'.pem');
 assert.equal((await p.readFile(archived,'utf8')).includes('PUBLIC KEY'),true);
 await assert.rejects(()=>x.signing.exportCheckpoint(path.join(x.root,'wrong.json'),PASS),/passphrase is invalid/);
 await x.signing.exportCheckpoint(path.join(x.root,'new.json'),NEW);
 assert.equal((await x.signing.verifyExternal(oldEvidence)).signatureValid,true);
}));
test('key export disallows overwrite, application-data paths and cross-profile import',()=>withFixture(async x=>{
 await x.signing.initialize(PASS);
 const target=path.join(x.root,'backup.json');await x.keys.exportEncrypted(target,PASS,BACKUP);
 await assert.rejects(()=>x.keys.exportEncrypted(target,PASS,BACKUP),/already exists/);
 await assert.rejects(()=>x.keys.exportEncrypted(path.join(x.data,'inside.json'),PASS,BACKUP),/outside application data/);
 const another=x.registry.create('Separate');
 x.registry.activate(another.id);
 await assert.rejects(()=>x.keys.importEncrypted(target,BACKUP,PASS),/another profile/);
}));

test('interrupted rotation before pointer commit preserves old identity across restart',()=>withFixture(async x=>{
 await x.signing.initialize(PASS);
 const initial=(await x.signing.status()).fingerprint;
 const injected=new SigningKeyManagement({signing:x.signing,hooks:{beforeCommit:()=>{throw Error('SIMULATED_CRASH_BEFORE_COMMIT');}}});
 await assert.rejects(()=>injected.rotate(PASS,NEW),/SIMULATED_CRASH_BEFORE_COMMIT/);
 assert.equal((await x.signing.status()).fingerprint,initial);
 const fresh=new AuditSigning({audit:x.audit});
 assert.equal((await fresh.status()).fingerprint,initial);
 const dest=path.join(x.root,'old-valid.json');
 await fresh.exportCheckpoint(dest,PASS);
 assert.equal((await fresh.verifyExternal(dest)).ok,true);
}));
test('atomic pointer survives re-instantiation and a second rotation',()=>withFixture(async x=>{
 await x.signing.initialize(PASS);
 const first=await x.keys.rotate(PASS,NEW);
 const pointer=path.join(x.data,'recovery-audit','default','active-key.json');
 assert.equal(JSON.parse(await p.readFile(pointer,'utf8')).fingerprint,first.newFingerprint);
 const resumed=new AuditSigning({audit:x.audit});
 assert.equal((await resumed.status()).fingerprint,first.newFingerprint);
 const nextPassword='Third distinct signing password 2026';
 const second=await new SigningKeyManagement({signing:resumed}).rotate(NEW,nextPassword);
 assert.equal(second.oldFingerprint,first.newFingerprint);
 assert.equal((await resumed.status()).fingerprint,second.newFingerprint);
 const originalPub=path.join(x.data,'recovery-audit','default','retired-signing-keys',first.oldFingerprint+'.pem');
 const middlePub=path.join(x.data,'recovery-audit','default','retired-signing-keys',first.newFingerprint+'.pem');
 assert.ok(fs.existsSync(originalPub));assert.ok(fs.existsSync(middlePub));
}));

test('interruption after atomic pointer commit retains a usable NEW identity and reports cleanup risk',()=>withFixture(async x=>{
 await x.signing.initialize(PASS);
 const original=await x.signing.status();
 const before=path.join(x.data,'recovery-audit','default','audit-ed25519-private.pem');
 const keys=new SigningKeyManagement({signing:x.signing,hooks:{beforeCleanup:()=>{throw Error('SIMULATED_POWER_LOSS_AFTER_COMMIT');}}});
 const result=await keys.rotate(PASS,NEW);
 assert.equal(result.ok,true);
 assert.equal(result.committed,true);
 assert.match(result.warning,/cleanup failed/);
 assert.ok(fs.existsSync(before)); // Previous encrypted private PEM needs explicit cleanup.
 const fresh=new AuditSigning({audit:x.audit});
 assert.notEqual((await fresh.status()).fingerprint,original.fingerprint);
 const checkpoint=path.join(x.root,'after-restart.json');
 await fresh.exportCheckpoint(checkpoint,NEW);
 assert.equal((await fresh.verifyExternal(checkpoint)).ok,true);
}));
