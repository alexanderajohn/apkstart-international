'use strict';
/**
 * Pass 15: explicit, encrypted signing-key portability and controlled rotation.
 * Nothing is transferred remotely. No existing local identity is overwritten.
 */
const fs=require('node:fs'),p=fs.promises,path=require('node:path'),crypto=require('node:crypto');
const {validatePassword}=require('./encrypted-backup');
const {fingerprint}=require('./audit-signing');
const FORMAT='asi-signing-key-backup-v1', MAX=128*1024;
function sha(x){return crypto.createHash('sha256').update(x).digest('hex');}
function keyPair(pem,pub,password){
  let privateKey;
  try{privateKey=crypto.createPrivateKey({key:pem,format:'pem',passphrase:password});}
  catch(_){throw Error('Incorrect signing-key passphrase or corrupt private key');}
  if(privateKey.asymmetricKeyType!=='ed25519'||crypto.createPublicKey(privateKey).export({format:'pem',type:'spki'})!==pub)
    throw Error('Signing private/public key mismatch');
  return privateKey;
}
async function safeFile(file){
  const s=await p.lstat(file);
  if(!s.isFile()||s.isSymbolicLink()||s.size>MAX)throw Error('Unsafe signing-key file');
  return p.readFile(file,'utf8');
}
async function externalPath(destination,dataDir){
  if(typeof destination!=='string'||!destination.toLowerCase().endsWith('.json'))throw Error('Choose a JSON backup destination');
  const root=await p.realpath(dataDir),dir=await p.realpath(path.dirname(path.resolve(destination)));
  const target=path.join(dir,path.basename(destination)),rel=path.relative(root,target);
  if(!rel.startsWith('..'+path.sep)&&rel!=='..'||path.isAbsolute(rel))throw Error('Key backup must be outside application data');
  if(fs.existsSync(target))throw Error('Key backup destination already exists');
  return target;
}
function decode(doc,password){
  validatePassword(password);
  if(!doc||Object.keys(doc).sort().join(',')!=='ciphertext,format,iv,kdf,salt,tag,version'
    ||doc.format!==FORMAT||doc.version!==1||doc.kdf!=='scrypt-N16384-r8-p1')
    throw Error('Unsupported signing-key backup');
  for(const [v,n] of [['salt',32],['iv',12],['tag',16]]){
    if(typeof doc[v]!=='string'||!/^[0-9a-f]+$/.test(doc[v])||doc[v].length!==n*2)
      throw Error('Invalid key backup header');
  }
  if(typeof doc.ciphertext!=='string'||doc.ciphertext.length>MAX*2||!/^[A-Za-z0-9+/]*={0,2}$/.test(doc.ciphertext))
    throw Error('Invalid key backup ciphertext');
  const key=crypto.scryptSync(password,Buffer.from(doc.salt,'hex'),32,{N:16384,r:8,p:1});
  try{
    const decipher=crypto.createDecipheriv('aes-256-gcm',key,Buffer.from(doc.iv,'hex'));
    decipher.setAAD(Buffer.from(FORMAT));decipher.setAuthTag(Buffer.from(doc.tag,'hex'));
    const plain=Buffer.concat([decipher.update(Buffer.from(doc.ciphertext,'base64')),decipher.final()]);
    const payload=JSON.parse(plain.toString('utf8'));
    if(Object.keys(payload).sort().join(',')!=='fingerprint,privatePem,profileTag,publicPem'
      ||typeof payload.privatePem!=='string'||typeof payload.publicPem!=='string'
      ||payload.fingerprint!==fingerprint(payload.publicPem)
      ||!/^[0-9a-f]{64}$/.test(payload.profileTag))throw Error('Invalid key backup contents');
    return payload;
  }catch(e){throw Error('Incorrect backup password or modified encrypted key backup');}
}
function encode(payload,password){
  validatePassword(password);
  const salt=crypto.randomBytes(32),iv=crypto.randomBytes(12);
  const key=crypto.scryptSync(password,salt,32,{N:16384,r:8,p:1});
  const cipher=crypto.createCipheriv('aes-256-gcm',key,iv);
  cipher.setAAD(Buffer.from(FORMAT));
  const ciphertext=Buffer.concat([cipher.update(JSON.stringify(payload),'utf8'),cipher.final()]);
  return {format:FORMAT,version:1,kdf:'scrypt-N16384-r8-p1',salt:salt.toString('hex'),
    iv:iv.toString('hex'),tag:cipher.getAuthTag().toString('hex'),ciphertext:ciphertext.toString('base64')};
}
class SigningKeyManagement{
  constructor({signing,hooks={}}){if(!signing?.audit)throw Error('Signing manager requires audit signing');this.signing=signing;this.audit=signing.audit;this.hooks=hooks;}
  async exportEncrypted(destination,keyPassword,backupPassword){
    return this.audit._enqueue(async()=>{
      const dest=await externalPath(destination,this.audit.dataDir);
      await this.audit._read();
      const f=await this.signing._identity();
      if(!f.exists)throw Error('No existing signing identity');
      const [privatePem,publicPem]=await Promise.all([safeFile(f.privateFile),safeFile(f.publicFile)]);
      keyPair(privatePem,publicPem,keyPassword);
      const {profileTag}=require('./audit-signing');
      const payload={privatePem,publicPem,fingerprint:fingerprint(publicPem),profileTag:profileTag(this.audit.getProfileId())};
      const json=JSON.stringify(encode(payload,backupPassword))+'\n';
      const h=await p.open(dest,'wx',0o600);
      try{await h.writeFile(json);await h.sync();}catch(e){await h.close();await p.rm(dest,{force:true});throw e;}await h.close();
      return {ok:true,fingerprint:payload.fingerprint,warning:'Keep this encrypted backup and its password separately. Anyone with both can impersonate the signer.'};
    });
  }
  async importEncrypted(source,backupPassword,keyPassword){
    return this.audit._enqueue(async()=>{
      await this.audit._read();
      const f=await this.signing._identity(true);
      if(f.exists)throw Error('Existing signing identity must never be overwritten by import');
      if(typeof source!=='string')throw Error('Choose a key backup JSON file');
      const doc=JSON.parse(await safeFile(source));
      const payload=decode(doc,backupPassword);
      const {profileTag}=require('./audit-signing');
      if(payload.profileTag!==profileTag(this.audit.getProfileId()))throw Error('Backup belongs to another profile');
      keyPair(payload.privatePem,payload.publicPem,keyPassword);
      let created=false;
      try{
        await p.writeFile(f.privateFile,payload.privatePem,{flag:'wx',mode:0o600});created=true;
        await p.writeFile(f.publicFile,payload.publicPem,{flag:'wx',mode:0o600});
      }catch(e){if(created)throw Error('Signing import incomplete; preserve private key for manual recovery');throw e;}
      return {ok:true,fingerprint:payload.fingerprint};
    });
  }
  async rotate(oldPassword,newPassword){
    validatePassword(newPassword);
    return this.audit._enqueue(async()=>{
      await this.audit._read();
      const f=await this.signing._identity();
      if(!f.exists)throw Error('No signing key to rotate');
      const [oldPrivate,oldPublic]=await Promise.all([safeFile(f.privateFile),safeFile(f.publicFile)]);
      keyPair(oldPrivate,oldPublic,oldPassword);
      const oldFingerprint=fingerprint(oldPublic),folder=f.folder;
      const archiveDir=path.join(folder,'retired-signing-keys');
      const archive=path.join(archiveDir,oldFingerprint+'.pem');
      // A previous successful rotation may already have archived this key.
      // Refuse to silently replace any inconsistent historical public key.
      await p.mkdir(archiveDir,{recursive:true,mode:0o700});
      if(fs.existsSync(archive)){
        if(await safeFile(archive)!==oldPublic)throw Error('Retired public key conflicts with active identity');
      }else{
        const h=await p.open(archive,'wx',0o600);
        try{await h.writeFile(oldPublic);await h.sync();}finally{await h.close();}
      }
      const kp=crypto.generateKeyPairSync('ed25519',{
        publicKeyEncoding:{format:'pem',type:'spki'},
        privateKeyEncoding:{format:'pem',type:'pkcs8',cipher:'aes-256-cbc',passphrase:newPassword}
      });
      const newFingerprint=fingerprint(kp.publicKey);
      const slots=path.join(folder,'signing-key-slots');
      await p.mkdir(slots,{recursive:true,mode:0o700});
      const slot=path.join(slots,newFingerprint);
      await p.mkdir(slot,{recursive:false,mode:0o700});
      const writeSynced=async(file,contents)=>{
        const h=await p.open(file,'wx',0o600);
        try{await h.writeFile(contents);await h.sync();}finally{await h.close();}
      };
      const pointer=path.join(folder,'active-key.json');
      const temp=path.join(folder,'.active-key-'+crypto.randomBytes(12).toString('hex')+'.tmp');
      let committed=false;
      try{
        await writeSynced(path.join(slot,'private.pem'),kp.privateKey);
        await writeSynced(path.join(slot,'public.pem'),kp.publicKey);
        // Reject inconsistent staging, with new password, before pointer switch.
        keyPair(await safeFile(path.join(slot,'private.pem')),
          await safeFile(path.join(slot,'public.pem')),newPassword);
        await writeSynced(temp,JSON.stringify({version:1,fingerprint:newFingerprint})+'\n');
        if(this.hooks.beforeCommit)await this.hooks.beforeCommit(); // synthetic crash-injection test only
        // This is the ONLY active-identity commit point. If this rename fails,
        // old legacy files or the previous active pointer remain authoritative.
        await p.rename(temp,pointer);
        committed=true;
      }finally{
        await p.rm(temp,{force:true}).catch(()=>{});
        if(!committed){
          await p.rm(slot,{recursive:true,force:true}).catch(()=>{});
        }
      }
      // AFTER the atomic commit, avoid throwing: active identity is already new.
      // Retain the old public key only. A crash here can temporarily leave an
      // old encrypted private key: remove it on next explicit management call.
      let cleanupWarning=null;
      try{
        if(this.hooks.beforeCleanup)await this.hooks.beforeCleanup(); // simulate abrupt termination after pointer commit
        await p.unlink(f.privateFile);
      }
      catch(_){cleanupWarning='Old encrypted private key cleanup failed; manually remove the inactive private PEM after verifying the new key and retaining an external backup.';}
      // Best-effort rotation timeline: operational metadata, NOT a notarized
      // chain. Both fingerprints remain independently verifiable elsewhere.
      try{
        const history=path.join(folder,'rotation-history.jsonl');
        const handle=await p.open(history,'a',0o600);
        try{
          await handle.writeFile(JSON.stringify({version:1,at:new Date().toISOString(),
            oldFingerprint,newFingerprint,transition:'active-pointer-switched'})+'\\n'.replace('\\\\n','\\n'));
          await handle.sync();
        }finally{await handle.close();}
      }catch(_){
        cleanupWarning=(cleanupWarning||'')+' Rotation history could not be recorded; compare independently preserved fingerprints.';
      }
      return {ok:true,oldFingerprint,newFingerprint,committed:true,
        warning:cleanupWarning||'New key activated atomically. Preserve external fingerprints. Rotation does not revoke prior signatures.'};
    });
  }
}
module.exports={SigningKeyManagement,encode,decode};
