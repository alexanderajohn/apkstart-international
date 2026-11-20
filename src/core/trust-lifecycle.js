'use strict';
// Pass 16. Public-key-only trust bundles. No self-authentication of exported
// keys: verifier MUST supply an independently obtained pinned fingerprint.
const fs=require('node:fs'),p=fs.promises,path=require('node:path'),crypto=require('node:crypto');
const {fingerprint,verifyEnvelope,profileTag}=require('./audit-signing');
const HEX=/^[0-9a-f]{64}$/,FORMAT='asi-trust-bundle-v1';
const sha=s=>crypto.createHash('sha256').update(s).digest('hex');
function trustedKey(pem,expected){
  if(typeof pem!=='string'||pem.length>2048||!HEX.test(expected)||fingerprint(pem)!==expected)
    throw Error('Public-key trust fingerprint mismatch');
  const key=crypto.createPublicKey(pem);
  if(key.asymmetricKeyType!=='ed25519')throw Error('Trust bundle requires Ed25519');
}
function checkBundle(b){
  if(!b||typeof b!=='object'||Array.isArray(b)||
    Object.keys(b).sort().join(',')!=='format,keys,profileTag,version'||
    b.format!==FORMAT||b.version!==1||!HEX.test(b.profileTag)||
    !Array.isArray(b.keys)||b.keys.length<1||b.keys.length>64)
    throw Error('Invalid trust bundle');
  const seen=new Set();
  for(const k of b.keys){
    if(!k||Object.keys(k).sort().join(',')!=='fingerprint,publicKey,role'
      ||!['active','retired'].includes(k.role)||seen.has(k.fingerprint))
      throw Error('Invalid trust bundle key');
    trustedKey(k.publicKey,k.fingerprint);seen.add(k.fingerprint);
  }
  if(b.keys.filter(k=>k.role==='active').length!==1)throw Error('Trust bundle must contain exactly one active key');
  return b;
}
async function safeRead(file,max=128*1024){
  const st=await p.lstat(file);
  if(!st.isFile()||st.isSymbolicLink()||st.size>max)throw Error('Unsafe or oversized trust file');
  return p.readFile(file,'utf8');
}
function verifyOffline(bundle,evidence,pinnedFingerprint){
  checkBundle(bundle);
  if(typeof pinnedFingerprint!=='string'||!HEX.test(pinnedFingerprint))
    throw Error('Enter an independently trusted public-key fingerprint');
  if(!bundle.keys.some(k=>k.fingerprint===pinnedFingerprint))
    throw Error('Pinned key is missing from bundle');
  const q=verifyEnvelope(evidence); // cryptographic signature; not proof of identity
  if(q.profileTag!==bundle.profileTag)throw Error('Profile tag differs from trusted bundle');
  const k=bundle.keys.find(x=>x.fingerprint===q.keyFingerprint);
  if(!k||k.publicKey!==evidence.publicKey)throw Error('Untrusted evidence signer');
  // A pin to a different key does NOT authorize all keys in an attacker-edited
  // bundle. Only the exact pinned signer is accepted for offline verification.
  if(q.keyFingerprint!==pinnedFingerprint)throw Error('Evidence signer does not match independent pin');
  if(q.kind==='report'){
    if(sha(JSON.stringify(evidence.report))!==q.reportDigest||
       evidence.report?.verification?.eventsCount!==q.eventsCount||
       evidence.report?.verification?.head!==q.head)
      throw Error('Report contents do not match signed digest');
  }
  return {ok:true,signatureValid:true,signerFingerprint:q.keyFingerprint,
    profileTag:q.profileTag,kind:q.kind,eventsCount:q.eventsCount,
    warning:'Fingerprint must have been obtained independently; this proves no current Android recovery state.'};
}
class TrustLifecycle{
  constructor({signing}){if(!signing?.audit)throw Error('Audit signing required');this.signing=signing;this.audit=signing.audit;}
  async _folder(){
    const f=await this.signing._identity();
    if(!f.exists)throw Error('Signing identity is not initialized');
    return f;
  }
  async bundle(){
    return this.audit._enqueue(async()=>{
      const f=await this._folder(),active=await safeRead(f.publicFile,4096);
      const keys=[{fingerprint:fingerprint(active),publicKey:active,role:'active'}];
      const retired=path.join(f.folder,'retired-signing-keys');
      if(fs.existsSync(retired)){
        const st=await p.lstat(retired);
        if(!st.isDirectory()||st.isSymbolicLink())throw Error('Unsafe retired keys directory');
        const names=await p.readdir(retired);
        if(names.length>63)throw Error('Too many retired keys for bundle');
        for(const name of names.sort()){
          if(!HEX.test(name.slice(0,-4))||!name.endsWith('.pem'))throw Error('Unexpected retired-key file');
          const pem=await safeRead(path.join(retired,name),4096),id=name.slice(0,-4);
          trustedKey(pem,id);
          if(id===keys[0].fingerprint)throw Error('Active key duplicated in retired directory');
          keys.push({fingerprint:id,publicKey:pem,role:'retired'});
        }
      }
      return checkBundle({format:FORMAT,version:1,profileTag:profileTag(this.audit.getProfileId()),keys});
    });
  }
  async exportBundle(destination){
    if(typeof destination!=='string'||!destination.toLowerCase().endsWith('.json'))throw Error('Choose a JSON trust bundle path');
    const b=await this.bundle(),dest=path.resolve(destination);
    const root=await p.realpath(this.audit.dataDir),parent=await p.realpath(path.dirname(dest));
    const relative=path.relative(root,path.join(parent,path.basename(dest)));
    if(relative===''||(!relative.startsWith('..'+path.sep)&&relative!=='..'&&!path.isAbsolute(relative)))
      throw Error('Trust bundle must be exported outside application data');
    const fh=await p.open(dest,'wx',0o600);
    try{await fh.writeFile(JSON.stringify(b,null,2)+'\n');await fh.sync();}
    catch(e){await fh.close();await p.rm(dest,{force:true});throw e;}
    await fh.close();
    return {ok:true,keys:b.keys.length,activeFingerprint:b.keys[0].fingerprint,
      warning:'Trust bundles contain public keys, NOT proof of their authenticity. Independently verify the active fingerprint.'};
  }
  async verifyFiles(bundleFile,evidenceFile,pin){
    const bundle=JSON.parse(await safeRead(bundleFile)),evidence=JSON.parse(await safeRead(evidenceFile,9*1024*1024));
    return verifyOffline(bundle,evidence,pin);
  }
  async rotationHistory(){
    return this.audit._enqueue(async()=>{
      const f=await this._folder(),file=path.join(f.folder,'rotation-history.jsonl');
      if(!fs.existsSync(file))return {entries:[],warning:'No local rotation history. Fingerprints require independent verification.'};
      const raw=await safeRead(file,256*1024),lines=raw.trim().split(String.fromCharCode(10));
      if(lines.length>500)throw Error('Rotation history too large');
      const entries=lines.map(line=>{
        const e=JSON.parse(line);
        if(e.version!==1||!HEX.test(e.oldFingerprint)||!HEX.test(e.newFingerprint)||
           e.transition!=='active-pointer-switched'||Number.isNaN(Date.parse(e.at)))
          throw Error('Invalid local rotation history');
        return {at:e.at,oldFingerprint:e.oldFingerprint,newFingerprint:e.newFingerprint};
      });
      return {entries,warning:'Local history is informational, not signed or externally anchored. Compare against trusted fingerprints.'};
    });
  }
  async inventory(){
    return this.audit._enqueue(async()=>{
      const f=await this._folder(),slots=path.join(f.folder,'signing-key-slots');
      const items=[];
      if(fs.existsSync(slots)){
        const st=await p.lstat(slots);
        if(!st.isDirectory()||st.isSymbolicLink())throw Error('Unsafe signing slots directory');
        for(const name of (await p.readdir(slots)).sort()){
          if(!HEX.test(name))throw Error('Unexpected signing slot');
          const full=path.join(slots,name),stat=await p.lstat(full);
          if(stat.isSymbolicLink()||!stat.isDirectory())throw Error('Unsafe signing slot');
          const file=path.join(full,'private.pem');
          const hasPrivate=fs.existsSync(file);
          if(hasPrivate)await safeRead(file);
          items.push({fingerprint:name,active:!!f.versioned&&f.fingerprint===name,
            containsEncryptedPrivateKey:hasPrivate,action:'review-only'});
        }
      }
      if(f.versioned){
        const legacy=path.join(f.folder,'audit-ed25519-private.pem');
        if(fs.existsSync(legacy)){await safeRead(legacy);items.push({
          fingerprint:null,active:false,containsEncryptedPrivateKey:true,
          action:'legacy-inactive-review-only'});}
      }
      return {activeFingerprint:fingerprint(await safeRead(f.publicFile,4096)),
        candidates:items.filter(i=>!i.active),
        warning:'Read-only inventory. Never automatically delete orphan slots, encrypted private keys or recovery material.'};
    });
  }
}
module.exports={TrustLifecycle,verifyOffline,checkBundle};
