'use strict';
/**
 * Pass 19: a single main-process install preflight for GUI, Windows Explorer,
 * file associations and CLI. Renderer consent is never a sufficient authority.
 * Static APK signing evidence is NOT certificate verification.
 */
const fs=require('node:fs'),p=fs.promises,path=require('node:path');
const {inspectApk,sha256File}=require('./smartcheck');
const {expectedAvd}=require('./runtime-readiness');
function checkInput(file){
  if(typeof file!=='string'||!file||file.length>32767||
     !/\.(apk|apks|xapk)$/i.test(file))
    throw Error('Select one Android APK or split APK bundle');
  return path.resolve(file);
}
async function safeStat(file){
  const st=await p.lstat(file);
  if(st.isSymbolicLink()||!st.isFile()||st.size<1024||st.size>16*1024**3)
    throw Error('Unsafe, invalid or oversized APK source');
  return st;
}
async function prepareInstall(file,profileId,{inspect=inspectApk}={}){
  const target=checkInput(file);
  expectedAvd(profileId);
  const before=await safeStat(target);
  const verdict=await inspect(target);
  const after=await safeStat(target);
  if(before.size!==after.size||before.mtimeMs!==after.mtimeMs||
     typeof verdict?.sha256!=='string'||!/^[a-f0-9]{64}$/.test(verdict.sha256))
    throw Error('APK changed while SmartCheck was running');
  if(verdict.canProceed===false||verdict.compatibility?.level==='blocked')
    throw Error('APK is incompatible with Android 14 (API 34)');
  return Object.freeze({
    path:target, profileId, fileName:path.basename(target),
    bytes:after.size,modifiedAt:after.mtimeMs,
    sha256:verdict.sha256,format:verdict.format,
    package:verdict.package||null,label:verdict.label||null,
    version:verdict.versionName||null,
    splitDigests:verdict.splitDigests || null,
    signatureVerified:verdict.signing?.verified===true,
    compatibility:verdict.compatibility?.level||'unknown'
  });
}
async function verifyInstallSource(preview,activeProfile,{sha256=sha256File}={}){
  if(!preview||preview.profileId!==activeProfile)
    throw Error('Android Profile changed during install confirmation');
  const st=await safeStat(preview.path);
  if(st.size!==preview.bytes||st.mtimeMs!==preview.modifiedAt||
     await sha256(preview.path)!==preview.sha256)
    throw Error('APK content changed after approval; select and inspect it again');
  return preview.path;
}
function approvalText(preview,{existing=false}={}){
  if(!preview||typeof preview.fileName!=='string')throw Error('Invalid approval preview');
  const type=preview.package?('App: '+(preview.label||preview.package)+'\nPackage: '+preview.package):
    'Split APK bundle: package identity not available in the static preview';
  return type+'\nProfile: '+preview.profileId+
    '\nSource: '+preview.fileName+
    '\nSHA-256: '+preview.sha256+
    '\n'+(existing?'Existing app: this may UPDATE it while retaining Android user data.':'Install to the selected Profile only.')+
    '\nWARNING: SmartCheck does not cryptographically verify APK signing or prove malware safety.'+
    '\nCancel is the default. No Android installation occurs before approval.';
}
module.exports={prepareInstall,verifyInstallSource,approvalText};
