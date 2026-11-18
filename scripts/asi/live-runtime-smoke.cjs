#!/usr/bin/env node
'use strict';
/**
 * PASS 18 - real Windows test runner. No emulator provisioning, no automatic
 * profile switching, no deletion, no data wipe, no cleanup.
 *
 * Read-only default; installs only with explicit disposable-profile opt-in.
 * A synthetic ZIP/APK created by unit tests is NOT a signed installable APK.
 */
const path=require('node:path'),fs=require('node:fs'),crypto=require('node:crypto');
const {execFile}=require('node:child_process');
const {inspectRuntime,expectedAvd}=require('../../src/core/runtime-readiness');
const PROFILE=/^p_[0-9a-f]{16}$/,PKG=/^[A-Za-z_]\w*(?:\.[A-Za-z_]\w*){2,}$/;
const HELP='Usage: node scripts/asi/live-runtime-smoke.cjs [--readiness|--install-launch|--verify-existing|--assert-absent]. Set ASI_E2E_ADB_PATH (absolute adb.exe), ASI_E2E_SERIAL (emulator-5554), ASI_E2E_PROFILE_ID. Optional install: ASI_E2E_APK_PATH, ASI_E2E_PACKAGE, ASI_E2E_DISPOSABLE_ACK=I_CREATED_DISPOSABLE_PROFILE.';
const args=process.argv.slice(2);
function requireEnv(name){const x=process.env[name];if(!x)throw Error('Missing required environment value: '+name);return x;}
function emit(report){process.stdout.write(JSON.stringify(report,null,2)+'\n');}
async function run(){
 if(args.includes('--help')){process.stdout.write(HELP+'\n');return;}
 if(process.platform!=='win32')throw Error('Live test must run on a physical Windows 10/11 test host');
 const mode=args.length===0?'--readiness':args[0];
 if(args.length>1||!['--readiness','--install-launch','--verify-existing','--assert-absent'].includes(mode))
  throw Error('Unsupported mode. '+HELP);
 const adb=requireEnv('ASI_E2E_ADB_PATH'),serial=requireEnv('ASI_E2E_SERIAL'),profileId=requireEnv('ASI_E2E_PROFILE_ID');
 if(!path.isAbsolute(adb)||path.basename(adb).toLowerCase()!=='adb.exe'||!fs.statSync(adb).isFile())
  throw Error('Use an existing absolute path to the controlled adb.exe');
 if(!/^emulator-[0-9]{4,5}$/.test(serial))throw Error('Only the ApkStart-managed emulator serial is allowed');
 const expected=expectedAvd(profileId);
 // Explicit operator assertion + live AVD-name equality; never claim to
 // establish process ownership from serial alone on an external host.
 if(process.env.ASI_E2E_AVD_NAME!==expected)throw Error('Expected AVD name does not match selected Profile');
 const env={...process.env,ANDROID_ADB_SERVER_PORT:'5044'};
 function exec(args,timeout=15000,withSerial=true){
   return new Promise((resolve,reject)=>{
    execFile(adb,[...(withSerial?['-s',serial]:[]),...args],{
      env,timeout,windowsHide:true,maxBuffer:1024*1024,encoding:'utf8'
    },(err,stdout)=>err?reject(Error('ADB command failed')):resolve({stdout:String(stdout||'')}));
   });
 }
 const client={serial,
   exec:(a,{timeout}={})=>exec(a,timeout||15000),
   async deviceState(){
     const {stdout}=await exec(['devices'],15000,false);
     const row=stdout.split(/\r?\n/).map(s=>s.trim()).find(s=>s.startsWith(serial+'\t'));
     return row?row.split(/\s+/)[1]:'no-device';
   }};
 // Operator-declared, not automatically verified. inspectRuntime separately
 // verifies the AVD identity via read-only 'adb emu avd name'.
 const report=await inspectRuntime({client,profileId,serial,owned:true,running:true});
 const result={mode,readiness:report,realDeviceChecked:true,operatorAttestedOwnership:true,
   note:'Only the selected operator-controlled profile is tested. No other Android Profile was changed.'};
 if(report.status!=='ready'){
  emit(result);process.exitCode=2;return;
 }
 if(mode==='--readiness'){emit(result);return;}
 const pkg=requireEnv('ASI_E2E_PACKAGE');
 if(!PKG.test(pkg)||pkg.length>180)throw Error('Invalid test package name');
 const packagePath=async()=>{
  try{return (await exec(['shell','pm','path',pkg],15000)).stdout.trim();}
  catch(_){return '';}
 };
 if(mode==='--assert-absent'){
  result.packagePresent=/^package:/m.test(await packagePath());
  result.ok=!result.packagePresent;
  emit(result);if(!result.ok)process.exitCode=3;return;
 }
 if(mode==='--verify-existing'){
  result.packagePresent=/^package:/m.test(await packagePath());
  result.ok=result.packagePresent;
  emit(result);if(!result.ok)process.exitCode=3;return;
 }
 // Install+launch is NEVER run for Default, and never without exact consent.
 if(!PROFILE.test(profileId)||process.env.ASI_E2E_DISPOSABLE_ACK!=='I_CREATED_DISPOSABLE_PROFILE')
  throw Error('Install/launch requires a disposable secondary profile and explicit opt-in');
 if(/^package:/m.test(await packagePath()))
  throw Error('Refusing to install over an existing package; use another disposable test APK');
 const apk=requireEnv('ASI_E2E_APK_PATH'),stat=fs.statSync(apk);
 if(!path.isAbsolute(apk)||!stat.isFile()||stat.size<1024||stat.size>200*1024*1024||!apk.toLowerCase().endsWith('.apk'))
  throw Error('Supply a signed installable test APK smaller than 200 MB');
 const fd=fs.openSync(apk,'r'),magic=Buffer.alloc(4);
 try{fs.readSync(fd,magic,0,4,0);}finally{fs.closeSync(fd);}
 if(magic.toString('hex')!=='504b0304')throw Error('Test APK is not a ZIP package');
 result.apkSha256=crypto.createHash('sha256').update(fs.readFileSync(apk)).digest('hex');
 await exec(['install',apk],240000);
 result.packagePresent=/^package:/m.test(await packagePath());
 if(!result.packagePresent)throw Error('adb install returned success but package manager cannot find test package');
 const launched=(await exec(['shell','monkey','-p',pkg,'-c','android.intent.category.LAUNCHER','1'],60000)).stdout;
 if(!/Events injected:\s*1/.test(launched))throw Error('Android launcher did not report one injected event');
 result.launchEventIssued=true;
 result.ok=true;
 result.warning='Inspect app window manually. The test APK remains installed; it was not uninstalled or cleared.';
 emit(result);
}
run().catch(e=>{process.stderr.write('Live runtime validation failed: '+String(e.message||'unknown error')+'\n');process.exitCode=1;});
