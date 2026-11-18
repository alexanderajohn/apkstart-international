'use strict';
/**
 * Recovery Readiness & Restore Drill — read-only authenticated payload audit
 * plus an isolated synthetic transaction rehearsal.
 *
 * No backup plaintext, private file names, app tokens or AVD userdata are
 * written into the sandbox. The drill does NOT boot Android or restore a
 * live profile; the real backup blobs are authenticated while streamed to a
 * discard sink by EncryptedBackupCenter._verify.
 */
const fs=require('node:fs'),p=fs.promises,path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {PARTS,DIRS,checkSpace,within,safeStat}=require('./backup-center');
const {validatePassword}=require('./encrypted-backup');
const ARCHIVE_ID=/^sealed:ASI-Sealed-\d{4}-\d{2}-\d{2}-[a-f0-9]{12}$/;
const TOKEN=/^[a-f0-9]{48}$/;
const TTL_MS=10*60*1000;
const uid=()=>crypto.randomBytes(24).toString('hex');

async function sandboxRehearsal(manifest){
  // The sandbox contains only fixed synthetic names/content, never backup data.
  // Temp volume tests generic OS rename semantics, not live target ACLs.
  const root=await p.mkdtemp(path.join(os.tmpdir(),'asi-restore-drill-'));
  let error;
  const tested=[];
  try{
    for(const component of manifest.components){
      if(!PARTS.includes(component))throw Error('Invalid drill component');
      const prefix=component==='apps.json'?'catalog':component;
      const live=path.join(root,prefix+'.live');
      const stage=path.join(root,prefix+'.stage');
      const before=path.join(root,prefix+'.before');
      if(await p.readdir(root).then(a=>a.includes(prefix+'.live')||a.includes(prefix+'.stage')||a.includes(prefix+'.before')))
        throw Error('Synthetic drill collision');
      if(DIRS.has(component)){
        await p.mkdir(live);await p.mkdir(stage);
        await p.writeFile(path.join(live,'synthetic.txt'),'DRILL_OLD',{flag:'wx'});
        await p.writeFile(path.join(stage,'synthetic.txt'),'DRILL_NEW',{flag:'wx'});
      }else{
        await p.writeFile(live,'DRILL_OLD',{flag:'wx'});
        await p.writeFile(stage,'DRILL_NEW',{flag:'wx'});
      }
      // Exercise same-volume rename / safety-copy scheme with synthetic data.
      await p.rename(live,before);
      await p.rename(stage,live);
      const old=await p.readFile(DIRS.has(component)?path.join(before,'synthetic.txt'):before,'utf8');
      const now=await p.readFile(DIRS.has(component)?path.join(live,'synthetic.txt'):live,'utf8');
      if(old!=='DRILL_OLD'||now!=='DRILL_NEW')
        throw Error('Synthetic transaction failed its content check');
      // Exercise rollback to original state. Never touch actual user paths.
      await p.rename(live,stage);await p.rename(before,live);
      const recovered=await p.readFile(DIRS.has(component)?path.join(live,'synthetic.txt'):live,'utf8');
      if(recovered!=='DRILL_OLD')throw Error('Synthetic rollback integrity mismatch');
      tested.push(component);
    }
    return {ok:true,componentsTested:tested,
      syntheticOnly:true,privatePlaintextWritten:false,
      liveProfileModified:false,volume:'OS temporary volume'};
  }catch(e){error=e;throw e;}
  finally{
    try{await p.rm(root,{recursive:true,force:true});}
    catch(e){
      // No user content is ever written to the sandbox; nevertheless do not
      // silently claim success when cleanup did not finish.
      if(!error)throw Error('Synthetic drill cleanup incomplete: '+e.message);
    }
  }
}
class RestoreDrill{
  constructor({encryptedBackupCenter,vault}){
    if(!encryptedBackupCenter||!vault)throw Error('Restore Drill requires the encrypted engine and Recovery Vault');
    this.encrypted=encryptedBackupCenter;this.vault=vault;
    this.pending=null;
  }
  async _source(kind,idOrPath,layout){
    if(kind==='sealed'){
      if(typeof idOrPath!=='string'||!ARCHIVE_ID.test(idOrPath))
        throw Error('Invalid sealed drill archive identifier');
      const archive=(await this.vault.findSealed(layout)).find(x=>x.id===idOrPath);
      if(!archive)throw Error('Sealed archive not found for active Android profile');
      return archive.path;
    }
    if(kind==='external'){
      if(typeof idOrPath!=='string'||!idOrPath.trim())
        throw Error('An external encrypted archive directory must be selected');
      const folder=await p.realpath(idOrPath);
      const data=await p.realpath(this.encrypted.dataDir);
      if(within(folder,data)||within(data,folder))
        throw Error('External drill source must be outside ApkStart data');
      if(!(await safeStat(folder)).isDirectory())throw Error('External drill source is not a folder');
      for(const target of Object.values(layout.targets)){
        if(within(folder,target)||within(target,folder))
          throw Error('External drill source overlaps active Android profile data');
      }
      return folder;
    }
    throw Error('Unsupported encrypted drill source');
  }
  _space(layout,manifest){
    return this.encrypted.requirements(layout,manifest).map(d=>({
      location:d.path,requiredBytes:d.bytes,
      availableBytes:checkSpace(d.path,d.bytes)
    }));
  }
  async preview(kind,idOrPath,password){
    validatePassword(password);
    return this.encrypted.exclusive(async()=>{
      this.pending=null;
      await this.encrypted.idle();
      const layout=this.encrypted.layout();
      const source=await this._source(kind,idOrPath,layout);
      const verified=await this.encrypted._verify(source,password,layout,true);
      const disks=this._space(layout,verified.manifest);
      const m=verified.manifest;
      const ageMs=Date.now()-Date.parse(m.createdAt);
      const warnings=[
        'This is a safe synthetic restore rehearsal, NOT a real Android emulator boot or complete userdata restore.',
        'Real Android user files will be authenticated in memory but NEVER written to the sandbox.',
        'The isolated transaction tests the OS temporary volume, NOT target-drive ACLs, antivirus locks or crash-atomicity.'
      ];
      if(m.components.includes('avd')&&!m.avdCompatibility)
        warnings.push('Source Android AVD compatibility metadata is missing. Guest boot compatibility is unknown.');
      if(!m.components.includes('avd'))
        warnings.push('Backup does not contain AVD userdata; this cannot establish full Android recovery readiness.');
      const token=uid();
      this.pending={token,at:Date.now(),kind,id:kind==='sealed'?idOrPath:null,
        directory:source,profileId:layout.id,fingerprint:verified.fingerprint};
      return {token,readiness:true,profileId:layout.id,sourceType:kind,
        encrypted:true,authenticated:true,createdAt:m.createdAt,
        ageDays:Number.isFinite(ageMs)?Math.max(0,Math.floor(ageMs/86400000)):null,
        components:m.components,files:m.files.length,bytes:m.totalBytes,
        diskSpace:disks,warnings,expiresAt:new Date(this.pending.at+TTL_MS).toISOString(),
        liveDataUntouched:true,guestBootTested:false,privatePlaintextWritten:false,
        nextStep:'Type DRILL to simulate a staged restore and rollback using synthetic temporary files only.'};
    });
  }
  cancel(token){
    if(this.pending?.token===token){this.pending=null;return true;}
    return false;
  }
  async run(token,password){
    return this.encrypted.exclusive(async()=>{
      const approval=this.pending;this.pending=null;
      if(!approval||typeof token!=='string'||!TOKEN.test(token)
        ||token!==approval.token||Date.now()-approval.at>TTL_MS)
        throw Error('Restore drill approval expired; inspect the encrypted archive again');
      validatePassword(password);
      await this.encrypted.idle();
      const layout=this.encrypted.layout();
      if(layout.id!==approval.profileId)throw Error('Active Android profile changed since drill preview');
      const resolved=await this._source(approval.kind,
        approval.kind==='sealed'?approval.id:approval.directory,layout);
      if(path.relative(resolved,approval.directory)!=='')
        throw Error('Encrypted drill source changed since preview');
      // Decrypt, authenticate and SHA-256 each file to a discard stream; no
      // decrypted user data is ever staged on disk.
      const verified=await this.encrypted._verify(resolved,password,layout,true);
      if(verified.fingerprint!==approval.fingerprint)
        throw Error('Encrypted archive manifest changed since drill preview');
      const diskSpace=this._space(layout,verified.manifest);
      const staged=await sandboxRehearsal(verified.manifest);
      return {ok:true,readiness:true,drill:true,authenticated:true,
        sourceType:approval.kind,profileId:layout.id,
        filesVerified:verified.manifest.files.length,
        bytesVerified:verified.manifest.totalBytes,components:verified.manifest.components,
        diskSpace,syntheticStages:staged.componentsTested,
        syntheticSandboxCleaned:true,privatePlaintextWritten:false,
        liveProfileModified:false,guestBootTested:false,
        warning:'Synthetic staging and rollback passed on OS temp volume. Real Android AVD boot and physical target-drive restoration still require manual testing.'};
    });
  }
}
module.exports={RestoreDrill,sandboxRehearsal};
