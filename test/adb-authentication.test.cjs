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

test('temporary offline boot probes keep the host daemon alive until Android is ready', async (t) => {
  const {Runtime} = require('../src/core/engine');
  const serial = 'emulator-5554';
  let time = Date.now();
  t.mock.method(Date, 'now', () => time);
  let online = false;
  let resets = 0;
  const client = {
    serial,
    async shell() {
      if (!online) throw Error('device offline');
      return '1\npackage:/system/framework/framework-res.apk';
    },
    async deviceState() { return 'offline'; },
  };
  const runtime = {
    settings: {engine: {}},
    _probeClient: client,
    emulator: {
      running: () => true,
      async resetAdbServer() { resets++; },
      async start({probe}) {
        for (let i = 0; i < 8; i++) {
          time += 5000;
          assert.equal(await probe({serial}), 'pending');
        }
        online = true;
        assert.equal(await probe({serial}), 'ok');
        return {ok:false, error:'end of probe test'};
      },
    },
  };
  const result = await Runtime.prototype.bootEmulator.call(runtime, {env:{accel:{ok:true}}});
  assert.equal(result.error, 'end of probe test');
  assert.equal(resets, 0);
});


test('Google Play userdata keeps its selected language without a privileged framework restart', () => {
  const {EmulatorEngine} = require('../src/core/emulator');
  const engine = new EmulatorEngine(__dirname);
  engine._guestLocale = () => 'vi-VN';
  engine.imageChoice = () => ({tag:'google_apis_playstore'});
  assert.ok(!engine.buildArgs({snapshot:false}).includes('-change-locale'));
  engine.imageChoice = () => ({tag:'default'});
  const args = engine.buildArgs({snapshot:false});
  assert.equal(args[args.indexOf('-change-locale') + 1], 'vi-VN');
});

test('regional public DNS requires an explicit setting', () => {
  const {EmulatorEngine} = require('../src/core/emulator');
  const engine = new EmulatorEngine(__dirname);
  Object.defineProperty(engine,'settings',{value:{engine:{locale:'off'}},configurable:true});
  for (const value of [undefined,false,true]) {
    engine.settings.engine.fastDns=value;
    const args=engine.buildArgs({snapshot:false});
    assert.equal(args.includes('-dns-server'),value===true);
  }
});
