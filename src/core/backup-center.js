'use strict';
// Offline, manifest-verified per-profile directory snapshots. Never touch
// Android runtime binaries, shared settings or another profile's data.
const fs=require('node:fs'),p=fs.promises,path=require('node:path'),crypto=require('node:crypto');
const FORMAT='apkstart-international-profile-backup',VERSION=1;
const PARTS=['apps.json','apks','icons','avd'],DIRS=new Set(PARTS.slice(1));
const MAX_FILES=200000,MAX_BYTES=1024*1024*1024*1024,MARGIN=64*1048576;
const uid=(n=8)=>crypto.randomBytes(n).toString('hex');
function within(child,parent){
  const r=path.relative(path.resolve(parent),path.resolve(child));
  return !r||r!=='..'&&!r.startsWith('..'+path.sep)&&!path.isAbsolute(r);
}
function validRelative(s){
  return typeof s==='string'&&s.length>0&&s.length<=1024
    &&!s.startsWith('/')&&!s.includes('\\')&&!s.includes('//')
    &&s.split('/').every(x=>x&&x!=='.'&&x!=='..'&&!x.endsWith(' ')&&!x.endsWith('.')
      &&!/[<>:"|?*\x00-\x1f\x7f]/.test(x)
      &&!/^(con|aux|prn|nul|com[1-9]|lpt[1-9])(\..*)?$/i.test(x));
}
function safe(root,rel){
  if(!validRelative(rel))throw Error('Unsafe backup path');
  const v=path.resolve(root,...rel.split('/'));
  if(!within(v,root)||v===path.resolve(root))throw Error('Backup path escaped root');
  return v;
}
function component(rel){return rel.split('/')[0];}
async function safeStat(f){
  const s=await p.lstat(f);
  if(s.isSymbolicLink()||(!s.isFile()&&!s.isDirectory()))throw Error('Symlinks, junctions and special files cannot be backed up');
  return s;
}
async function walk(root){
  const files=[],directories=[];
  async function go(abs,rel){
    const st=await safeStat(abs);
    if(st.isDirectory()){
      if(rel)directories.push(rel);
      for(const name of (await p.readdir(abs)).sort()){
        const next=rel?rel+'/'+name:name;
        if(!validRelative(next))throw Error('Unsupported filename in backup');
        await go(path.join(abs,name),next);
      }
    } else {
      if(!rel||!Number.isSafeInteger(st.size)||st.size>MAX_BYTES)throw Error('Unsupported file size');
      files.push({path:rel,size:st.size});
      if(files.length>MAX_FILES)throw Error('Backup has too many files');
    }
  }
  await go(root,'');
  return {files,directories};
}
async function shaFile(file){
  const hash=crypto.createHash('sha256');let size=0;
  for await(const chunk of fs.createReadStream(file)){
    size+=chunk.length;
    if(!Number.isSafeInteger(size)||size>MAX_BYTES)throw Error('File too large');
    hash.update(chunk);
  }
  return {sha256:hash.digest('hex'),size};
}
function freeBytes(loc){
  let v=path.resolve(loc);
  while(!fs.existsSync(v)){
    const up=path.dirname(v);
    if(up===v)throw Error('Cannot check disk space');
    v=up;
  }
  const s=fs.statfsSync(v),n=Number(s.bavail)*Number(s.bsize);
  if(!Number.isFinite(n)||n<0)throw Error('Cannot check disk space');
  return n;
}
function checkSpace(loc,bytes){
  const free=freeBytes(loc);
  if(free<bytes+MARGIN)throw Error('Insufficient disk space: need '+Math.ceil((bytes+MARGIN)/1048576)+' MB, free '+Math.floor(free/1048576)+' MB');
  return free;
}
function checkManifest(m){
  if(!m||m.format!==FORMAT||m.version!==VERSION
    ||typeof m.profileId!=='string'||typeof m.avdName!=='string'
    ||!Array.isArray(m.components)||!Array.isArray(m.files)||!Array.isArray(m.directories)
    ||m.files.length>MAX_FILES||m.directories.length>MAX_FILES*3
    ||!Number.isSafeInteger(m.totalBytes)||m.totalBytes<0||m.totalBytes>MAX_BYTES)
    throw Error('Unsupported or invalid backup manifest');
  const components=new Set(),names=new Set(),dirs=new Set(),required=new Set();
  let bytes=0;
  for(const c of m.components){
    if(!PARTS.includes(c)||components.has(c))throw Error('Unexpected backup component');
    components.add(c);
  }
  for(const f of m.files){
    if(!f||!validRelative(f.path)||!components.has(component(f.path))
      ||!Number.isSafeInteger(f.size)||f.size<0||f.size>MAX_BYTES
      ||typeof f.sha256!=='string'||!/^[0-9a-f]{64}$/i.test(f.sha256)
      ||(component(f.path)==='apps.json'&&f.path!=='apps.json')||DIRS.has(f.path))
      throw Error('Invalid backup file entry');
    const k=f.path.toLowerCase();if(names.has(k))throw Error('Duplicate backup path');
    names.add(k);bytes+=f.size;
    if(!Number.isSafeInteger(bytes)||bytes>MAX_BYTES)throw Error('Backup exceeds size limit');
    const chunks=f.path.split('/');
    for(let i=1;i<chunks.length;i++)required.add(chunks.slice(0,i).join('/').toLowerCase());
  }
  for(const d of m.directories){
    if(!validRelative(d)||!DIRS.has(component(d))||!components.has(component(d)))throw Error('Invalid backup directory');
    const k=d.toLowerCase();if(dirs.has(k)||names.has(k))throw Error('Duplicate directory');
    dirs.add(k);
  }
  for(const d of required)if(!dirs.has(d))throw Error('Missing parent directory: '+d);
  for(const c of DIRS)if(components.has(c)&&!dirs.has(c))throw Error('Missing component directory');
  if(bytes!==m.totalBytes)throw Error('Backup byte count mismatch');
  return m;
}
class BackupCenter{
  constructor({registry,dataDir,getAvdHome,assertIdle,onBusy=()=>{},onProgress=()=>{}}){
    this.registry=registry;this.dataDir=dataDir;this.getAvdHome=getAvdHome;
    this.assertIdle=assertIdle;this.onBusy=onBusy;this.onProgress=onProgress;
    this.busy=false;this.pending=null;
  }
  layout(){
    const id=this.registry.currentId(),p=this.registry.paths(id);
    const avdName=this.registry.avdName(id);
    return {id,avdName,targets:{
      'apps.json':p.appsFile,apks:p.apkDir,icons:p.iconsDir,
      avd:path.join(this.getAvdHome(),avdName+'.avd'),
    }};
  }
  async idle(){if(this.assertIdle)await this.assertIdle();}
  progress(phase,done=0,total=0){try{this.onProgress({phase,done,total});}catch(_){}}
  async exclusive(fn){
    if(this.busy)throw Error('Backup Center is busy');
    this.busy=true;this.onBusy(true);
    try{return await fn();}finally{this.busy=false;this.onBusy(false);}
  }
  async inventory(layout){
    const components=[],directories=[],files=[];
    for(const c of PARTS){
      const src=layout.targets[c];
      if(!fs.existsSync(src))continue;
      const st=await safeStat(src);
      if(st.isDirectory()!==DIRS.has(c))throw Error('Unexpected component type: '+c);
      components.push(c);
      if(st.isDirectory()){
        const list=await walk(src);
        directories.push(c,...list.directories.map(x=>c+'/'+x));
        files.push(...list.files.map(x=>({path:c+'/'+x.path,size:x.size})));
      }else files.push({path:c,size:st.size});
      if(files.length>MAX_FILES)throw Error('Too many files');
    }
    const totalBytes=files.reduce((a,b)=>a+b.size,0);
    if(!Number.isSafeInteger(totalBytes)||totalBytes>MAX_BYTES)throw Error('Profile too large');
    return {components,files,directories,totalBytes};
  }
  async create(folder){
    return this.exclusive(async()=>{
      await this.idle();
      const l=this.layout(),parent=await p.realpath(folder);
      if(!(await safeStat(parent)).isDirectory())throw Error('Choose a backup destination directory');
      if(within(parent,this.dataDir)||within(this.dataDir,parent))
        throw Error('Choose an external folder outside the ApkStart data directory');
      for(const target of Object.values(l.targets)){
        if(within(parent,target)||within(target,parent))
          throw Error('Backup directory overlaps profile source data');
      }
      const inv=await this.inventory(l);
      if(!inv.components.length)throw Error('Nothing to back up');
      checkSpace(parent,inv.totalBytes);
      const tag=new Date().toISOString().replace(/[-:]/g,'').replace(/\..+$/,'').replace('T','-');
      const name='ASI-Backup-'+l.id+'-'+tag+'-'+uid(4),tmp=path.join(parent,name+'.partial'),dest=path.join(parent,name);
      await p.mkdir(tmp);
      try{
        for(const dir of inv.directories)await p.mkdir(safe(tmp,dir),{recursive:true});
        const out=[];let done=0;
        for(const f of inv.files){
          await this.idle();
          const bits=f.path.split('/'),src=f.path==='apps.json'?l.targets['apps.json']:path.join(l.targets[bits[0]],...bits.slice(1));
          const dst=safe(tmp,f.path);
          await safeStat(src);
          await p.mkdir(path.dirname(dst),{recursive:true});
          await p.copyFile(src,dst,fs.constants.COPYFILE_EXCL);
          const digest=await shaFile(dst);
          if(digest.size!==f.size)throw Error('Source changed during backup: '+f.path);
          out.push({path:f.path,...digest});
          done+=f.size;this.progress('backup',done,inv.totalBytes);
        }
        const m={format:FORMAT,version:VERSION,profileId:l.id,avdName:l.avdName,
          createdAt:new Date().toISOString(),components:inv.components,
          directories:inv.directories,files:out,totalBytes:inv.totalBytes};
        checkManifest(m);
        await p.writeFile(path.join(tmp,'manifest.json'),JSON.stringify(m,null,2)+'\n',{flag:'wx'});
        await this.verify(tmp,l,false);
        await p.rename(tmp,dest);
        this.progress('backup-complete',done,done);
        return {path:dest,profileId:l.id,files:out.length,bytes:inv.totalBytes,createdAt:m.createdAt};
      }catch(err){
        try{await p.rm(tmp,{recursive:true,force:true});}catch(_){}
        throw err;
      }
    });
  }
  async verify(directory,layout=this.layout(),requireIdentity=true){
    const folder=await p.realpath(directory);
    if(!(await safeStat(folder)).isDirectory())throw Error('Select a backup folder');
    // Never restore from a folder nested in a live target or its parent.
    if(requireIdentity)for(const target of Object.values(layout.targets)){
      if(within(folder,target)||within(target,folder))throw Error('Backup overlaps current profile data');
    }
    const mf=path.join(folder,'manifest.json'),stat=await safeStat(mf);
    if(!stat.isFile()||stat.size>32*1048576)throw Error('Invalid or too large backup manifest');
    const raw=await p.readFile(mf,'utf8');
    let m;try{m=checkManifest(JSON.parse(raw));}
    catch(e){throw Error('Invalid backup manifest: '+e.message);}
    if(requireIdentity&&(m.profileId!==layout.id||m.avdName!==layout.avdName))
      throw Error('Backup belongs to another profile. Switch to the matching profile first.');
    const content=await walk(folder);
    if(content.files.length!==m.files.length+1||content.directories.length!==m.directories.length)
      throw Error('Unexpected or missing backup files');
    const filenames=new Set(['manifest.json',...m.files.map(f=>f.path)]);
    const dirnames=new Set(m.directories);
    for(const f of content.files)if(!filenames.has(f.path))throw Error('Unexpected backup file');
    for(const d of content.directories)if(!dirnames.has(d))throw Error('Unexpected backup directory');
    let done=0;
    for(const f of m.files){
      const hash=await shaFile(safe(folder,f.path));
      if(hash.size!==f.size||hash.sha256.toLowerCase()!==f.sha256.toLowerCase())
        throw Error('SHA-256 mismatch: '+f.path);
      done+=f.size;this.progress('verify',done,m.totalBytes);
    }
    return {directory:folder,manifest:m,manifestSha:crypto.createHash('sha256').update(raw).digest('hex')};
  }
  requirements(l,m){
    const drives=new Map();
    for(const c of m.components){
      let ancestor=path.dirname(l.targets[c]);
      while(!fs.existsSync(ancestor))ancestor=path.dirname(ancestor);
      const key=fs.statSync(ancestor).dev;
      const cost=m.files.filter(f=>component(f.path)===c).reduce((a,b)=>a+b.size,0);
      const d=drives.get(key)||{path:ancestor,bytes:0};
      d.bytes+=cost;drives.set(key,d);
    }
    return [...drives.values()];
  }
  async previewRestore(folder){
    if(this.busy)throw Error('Backup Center is busy');
    this.pending=null;
    const layout=this.layout(),s=await this.verify(folder,layout);
    const space=this.requirements(layout,s.manifest).map(x=>({location:x.path,requiredBytes:x.bytes,availableBytes:checkSpace(x.path,x.bytes)}));
    const token=uid(24);
    this.pending={token,id:layout.id,createdAt:Date.now(),directory:s.directory,sha:s.manifestSha};
    return {token,profileId:layout.id,createdAt:s.manifest.createdAt,
      bytes:s.manifest.totalBytes,files:s.manifest.files.length,
      components:s.manifest.components,space,
      warning:'Existing data will be preserved as .before-restore safety copies. Restart ApkStart after restoration.'};
  }
  async restore(token){
    return this.exclusive(async()=>{
      const pending=this.pending;this.pending=null;
      if(!pending||token!==pending.token||Date.now()-pending.createdAt>600000)
        throw Error('Restore approval expired. Verify and confirm again.');
      await this.idle();
      const layout=this.layout();
      if(layout.id!==pending.id)throw Error('Profile changed since restore preview');
      const s=await this.verify(pending.directory,layout);
      if(s.manifestSha!==pending.sha)throw Error('Backup changed since preview');
      for(const d of this.requirements(layout,s.manifest))checkSpace(d.path,d.bytes);
      const m=s.manifest,txn='asi-'+uid(10),stages=[],moved=[];
      try{
        for(const c of PARTS){
          const target=layout.targets[c],present=m.components.includes(c);
          if(!present&&!fs.existsSync(target))continue;
          const stage=target+'.'+txn+'.stage',safety=target+'.'+txn+'.before-restore';
          if(fs.existsSync(stage)||fs.existsSync(safety))throw Error('Restore file collision');
          if(present){
            await p.mkdir(path.dirname(stage),{recursive:true});
            if(DIRS.has(c)){
              await p.mkdir(stage);
              for(const d of m.directories.filter(x=>x.startsWith(c+'/')))
                await p.mkdir(safe(stage,d.slice(c.length+1)),{recursive:true});
            }
            for(const f of m.files.filter(x=>component(x.path)===c)){
              await this.idle();
              const src=safe(s.directory,f.path),rel=c==='apps.json'?'':f.path.slice(c.length+1),dest=rel?safe(stage,rel):stage;
              await p.mkdir(path.dirname(dest),{recursive:true});
              await p.copyFile(src,dest,fs.constants.COPYFILE_EXCL);
              const digest=await shaFile(dest);
              if(digest.size!==f.size||digest.sha256.toLowerCase()!==f.sha256.toLowerCase())
                throw Error('Restored stage failed SHA-256: '+f.path);
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
        return {ok:true,profileId:layout.id,bytes:m.totalBytes,files:m.files.length,
          preserved:moved.filter(x=>x.oldMoved).map(x=>x.safety),restartRequired:true};
      }catch(error){
        const failures=[];
        for(const item of moved.reverse())try{
          if(item.newMoved&&fs.existsSync(item.target))await p.rename(item.target,item.stage);
          if(item.oldMoved&&fs.existsSync(item.safety))await p.rename(item.safety,item.target);
        }catch(e){failures.push(e.message);}
        if(failures.length)throw Error('Restore failed; rollback incomplete. Preserved data remains in before-restore folders. '+failures.join('; '));
        throw error;
      }finally{
        // Only delete temporary stages created by us; never delete safety copies.
        for(const item of stages)try{
          if(fs.existsSync(item.stage))await p.rm(item.stage,{recursive:DIRS.has(item.c),force:true});
        }catch(_){}
      }
    });
  }
}
module.exports={BackupCenter,FORMAT,VERSION,checkManifest,validRelative,within,freeBytes};
