'use strict';
const fs = require('node:fs');
const path = require('node:path');
const {createHash,randomUUID} = require('node:crypto');
const {pipeline} = require('node:stream/promises');
const {Transform} = require('node:stream');
const base = 'https://dl.google.com/android/repository/';
function official(value) {
  const u = new URL(value);
  if (u.origin!=='https://dl.google.com' || u.username || u.password || !u.pathname.startsWith('/android/repository/'))
    throw Error('Unexpected Android SDK source');
  return u.href;
}
function archiveFromIndex(xml,index,component) {
  official(index);
  const candidates=[];
  for (const match of xml.matchAll(/<remotePackage\b[^>]*\bpath="([^"]+)"[^>]*>([\s\S]*?)<\/remotePackage>/g)) {
    const [,id,body]=match;
    if (id!==component || /<channelRef\b[^>]*ref="(?!channel-0")/.test(body) || /<preview>/.test(body)) continue;
    const revision = /<revision>([\s\S]*?)<\/revision>/.exec(body)?.[1]||'';
    const parts=['major','minor','micro'].map(k=>Number(new RegExp('<'+k+'>(\\d+)</'+k+'>').exec(revision)?.[1]||0));
    for (const [,archive] of body.matchAll(/<archive>([\s\S]*?)<\/archive>/g)) {
      const os=/<host-os>([^<]+)<\/host-os>/.exec(archive)?.[1];
      const cpu=/<host-arch>([^<]+)<\/host-arch>/.exec(archive)?.[1];
      if ((os&&os!=='windows') || (cpu&&!['x86_64','x86-64','x64'].includes(cpu))) continue;
      const complete=/<complete>([\s\S]*?)<\/complete>/.exec(archive)?.[1]||'';
      const url=/<url>([^<]+)<\/url>/.exec(complete)?.[1]?.trim();
      const size=Number(/<size>(\d+)<\/size>/.exec(complete)?.[1]);
      const checks=[...complete.matchAll(/<checksum(?:\s+type="([^"]+)")?>([a-fA-F\d]+)<\/checksum>/g)];
      const sums=new Map(checks.map(([,type,digest])=>[(type||'sha1').replace('-','').toLowerCase(),digest.toLowerCase()]));
      const algorithm=sums.has('sha256')?'sha256':'sha1';
      const hash=sums.get(algorithm);
      if (!url || !Number.isSafeInteger(size) || size<=0 || size>8*1024**3 || hash?.length!==(algorithm==='sha256'?64:40)) continue;
      candidates.push({url:official(new URL(url,index).href),size,algorithm,hash,parts});
    }
  }
  candidates.sort((a,b)=>b.parts[0]-a.parts[0]||b.parts[1]-a.parts[1]||b.parts[2]-a.parts[2]);
  if (!candidates.length) throw Error('No verified Windows SDK archive available for '+component);
  return candidates[0];
}
async function get(url,signal) {
  const response=await fetch(official(url),{redirect:'error',signal});
  if(!response.ok) throw Error('Android SDK download failed (HTTP '+response.status+')');
  return response;
}
async function verifiedSdkArchive(index,component,directory,progress) {
  const metadata=await get(index,AbortSignal.timeout(60000));
  let xml='';
  for await(const data of metadata.body) {
    xml+=Buffer.from(data).toString('utf8');
    if(xml.length>8*1024**2) throw Error('Android SDK index is too large');
  }
  const ref=archiveFromIndex(xml,index,component);
  const file=path.join(directory,'sdk-'+randomUUID()+'.zip');
  const download=await get(ref.url,AbortSignal.timeout(60*60*1000));
  const hash=createHash(ref.algorithm);
  let received=0,previous=-1;
  const verify=new Transform({transform(chunk,_enc,next){
    received+=chunk.length;
    if(received>ref.size)return next(Error('SDK archive exceeds expected size'));
    hash.update(chunk);
    const percent=Math.floor(received/ref.size*100);
    if(percent!==previous){previous=percent;progress({stage:'download',message:component,percent});}
    next(null,chunk);
  }});
  const handle=await fs.promises.open(file,'wx',0o600);
  try{
    await pipeline(download.body,verify,handle.createWriteStream());
    if(received!==ref.size||hash.digest('hex')!==ref.hash)throw Error('Android SDK archive checksum mismatch');
    return file;
  }catch(error){await handle.close();await fs.promises.rm(file,{force:true});throw error;}
}
module.exports={archiveFromIndex,verifiedSdkArchive,base};
