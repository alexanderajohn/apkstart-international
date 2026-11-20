'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {AdbClient}=require('../src/core/adb');
test('adb online requires an authorized EXACT serial; get-state is never trusted',async()=>{
 for(const state of ['unauthorized','offline','recovery','no permissions','device']){
  const c=new AdbClient({adbPath:'adb.exe',serial:'emulator-5554'});
  const calls=[];
  c.exec=async(args,opts={})=>{
   calls.push(args.join(' '));
   assert.equal(opts.withSerial,false);
   assert.deepEqual(args,['devices']);
   return {stdout:'List of devices attached\nemulator-5554\t'+state+'\nemulator-5556\tdevice\n'};
  };
  assert.equal(await c.isOnline(),state==='device');
  assert.deepEqual(calls,['devices']);
 }
});
test('unrelated authorized emulator never makes selected serial appear online',async()=>{
 const c=new AdbClient({serial:'emulator-5554'}),calls=[];
 c.exec=async(args)=>{calls.push(args);return {stdout:'List of devices attached\nemulator-5556\tdevice\n'};};
 assert.equal(await c.isOnline(),false);
 assert.equal(calls.length,1);
});
test('adb query failure refuses to report a device as online',async()=>{
 const c=new AdbClient({serial:'emulator-5554'});
 c.exec=async()=>{throw Error('ADB not responding');};
 assert.equal(await c.isOnline(),false);
});

test('launcher resolution follows the guest now using the same emulator serial', async () => {
  const client = new AdbClient({adbPath: 'adb', serial: 'emulator-5554'});
  const pkg = 'example.profile.app';
  let component = pkg + '/.First';
  client.shell = async () => component;
  assert.equal(await client.resolveLauncher(pkg), component);

  component = pkg + '/.Restored';
  assert.equal(await client.resolveLauncher(pkg), component);

  component = 'No activity found';
  assert.equal(await client.resolveLauncher(pkg), null);
});
