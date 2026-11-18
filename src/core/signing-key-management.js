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
  constructor({signing}){if(!signing?.audit)throw Error('Signing manager requires audit signing');this.signing=signing;this.audit=signing.audit;}
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
      const oldFingerprint=fingerprint(oldPublic),folder=path.dirname(f.privateFile);
      const archiveDir=path.join(folder,'retired-signing-keys');
      await p.mkdir(archiveDir,{recursive:true,mode:0o700});
      const oldArchive=path.join(archiveDir,oldFingerprint+'.pem');
      if(fs.existsSync(oldArchive))throw Error('Signing key was already retired');
      const kp=crypto.generateKeyPairSync('ed25519',{publicKeyEncoding:{format:'pem',type:'spki'},privateKeyEncoding:{format:'pem',type:'pkcs8',cipher:'aes-256-cbc',passphrase:newPassword}});
      const newFingerprint=fingerprint(kp.publicKey);
      // Archive only the old PUBLIC key. Never retain decrypted or retired private keys.
      // Stage new keys beside originals; a failed rename is restored from in-memory copies.
      const suffix=crypto.randomBytes(8).toString('hex');
      const tmpPrivate=f.privateFile+'.'+suffix+'.new',tmpPublic=f.publicFile+'.'+suffix+'.new';
      await p.writeFile(tmpPrivate,kp.privateKey,{flag:'wx',mode:0o600});
      try{
        await p.writeFile(tmpPublic,kp.publicKey,{flag:'wx',mode:0o600});
        await p.writeFile(oldArchive,oldPublic,{flag:'wx',mode:0o600});
        try{
          await p.rename(tmpPrivate,f.privateFile);
          await p.rename(tmpPublic,f.publicFile);
        }catch(e){
          await p.writeFile(f.privateFile,oldPrivate,{mode:0o600});
          await p.writeFile(f.publicFile,oldPublic,{mode:0o600});
          throw e;
        }
      }finally{await p.rm(tmpPrivate,{force:true});await p.rm(tmpPublic,{force:true});}
      return {ok:true,oldFingerprint,newFingerprint,warning:'Older evidence remains verifiable with the archived public key; preserve independent fingerprints. Rotation does not revoke previously compromised signatures.'};
    });
  }
}
module.exports={SigningKeyManagement,encode,decode};
