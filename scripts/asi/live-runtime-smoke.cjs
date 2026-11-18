#!/usr/bin/env node
'use strict';
/**
 * PASS 18 - real Windows test runner. No emulator provisioning, no automatic
 * profile switching, no deletion, no data wipe, no cleanup.
 *
 * Read-only default; installs only with explicit disposable-profile opt-in.
 * A synthetic ZIP/APK created by unit tests is NOT a signed installable APK.
 */
const path=require('node:path'),fs=require('node:fs');
const { AdbClient } = require('../../src/core/adb');
const { prepareInstall } = require('../../src/core/apk-install-guard');
const { withApprovedCopy } = require('../../src/core/install-staging');
const { installSession } = require('../../src/core/install-session');
const { packagePresent, verifyCanary, launchAndObserve } = require('./guest-evidence.cjs');
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
 process.env.ANDROID_ADB_SERVER_PORT='5044';
 const client = new AdbClient({adbPath:adb,serial});
 const check = async () => {
   const r = await inspectRuntime({client, profileId, serial, owned:true, running:true});
   if (r.status !== 'ready') throw Error('Runtime identity or readiness changed');
 };
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
 if(mode==='--assert-absent' || mode==='--verify-existing'){
   const present = await packagePresent(client,pkg);
   result.packagePresent = present;
   result.ok = mode==='--assert-absent' ? !present : present;
   if (present && mode==='--verify-existing' && process.env.ASI_E2E_CANARY_SHA256)
     result.privateDataVerified = await verifyCanary(client,pkg,process.env.ASI_E2E_CANARY_SHA256);
   emit(result); if(!result.ok)process.exitCode=3; return;
 }
 // Install+launch is NEVER run for Default, and never without exact consent.
 if(!PROFILE.test(profileId)||process.env.ASI_E2E_DISPOSABLE_ACK!=='I_CREATED_DISPOSABLE_PROFILE')
  throw Error('Install/launch requires a disposable secondary profile and explicit opt-in');
 if(await packagePresent(client,pkg))
  throw Error('Refusing to install over an existing package; use another disposable test APK');
 const apk=requireEnv('ASI_E2E_APK_PATH'),stat=fs.statSync(apk);
 if(!path.isAbsolute(apk)||!stat.isFile()||stat.size<1024||stat.size>200*1024*1024||!apk.toLowerCase().endsWith('.apk'))
  throw Error('Supply a signed installable test APK smaller than 200 MB');
 const preview = await prepareInstall(apk,profileId);
 if(preview.package!==pkg)throw Error('Test APK package differs from the expected identity');
 result.apkSha256=preview.sha256;
 await withApprovedCopy(preview,profileId,staged=>installSession(client,[staged],{
   pkg,replace:false,grant:false,checkGuest:check
 }));
 await check();
 result.packagePresent=await packagePresent(client,pkg);
 if(!result.packagePresent)throw Error('Android package manager cannot find the committed package');
 await launchAndObserve(client,pkg,check);
 await check();
 await client.exec(['shell','am','force-stop','--user','0',pkg]);
 await launchAndObserve(client,pkg,check);
 result.launchesObserved=2;
 if(process.env.ASI_E2E_CANARY_SHA256)
   result.privateDataVerified=await verifyCanary(client,pkg,process.env.ASI_E2E_CANARY_SHA256);
 result.ok=true;
 result.warning='Inspect app window manually. The test APK remains installed; it was not uninstalled or cleared.';
 emit(result);
}
run().catch(e=>{process.stderr.write('Live runtime validation failed: '+String(e.message||'unknown error')+'\n');process.exitCode=1;});
