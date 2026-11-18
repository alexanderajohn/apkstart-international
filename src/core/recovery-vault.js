'use strict';
/**
 * Recovery Vault: local, read-only discovery of existing .before-restore and
 * .before-recovery safety copies. Recovery is copy-to-stage then protected swap:
 * source recovery points are not moved, modified or automatically deleted.
 *
 * These points are NOT encrypted/authenticated archives. SHA-256 guards against
 * changes between preview and apply, not against a malicious local file owner.
 */
const fs=require('node:fs'),p=fs.promises,path=require('node:path'),crypto=require('node:crypto');
const {BackupCenter,FORMAT,VERSION,PARTS,DIRS,MAX_FILES,MAX_BYTES,
  checkManifest,checkSpace,walk,safe,safeStat,shaFile}=require('./backup-center');

const pointId=/^(restore|recovery):([a-f0-9]{20})$/;
const suffix=/^\.asi-([a-f0-9]{20})\.(before-restore|before-recovery)$/;
const uid=()=>crypto.randomBytes(10).toString('hex');
function srcFor(root,c,rel){
  if(c==='apps.json')return root;
  const sub=rel.slice(c.length+1);
  return safe(root,sub);
}
async function inspectSource(source,c){
  const stat=await safeStat(source);
  if(stat.isDirectory()!==DIRS.has(c))throw Error('Safety copy component has the wrong type');
  if(c==='apps.json'){
    const hash=await shaFile(source);
    return {files:[{path:c,...hash}],directories:[],bytes:hash.size};
  }
  const tree=await walk(source);
  if(tree.files.length>MAX_FILES)throw Error('Too many recovery files');
  const files=[],directories=[c,...tree.directories.map(d=>c+'/'+d)];
  let bytes=0;
  for(const entry of tree.files){
    const digest=await shaFile(safe(source,entry.path));
    if(entry.size!==digest.size)throw Error('Safety copy changed during inspection');
    files.push({path:c+'/'+entry.path,...digest});
    bytes+=digest.size;
    if(!Number.isSafeInteger(bytes)||bytes>MAX_BYTES)throw Error('Recovery point is too large');
  }
  return {files,directories,bytes};
}
class RecoveryVault extends BackupCenter{
  async findPoints(layout=this.layout()){
    const groups=new Map();
    for(const c of PARTS){
      const target=layout.targets[c],parent=path.dirname(target),base=path.basename(target);
      if(!fs.existsSync(parent))continue;
      if(!(await safeStat(parent)).isDirectory())throw Error('Unexpected recovery parent path');
      for(const name of await p.readdir(parent)){
        if(!name.startsWith(base+'.asi-'))continue;
        const match=suffix.exec(name.slice(base.length));
        if(!match)continue;
        const key=(match[2]==='before-restore'?'restore':'recovery')+':'+match[1];
        const absolute=path.join(parent,name),stat=await safeStat(absolute);
        if(stat.isDirectory()!==DIRS.has(c))throw Error('Invalid recovery component type');
        if(!groups.has(key))groups.set(key,{id:key,components:[],roots:{},
          updatedAt:new Date(stat.mtimeMs).toISOString()});
        const item=groups.get(key);
        item.components.push(c);item.roots[c]=absolute;
        if(new Date(stat.mtimeMs).toISOString()>item.updatedAt)
          item.updatedAt=new Date(stat.mtimeMs).toISOString();
      }
    }
    return [...groups.values()].sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));
  }
  async inspectPoint(layout,point){
    const files=[],directories=[],components=[];
    let totalBytes=0;
    for(const c of PARTS){
      if(!point.roots[c])continue;
      const info=await inspectSource(point.roots[c],c);
      components.push(c);
      files.push(...info.files);directories.push(...info.directories);
      totalBytes+=info.bytes;
      if(files.length>MAX_FILES||!Number.isSafeInteger(totalBytes)||totalBytes>MAX_BYTES)
        throw Error('Recovery point exceeds safety limits');
    }
    const manifest={format:FORMAT,version:VERSION,profileId:layout.id,avdName:layout.avdName,
      components,files,directories,totalBytes};
    checkManifest(manifest);
    const fingerprint=crypto.createHash('sha256').update(JSON.stringify({
      pointId:point.id,manifest
    })).digest('hex');
    return {manifest,fingerprint};
  }
  async list(){
    return this.exclusive(async()=>{
      await this.idle();
      const layout=this.layout(),points=await this.findPoints(layout);
      return {profileId:layout.id,points:points.map(x=>({
        id:x.id,components:x.components,updatedAt:x.updatedAt
      }))};
    });
  }
  async preview(pointIdValue){
    return this.exclusive(async()=>{
      this.pending=null;await this.idle();
      if(typeof pointIdValue!=='string'||!pointId.test(pointIdValue))
        throw Error('Invalid Recovery Vault point ID');
      const layout=this.layout(),point=(await this.findPoints(layout)).find(x=>x.id===pointIdValue);
      if(!point)throw Error('Recovery point no longer exists');
      const scan=await this.inspectPoint(layout,point);
      const space=this.requirements(layout,scan.manifest).map(d=>({
        location:d.path,requiredBytes:d.bytes,availableBytes:checkSpace(d.path,d.bytes)
      }));
      const token=crypto.randomBytes(24).toString('hex');
      this.pending={token,id:layout.id,pointId:point.id,fingerprint:scan.fingerprint,at:Date.now()};
      return {token,recovery:true,profileId:layout.id,pointId:point.id,
        createdAt:point.updatedAt,components:scan.manifest.components,
        files:scan.manifest.files.length,bytes:scan.manifest.totalBytes,space,
        warning:'Unencrypted local safety copy, not a trusted signed backup. RECOVER and native confirmation required. Original point and current data will both be preserved.'};
    });
  }
  async apply(token){
    return this.exclusive(async()=>{
      const pending=this.pending;this.pending=null;
      if(!pending||typeof token!=='string'||token!==pending.token||Date.now()-pending.at>600000)
        throw Error('Recovery approval expired; inspect the safety copy again');
      await this.idle();
      const layout=this.layout();
      if(layout.id!==pending.id)throw Error('Active Android profile changed since preview');
      const point=(await this.findPoints(layout)).find(x=>x.id===pending.pointId);
      if(!point)throw Error('Recovery point missing');
      const scan=await this.inspectPoint(layout,point);
      if(scan.fingerprint!==pending.fingerprint)throw Error('Recovery point changed since preview');
      for(const d of this.requirements(layout,scan.manifest))checkSpace(d.path,d.bytes);
      const m=scan.manifest,transaction='asi-'+uid(),stages=[],moved=[];
      let rollbackIncomplete=false;
      try{
        for(const c of m.components){
          await this.idle();
          const target=layout.targets[c],root=point.roots[c];
          const stage=target+'.'+transaction+'.stage';
          const safety=target+'.'+transaction+'.before-recovery';
          if(fs.existsSync(stage)||fs.existsSync(safety))throw Error('Recovery stage collision');
          if(fs.existsSync(target)){
            const st=await safeStat(target);
            if(st.isDirectory()!==DIRS.has(c))throw Error('Live target component type changed');
          }
          const item={c,target,root,stage,safety,oldMoved:false,newMoved:false};
          stages.push(item); // register before any writes for partial-file cleanup
          await p.mkdir(path.dirname(stage),{recursive:true});
          if(DIRS.has(c)){
            await p.mkdir(stage);
            for(const dir of m.directories.filter(d=>d.startsWith(c+'/')))
              await p.mkdir(safe(stage,dir.slice(c.length+1)),{recursive:true});
          }
          for(const f of m.files.filter(f=>f.path===c||f.path.startsWith(c+'/'))){
            await this.idle();
            const dst=c==='apps.json'?stage:safe(stage,f.path.slice(c.length+1));
            const src=srcFor(root,c,f.path);
            await p.mkdir(path.dirname(dst),{recursive:true});
            await safeStat(src);
            await p.copyFile(src,dst,fs.constants.COPYFILE_EXCL);
            const hash=await shaFile(dst);
            if(hash.size!==f.size||hash.sha256!==f.sha256)
              throw Error('Recovery file changed while staging: '+f.path);
          }
          this.progress('recovery-stage',stages.length,m.components.length);
        }
        await this.idle();
        const latest=await this.inspectPoint(layout,point);
        if(latest.fingerprint!==pending.fingerprint)
          throw Error('Recovery point changed before swap');
        for(const item of stages){
          await this.idle();
          moved.push(item);
          if(fs.existsSync(item.target)){
            await safeStat(item.target);
            await p.rename(item.target,item.safety);item.oldMoved=true;
          }
          await p.rename(item.stage,item.target);item.newMoved=true;
        }
        this.progress('recovery-complete',m.totalBytes,m.totalBytes);
        return {ok:true,recovery:true,profileId:layout.id,
          pointId:point.id,bytes:m.totalBytes,files:m.files.length,
          preserved:moved.filter(x=>x.oldMoved).map(x=>x.safety),
          sourcePreserved:true,restartRequired:true};
      }catch(error){
        const failures=[];
        for(const item of moved.reverse())try{
          if(item.newMoved&&fs.existsSync(item.target))
            await p.rename(item.target,item.stage);
          if(item.oldMoved&&fs.existsSync(item.safety))
            await p.rename(item.safety,item.target);
        }catch(e){failures.push(e.message);}
        rollbackIncomplete=failures.length>0;
        if(rollbackIncomplete)
          throw Error('Recovery rollback incomplete; all safety/stage files retained for manual inspection: '+failures.join('; '));
        throw error;
      }finally{
        // Remove only temporary stage files owned by this invocation, never
        // source points or before-recovery safety copies.
        if(!rollbackIncomplete)for(const item of stages)try{
          if(fs.existsSync(item.stage))
            await p.rm(item.stage,{recursive:DIRS.has(item.c),force:true});
        }catch(_){}
      }
    });
  }
}
module.exports={RecoveryVault,pointId};
