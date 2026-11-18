'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),p=fs.promises,path=require('node:path'),os=require('node:os');
const {RecoveryAudit}=require('../src/core/recovery-audit');
const {createRegistry}=require('../src/core/profiles');
const {AuditSigning}=require('../src/core/audit-signing');
const {SigningKeyManagement}=require('../src/core/signing-key-management');
const {TrustLifecycle}=require('../src/core/trust-lifecycle');
const {SafeKeyQuarantine}=require('../src/core/safe-key-quarantine');
const {signedExport,verifySignedFile,verifySignedBundle,verifyChain,
  readChain,exportRotationCheckpoint,verifyCheckpointFile}=require('../src/core/trust-hardening');
const OLD='Long strong trust passphrase 2026',NEW='Another strong trust passphrase 2026';
async function fixture(fn){
 const root=await p.mkdtemp(path.join(os.tmpdir(),'asi-pass17-')),data=path.join(root,'data');
 await p.mkdir(data);
 const registry=createRegistry(data),audit=new RecoveryAudit({dataDir:data,getProfileId:()=>registry.currentId()});
 const signing=new AuditSigning({audit}),keys=new SigningKeyManagement({signing}),trust=new TrustLifecycle({signing});
 try{return await fn({root,data,registry,audit,signing,keys,trust});}
 finally{await p.rm(root,{force:true,recursive:true});}
}
test('signed bundle authenticates pinned signer; changes, wrong pin and wrong password fail',()=>fixture(async x=>{
 await x.signing.initialize(OLD);
 const pin=(await x.signing.status()).fingerprint,file=path.join(x.root,'signed-trust.json');
 await assert.rejects(()=>signedExport(x.trust,file,'wrong password'),/password incorrect/);
 assert.equal(fs.existsSync(file),false);
 await signedExport(x.trust,file,OLD);
 assert.equal((await verifySignedFile(file,pin)).ok,true);
 const doc=JSON.parse(await p.readFile(file,'utf8'));
 assert.throws(()=>verifySignedBundle(doc,'a'.repeat(64)),/independent pin/);
 const changed=structuredClone(doc);changed.bundle.profileTag='0'.repeat(64);
 assert.throws(()=>verifySignedBundle(changed,pin),/authentication failed/);
 await assert.rejects(()=>signedExport(x.trust,file,OLD),/EEXIST/);
}));
test('rotation chain verifies and signed external checkpoint detects truncation or rewrite',()=>fixture(async x=>{
 await x.signing.initialize(OLD);
 const rotated=await x.keys.rotate(OLD,NEW);
 const base=path.join(x.data,'recovery-audit','default');
 const chainFile=path.join(base,'rotation-history-chain.jsonl');
 const lines=await readChain(chainFile),state=verifyChain(lines);
 assert.equal(state.events,1);
 assert.equal(lines[0].newFingerprint,rotated.newFingerprint);
 const checkpoint=path.join(x.root,'rotation-checkpoint.json');
 await exportRotationCheckpoint(x.trust,checkpoint,NEW);
 assert.equal((await verifyCheckpointFile(checkpoint,rotated.newFingerprint,x.trust)).events,1);
 await p.writeFile(chainFile,'');
 await assert.rejects(()=>verifyCheckpointFile(checkpoint,rotated.newFingerprint,x.trust),/truncated/);
 await p.writeFile(chainFile,JSON.stringify({...lines[0],at:'2020-01-01T00:00:00.000Z'})+'\n');
 await assert.rejects(()=>verifyCheckpointFile(checkpoint,rotated.newFingerprint,x.trust),/hash mismatch/);
}));
test('quarantine demands preview, typed approval, unchanged slot and single-use token',()=>fixture(async x=>{
 await x.signing.initialize(OLD);
 const first=await x.keys.rotate(OLD,NEW),folder=path.join(x.data,'recovery-audit','default');
 const slot=path.join(folder,'signing-key-slots',first.newFingerprint);
 const oldKey=path.join(slot,'private.pem');
 // Perform second rotation so first key becomes an inactive versioned slot.
 const third='Third independent passphrase 2026';
 await x.keys.rotate(NEW,third);
 assert.equal(fs.existsSync(oldKey),false); // rotation unlinks previous private key
 // Construct synthetic inactive slot with matching encrypted PEM and public key.
 const oldLegacy=path.join(folder,'signing-key-slots',first.oldFingerprint);
 await p.mkdir(oldLegacy,{recursive:true});
 const originalPublic=await p.readFile(path.join(folder,'retired-signing-keys',first.oldFingerprint+'.pem'),'utf8');
 const privateSource=path.join(folder,'quarantine-test-encrypted-private.pem');
 // Dummy encrypted PEM marker is enough for non-destructive filesystem verification.
 await p.writeFile(privateSource,'-----BEGIN ENCRYPTED PRIVATE KEY-----\nsynthetic\n-----END ENCRYPTED PRIVATE KEY-----');
 await p.copyFile(privateSource,path.join(oldLegacy,'private.pem'));
 await p.writeFile(path.join(oldLegacy,'public.pem'),originalPublic);
 const guard=new SafeKeyQuarantine({signing:x.signing});
 await assert.rejects(()=>guard.quarantine({token:'x',fingerprint:first.oldFingerprint,ack:'QUARANTINE KEY'}),/expired or mismatched/);
 await assert.rejects(()=>guard.preview((await x.signing.status()).fingerprint),/Active signing key/);
 const preview=await guard.preview(first.oldFingerprint);
 await assert.rejects(()=>guard.quarantine({token:preview.token,fingerprint:first.oldFingerprint,ack:'wrong'}),/expired or mismatched/);
 assert.equal(fs.existsSync(oldLegacy),true);
 const again=await guard.preview(first.oldFingerprint);
 const out=await guard.quarantine({token:again.token,fingerprint:first.oldFingerprint,ack:'QUARANTINE KEY'});
 assert.equal(out.ok,true);assert.equal(fs.existsSync(oldLegacy),false);
 const dest=path.join(folder,'quarantined-signing-keys');
 assert.equal((await p.readdir(dest)).length,1);
 await assert.rejects(()=>guard.quarantine({token:again.token,fingerprint:first.oldFingerprint,ack:'QUARANTINE KEY'}),/expired or mismatched/);
}));
test('fault injection, changed contents, expiration and profile change leave original key untouched',()=>fixture(async x=>{
 await x.signing.initialize(OLD);const first=await x.keys.rotate(OLD,NEW);
 const folder=path.join(x.data,'recovery-audit','default');
 const candidate=first.oldFingerprint,dir=path.join(folder,'signing-key-slots',candidate);
 await p.mkdir(dir);
 await p.writeFile(path.join(dir,'private.pem'),'-----BEGIN ENCRYPTED PRIVATE KEY-----\nfixture');
 await p.copyFile(path.join(folder,'retired-signing-keys',candidate+'.pem'),path.join(dir,'public.pem'));
 let now=1000;
 const guard=new SafeKeyQuarantine({signing:x.signing,now:()=>now,hooks:{beforeMove:()=>{throw Error('SIMULATED_RENAME_FAILURE');}}});
 const a=await guard.preview(candidate);
 await p.appendFile(path.join(dir,'private.pem'),'changed');
 await assert.rejects(()=>guard.quarantine({token:a.token,fingerprint:candidate,ack:'QUARANTINE KEY'}),/changed since preview/);
 assert.equal(fs.existsSync(dir),true);
 const b=await guard.preview(candidate);now=now+120001;
 await assert.rejects(()=>guard.quarantine({token:b.token,fingerprint:candidate,ack:'QUARANTINE KEY'}),/expired or mismatched/);
 now=1000;
 const c=await guard.preview(candidate);
 await assert.rejects(()=>guard.quarantine({token:c.token,fingerprint:candidate,ack:'QUARANTINE KEY'}),/SIMULATED_RENAME_FAILURE/);
 assert.equal(fs.existsSync(dir),true);
 const d=await guard.preview(candidate);
 const second=x.registry.create('Another profile');x.registry.activate(second.id);
 await assert.rejects(()=>guard.quarantine({token:d.token,fingerprint:candidate,ack:'QUARANTINE KEY'}),/expired or mismatched/);
 assert.equal(fs.existsSync(dir),true);
}));
