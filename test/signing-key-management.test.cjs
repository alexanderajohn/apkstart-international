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
