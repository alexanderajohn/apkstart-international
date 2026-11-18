'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {inspectRuntime,expectedAvd,extractAvd}=require('../src/core/runtime-readiness');
const secondary='p_0123456789abcdef';
function fixture({state='device',name='apkstart',sdk='34',boot='1',abi='x86_64',pm='package:/system/framework/framework-res.apk',avdError=false}={}){
 const calls=[];
 const client={serial:'emulator-5554',
  async deviceState(){calls.push('devices');return state;},
  async exec(args){calls.push(args.join(' '));
    const action=args.join(' ');
    if(action==='emu avd name'){if(avdError)throw Error('Emulator console unavailable');return {stdout:name+'\nOK\n'};}
    if(action==='shell getprop sys.boot_completed')return {stdout:boot+'\n'};
    if(action==='shell getprop ro.build.version.sdk')return {stdout:sdk+'\n'};
    if(action==='shell getprop ro.product.cpu.abi')return {stdout:abi+'\n'};
    if(action==='shell pm path android')return {stdout:pm+'\n'};
    throw Error('Unexpected ADB operation '+action);
  }
 };
 return {client,calls};
}
const inspect=(f,more={})=>inspectRuntime({
 client:f.client,profileId:'default',serial:'emulator-5554',owned:true,running:true,...more});
test('live owned Android 14 with package manager and correct AVD is ready',async()=>{
 const f=fixture();
 const report=await inspect(f);
 assert.equal(report.status,'ready');assert.equal(report.sdk,34);
 assert.equal(report.abi,'x86_64');
 assert.equal(report.expectedAvd,'apkstart');
 assert.deepEqual(report.checks.map(c=>c.status),['pass','pass','pass','pass','pass','pass']);
 assert.ok(f.calls.includes('shell pm path android'));
 assert.equal(JSON.stringify(report).includes('package:/system'),false);
});
test('ADB authorization and offline failures stop all shell commands',async()=>{
 for(const state of ['unauthorized','offline','no-device']){
  const f=fixture({state});
  const r=await inspect(f);
  assert.equal(r.status,'blocked');
  assert.deepEqual(f.calls,['devices']);
  assert.equal(r.checks.at(-1).id,'adb-authorization');
 }
});
test('an unowned, stopped or busy emulator is never inspected or adopted',async()=>{
 for(const change of [{owned:false},{running:false},{busy:true},{serial:'127.0.0.1:5555'}]){
  const f=fixture(),r=await inspect(f,change);
  assert.equal(r.status,'blocked');
  assert.deepEqual(f.calls,[]);
 }
});
test('wrong profile AVD causes fail-closed without checking Android services',async()=>{
 const f=fixture({name:'apkstart_p_ffffffffffffffff'});
 const r=await inspect(f);
 assert.equal(r.status,'blocked');
 assert.equal(r.checks.at(-1).id,'profile-avd');
 assert.deepEqual(f.calls,['devices','emu avd name']);
});
test('non-default profile uses isolated AVD and requires exact match',async()=>{
 const f=fixture({name:'apkstart_'+secondary});
 const r=await inspect(f,{profileId:secondary});
 assert.equal(r.status,'ready');
 assert.equal(r.expectedAvd,'apkstart_'+secondary);
});
test('AVD name unavailable is limited and never silently trusted',async()=>{
 const f=fixture({avdError:true});
 const r=await inspect(f);
 assert.equal(r.status,'limited');
 assert.equal(r.checks.find(c=>c.id==='profile-avd').status,'unknown');
});
test('boot incomplete blocks package queries',async()=>{
 const f=fixture({boot:'0'});
 const r=await inspect(f);
 assert.equal(r.status,'blocked');
 assert.equal(r.checks.at(-1).id,'android-boot');
 assert.ok(!f.calls.includes('shell pm path android'));
});
test('wrong Android API and unavailable package manager cannot report ready',async()=>{
 for(const values of [{sdk:'33'},{sdk:'35'},{sdk:'not-an-int'},{pm:''}]){
  const r=await inspect(fixture(values));
  assert.equal(r.status,'blocked');
 }
});
test('profile IDs and AVD parsing reject control and line-injection',()=>{
 assert.equal(expectedAvd('default'),'apkstart');
 assert.equal(expectedAvd(secondary),'apkstart_'+secondary);
 for(const bad of ['../default','p_0123','default\nother','p_aaaaaaaaaaaaaaaa/','']){
  assert.throws(()=>expectedAvd(bad),/Unrecognized/);
 }
 assert.equal(extractAvd('apkstart\nOK\n'),'apkstart');
 assert.equal(extractAvd('apkstart\nOK\nignored'),null);
 assert.equal(extractAvd('apkstart;rm -rf /\nOK'),null);
});
test('production probe never asks adb to mutate guest data',async()=>{
 const f=fixture();await inspect(f);
 const allowed=new Set(['devices','emu avd name','shell getprop sys.boot_completed',
 'shell getprop ro.build.version.sdk','shell getprop ro.product.cpu.abi','shell pm path android']);
 assert.ok(f.calls.every(c=>allowed.has(c)));
});
