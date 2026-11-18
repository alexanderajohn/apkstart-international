'use strict';
/**
 * Encrypted Backup & Recovery v1. A directory of authenticated ciphertexts.
 *
 * AES-256-GCM is authenticated (not just SHA-256 checksums); scrypt derives
 * an encryption key from a user-entered password. Each data file gets its
 * own random 96-bit nonce. The encrypted manifest conceals app names,
 * paths, file hashes, profile identity and snapshot metadata.
 *
 * Export never writes plaintext to the destination. Restore writes plaintext
 * ONLY into per-target staging, verifies all authentication tags and hashes,
 * then performs protected renames with rollback, keeping old data copies.
 */
const fs=require('node:fs'),p=fs.promises,path=require('node:path'),crypto=require('node:crypto');
const {pipeline}=require('node:stream/promises');
const {Writable}=require('node:stream');
const {promisify}=require('node:util');
const {
  BackupCenter,FORMAT,VERSION,PARTS,DIRS,MAX_FILES,MAX_BYTES,
  checkManifest,within,safe,safeStat,walk,checkSpace
}=require('./backup-center');
const scrypt=promisify(crypto.scrypt);
const ENC_FORMAT='apkstart-international-encrypted-backup',ENC_VERSION=1;
const KDF={name:'scrypt',N:32768,r:8,p:1,keyBytes:32};
const MANIFEST_LIMIT=64*1048576;
const HEX32=/^[a-f0-9]{32}$/,HEX24=/^[a-f0-9]{24}$/,HEX64=/^[a-f0-9]{64}$/;
const id=(n=12)=>crypto.randomBytes(n).toString('hex');
const aad=(label)=>Buffer.from('ASI-ENC-BACKUP-v1/'+label,'utf8');
const authError=()=>Error('Incorrect password or encrypted backup authentication failed');
function validatePassword(value){
  if(typeof value!=='string')throw Error('A password is required for encrypted backups');
  const bytes=Buffer.byteLength(value,'utf8');
  if(bytes<12||bytes>1024)throw Error('Use a backup password of 12 to 1024 UTF-8 bytes');
  return value;
}
async function derive(password,saltHex){
  validatePassword(password);
  if(!HEX64.test(saltHex))throw Error('Invalid backup KDF salt');
  const input=Buffer.from(password,'utf8');
  try {return await scrypt(input,Buffer.from(saltHex,'hex'),32,{N:KDF.N,r:KDF.r,p:KDF.p,maxmem:128*1048576});}
  finally {input.fill(0);}
}
function encryptBytes(plaintext,key,label){
  const iv=crypto.randomBytes(12);
  const cipher=crypto.createCipheriv('aes-256-gcm',key,iv);
  cipher.setAAD(aad(label));
  const content=Buffer.concat([cipher.update(plaintext),cipher.final()]);
  return {content,iv:iv.toString('hex'),tag:cipher.getAuthTag().toString('hex')};
}
function decryptBytes(ciphertext,key,ivHex,tagHex,label){
  if(!HEX24.test(ivHex)||!HEX32.test(tagHex))throw Error('Invalid encrypted authentication metadata');
  try{
    const decipher=crypto.createDecipheriv('aes-256-gcm',key,Buffer.from(ivHex,'hex'));
    decipher.setAAD(aad(label));
    decipher.setAuthTag(Buffer.from(tagHex,'hex'));
    return Buffer.concat([decipher.update(ciphertext),decipher.final()]);
  }catch(_){throw authError();}
}
async function encryptFile(source,destination,key,blob){
  const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',key,iv);
  cipher.setAAD(aad('blob/'+blob));
  const hash=crypto.createHash('sha256');
  let size=0;
  const input=fs.createReadStream(source);
  input.on('data',chunk=>{hash.update(chunk);size+=chunk.length;});
  await pipeline(input,cipher,fs.createWriteStream(destination,{flags:'wx'}));
  if(!Number.isSafeInteger(size)||size>MAX_BYTES)throw Error('Backup source exceeds size limit');
  return {blob,size,sha256:hash.digest('hex'),iv:iv.toString('hex'),tag:cipher.getAuthTag().toString('hex')};
}
async function decryptFile(source,destination,key,record){
  const decipher=crypto.createDecipheriv('aes-256-gcm',key,Buffer.from(record.iv,'hex'));
  decipher.setAAD(aad('blob/'+record.blob));
  decipher.setAuthTag(Buffer.from(record.tag,'hex'));
  const hash=crypto.createHash('sha256');
  let size=0;
  decipher.on('data',chunk=>{size+=chunk.length;hash.update(chunk);});
  const target=destination
    ?fs.createWriteStream(destination,{flags:'wx'})
    :new Writable({write(_chunk,_encoding,next){next();}});
  try {await pipeline(fs.createReadStream(source),decipher,target);}
  catch(_){throw authError();}
  const digest=hash.digest('hex');
  if(size!==record.size||digest!==record.sha256)
    throw Error('Encrypted file SHA-256 or size mismatch');
  return {size,sha256:digest};
}
function checkHeader(h){
  if(!h||h.format!==ENC_FORMAT||h.version!==ENC_VERSION||h.cipher!=='aes-256-gcm'
    ||h.kdf?.name!==KDF.name||h.kdf.N!==KDF.N||h.kdf.r!==KDF.r
    ||h.kdf.p!==KDF.p||h.kdf.keyBytes!==32||!HEX64.test(h.salt)
    ||!h.manifest||!HEX24.test(h.manifest.iv)||!HEX32.test(h.manifest.tag))
    throw Error('Unsupported or invalid encrypted backup header');
  return h;
}
function checkEncryptedManifest(m){
  checkManifest(m);
  const seen=new Set();
  for(const f of m.files){
    if(!HEX32.test(f.blob)||!HEX24.test(f.iv)||!HEX32.test(f.tag)||seen.has(f.blob))
      throw Error('Invalid encrypted backup file record');
    seen.add(f.blob);
  }
  return m;
}
function sourcePath(l,rel){
  const [component,...tail]=rel.split('/');
  return rel==='apps.json'?l.targets['apps.json']:path.join(l.targets[component],...tail);
}
class EncryptedBackupCenter extends BackupCenter {
  // Never keep a password or derived key in class properties or a pending token.
  async create(folder,password){
    validatePassword(password);
    return this.exclusive(async()=>{
      await this.idle();
      const layout=this.layout(),parent=await p.realpath(folder);
      if(!(await safeStat(parent)).isDirectory())throw Error('Choose a backup destination folder');
      const data=await p.realpath(this.dataDir);
      if(within(parent,data)||within(data,parent))
        throw Error('Choose an external folder outside ApkStart profile data');
      for(const dest of Object.values(layout.targets))
        if(within(parent,dest)||within(dest,parent))
          throw Error('Encrypted backup destination overlaps live profile data');
      const inv=await this.inventory(layout);
      if(!inv.components.length)throw Error('Nothing to back up');
      checkSpace(parent,inv.totalBytes+MANIFEST_LIMIT);
      const dir='ASI-Encrypted-'+new Date().toISOString().slice(0,10)+'-'+id(6);
      const temp=path.join(parent,dir+'.partial'),dest=path.join(parent,dir);
      await p.mkdir(temp,{recursive:false});
      let key;
      try {
        const salt=crypto.randomBytes(32).toString('hex');
        key=await derive(password,salt);
        await p.mkdir(path.join(temp,'payload'));
        const records=[];let done=0;
        for(const entry of inv.files){
          await this.idle();
          const src=sourcePath(layout,entry.path);
          await safeStat(src);
          const blob=id(16),target=path.join(temp,'payload',blob+'.bin');
          const result=await encryptFile(src,target,key,blob);
          if(result.size!==entry.size)throw Error('Source changed during encryption');
          records.push({path:entry.path,...result});
          done+=result.size;this.progress('encrypt',done,inv.totalBytes);
        }
        const manifest={format:FORMAT,version:VERSION,profileId:layout.id,avdName:layout.avdName,
          createdAt:new Date().toISOString(),components:inv.components,directories:inv.directories,
          files:records,totalBytes:inv.totalBytes};
        checkEncryptedManifest(manifest);
        const manifestRaw=Buffer.from(JSON.stringify(manifest),'utf8');
        if(manifestRaw.length>MANIFEST_LIMIT)throw Error('Encrypted manifest exceeds allowed size');
        const sealed=encryptBytes(manifestRaw,key,'manifest');
        manifestRaw.fill(0);
        await p.writeFile(path.join(temp,'manifest.enc'),sealed.content,{flag:'wx'});
        const header={format:ENC_FORMAT,version:ENC_VERSION,cipher:'aes-256-gcm',
          kdf:KDF,salt,manifest:{iv:sealed.iv,tag:sealed.tag}};
        await p.writeFile(path.join(temp,'header.json'),JSON.stringify(header,null,2)+'\n',{flag:'wx'});
        // Verify authentication over *every* ciphertext before advertising success.
        await this._verify(temp,password,layout,false);
        await p.rename(temp,dest);
        this.progress('encrypt-complete',done,done);
        return {path:dest,profileId:layout.id,files:records.length,
          bytes:inv.totalBytes,createdAt:manifest.createdAt,encrypted:true,cipher:'AES-256-GCM'};
      }catch(e){
        try{await p.rm(temp,{recursive:true,force:true});}catch(_){}
        throw e;
      }finally {key?.fill(0);}
    });
  }
  async _verify(directory,password,layout=this.layout(),requireIdentity=true){
    const folder=await p.realpath(directory);
    if(!(await safeStat(folder)).isDirectory())throw Error('Select a backup directory');
    if(requireIdentity){
      const data=await p.realpath(this.dataDir);
      if(within(folder,data)||within(data,folder))
        throw Error('Encrypted backup overlaps ApkStart profile data');
      for(const dest of Object.values(layout.targets))
        if(within(folder,dest)||within(dest,folder))throw Error('Encrypted backup overlaps live profile data');
    }
    const headerFile=path.join(folder,'header.json'),headStat=await safeStat(headerFile);
    if(!headStat.isFile()||headStat.size>8192)throw Error('Invalid encrypted header size');
    const headerRaw=await p.readFile(headerFile);
    let header;try{header=checkHeader(JSON.parse(headerRaw.toString('utf8')));}
    catch(e){throw Error('Invalid encrypted backup header: '+e.message);}
    const mf=path.join(folder,'manifest.enc'),st=await safeStat(mf);
    if(!st.isFile()||st.size>MANIFEST_LIMIT)throw Error('Invalid encrypted manifest size');
    const sealed=await p.readFile(mf);
    const fingerprint=crypto.createHash('sha256').update(headerRaw).update(sealed).digest('hex');
    let key,plain,manifest;
    try{
      key=await derive(password,header.salt);
      plain=decryptBytes(sealed,key,header.manifest.iv,header.manifest.tag,'manifest');
      manifest=checkEncryptedManifest(JSON.parse(plain.toString('utf8')));
      if(requireIdentity&&(manifest.profileId!==layout.id||manifest.avdName!==layout.avdName))
        throw Error('Encrypted backup belongs to another Android profile');
      const tree=await walk(folder);
      const wanted=new Set(['header.json','manifest.enc',
        ...manifest.files.map(x=>'payload/'+x.blob+'.bin')]);
      if(tree.files.length!==wanted.size||tree.directories.length!==1||tree.directories[0]!=='payload')
        throw Error('Missing or unexpected encrypted backup entries');
      for(const f of tree.files)if(!wanted.has(f.path))throw Error('Unexpected encrypted file');
      let done=0;
      for(const f of manifest.files){
        const cipherFile=path.join(folder,'payload',f.blob+'.bin');
        const cipherStat=await safeStat(cipherFile);
        if(!cipherStat.isFile()||cipherStat.size!==f.size)throw Error('Encrypted file size mismatch');
        await decryptFile(cipherFile,null,key,f);
        done+=f.size;this.progress('encrypted-verify',done,manifest.totalBytes);
      }
      return {directory:folder,manifest,fingerprint};
    }finally {plain?.fill(0);key?.fill(0);}
  }
  async previewRestore(folder,password){
    validatePassword(password);
    return this.exclusive(async()=>{
      await this.idle();
      this.pending=null;
      const layout=this.layout(),report=await this._verify(folder,password,layout);
      const space=this.requirements(layout,report.manifest).map(v=>({
        location:v.path,requiredBytes:v.bytes,availableBytes:checkSpace(v.path,v.bytes)
      }));
      const token=id(24);
      this.pending={token,profileId:layout.id,directory:report.directory,
        fingerprint:report.fingerprint,at:Date.now()};
      return {token,encrypted:true,cipher:'AES-256-GCM',profileId:layout.id,
        createdAt:report.manifest.createdAt,files:report.manifest.files.length,
        bytes:report.manifest.totalBytes,components:report.manifest.components,
        space,warning:'Authenticity and SHA-256 checked. Restore requires password again and confirmation; originals stay in safety copies.'};
    });
  }
  async restore(token,password){
    validatePassword(password);
    return this.exclusive(async()=>{
      const pending=this.pending;this.pending=null;
      if(!pending||token!==pending.token||Date.now()-pending.at>600000)
        throw Error('Encrypted restore approval expired; inspect the backup again');
      await this.idle();
      const layout=this.layout();
      if(layout.id!==pending.profileId)throw Error('Profile changed since preview');
      const v=await this._verify(pending.directory,password,layout);
      if(v.fingerprint!==pending.fingerprint)throw Error('Encrypted backup changed after preview');
      for(const disk of this.requirements(layout,v.manifest))checkSpace(disk.path,disk.bytes);
      // Key exists only during this restore, never across the preview/consent window.
      const header=checkHeader(JSON.parse(await p.readFile(path.join(v.directory,'header.json'),'utf8')));
      const key=await derive(password,header.salt);
      const txn='asi-'+id(10),stages=[],moved=[],m=v.manifest;
      try{
        for(const c of PARTS){
          const target=layout.targets[c],present=m.components.includes(c);
          if(!present&&!fs.existsSync(target))continue;
          const stage=target+'.'+txn+'.stage',safety=target+'.'+txn+'.before-restore';
          if(fs.existsSync(stage)||fs.existsSync(safety))throw Error('Restore stage collision');
          if(present){
            await p.mkdir(path.dirname(stage),{recursive:true});
            if(DIRS.has(c)){
              await p.mkdir(stage);
              for(const dir of m.directories.filter(d=>d.startsWith(c+'/')))
                await p.mkdir(safe(stage,dir.slice(c.length+1)),{recursive:true});
            }
            for(const f of m.files.filter(f=>f.path.split('/')[0]===c)){
              await this.idle();
              const rel=c==='apps.json'?'':f.path.slice(c.length+1);
              const targetFile=rel?safe(stage,rel):stage;
              await p.mkdir(path.dirname(targetFile),{recursive:true});
              await decryptFile(path.join(v.directory,'payload',f.blob+'.bin'),targetFile,key,f);
              this.progress('decrypt-stage',f.size,m.totalBytes);
            }
          }
          stages.push({c,target,stage,safety,present});
        }
        await this.idle();
        for(const item of stages){
          const state={...item,oldMoved:false,newMoved:false};moved.push(state);
          if(fs.existsSync(item.target)){await p.rename(item.target,item.safety);state.oldMoved=true;}
          if(item.present){await p.rename(item.stage,item.target);state.newMoved=true;}
        }
        this.progress('restore-complete',m.totalBytes,m.totalBytes);
        return {ok:true,encrypted:true,profileId:layout.id,files:m.files.length,
          bytes:m.totalBytes,restartRequired:true,
          preserved:moved.filter(x=>x.oldMoved).map(x=>x.safety)};
      }catch(error){
        const errors=[];
        for(const item of moved.reverse())try{
          if(item.newMoved&&fs.existsSync(item.target))await p.rename(item.target,item.stage);
          if(item.oldMoved&&fs.existsSync(item.safety))await p.rename(item.safety,item.target);
        }catch(e){errors.push(e.message);}
        if(errors.length)throw Error('Restore rollback incomplete; safety copies preserved: '+errors.join('; '));
        throw error;
      }finally{
        key.fill(0);
        for(const stage of stages)try{
          if(fs.existsSync(stage.stage))await p.rm(stage.stage,{recursive:DIRS.has(stage.c),force:true});
        }catch(_){}
      }
    });
  }
}
module.exports={EncryptedBackupCenter,ENC_FORMAT,ENC_VERSION,validatePassword,checkHeader,checkEncryptedManifest};
