'use strict';
/**
 * Pass 19: require the Android guest to match the profile selected BEFORE an
 * install/launch began. ADB "device" alone is not an identity assertion.
 *
 * Only read-only adb queries; no emulator startup, connect, repair or reset.
 */
const {expectedAvd,extractAvd}=require('./runtime-readiness');
const SERIAL=/^emulator-[0-9]{4,5}$/;
function assertProfileUnchanged(expected,getProfileId){
  if(typeof getProfileId!=='function'||getProfileId()!==expected)
    throw Error('Android Profile changed during operation; refusing to write to another Profile');
}
async function assertProfileGuest({expectedProfileId,getProfileId,client,serial,engine}){
  expectedAvd(expectedProfileId);
  assertProfileUnchanged(expectedProfileId,getProfileId);
  if(!client||typeof client.exec!=='function'||typeof client.deviceState!=='function')
    throw Error('Cannot verify Android guest ownership or ADB authorization');
  if(!serial||client.serial!==serial)throw Error('ADB target changed during operation');
  // Historical QEMU support is only possible for the Default profile, and
  // never treated as evidence that a secondary Android emulator is isolated.
  if(!SERIAL.test(serial)){
    if(expectedProfileId!=='default'||engine!=='builtin')
      throw Error('Only a verified Android Emulator is supported for secondary Profiles');
    if(await client.deviceState()!=='device')throw Error('Default QEMU ADB device is not authorized');
    assertProfileUnchanged(expectedProfileId,getProfileId);
    return {ok:true,profileId:expectedProfileId,legacyQemu:true};
  }
  if(await client.deviceState()!=='device')
    throw Error('ADB device is offline or unauthorized');
  let name=null;
  try{
    const result=await client.exec(['emu','avd','name'],{timeout:8000});
    name=extractAvd(result?.stdout);
  }catch(_){}
  // Strict identity is essential when the app has several profiles and can
  // leave detached emulator processes behind. Missing result is NOT a match.
  if(!name||name!==expectedAvd(expectedProfileId))
    throw Error('Cannot verify exact Android AVD for selected Profile; refusing install or launch');
  assertProfileUnchanged(expectedProfileId,getProfileId);
  return {ok:true,profileId:expectedProfileId,avd:name};
}
module.exports={assertProfileGuest,assertProfileUnchanged};
