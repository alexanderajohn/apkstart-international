'use strict';
/**
 * Explicit retention inspection and authenticated plaintext cleanup.
 *
 * No automatic pruning. The only deletion path is a single-use approval token
 * bound to a fully authenticated encrypted safety archive AND a byte-for-byte
 * matching, locally discovered Recovery Vault safety point. Live profile data
 * and encrypted archives are never deletion targets.
 *
 * Filesystem deletion is not secure erasure or crash-atomic. Any interrupted
 * purge leaves the verified encrypted archive in place.
 */
const fs=require('node:fs'),p=fs.promises,path=require('node:path'),crypto=require('node:crypto');
const {PARTS,DIRS,MAX_FILES,MAX_BYTES,walk,safeStat}=require('./backup-center');
const {validatePassword}=require('./encrypted-backup');

const POINT_ID=/^(restore|recovery):[a-f0-9]{20}$/;
const SEALED_ID=/^sealed:ASI-Sealed-\d{4}-\d{2}-\d{2}-[a-f0-9]{12}$/;
const TTL=10*60*1000;
const toBytes=(entries)=>entries.reduce((n,entry)=>{
  const bytes=entry.size;
  if(!Number.isSafeInteger(bytes)||bytes<0||bytes>MAX_BYTES||n+bytes>MAX_BYTES)
    throw Error('Invalid retention size');
  return n+bytes;
},0);
async function measure(root){
  const stat=await safeStat(root);
  if(stat.isFile())return {files:1,bytes:stat.size};
  if(!stat.isDirectory())throw Error('Invalid safety component type');
  const inv=await walk(root);
  return {files:inv.files.length,bytes:toBytes(inv.files)};
}
function equalInventory(source,sealed,pointId){
  // Archives have a separately encrypted point ID and profile identity.
  if(sealed.safetyPointId!==pointId||sealed.profileId!==source.profileId
    ||sealed.avdName!==source.avdName
    ||JSON.stringify(sealed.components)!==JSON.stringify(source.components)
    ||JSON.stringify(sealed.directories)!==JSON.stringify(source.directories)
    ||sealed.totalBytes!==source.totalBytes||sealed.files.length!==source.files.length)
    throw Error('Encrypted archive does not match the complete plaintext recovery point');
  const files=new Map(source.files.map(f=>[f.path,f]));
  for(const f of sealed.files){
    const original=files.get(f.path);
    if(!original||original.size!==f.size||original.sha256!==f.sha256)
      throw Error('Encrypted archive and recovery point content mismatch');
    files.delete(f.path);
  }
  if(files.size)throw Error('Encrypted archive is missing safety-point files');
}
class SafetyRetention{
  constructor({vault,encryptedBackupCenter}){
    if(!vault||!encryptedBackupCenter)throw Error('Recovery Vault and authenticated backup engine are required');
    this.vault=vault;
    this.encrypted=encryptedBackupCenter;
    this.pending=null;
  }
  async report(retentionDays=30){
    if(!Number.isInteger(retentionDays)||retentionDays<1||retentionDays>3650)
      throw Error('Retention advisory days must be an integer between 1 and 3650');
    return this.vault.exclusive(async()=>{
      await this.vault.idle();
      const layout=this.vault.layout();
      const points=await this.vault.findPoints(layout);
      const archives=await this.vault.findSealed(layout);
      const now=Date.now();
      let plaintextBytes=0,encryptedBytes=0,oldPlaintextBytes=0;
      const plaintext=[];
      for(const pt of points){
        await this.vault.idle();
        let bytes=0,files=0;
        for(const c of PARTS){
          if(!pt.roots[c])continue;
          const m=await measure(pt.roots[c]);
          bytes+=m.bytes;files+=m.files;
          if(!Number.isSafeInteger(bytes)||bytes>MAX_BYTES||files>MAX_FILES)
            throw Error('Recovery point exceeds safety limits');
        }
        const ageDays=Math.max(0,Math.floor((now-Date.parse(pt.updatedAt))/86400000));
        const oldEnough=ageDays>=retentionDays;
        plaintext.push({id:pt.id,updatedAt:pt.updatedAt,ageDays,oldEnough,
          bytes,files,components:pt.components});
        plaintextBytes+=bytes;
        if(oldEnough)oldPlaintextBytes+=bytes;
      }
      const sealed=[];
      for(const archive of archives){
        await this.vault.idle();
        const m=await measure(archive.path);
        // Listing is untrusted metadata only. A sealed archive is NOT
        // authenticated until a passworded cleanup preview is performed.
        const stat=await safeStat(archive.path);
        sealed.push({id:archive.id,createdAt:archive.createdAt,
          updatedAt:new Date(stat.mtimeMs).toISOString(),files:m.files,
          bytes:m.bytes,authenticated:false});
        encryptedBytes+=m.bytes;
      }
      return {profileId:layout.id,retentionDays,
        plaintext,encrypted:sealed,
        totals:{plaintextPoints:plaintext.length,encryptedArchives:sealed.length,
          plaintextBytes,encryptedBytes,oldPlaintextBytes},
        automaticCleanup:false,
        advisory:'Age is informational only. There is no automatic delete. Only an authenticated sealed archive covering every file of a selected plaintext point can authorize manual cleanup.'};
    });
  }
  async _matched(layout,pointId,archiveId,password){
    if(typeof pointId!=='string'||!POINT_ID.test(pointId))
      throw Error('Invalid plaintext safety point ID');
    if(typeof archiveId!=='string'||!SEALED_ID.test(archiveId))
      throw Error('Invalid encrypted safety archive ID');
    const archive=(await this.vault.findSealed(layout)).find(a=>a.id===archiveId);
    if(!archive)throw Error('Encrypted safety archive was not found in the active profile');
    const secured=await this.encrypted._verify(archive.path,password,layout,true);
    const point=(await this.vault.findPoints(layout)).find(q=>q.id===pointId);
    if(!point)throw Error('Plaintext recovery point no longer exists');
    const scanned=await this.vault.inspectPoint(layout,point);
    equalInventory(scanned.manifest,secured.manifest,pointId);
    return {archive,secured,point,scanned};
  }
  async preview(pointId,archiveId,password){
    validatePassword(password);
    return this.vault.exclusive(async()=>{
      this.pending=null;
      await this.vault.idle();
      const layout=this.vault.layout();
      const verified=await this._matched(layout,pointId,archiveId,password);
      const token=crypto.randomBytes(24).toString('hex');
      const at=Date.now();
      this.pending={token,at,profileId:layout.id,pointId,archiveId,
        pointFingerprint:verified.scanned.fingerprint,
        sealedFingerprint:verified.secured.fingerprint};
      const point=verified.scanned.manifest;
      return {token,plaintextCleanup:true,profileId:layout.id,
        pointId,archiveId,expiresAt:new Date(at+TTL).toISOString(),
        files:point.files.length,bytes:point.totalBytes,
        components:point.components,authenticated:true,
        warning:'Deleting this plaintext point is irreversible and not secure erasure. The verified encrypted archive and current live profile data will remain untouched. Power loss may leave staged cleanup fragments.'};
    });
  }
  cancel(token){
    if(this.pending?.token===token){this.pending=null;return true;}
    return false;
  }
  async apply(token,password){
    return this.vault.exclusive(async()=>{
      const pending=this.pending;this.pending=null; // single-use even on failure
      validatePassword(password);
      if(typeof token!=='string'||!(/^[a-f0-9]{48}$/).test(token)
        ||!pending||token!==pending.token||Date.now()-pending.at>TTL)
        throw Error('Plaintext cleanup approval expired; verify again');
      await this.vault.idle();
      const layout=this.vault.layout();
      if(layout.id!==pending.profileId)throw Error('Active profile changed since cleanup preview');
      const matched=await this._matched(layout,pending.pointId,pending.archiveId,password);
      if(matched.scanned.fingerprint!==pending.pointFingerprint
        ||matched.secured.fingerprint!==pending.sealedFingerprint)
        throw Error('Encrypted archive or plaintext recovery point changed since preview');
      const tx=crypto.randomBytes(10).toString('hex');
      const moved=[],quarantineRoots={};
      let deleting=false;
      try{
        for(const c of PARTS){
          const original=matched.point.roots[c];
          if(!original)continue;
          await this.vault.idle();
          const expected=layout.targets[c]+'.asi-'+pending.pointId.slice(pending.pointId.indexOf(':')+1)
            +'.'+(pending.pointId.startsWith('restore:')?'before-restore':'before-recovery');
          if(path.relative(original,expected)!=='')
            throw Error('Recovery point component no longer has its expected fixed path');
          const st=await safeStat(original);
          if(st.isDirectory()!==DIRS.has(c))throw Error('Recovery point type changed');
          const pendingPath=original+'.asi-'+tx+'.cleanup-pending';
          if(fs.existsSync(pendingPath))throw Error('Cleanup collision; no data removed');
          await p.rename(original,pendingPath);
          moved.push({c,original,pendingPath});
          quarantineRoots[c]=pendingPath;
        }
        // Perform one more integrity pass on the isolated copies BEFORE the
        // first irreversible unlink. Archive verification ran before renames.
        const isolated=await this.vault.inspectPoint(layout,{
          id:matched.point.id,roots:quarantineRoots
        });
        if(isolated.fingerprint!==pending.pointFingerprint)
          throw Error('Safety point changed during cleanup quarantine');
        await this.vault.idle();
        deleting=true;
        for(const item of moved){
          await p.rm(item.pendingPath,{recursive:DIRS.has(item.c),force:false});
          this.vault.progress('cleanup-delete',moved.indexOf(item)+1,moved.length);
        }
        return {ok:true,plaintextCleanup:true,profileId:layout.id,
          pointId:pending.pointId,archiveId:pending.archiveId,
          files:isolated.manifest.files.length,estimatedReclaimedBytes:isolated.manifest.totalBytes,
          encryptedArchivePreserved:true,liveDataUnchanged:true,
          secureErase:false};
      }catch(error){
        if(deleting){
          const remaining=moved.filter(x=>fs.existsSync(x.pendingPath)).map(x=>x.pendingPath);
          throw Error('Plaintext cleanup incomplete after deletion began; sealed archive is preserved. Remaining quarantine paths: '+
            remaining.join(', ')+'; '+error.message);
        }
        const failures=[];
        for(const item of moved.reverse())try{
          if(fs.existsSync(item.pendingPath))await p.rename(item.pendingPath,item.original);
        }catch(e){failures.push(e.message);}
        if(failures.length)
          throw Error('Cleanup cancelled but quarantine rollback incomplete; sealed archive remains. '+failures.join('; '));
        throw error;
      }
    });
  }
}
module.exports={SafetyRetention,equalInventory};
