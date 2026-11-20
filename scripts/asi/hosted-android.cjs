'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {execFileSync,spawn} = require('node:child_process');
const {setTimeout:delay} = require('node:timers/promises');
const image = 'system-images;android-34;google_apis_playstore;x86_64';
const fixtures = [
  {file:'api.apk', pkg:'io.appium.android.apis'},
  {file:'calculator.apk', pkg:'org.fossify.math'},
];

async function run() {
  assert(process.platform==='linux' && process.env.GITHUB_ACTIONS==='true' &&
    process.env.TEST_RUNNER_ENVIRONMENT==='github-hosted','Requires a disposable hosted Linux runner');
  const temp = fs.realpathSync(process.env.RUNNER_TEMP);
  const root = fs.mkdtempSync(path.join(temp,'asi-live-'));
  const evidence = path.join(temp,'guest-evidence');
  fs.mkdirSync(evidence);
  process.env.APPDATA = path.join(root,'data');
  process.env.ANDROID_ADB_SERVER_PORT = '5044';
  const {AdbClient} = require('../../src/core/adb');
  const {inspectRuntime} = require('../../src/core/runtime-readiness');
  const {identifyGuest,recordOwner,verifyOwner} = require('../../src/core/runtime-owner');
  const {prepareInstall} = require('../../src/core/apk-install-guard');
  const {withApprovedCopy} = require('../../src/core/install-staging');
  const {EncryptedBackupCenter} = require('../../src/core/encrypted-backup');
  const {packagePresent,verifyCanary} = require('./guest-evidence.cjs');
  const store = require('../../src/core/store');
  const {Installer} = require('../../src/core/installer');
  assert.equal(store.DATA_DIR,path.join(process.env.APPDATA,'apkstart-international'));
  const registry = store.profiles;
  store.saveSettings({createShortcutOnInstall:false,freeform:false});
  const primary = registry.create('Guest validation A').id;
  const secondary = registry.create('Guest validation B').id;
  const adb = path.join(process.env.ANDROID_HOME,'platform-tools','adb');
  const emulator = path.join(process.env.ANDROID_HOME,'emulator','emulator');
  const serial = 'emulator-5554';
  const client = new AdbClient({adbPath:adb,serial});
  const report = {platform:'GitHub-hosted Linux x64',revision:process.env.GITHUB_SHA,image,
    emulatorVersion:execFileSync(emulator,['-version'],{encoding:'utf8'}).split('\n').find(l=>l.includes('Android emulator version')),
    phases:[],complete:false};
  let guest;
  const active = () => guest && guest.exitCode===null && guest.signalCode===null;
  const save = () => fs.writeFileSync(path.join(evidence,'result.json'),JSON.stringify(report,null,2)+'\n');
  async function phase(name,fn) {
    console.log('Starting '+name);
    const start=Date.now();
    const step={name,status:'running'};
    report.phases.push(step);
    save();
    try { step.observation=await fn();step.status='passed'; }
    catch(error){step.status='failed';step.error=error.message;throw error;}
    finally {
      step.elapsedMs=Date.now()-start;
      save();
      console.log('Guest evidence '+JSON.stringify(step));
    }
    return step.observation;
  }
  function select(id) {
    assert(!active(),'Stop the owned guest before switching Profile');
    registry.activate(id);
    store.ensureDirs();
    const home=registry.paths().avdHome;
    fs.mkdirSync(home,{recursive:true});
    process.env.ANDROID_AVD_HOME=home;
  }
  function createAvd(id) {
    select(id);
    execFileSync('avdmanager',['create','avd','-n',registry.avdName(),'-k',image,'-d','pixel_2'],
      {input:'no\n',stdio:['pipe','inherit','inherit']});
    const config=path.join(registry.paths().avdHome,registry.avdName()+'.avd','config.ini');
    const ini=fs.readFileSync(config,'utf8').replace(/^disk\.dataPartition\.size\s*=.*$/gm,'');
    fs.writeFileSync(config,ini+'\ndisk.dataPartition.size=3G\n');
  }
  async function boot(id) {
    select(id);
    const avd=registry.avdName();
    const log=path.join(root,avd+'-'+Date.now()+'.log');
    const fd=fs.openSync(log,'wx');
    try {guest=spawn(emulator,['-avd',avd,'-port','5554','-accel','on','-no-window','-gpu','swiftshader',
      '-memory','2048','-cores','2','-noaudio','-no-boot-anim','-no-snapshot'],{stdio:['ignore',fd,fd]});}
    finally {fs.closeSync(fd);}
    const end=Date.now()+7*60000;
    let last;
    while(Date.now()<end && active()){
      last=await inspectRuntime({client,profileId:id,serial,owned:true,running:true});
      if(last.status==='ready'){
        const owner=await identifyGuest(client,registry,id);
        recordOwner(registry,owner);
        await client.exec(['shell','input','keyevent','KEYCODE_WAKEUP']);
        await client.exec(['shell','wm','dismiss-keyguard']);
        return {profile:id,avd,boot:owner.boot,api:last.sdk,abi:last.abi};
      }
      await delay(2000);
    }
    console.error(last,fs.readFileSync(log,'utf8').split('\n').slice(-35).join('\n'));
    throw Error('Could not verify a fully booted controlled Android 14 guest');
  }
  async function stop() {
    assert(active(),'Expected the owned emulator to be running');
    await verifyOwner(client,registry,registry.currentId());
    await client.exec(['shell','sync']);
    await client.exec(['emu','kill']);
    const end=Date.now()+90000;
    while(active() && Date.now()<end)await delay(500);
    assert(!active(),'Emulator has not exited');
    assert.equal(guest.exitCode,0,'Unexpected emulator exit');
  }
  async function foreground(pkg) {
    await verifyOwner(client,registry,registry.currentId());
    const component=await client.resolveLauncher(pkg);
    assert(component?.startsWith(pkg+'/'),'No launcher for '+pkg);
    await client.startApp(pkg,component,{freeform:false});
    const end=Date.now()+20000;
    let activity;
    do {
      await delay(500);
      const output=await client.shell('dumpsys activity activities');
      activity=output.split('\n').filter(s=>/(?:topResumedActivity|mResumedActivity|ResumedActivity):?\s*[=:]/.test(s))
        .map(s=>s.match(/\bu0\s+([\w.$]+\/[\w.$]+)/)?.[1]).find(c=>c?.startsWith(pkg+'/'));
    } while(!activity && Date.now()<end);
    assert(activity,'No resumed Activity belonging to '+pkg);
    assert.match((await client.shell('pidof '+pkg)).trim(),/^\d+(?:\s+\d+)*$/);
    return activity;
  }
  const runtime = {
    async ensure(){await verifyOwner(client,registry,registry.currentId());return {ok:true,engine:'emulator',client};},
    touch(){this.lastUsedAt=Date.now();},
  };
  const installer = new Installer(runtime,{desktopDir:path.join(root,'desktop')});
  const checkIdle=()=>{assert(!active(),'Backup/restore requires a stopped guest');};
  const center=new EncryptedBackupCenter({registry,dataDir:store.DATA_DIR,getAvdHome:()=>registry.paths().avdHome,assertIdle:checkIdle});
  const password=crypto.randomBytes(32).toString('base64');
  const canary=crypto.randomBytes(48);
  const digest=crypto.createHash('sha256').update(canary).digest('hex');
  const debugPkg=fixtures[0].pkg;
  async function writeCanary(bytes) {
    await verifyOwner(client,registry,primary);
    await client.exec(['shell','run-as',debugPkg,'mkdir','-p','files']);
    execFileSync(adb,['-s',serial,'shell','-T','run-as',debugPkg,'tee','files/asi-canary'],
      {input:bytes,stdio:['pipe','ignore','pipe']});
    return verifyCanary(client,debugPkg,crypto.createHash('sha256').update(bytes).digest('hex'));
  }
  async function checkInstalled() {
    assert.equal(await verifyCanary(client,debugPkg,digest),true);
    const foregroundApps=[];
    for(const {pkg} of fixtures) {
      assert(store.getApp(pkg),'Missing Profile catalog entry');
      assert(await packagePresent(client,pkg),'Missing installed package');
      foregroundApps.push(await foreground(pkg));
    }
    return {canaryVerified:true,foregroundApps};
  }

  try {
    createAvd(primary);
    createAvd(secondary);
    await client.exec(['start-server'],{withSerial:false});
    const first=await phase('cold-boot-primary',()=>boot(primary));
    for(const fixture of fixtures)await phase('install-close-relaunch-'+fixture.pkg,async()=>{
      assert(!await packagePresent(client,fixture.pkg));
      const source=path.join(temp,'guest-fixtures',fixture.file);
      const approved=await prepareInstall(source,primary);
      assert.equal(approved.package,fixture.pkg);
      await withApprovedCopy(approved,primary,staged=>installer.install(staged,false));
      assert(await packagePresent(client,fixture.pkg));
      const firstActivity=await foreground(fixture.pkg);
      await client.exec(['shell','am','force-stop','--user','0',fixture.pkg]);
      assert(!(await client.shell('ps -A -o NAME')).trim().split(/\s+/).includes(fixture.pkg),'App process did not stop');
      const secondActivity=await foreground(fixture.pkg);
      return {pkg:fixture.pkg,version:approved.version,sha256:approved.sha256,firstActivity,secondActivity};
    });
    await phase('write-private-canary',()=>writeCanary(canary));
    await phase('shutdown-primary',stop);
    const exportsDir=path.join(root,'exports');
    fs.mkdirSync(exportsDir);
    let archive;
    await phase('encrypted-offline-backup',async()=>{
      archive=await center.create(exportsDir,password);
      return {bytes:archive.bytes,files:archive.files,cipher:archive.cipher};
    });
    await phase('cold-boot-secondary',()=>boot(secondary));
    await phase('verify-isolated-secondary',async()=>{
      for(const {pkg} of fixtures){
        assert(!await packagePresent(client,pkg));
        assert(!store.getApp(pkg));
      }
      return {absent:fixtures.map(x=>x.pkg)};
    });
    await phase('shutdown-secondary',stop);
    const beforeRestore=await phase('cold-boot-original',async()=>{
      const b=await boot(primary);
      assert.notEqual(b.boot,first.boot,'Expected another cold boot');
      return {...b,...await checkInstalled()};
    });
    await phase('change-private-canary-after-backup',()=>writeCanary(crypto.randomBytes(48)));
    await phase('shutdown-before-restore',stop);
    await phase('encrypted-offline-restore',async()=>{
      const approval=await center.previewRestore(archive.path,password);
      const restored=await center.restore(approval.token,password);
      assert(restored.ok && restored.encrypted);
      assert(restored.preserved.some(p=>p.includes(registry.avdName()+'.avd.')));
      return {bytes:restored.bytes,files:restored.files,originalComponentsPreserved:restored.preserved.length};
    });
    await phase('cold-boot-restored-data',async()=>{
      const b=await boot(primary);
      assert.notEqual(b.boot,beforeRestore.boot,'Expected a cold boot of the restored AVD');
      return {...b,...await checkInstalled()};
    });
    await phase('shutdown-restored',stop);
    report.complete=true;
  } finally {
    if(active())guest.kill('SIGTERM');
    save();
  }
}

run().catch(error=>{console.error(error);process.exitCode=1;});
