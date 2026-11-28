'use strict';
/**
 * Disaster Recovery Health Check: read-only discovery of interrupted offline
 * backups/restores/cleanup, authenticated encrypted-archive check on demand,
 * and deliberately approved, non-overwriting rescue of cleanup quarantine.
 *
 * Never removes files, overwrites live data, starts Android, or auto-repairs.
 * A rescue only renames existing .cleanup-pending components back to their
 * exact .before-restore / .before-recovery source paths, if those paths are
 * absent. Partially deleted points remain partial; only a complete verified
 * encrypted archive can serve as a full recovery guarantee.
 */
const fs=require('node:fs'),p=fs.promises,path=require('node:path'),crypto=require('node:crypto');
const {PARTS,DIRS,MAX_FILES,MAX_BYTES,safeStat}=require('./backup-center');
const {validatePassword}=require('./encrypted-backup');

const TX=/^[a-f0-9]{20}$/;
const PENDING=/^pending:(restore|recovery):([a-f0-9]{20}):([a-f0-9]{20})$/;
const SEALED=/^sealed:ASI-Sealed-\d{4}-\d{2}-\d{2}-[a-f0-9]{12}$/;
const PARTIAL=/^ASI-Sealed-\d{4}-\d{2}-\d{2}-[a-f0-9]{12}\.partial$/;
const TTL=10*60*1000;
const LIMIT=1000;
function quarantineName(base,name){
  if(!name.startsWith(base+'.asi-'))return null;
  const tail=name.slice(base.length);
  const m=/^\.asi-([a-f0-9]{20})\.before-(restore|recovery)\.asi-([a-f0-9]{20})\.cleanup-pending$/.exec(tail);
  if(!m)return null;
  return {pointId:m[2]+':'+m[1],groupId:'pending:'+m[2]+':'+m[1]+':'+m[3]};
}
function stageName(base,name){
  return name.startsWith(base+'.asi-')&&/^\.asi-[a-f0-9]{20}\.stage$/.test(name.slice(base.length));
}
function optionalStat(file){
  // lstat (not stat) prevents accidentally traversing a junction or symlink.
  return p.lstat(file).then(s=>{
    if(s.isSymbolicLink()||(!s.isDirectory()&&!s.isFile()))
      throw Error('Unsafe symbolic link, junction or special file');
    return s;
  });
}
class DisasterHealth{
  constructor({vault,encryptedBackupCenter}){
    if(!vault||!encryptedBackupCenter)throw Error('Recovery Vault and encrypted backup engine are required');
    this.vault=vault;this.encrypted=encryptedBackupCenter;this.pending=null;
  }
  async _artifacts(layout){
    const pending=new Map(),stages=[],issues=[];
    let seen=0;
    for(const component of PARTS){
      const live=layout.targets[component];
      const dir=path.dirname(live),base=path.basename(live);
      if(!fs.existsSync(dir))continue;
      await safeStat(dir);
      const names=(await p.readdir(dir)).sort();
      for(const name of names){
        const pendingName=quarantineName(base,name),staged=stageName(base,name);
        if(!pendingName&&!staged)continue;
        if(++seen>LIMIT)throw Error('Health check artifact limit exceeded');
        const candidate=path.join(dir,name);
        const kind=pendingName?'cleanup-pending':'restore-stage';
        try{
          const st=await optionalStat(candidate);
          if(st.isDirectory()!==DIRS.has(component))throw Error('Component type mismatch');
          if(staged){
            stages.push({component,type:'restore-stage',name,bytes:st.isFile()?st.size:null,
              warning:'Do not delete: may contain data from an interrupted restore'});
            continue;
          }
          let record=pending.get(pendingName.groupId);
          if(!record){record={id:pendingName.groupId,pointId:pendingName.pointId,
            roots:{},components:[],conflicts:[]};pending.set(pendingName.groupId,record);}
          if(record.roots[component])throw Error('Duplicate quarantine component');
          record.roots[component]=candidate;record.components.push(component);
          const original=candidate.replace(/\.asi-[a-f0-9]{20}\.cleanup-pending$/,'');
          const expected=live+'.asi-'+pendingName.pointId.split(':')[1]+'.before-'+
            pendingName.pointId.split(':')[0];
          if(path.relative(original,expected)!=='')throw Error('Quarantine root escaped fixed profile path');
          if(fs.existsSync(original))record.conflicts.push(component);
        }catch(e){
          issues.push({type:kind,component,name,reason:String(e.message||e)});
        }
      }
    }
    return {pending:[...pending.values()].sort((a,b)=>a.id.localeCompare(b.id)),stages,issues};
  }
  async _partials(layout){
    const root=await this.vault.sealedFolder(layout);
    if(!root)return {items:[],issues:[]};
    const items=[],issues=[];
    for(const name of (await p.readdir(root)).sort()){
      if(!PARTIAL.test(name))continue;
      if(items.length+issues.length>=LIMIT)throw Error('Health check partial archive limit exceeded');
      const full=path.join(root,name);
      try{
        const st=await optionalStat(full);
        if(!st.isDirectory())throw Error('Partial encrypted archive is not a directory');
        items.push({type:'unpublished-encrypted-backup',name,
          warning:'Incomplete archive: never use for restore; no automatic cleanup'});
      }catch(e){issues.push({type:'unpublished-encrypted-backup',name,reason:e.message});}
    }
    return {items,issues};
  }
  async report(){
    return this.vault.exclusive(async()=>{
      await this.vault.idle();
      const layout=this.vault.layout();
      const {pending,stages,issues}=await this._artifacts(layout);
      const {items:partials,issues:partialIssues}=await this._partials(layout);
      const allIssues=[...issues,...partialIssues],quarantines=[];
      let plain=[],sealed=[];
      try{plain=await this.vault.findPoints(layout);}
      catch(e){allIssues.push({type:'recovery-points',reason:String(e.message||e)});}
      try{sealed=await this.vault.findSealed(layout);}
      catch(e){allIssues.push({type:'encrypted-archives',reason:String(e.message||e)});}
      for(const q of pending){
        let valid=true,files=0,bytes=0;
        try{
          const inv=await this.vault.inspectPoint(layout,{id:q.pointId,roots:q.roots});
          files=inv.manifest.files.length;bytes=inv.manifest.totalBytes;
        }catch(e){valid=false;allIssues.push({type:'cleanup-pending',id:q.id,reason:String(e.message||e)});}
        quarantines.push({id:q.id,pointId:q.pointId,components:q.components,files,bytes,
          conflict:q.conflicts.length>0,valid,
          rescuable:valid&&q.conflicts.length===0,
          warning:'This may be only the surviving portion of a deleted plaintext point. Rescue never restores active Android data and cannot recreate already deleted files.'});
      }
      return {profileId:layout.id,checkedAt:new Date().toISOString(),
        localRecoveryPoints:plain.length,encryptedArchives:sealed.length,
        archives:sealed.map(x=>({id:x.id,createdAt:x.createdAt,authenticated:false})),
        archivesAuthenticated:false, // listing does not know encryption passwords
        quarantine:quarantines,stages,partialArchives:partials,issues:allIssues,
        recommendations:[
          'Do not delete .stage or .partial artifacts without manual analysis; they may be the only surviving fragments.',
          'For sealed archives use Verify encryption with the password to authenticate every ciphertext.',
          'Rescue returns only surviving cleanup-pending files to the original safety-copy names. It cannot repair missing components.',
          'No automatic repair, move, deletion or reset is performed by Health Check.'
        ],automaticRepair:false,automaticCleanup:false};
    });
  }
  async verifyArchive(archiveId,password){
    validatePassword(password);
    return this.vault.exclusive(async()=>{
      await this.vault.idle();
      if(typeof archiveId!=='string'||!SEALED.test(archiveId))
        throw Error('Invalid encrypted Safety Vault archive ID');
      const layout=this.vault.layout();
      const archive=(await this.vault.findSealed(layout)).find(a=>a.id===archiveId);
      if(!archive)throw Error('Encrypted archive not found for active profile');
      const verified=await this.encrypted._verify(archive.path,password,layout,true);
      return {ok:true,authenticated:true,profileId:layout.id,archiveId,
        sourcePointId:verified.manifest.safetyPointId||null,
        files:verified.manifest.files.length,bytes:verified.manifest.totalBytes,
        components:verified.manifest.components,
        caveat:'Authentication verifies archive integrity, not physical Android AVD boot compatibility.'};
    });
  }
  async _validate(layout,quarantineId){
    if(typeof quarantineId!=='string'||!PENDING.test(quarantineId))
      throw Error('Invalid interrupted-cleanup identifier');
    const q=(await this._artifacts(layout)).pending.find(x=>x.id===quarantineId);
    if(!q)throw Error('Interrupted cleanup no longer exists');
    if(q.conflicts.length)throw Error('Original safety path exists; will not overwrite it');
    const scanned=await this.vault.inspectPoint(layout,{id:q.pointId,roots:q.roots});
    for(const c of q.components){
      const source=q.roots[c],stat=await safeStat(source);
      if(stat.isDirectory()!==DIRS.has(c))throw Error('Quarantine component has unexpected type');
      const pointType=q.pointId.split(':')[0],pointHex=q.pointId.split(':')[1];
      const expected=layout.targets[c]+'.asi-'+pointHex+'.before-'+pointType;
      const pending=expected+'.asi-'+PENDING.exec(quarantineId)[3]+'.cleanup-pending';
      if(path.relative(source,pending)!=='')throw Error('Interrupted-cleanup path mismatch');
      if(fs.existsSync(expected))throw Error('Safety destination already exists');
    }
    return {quarantine:q,scanned};
  }
  async previewRescue(quarantineId){
    return this.vault.exclusive(async()=>{
      await this.vault.idle();
      this.pending=null;
      const layout=this.vault.layout();
      const {quarantine,scanned}=await this._validate(layout,quarantineId);
      const token=crypto.randomBytes(24).toString('hex'),at=Date.now();
      this.pending={token,at,profileId:layout.id,id:quarantineId,
        fingerprint:scanned.fingerprint};
      return {token,healthRescue:true,profileId:layout.id,id:quarantineId,
        pointId:quarantine.pointId,files:scanned.manifest.files.length,
        bytes:scanned.manifest.totalBytes,components:scanned.manifest.components,
        expiresAt:new Date(at+TTL).toISOString(),
        warning:'Only surviving cleanup fragments will be renamed back into original plaintext safety-copy locations. It does NOT rebuild missing files and does NOT touch active profile data or encrypted archives. Requires typed RESCUE and native confirmation.'};
    });
  }
  cancelRescue(token){
    if(this.pending?.token===token){this.pending=null;return true;}
    return false;
  }
  async applyRescue(token){
    return this.vault.exclusive(async()=>{
      const approval=this.pending;this.pending=null;
      if(!approval||typeof token!=='string'||!/^[a-f0-9]{48}$/.test(token)
        ||approval.token!==token||Date.now()-approval.at>TTL)
        throw Error('Rescue approval expired; inspect the interruption again');
      await this.vault.idle();
      const layout=this.vault.layout();
      if(layout.id!==approval.profileId)throw Error('Active profile changed since rescue preview');
      const {quarantine,scanned}=await this._validate(layout,approval.id);
      if(scanned.fingerprint!==approval.fingerprint)
        throw Error('Quarantine files changed since rescue preview');
      const tx=PENDING.exec(approval.id)[3],moved=[];
      try{
        for(const component of PARTS){
          if(!quarantine.roots[component])continue;
          await this.vault.idle();
          const from=quarantine.roots[component],to=from.slice(0,-('.asi-'+tx+'.cleanup-pending').length);
          await safeStat(from);
          if(fs.existsSync(to))throw Error('Safety copy destination now exists');
          // Rename is same-volume and does not unlink either source or target.
          await p.rename(from,to);
          moved.push({from,to});
        }
        return {ok:true,healthRescue:true,profileId:layout.id,
          pointId:quarantine.pointId,components:moved.map(x=>PARTS.find(c=>
            x.to.startsWith(layout.targets[c]+'.asi-'))),
          restoredFragments:moved.length,sourceWasPartial:true,
          liveDataUnchanged:true,encryptedArchivesUntouched:true};
      }catch(err){
        const failures=[];
        for(const item of moved.reverse())try{
          if(fs.existsSync(item.to)&&!fs.existsSync(item.from))
            await p.rename(item.to,item.from);
        }catch(e){failures.push(String(e.message||e));}
        if(failures.length)
          throw Error('Rescue rollback incomplete; manual intervention required. '+failures.join('; '));
        throw err;
      }
    });
  }
}
module.exports={DisasterHealth,quarantineName,stageName};
