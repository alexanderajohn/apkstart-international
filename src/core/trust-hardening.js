'use strict';
/**
 * Pass 17: separately pinned, signed trust bundles and hash-chained rotation
 * checkpoints. Trust always starts with an out-of-band key fingerprint.
 */
const fs=require('node:fs'),p=fs.promises,crypto=require('node:crypto'),path=require('node:path');
const {fingerprint}=require('./audit-signing');
const {checkBundle}=require('./trust-lifecycle');
const {validatePassword}=require('./encrypted-backup');
const HEX=/^[0-9a-f]{64}$/;
const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
const domain='ASI-TRUST-BUNDLE-SIGNATURE-v2\n';
const canonical=b=>JSON.stringify(b);
function strict(o,keys){
  if(!o||typeof o!=='object'||Array.isArray(o)||Object.keys(o).sort().join(',')!==keys.slice().sort().join(','))
    throw Error('Signed trust schema mismatch');
}
function signBundle(bundle,privatePem,password){
  validatePassword(password);checkBundle(bundle);
  const active=bundle.keys.find(k=>k.role==='active');
  let key;
  try{key=crypto.createPrivateKey({key:privatePem,format:'pem',passphrase:password});}
  catch(_){throw Error('Signing password incorrect');}
  if(key.asymmetricKeyType!=='ed25519'||
    crypto.createPublicKey(key).export({format:'pem',type:'spki'})!==active.publicKey)
    throw Error('Signing key does not match trust bundle');
  const envelope={format:'asi-signed-trust-bundle-v2',version:2,bundle,
    signerFingerprint:active.fingerprint,
    signature:crypto.sign(null,Buffer.from(domain+canonical(bundle)),key).toString('base64')};
  verifySignedBundle(envelope,active.fingerprint);
  return envelope;
}
function verifySignedBundle(doc,independentPin){
  strict(doc,['format','version','bundle','signerFingerprint','signature']);
  if(doc.format!=='asi-signed-trust-bundle-v2'||doc.version!==2||!HEX.test(doc.signerFingerprint)
    ||typeof independentPin!=='string'||!HEX.test(independentPin))
    throw Error('Independent signer pin is mandatory');
  checkBundle(doc.bundle);
  const signer=doc.bundle.keys.find(x=>x.fingerprint===doc.signerFingerprint&&x.role==='active');
  if(!signer||independentPin!==doc.signerFingerprint)
    throw Error('Signed trust bundle signer differs from independent pin');
  if(typeof doc.signature!=='string'||!/^[A-Za-z0-9+/]{86}==$/.test(doc.signature))
    throw Error('Malformed trust signature');
  if(!crypto.verify(null,Buffer.from(domain+canonical(doc.bundle)),signer.publicKey,
      Buffer.from(doc.signature,'base64')))
    throw Error('Signed trust bundle authentication failed');
  return {ok:true,signerFingerprint:doc.signerFingerprint,profileTag:doc.bundle.profileTag,
    keys:doc.bundle.keys.length,
    caveat:'This verifies a pinned signer, not a certification authority, key revocation or trusted timestamp.'};
}
async function checkedFile(file,limit){
  const st=await p.lstat(file);
  if(st.isSymbolicLink()||!st.isFile()||st.size>limit)throw Error('Unsafe trust material');
  return p.readFile(file,'utf8');
}
async function signedExport(trust,destination,password){
  if(typeof destination!=='string'||!destination.toLowerCase().endsWith('.json'))
    throw Error('Choose signed trust JSON export');
  const dest=path.resolve(destination),root=await p.realpath(trust.audit.dataDir),
    parent=await p.realpath(path.dirname(dest)),rel=path.relative(root,path.join(parent,path.basename(dest)));
  if(rel===''||(!rel.startsWith('..'+path.sep)&&rel!=='..'&&!path.isAbsolute(rel)))
    throw Error('Signed trust export must be outside app data');
  // Avoid locking the audit queue recursively: bundle() already obtains it.
  const bundle=await trust.bundle();
  const identity=await trust.signing._identity();
  const pem=await checkedFile(identity.privateFile,128*1024);
  const doc=signBundle(bundle,pem,password);
  const h=await p.open(dest,'wx',0o600);
  try{await h.writeFile(JSON.stringify(doc,null,2)+'\n');await h.sync();}
  catch(e){await h.close();await p.rm(dest,{force:true});throw e;}
  await h.close();
  return {ok:true,fingerprint:doc.signerFingerprint,
    warning:'Store and verify the signer fingerprint independently. No trusted timestamp or revocation authority.'};
}
async function verifySignedFile(file,pin){
  const doc=JSON.parse(await checkedFile(file,128*1024));
  return verifySignedBundle(doc,pin);
}
const GENESIS='0'.repeat(64);
function verifyChain(lines){
  let head=GENESIS,seq=0;
  for(const e of lines){
    strict(e,['version','sequence','at','oldFingerprint','newFingerprint','transition','previous','hash']);
    if(e.version!==1||e.sequence!==++seq||e.previous!==head
      ||!HEX.test(e.oldFingerprint)||!HEX.test(e.newFingerprint)
      ||!HEX.test(e.hash)||e.transition!=='active-pointer-switched'
      ||typeof e.at!=='string'||Number.isNaN(Date.parse(e.at)))
      throw Error('Rotation chain structure invalid');
    const {hash:ignored,...unsigned}=e;
    if(hash('ASI-ROTATION-CHAIN-v1\n'+JSON.stringify(unsigned))!==e.hash)
      throw Error('Rotation history hash mismatch');
    head=e.hash;
  }
  return {events:seq,head};
}
async function readChain(file){
  if(!fs.existsSync(file))return [];
  const data=await checkedFile(file,256*1024);
  if(!data.trim())return [];
  const lines=data.trimEnd().split('\n');
  if(lines.length>500)throw Error('Rotation history too long');
  return lines.map(x=>JSON.parse(x));
}
async function exportRotationCheckpoint(trust,dest,password){
  if(typeof dest!=='string'||!dest.toLowerCase().endsWith('.json'))
    throw Error('Choose rotation checkpoint JSON');
  const loc=await trust.signing._identity();
  if(!loc.exists)throw Error('Signing identity unavailable');
  const folder=loc.folder,file=path.join(folder,'rotation-history-chain.jsonl');
  const entries=await readChain(file),summary=verifyChain(entries);
  const active=await checkedFile(loc.publicFile,4096);
  const {profileTag}=require('./audit-signing');
  const payload={format:'asi-rotation-checkpoint-v1',version:1,
    profileTag:profileTag(trust.audit.getProfileId()),signerFingerprint:fingerprint(active),
    events:summary.events,head:summary.head};
  const pem=await checkedFile(loc.privateFile,128*1024);
  let key;
  try{key=crypto.createPrivateKey({key:pem,format:'pem',passphrase:password});}
  catch(_){throw Error('Signing password incorrect');}
  if(crypto.createPublicKey(key).export({format:'pem',type:'spki'})!==active)
    throw Error('Checkpoint signing key mismatch');
  const doc={payload,publicKey:active,signature:crypto.sign(null,Buffer.from('ASI-ROTATION-CHECKPOINT-v1\n'+JSON.stringify(payload)),key).toString('base64')};
  const out=path.resolve(dest),root=await p.realpath(trust.audit.dataDir),parent=await p.realpath(path.dirname(out)),rel=path.relative(root,path.join(parent,path.basename(out)));
  if(rel===''||(!rel.startsWith('..'+path.sep)&&rel!=='..'&&!path.isAbsolute(rel)))
    throw Error('Checkpoint must be exported outside app data');
  const h=await p.open(out,'wx',0o600);
  try{await h.writeFile(JSON.stringify(doc,null,2)+'\n');await h.sync();}
  catch(e){await h.close();await p.rm(out,{force:true});throw e;}
  await h.close();
  return {ok:true,...summary,signerFingerprint:payload.signerFingerprint};
}
function verifyCheckpoint(doc,pin){
  strict(doc,['payload','publicKey','signature']);
  const q=doc.payload;
  strict(q,['format','version','profileTag','signerFingerprint','events','head']);
  if(q.format!=='asi-rotation-checkpoint-v1'||q.version!==1||!HEX.test(q.head)
    ||!HEX.test(q.profileTag)||!Number.isSafeInteger(q.events)||q.events<0
    ||!HEX.test(pin)||q.signerFingerprint!==pin||fingerprint(doc.publicKey)!==pin)
    throw Error('Untrusted rotation checkpoint');
  if(typeof doc.signature!=='string'||!/^[A-Za-z0-9+/]{86}==$/.test(doc.signature)
    ||!crypto.verify(null,Buffer.from('ASI-ROTATION-CHECKPOINT-v1\n'+JSON.stringify(q)),doc.publicKey,Buffer.from(doc.signature,'base64')))
    throw Error('Rotation checkpoint signature invalid');
  return {ok:true,events:q.events,head:q.head,profileTag:q.profileTag};
}
async function verifyCheckpointFile(source,pin,localTrust=null){
  const doc=JSON.parse(await checkedFile(source,128*1024)),signed=verifyCheckpoint(doc,pin);
  if(localTrust){
    const f=await localTrust.signing._identity();
    if(!f.exists)throw Error('No local signing identity');
    const {profileTag}=require('./audit-signing');
    if(signed.profileTag!==profileTag(localTrust.audit.getProfileId()))
      throw Error('Checkpoint is for a different profile');
    const chain=await readChain(path.join(f.folder,'rotation-history-chain.jsonl'));
    verifyChain(chain);
    if(signed.events>chain.length)throw Error('Rotation history truncated beneath external checkpoint');
    const historical=signed.events===0?GENESIS:chain[signed.events-1].hash;
    if(historical!==signed.head)throw Error('Rotation history diverged from external checkpoint');
  }
  return signed;
}
module.exports={signBundle,verifySignedBundle,signedExport,verifySignedFile,
  verifyChain,readChain,exportRotationCheckpoint,verifyCheckpoint,verifyCheckpointFile,GENESIS,hash};
