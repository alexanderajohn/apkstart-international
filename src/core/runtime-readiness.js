'use strict';
/**
 * Pass 18 - read-only Android Emulator readiness.
 *
 * An adb connection does NOT prove the Android guest is usable or that it
 * belongs to the selected Android Profile. No launches, installs, settings
 * writes, APK data changes, port scans or adb connect are performed here.
 */
const PROFILE=/^p_[0-9a-f]{16}$/;
const SERIAL=/^emulator-[0-9]{4,5}$/;
const ANSI=/\x1b\[[0-9;]*m/g;
const abbreviate=s=>String(s||'').replace(ANSI,'').trim().slice(0,120);
function expectedAvd(profileId){
  if(profileId==='default')return 'apkstart';
  if(!PROFILE.test(String(profileId||'')))throw Error('Unrecognized Android profile identifier');
  return 'apkstart_'+profileId;
}
function extractAvd(text){
  const lines=String(text||'').split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
  // Official adb emu avd name prints `<name>\nOK`.
  if(lines.length!==2||lines[1]!=='OK'||!/^[A-Za-z0-9_.-]{1,100}$/.test(lines[0]))
    return null;
  return lines[0];
}
function check(id,status,detail){
  return {id,status,detail};
}
async function inspectRuntime({client,profileId,serial,owned=false,running=false,busy=false}={}){
  const avdName=expectedAvd(profileId);
  const report={format:'asi-runtime-readiness-v1',version:1,
    checkedAt:new Date().toISOString(),
    profileId,expectedAvd:avdName,serial:SERIAL.test(String(serial||''))?serial:null,
    status:'blocked',checks:[],sdk:null,abi:null,
    advisory:'Read-only observation; not proof that APK install/launch, persistence, or recovery work.'};
  const add=(id,status,detail)=>report.checks.push(check(id,status,detail));
  if(busy){add('runtime-idle','fail','Busy installing, backing up or starting runtime');return report;}
  if(!running){add('emulator-running','fail','No active owned emulator process');return report;}
  if(!owned){add('runtime-ownership','fail','Emulator ownership is not verified for this app session');return report;}
  if(!SERIAL.test(String(serial||''))||!client||client.serial!==serial||
    typeof client.deviceState!=='function'||typeof client.exec!=='function'){
    add('serial-binding','fail','ADB device is not bound to this managed emulator');return report;
  }
  add('runtime-ownership','pass','Owned Android emulator session confirmed');
  let state;
  try{state=await client.deviceState();}
  catch(_){state='unavailable';}
  if(state!=='device'){
    add('adb-authorization','fail',state==='unauthorized'?'ADB authorization required':
      state==='offline'?'ADB target is offline':'ADB device is unavailable');
    return report;
  }
  add('adb-authorization','pass','Expected emulator serial is authorized');
  const run=async(args,ms=8000)=>{
    const result=await client.exec(args,{timeout:ms});
    return abbreviate(result?.stdout);
  };
  let observed;
  try{observed=extractAvd(await run(['emu','avd','name']));}
  catch(_){observed=null;}
  if(observed&&observed!==avdName){
    add('profile-avd','fail','Android emulator belongs to another profile');
    return report;
  }
  add('profile-avd',observed===avdName?'pass':'unknown',
    observed===avdName?'Guest AVD matches selected profile':'AVD identity could not be independently read');
  let boot='';
  try{boot=await run(['shell','getprop','sys.boot_completed']);}catch(_){}
  if(boot!=='1'){
    add('android-boot','fail','Android boot_completed is not 1');
    return report;
  }
  add('android-boot','pass','Android system reports boot completed');
  let sdk='',abi='',pm='';
  try{sdk=await run(['shell','getprop','ro.build.version.sdk']);}catch(_){}
  try{abi=await run(['shell','getprop','ro.product.cpu.abi']);}catch(_){}
  try{pm=await run(['shell','pm','path','android'],10000);}catch(_){}
  const sdkNum=/^\d{1,3}$/.test(sdk)?Number(sdk):null;
  report.sdk=sdkNum;
  report.abi=/^[a-zA-Z0-9_-]{1,40}$/.test(abi)?abi:null;
  add('android-api',sdkNum===34?'pass':'fail',
    sdkNum===34?'Android 14 (API 34)':'Android API does not match the expected API 34 image');
  add('package-manager',/^package:\/\S+/.test(pm)?'pass':'fail',
    /^package:\/\S+/.test(pm)?'Android package manager responds':'Android package manager is unavailable');
  const failures=report.checks.some(x=>x.status==='fail');
  report.status=failures?'blocked':report.checks.some(x=>x.status==='unknown')?'limited':'ready';
  return report;
}
module.exports={inspectRuntime,expectedAvd,extractAvd};
