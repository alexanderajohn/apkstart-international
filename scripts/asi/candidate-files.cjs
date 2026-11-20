'use strict';
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');

async function inventory(root) {
  const files=[];
  async function visit(dir) {
    const entries=await fs.promises.readdir(dir,{withFileTypes:true});
    entries.sort((a,b)=>a.name<b.name?-1:a.name>b.name?1:0);
    for(const entry of entries) {
      const file=path.join(dir,entry.name);
      if(entry.isSymbolicLink())throw Error('Linked file in candidate');
      if(entry.isDirectory()){await visit(file);continue;}
      if(!entry.isFile())throw Error('Unexpected file type in candidate');
      const digest=crypto.createHash('sha256');let size=0;
      for await(const chunk of fs.createReadStream(file)){size+=chunk.length;digest.update(chunk);}
      files.push({file:path.relative(root,file).split(path.sep).join('/'),size,sha256:digest.digest('hex')});
    }
  }
  await visit(root);
  return files;
}

function validatePayload(files) {
  const names=new Set(files.filter(x=>x.size>0).map(x=>x.file));
  for(const required of ['ApkStart International.exe','resources/app/package.json','resources/app/src/main.js',
    'resources/app/src/ui/index.html','LICENSE','LICENSES.chromium.html','resources/app/LICENSE',
    'resources/app/node_modules/@napi-rs/lzma-win32-x64-msvc/package.json','locales/vi.pak']){
    if(!names.has(required))throw Error('Candidate file missing: '+required);
  }
  if(![...names].some(x=>x.startsWith('resources/app/node_modules/@napi-rs/lzma-win32-x64-msvc/')&&x.endsWith('.node')))
    throw Error('Missing native Windows LZMA module');
  if([...names].some(x=>x.startsWith('resources/runtime/')||/\.(apk|qcow2)$/i.test(x)))throw Error('Unexpected Android payload in Preview');
}

async function run([mode,root,report,revision]) {
  if(!['create','verify'].includes(mode)||!root||!report||!/^[a-f0-9]{40}$/.test(revision||''))throw Error('Usage: create|verify PORTABLE OUTPUT_JSON COMMIT_SHA');
  const files=await inventory(root);
  validatePayload(files);
  const pkg=JSON.parse(await fs.promises.readFile(path.join(root,'resources/app/package.json'),'utf8'));
  if(pkg.name!=='apkstart-international'||!/^\d+\.\d+\.\d+-rc\.\d+$/.test(pkg.version))throw Error('Unexpected candidate version');
  const record={version:pkg.version,revision,files};
  if(mode==='create')await fs.promises.writeFile(report,JSON.stringify(record,null,2)+'\n',{flag:'wx'});
  else if(JSON.stringify(JSON.parse(await fs.promises.readFile(report,'utf8')))!==JSON.stringify(record))throw Error('Candidate does not match recorded inventory');
  return files.length;
}
if(require.main===module)run(process.argv.slice(2)).then(n=>console.log('Verified candidate files:',n)).catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={inventory,validatePayload,run};
