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

test('virtual-only Windows display selects software graphics without disabling CPU acceleration', () => {
  const doctor = require('../src/core/doctor');
  assert.equal(doctor.gpuVendorFromNames('Microsoft Hyper-V Video | Microsoft Remote Display Adapter'), 'virtual');
  assert.equal(doctor.gpuVendorFromNames('Microsoft Hyper-V Video | NVIDIA RTX A4000'), 'nvidia');
  assert.equal(doctor.gpuVendorFromNames('Other Adapter | Microsoft Hyper-V Video'), 'unknown');
  assert.equal(doctor.gpuCandidates('37.3.8','virtual')[0],'software');
  assert.equal(doctor.gpuCandidates('35.1.4','virtual')[0],'swiftshader_indirect');
  assert.ok(doctor.gpuCandidates('37.3.8','virtual').includes('host'));
});

test('API 34 requires two unlocked observations of the same boot before declaring readiness', async () => {
  const {Runtime} = require('../src/core/engine');
  const serial='emulator-5554';
  const first='10000000-0000-4000-8000-000000000001', next='10000000-0000-4000-8000-000000000002';
  let state, boot;
  const client={serial,async shell(){return ['1','package:/system/framework/framework-res.apk',state,boot].join('\n');}};
  const runtime={settings:{engine:{}},_probeClient:client,emulator:{running:()=>true,async start({probe}){
    for(const [user,id,expected] of [['RUNNING_LOCKED',first,'pending'],['RUNNING_UNLOCKED',first,'booting'],
      ['RUNNING_UNLOCKED',next,'booting'],['RUNNING_UNLOCKED',next,'ok']]) {
      state=user; boot=id;
      assert.equal(await probe({serial}),expected);
    }
    return {ok:false,error:'end of readiness test'};
  }}};
  const result=await Runtime.prototype.bootEmulator.call(runtime,{env:{accel:{ok:true},sysimg:{api:34}}});
  assert.equal(result.error,'end of readiness test');
});
