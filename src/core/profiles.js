'use strict';
/**
 * Isolated Android profile registry.
 * Default profile is a zero-migration view of the legacy data folder.
 * Additional profiles own separate AVD, APK cache, icons and apps.json.
 * Runtime binaries/system images and general settings are shared.
 */
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const DEFAULT_ID='default';
const NAME_MAX=40;
const ID_RE=/^p_[a-f0-9]{16}$/;
function createRegistry(dataDir) {
  const folder=path.join(dataDir,'profiles');
  const indexFile=path.join(dataDir,'profiles.json');
  const defaultProfile={id:DEFAULT_ID,name:'Default',createdAt:null};
  const isValidId=(id)=>id===DEFAULT_ID||ID_RE.test(String(id||''));
  function validateName(name) {
    if(typeof name!=='string')throw new TypeError('Profile name must be text');
    const s=name.trim();
    if(!s||s.length>NAME_MAX||/[\x00-\x1f\x7f\/\\<>]/.test(s))
      throw new Error('Profile name must have 1-40 characters and no path separators');
    return s;
  }
  function readIndex(){
    if(!fs.existsSync(indexFile))return {version:1,activeId:DEFAULT_ID,profiles:[defaultProfile]};
    let data;
    try{data=JSON.parse(fs.readFileSync(indexFile,'utf8').replace(/^\uFEFF/,''));}
    catch(e){throw new Error('profiles.json cannot be read; refusing to overwrite profile data: '+e.message);}
    if(!data||data.version!==1||!Array.isArray(data.profiles)
      ||data.profiles.length<1||data.profiles.length>64
      ||!isValidId(data.activeId))
      throw new Error('Invalid profile registry. No changes were made.');
    const seen=new Set();
    for(const profile of data.profiles){
      if(!profile||!isValidId(profile.id)||seen.has(profile.id)
        ||typeof profile.name!=='string'||!profile.name.trim()||profile.name.length>NAME_MAX)
        throw new Error('Invalid profile entry. No changes were made.');
      seen.add(profile.id);
    }
    if(!seen.has(DEFAULT_ID)||!seen.has(data.activeId))
      throw new Error('Default or active profile is missing. No changes were made.');
    return data;
  }
  function persist(data) {
    fs.mkdirSync(dataDir,{recursive:true});
    const tmp=indexFile+'.tmp-'+process.pid;
    try{
      fs.writeFileSync(tmp,JSON.stringify(data,null,2)+'\n',{encoding:'utf8',flag:'wx'});
      fs.renameSync(tmp,indexFile);
    } catch(error) {
      try{fs.rmSync(tmp,{force:true});}catch(_){}
      throw error;
    }
  }
  function currentId(){return readIndex().activeId;}
  function list(){
    const index=readIndex();
    return {activeId:index.activeId, profiles:index.profiles.map(p=>({...p}))};
  }
  function profileRoot(id=currentId()){
    if(!isValidId(id))throw new Error('Invalid profile ID');
    if(id===DEFAULT_ID)return dataDir;
    return path.join(folder,id);
  }
  function paths(id=currentId()){
    const root=profileRoot(id);
    return {
      id,root,
      appsFile:path.join(root,'apps.json'),
      iconsDir:path.join(root,'icons'),
      apkDir:path.join(root,'apks'),
      avdHome:id===DEFAULT_ID?null:path.join(root,'avd'),
    };
  }
  function avdName(id=currentId()){
    if(!isValidId(id))throw new Error('Invalid profile ID');
    return id===DEFAULT_ID?'apkstart':'apkstart_'+id;
  }
  function create(name){
    const cleaned=validateName(name);
    const registry=readIndex();
    if(registry.profiles.length>=64)throw new Error('Maximum 64 Android profiles');
    if(registry.profiles.some(p=>p.name.toLowerCase()===cleaned.toLowerCase()))
      throw new Error('A profile with this name already exists');
    let id;
    do{id='p_'+crypto.randomBytes(8).toString('hex');}
    while(registry.profiles.some(p=>p.id===id)||fs.existsSync(path.join(folder,id)));
    const record={id,name:cleaned,createdAt:new Date().toISOString()};
    fs.mkdirSync(path.join(folder,id),{recursive:true});
    registry.profiles.push(record);
    persist(registry);
    return {...record};
  }
  function activate(id){
    const registry=readIndex();
    if(!isValidId(id)||!registry.profiles.some(p=>p.id===id))
      throw new Error('Unknown profile');
    if(registry.activeId===id)return {changed:false,activeId:id};
    const prev=registry.activeId;
    persist({...registry,activeId:id});
    return {changed:true,previousId:prev,activeId:id};
  }
  return {DEFAULT_ID,indexFile,readIndex,currentId,list,paths,avdName,create,activate,profileRoot,isValidId};
}
module.exports={createRegistry,DEFAULT_ID};
