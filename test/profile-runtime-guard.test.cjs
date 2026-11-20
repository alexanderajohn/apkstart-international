'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {assertProfileGuest,assertProfileUnchanged}=require('../src/core/profile-runtime-guard');
const secondary='p_0123456789abcdef';
function fake({avd='apkstart',state='device',serial='emulator-5554',error=false,onExec}={}){
 const log=[];
 const client={serial,async deviceState(){log.push('devices');return state;},
   async exec(args){log.push(args.join(' '));if(onExec)onExec();if(error)throw Error('Console unavailable');
     return {stdout:avd+'\nOK\n'};}};
 return {client,log};
}
const run=(f,expectedProfileId='default',getProfileId=()=>expectedProfileId,engine='emulator')=>
 assertProfileGuest({expectedProfileId,getProfileId,client:f.client,serial:f.client.serial,engine});
test('verified Default and secondary AVD allow operations without mutating ADB',async()=>{
 const a=fake(),b=fake({avd:'apkstart_'+secondary});
 assert.equal((await run(a)).avd,'apkstart');
 assert.equal((await run(b,secondary)).avd,'apkstart_'+secondary);
 assert.deepEqual(a.log,['devices','emu avd name']);
});
test('wrong, unavailable, or spoofed AVD identity fails closed',async()=>{
 for(const f of [fake({avd:'apkstart_p_ffffffffffffffff'}),
     fake({avd:'wrong'}),fake({error:true}),fake({avd:'apkstart\nOK\nother'})]){
  await assert.rejects(()=>run(f),/Cannot verify exact Android AVD/);
 }
});
test('offline/unauthorized guest is refused before any console query',async()=>{
 for(const state of ['unauthorized','offline','no-device']){
  const f=fake({state});await assert.rejects(()=>run(f),/offline or unauthorized/);
  assert.deepEqual(f.log,['devices']);
 }
});
test('profile changes during ADB query prevent the action',async()=>{
 let id='default';
 const f=fake({onExec:()=>{id=secondary;}});
 await assert.rejects(()=>run(f,'default',()=>id),/Profile changed/);
 assert.throws(()=>assertProfileUnchanged('default',()=>secondary),/Profile changed/);
});
test('legacy QEMU is only allowed for Default and authorized devices',async()=>{
 const f=fake({serial:'127.0.0.1:5555'});
 assert.equal((await run(f,'default',()=> 'default','builtin')).legacyQemu,true);
 assert.deepEqual(f.log,['devices']);
 await assert.rejects(()=>run(f,secondary,()=>secondary,'builtin'),/Only a verified Android Emulator/);
});
test('caller serial must match ADB client and secure checks do not try install',async()=>{
 const f=fake();
 await assert.rejects(()=>assertProfileGuest({expectedProfileId:'default',getProfileId:()=> 'default',
   client:f.client,serial:'emulator-5556',engine:'emulator'}),/ADB target changed/);
 assert.deepEqual(f.log,[]);
});
