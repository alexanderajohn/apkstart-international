'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),p=fs.promises,path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {createRegistry}=require('../src/core/profiles');
const {RecoveryAudit}=require('../src/core/recovery-audit');
const {AuditSigning}=require('../src/core/audit-signing');
const {SigningKeyManagement}=require('../src/core/signing-key-management');
const {TrustLifecycle,verifyOffline,checkBundle}=require('../src/core/trust-lifecycle');
const OLD='Long secure old signing passphrase 2026',NEW='Long secure new signing passphrase 2026';
async function scenario(fn){
  const root=await p.mkdtemp(path.join(os.tmpdir(),'asi-trust-lifecycle-')),data=path.join(root,'data');
  await p.mkdir(data);
  const registry=createRegistry(data),audit=new RecoveryAudit({dataDir:data,getProfileId:()=>registry.currentId()});
  const signing=new AuditSigning({audit}),management=new SigningKeyManagement({signing}),trust=new TrustLifecycle({signing});
  try{return await fn({root,data,audit,signing,management,trust,registry});}
  finally{await p.rm(root,{recursive:true,force:true});}
}
test('trusted fingerprint is mandatory; bundle does not self-authorize embedded signer',()=>scenario(async x=>{
 await x.signing.initialize(OLD);
 const result=await x.signing.status(),dest=path.join(x.root,'checkpoint.json');
 await x.signing.exportCheckpoint(dest,OLD);
 const bundle=await x.trust.bundle(),e=JSON.parse(await p.readFile(dest,'utf8'));
 assert.equal(verifyOffline(bundle,e,result.fingerprint).ok,true);
 assert.throws(()=>verifyOffline(bundle,e,'0'.repeat(64)),/missing from bundle/);
 assert.throws(()=>verifyOffline(bundle,e,'not a fingerprint'),/independently trusted/);
 const forged={...bundle,keys:[{...bundle.keys[0],fingerprint:'1'.repeat(64)}]};
 assert.throws(()=>checkBundle(forged),/fingerprint mismatch/);
}));
test('retired evidence needs its own independently pinned fingerprint',()=>scenario(async x=>{
 const old=await x.signing.initialize(OLD);
 const dest=path.join(x.root,'before.json');
 await x.signing.exportCheckpoint(dest,OLD);
 const change=await x.management.rotate(OLD,NEW);
 const bundle=await x.trust.bundle(),e=JSON.parse(await p.readFile(dest,'utf8'));
 assert.equal(bundle.keys.length,2);
 assert.equal(verifyOffline(bundle,e,old.fingerprint).ok,true);
 assert.throws(()=>verifyOffline(bundle,e,change.newFingerprint),/does not match independent pin/);
 const changed={...e,payload:{...e.payload,eventsCount:8}};
 assert.throws(()=>verifyOffline(bundle,changed,old.fingerprint),/signature verification failed/);
}));
test('cross-machine offline verification needs only public bundle, signed evidence and known pin',()=>scenario(async x=>{
 await x.signing.initialize(OLD);
 const bundleFile=path.join(x.root,'bundle.json'),reportFile=path.join(x.root,'report.json');
 await x.trust.exportBundle(bundleFile);
 await x.signing.exportSignedReport(reportFile,OLD);
 const f=(await x.signing.status()).fingerprint;
 assert.equal((await x.trust.verifyFiles(bundleFile,reportFile,f)).signatureValid,true);
 const doc=JSON.parse(await p.readFile(reportFile,'utf8'));
 doc.report.caveats.push('tampered');
 const tampered=path.join(x.root,'tampered.json');
 await p.writeFile(tampered,JSON.stringify(doc));
 await assert.rejects(()=>x.trust.verifyFiles(bundleFile,tampered,f),/Report contents/);
 await assert.rejects(()=>x.trust.exportBundle(bundleFile),/EEXIST/);
}));
test('orphan candidate inventory is read-only and preserves encrypted keys',()=>scenario(async x=>{
 await x.signing.initialize(OLD);
 const created=await x.management.rotate(OLD,NEW);
 const folder=path.join(x.data,'recovery-audit','default','signing-key-slots');
 const orphan=crypto.randomBytes(32).toString('hex'),fake=path.join(folder,orphan);
 await p.mkdir(fake);await p.writeFile(path.join(fake,'private.pem'),'ENCRYPTED-ORPHAN');
 const before=await p.readFile(path.join(fake,'private.pem'),'utf8');
 const result=await x.trust.inventory();
 assert.equal(result.activeFingerprint,created.newFingerprint);
 assert.ok(result.candidates.some(e=>e.fingerprint===orphan&&e.containsEncryptedPrivateKey));
 assert.equal(await p.readFile(path.join(fake,'private.pem'),'utf8'),before);
}));
test('profile mismatches and swapped bundle keys are rejected',()=>scenario(async x=>{
 await x.signing.initialize(OLD);
 const file=path.join(x.root,'evidence.json');
 await x.signing.exportCheckpoint(file,OLD);
 const b=await x.trust.bundle(),e=JSON.parse(await p.readFile(file,'utf8'));
 assert.throws(()=>verifyOffline({...b,profileTag:'0'.repeat(64)},e,b.keys[0].fingerprint),/Profile tag differs/);
 const other=crypto.generateKeyPairSync('ed25519',{publicKeyEncoding:{format:'pem',type:'spki'},privateKeyEncoding:{format:'pem',type:'pkcs8'}});
 assert.throws(()=>verifyOffline({...b,keys:[{...b.keys[0],publicKey:other.publicKey}]},e,b.keys[0].fingerprint),/fingerprint mismatch/);
}));
