'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {execFileSync,spawn,spawnSync} = require('node:child_process');
const {setTimeout:delay} = require('node:timers/promises');
const image = 'system-images;android-34;google_apis_playstore;x86_64';
const splitPkg = 'io.github.muntashirakon.AppManager';
const legacySplitFixture=process.env.ASI_SPLIT_FIXTURE==='legacy';
const splitFiles = ['base.apk','split_config.en.apk','split_config.x86_64.apk','split_config.xhdpi.apk',
  legacySplitFixture?'split_feat_docs.apk':'split_config.vi.apk'].sort();
const fixtures = [
  {file:'api.apk', pkg:'io.appium.android.apis'},
  {file:'calculator.apk', pkg:'org.fossify.math'},
];

async function run() {
  const windows = process.platform==='win32';
  assert((windows || process.platform==='linux') && process.env.GITHUB_ACTIONS==='true' &&
    process.env.TEST_RUNNER_ENVIRONMENT==='github-hosted','Requires a disposable GitHub-hosted test runner');
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
  const {packagePresent,verifyCanary,appManagerDenyControl} = require('./guest-evidence.cjs');
  const store = require('../../src/core/store');
  const {Installer} = require('../../src/core/installer');
  const {EmulatorEngine, SNAPSHOT_NAME} = require('../../src/core/emulator');
  assert.equal(store.DATA_DIR,path.join(process.env.APPDATA,'apkstart-international'));
  const registry = store.profiles;
  store.saveSettings({createShortcutOnInstall:false,freeform:false});
  const primary = registry.create('Guest validation A').id;
  const secondary = registry.create('Guest validation B').id;
  const adb = path.join(process.env.ANDROID_HOME,'platform-tools',windows?'adb.exe':'adb');
  const emulator = path.join(process.env.ANDROID_HOME,'emulator',windows?'emulator.exe':'emulator');
  const serial = 'emulator-5554';
  const client = new AdbClient({adbPath:adb,serial});
  const probe=spawnSync(emulator,['-accel-check'],{encoding:'utf8',timeout:30000});
  const probeText=[probe.stdout,probe.stderr,probe.error?.message].filter(Boolean).join(' ').trim();
  const hardware=/^0\s*$/m.test(probeText) && /installed and usable|is working/i.test(probeText);
  const acceleration=windows && !hardware ? 'off' : 'on';
  console.log('Android acceleration probe', JSON.stringify({acceleration,probeText}));
  const report = {platform:windows?'GitHub-hosted Windows x64':'GitHub-hosted Linux x64',
    osRelease:require('node:os').release(),acceleration,accelerationProbe:probeText,
    revision:process.env.GITHUB_SHA,image,splitVersion:legacySplitFixture?'2.5.22-PRE':'4.1.1',
    emulatorVersion:execFileSync(emulator,['-version'],{encoding:'utf8'}).split('\n').find(l=>l.includes('Android emulator version')),
    permissionInteractions:[],phases:[],complete:false};
  let guest;
  let emulatorLog;
  const active = () => guest && guest.exitCode===null && guest.signalCode===null;
  const save = () => fs.writeFileSync(path.join(evidence,'result.json'),JSON.stringify(report,null,2)+'\n');
  async function phase(name,fn) {
    console.log('Starting '+name);
    const start=Date.now();
    const step={name,status:'running'};
    report.phases.push(step);
    save();
    try { step.observation=await fn();step.status='passed'; }
    catch(error){
      step.status='failed';
      step.error=error.message;
      step.guestAlive=Boolean(active());
      if (emulatorLog) {
        const tail=fs.readFileSync(emulatorLog,'utf8').split(/\r?\n/).slice(-15);
        console.error('Emulator tail',JSON.stringify(tail));
      }
      // These queries are read-only and bound to the job's serial. Preserve
      // the original failure if the transport has already disappeared.
      const observations=await Promise.allSettled([
        client.exec(['devices','-l'],{withSerial:false,timeout:5000}),
        client.exec(['shell','getprop','sys.boot_completed'],{timeout:5000}),
        client.exec(['shell','pm','list','packages','--user','0','io.appium.android.apis'],{timeout:5000})
      ]);
      console.error('Failure observations',JSON.stringify(observations.map(r=>r.status==='fulfilled'?r.value.stdout.trim():r.reason.message)));
      throw error;
    }
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
    const args=['create','avd','-n',registry.avdName(),'-k',image,'-d','pixel_2'];
    // The Windows SDK ships a batch launcher. All arguments here are constants
    // or the generated Profile AVD identifier.
    execFileSync(windows?'cmd.exe':'avdmanager',windows?['/d','/c','avdmanager.bat',...args]:args,
      {input:'no\n',stdio:['pipe','inherit','inherit']});
    const config=path.join(registry.paths().avdHome,registry.avdName()+'.avd','config.ini');
    const ini=fs.readFileSync(config,'utf8').replace(/^disk\.dataPartition\.size\s*=.*$/gm,'');
    fs.writeFileSync(config,ini+'\ndisk.dataPartition.size=3G\n');
  }
  async function boot(id,snapshotArgs=['-no-snapshot']) {
    select(id);
    const avd=registry.avdName();
    const log=path.join(root,avd+'-'+Date.now()+'.log');
    emulatorLog=log;
    const fd=fs.openSync(log,'wx');
    try {guest=spawn(emulator,['-avd',avd,'-port','5554','-accel',acceleration,'-no-window','-gpu','swiftshader',
      '-memory','2048','-cores','2','-noaudio','-no-boot-anim',...snapshotArgs],{stdio:['ignore',fd,fd]});}
    finally {fs.closeSync(fd);}
    const end=Date.now()+(acceleration==='off'?18:7)*60000;
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
    const end=Date.now()+(pkg===splitPkg?90000:45000);
    let activity;
    let resumed=[];
    let visibleSince;
    const handled=new Set();
    do {
      await delay(500);
      const output=await client.shell('dumpsys activity activities');
      resumed=output.split('\n').filter(s=>/(?:topResumedActivity|mResumedActivity|ResumedActivity):?\s*[=:]/.test(s))
        .map(s=>s.match(/\bu0\s+([\w.$]+\/[\w.$]+)/)?.[1]).filter(Boolean);
      const visible=resumed.find(c=>c.startsWith(pkg+'/') &&
        (pkg!==splitPkg || legacySplitFixture || !c.endsWith('.main.SplashActivity')));
      if (visible) {
        visibleSince ??= Date.now();
        if (Date.now()-visibleSince>=1500) activity=visible;
      } else {
        visibleSince=undefined;
        const grant=resumed.find(c=>/^(?:com\.google\.android|com\.android)\.permissioncontroller\/.*\.GrantPermissionsActivity$/.test(c));
        if (grant && pkg===splitPkg) {
          const uiFile='/data/local/tmp/asi-ui-'+crypto.randomUUID()+'.xml';
          let xml;
          try {
            await client.exec(['shell','uiautomator','dump',uiFile],{timeout:25000});
            xml=(await client.exec(['shell','cat',uiFile],{timeout:5000})).stdout;
          } finally {
            await client.exec(['shell','rm','-f',uiFile],{timeout:5000}).catch(()=>{});
          }
          const button=appManagerDenyControl(xml,grant.split('/')[0]);
          const decisionKey=button && JSON.stringify([button.prompt,button.control]);
          if (button && !handled.has(decisionKey)) {
            await verifyOwner(client,registry,registry.currentId());
            await client.exec(['shell','input','tap',String(button.x),String(button.y)]);
            handled.add(decisionKey);
            const decision={profile:registry.currentId(),package:pkg,button:button.control,prompt:button.prompt};
            report.permissionInteractions.push(decision);
            console.log('Permission interaction',JSON.stringify(decision));
          } else if (!button && !handled.has('diagnostic')) {
            console.log('Unrecognized test permission dialog',xml.match(/<node[^>]+(?:permission_message|android.widget.Button)[^>]*>/g) || 'No permission buttons');
            handled.add('diagnostic');
          }
        }
      }
    } while(!activity && Date.now()<end);
    if (!activity) {
      const crashes=await client.shell('logcat -d -b crash -t 80').catch(()=> '');
      const focus=await client.shell('dumpsys window windows').catch(()=> '');
      console.error('Foreground diagnostic',JSON.stringify({
        pkg,launcher:component,resumed,
        focused:focus.split('\n').filter(s=>s.includes('mCurrentFocus')).slice(-2),
        crash:crashes.split('\n').filter(s=>s.includes(pkg)||/Exception|Caused by|FATAL/.test(s)).slice(-10)
      }));
      throw Error('No resumed Activity belonging to '+pkg+'; foreground: '+resumed.join(', '));
    }
    assert.match((await client.shell('pidof '+pkg)).trim(),/^\d+(?:\s+\d+)*$/);
    return activity;
  }
  const runtime = {
    emulator:new EmulatorEngine(root),
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
    execFileSync(adb,['-s',serial,'shell','-T','base64','-d','|','run-as',debugPkg,'tee','files/asi-canary'],
      {input:bytes.toString('base64'),stdio:['pipe','ignore','pipe']});
    return verifyCanary(client,debugPkg,crypto.createHash('sha256').update(bytes).digest('hex'));
  }
  async function exerciseInstallation(fixture,profileId) {
    assert(!await packagePresent(client,fixture.pkg));
    const source=path.join(temp,'guest-fixtures',fixture.file);
    const approved=await prepareInstall(source,profileId);
    assert.equal(approved.package,fixture.pkg);
    await withApprovedCopy(approved,profileId,staged=>installer.install(staged,false));
    assert(await packagePresent(client,fixture.pkg));
    let installedParts;
    if (fixture.pkg===splitPkg) {
      const {stdout}=await client.exec(['shell','pm','path',fixture.pkg]);
      installedParts=stdout.trim().split(/\r?\n/).map(line=>{
        assert(line.startsWith('package:/'),'Unexpected package path');
        return path.posix.basename(line);
      }).sort();
      assert.deepEqual(installedParts,splitFiles);
    }
    if (installedParts) console.log('Android installed split set',JSON.stringify({profileId,format:approved.format,installedParts}));
    const firstActivity=await foreground(fixture.pkg);
    await client.exec(['shell','am','force-stop','--user','0',fixture.pkg]);
    assert(!(await client.shell('ps -A -o NAME')).trim().split(/\s+/).includes(fixture.pkg),'App process did not stop');
    const secondActivity=await foreground(fixture.pkg);
    return {format:approved.format,installedParts,pkg:fixture.pkg,version:approved.version,sha256:approved.sha256,firstActivity,secondActivity};
  }
  // A split failure is reported at the end so the other Profile, cold boots
  // and recovery can still be independently exercised on this runner.
  const splitFailures=[];
  async function splitPhase(name,file,profileId) {
    try {
      await phase(name,()=>exerciseInstallation({file,pkg:splitPkg},profileId));
    } catch (error) {
      await verifyOwner(client,registry,profileId);
      splitFailures.push(error);
    }
  }
  async function checkDefaultPermissions() {
    await verifyOwner(client,registry,primary);
    const {stdout} = await client.exec(['shell','dumpsys','package',debugPkg]);
    const rows = stdout.split(/\r?\n/).map(line=>line.trim());
    const denied = ['CAMERA','RECORD_AUDIO','READ_CONTACTS'];
    for (const name of denied) {
      const prefix = 'android.permission.' + name + ': granted=';
      const grants = rows.filter(line=>line.startsWith(prefix));
      assert.equal(grants.length,1,'Missing or ambiguous permission state for '+name);
      assert(/^false(?:,|$)/.test(grants[0].slice(prefix.length)),'Permission granted by default: '+name);
    }
    return denied;
  }

  async function checkInstalled() {
    assert.equal(await verifyCanary(client,debugPkg,digest),true);
    const foregroundApps=[];
    for(const pkg of [...fixtures.map(f=>f.pkg),splitPkg]) {
      assert(store.getApp(pkg),'Missing Profile catalog entry');
      assert(await packagePresent(client,pkg),'Missing installed package');
      foregroundApps.push(await foreground(pkg));
    }
    return {canaryVerified:true,foregroundApps,permissionsDenied:await checkDefaultPermissions()};
  }

  try {
    save();
    createAvd(primary);
    createAvd(secondary);
    await client.exec(['start-server'],{withSerial:false});
    const first=await phase('cold-boot-primary',()=>boot(primary));
    for(const fixture of fixtures) {
      await phase('install-close-relaunch-'+fixture.pkg,()=>exerciseInstallation(fixture,primary));
    }
    await splitPhase('install-close-relaunch-apks','device.apks',primary);
    await phase('verify-default-permissions',checkDefaultPermissions);
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
      for(const pkg of [...fixtures.map(f=>f.pkg),splitPkg]){
        assert(!await packagePresent(client,pkg));
        assert(!store.getApp(pkg));
      }
      return {absent:[...fixtures.map(x=>x.pkg),splitPkg]};
    });
    await splitPhase('install-close-relaunch-xapk','device.xapk',secondary);
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
    const restoredBoot=await phase('cold-boot-restored-data',async()=>{
      const b=await boot(primary,['-snapshot',SNAPSHOT_NAME,'-no-snapshot-load','-no-snapshot-save']);
      assert.notEqual(b.boot,beforeRestore.boot,'Expected a cold boot of the restored AVD');
      return {...b,...await checkInstalled()};
    });
    await phase('save-restored-snapshot',async()=>{
      await verifyOwner(client,registry,primary);
      assert(await runtime.emulator.saveSnapshotNow(adb,{timeout:120000}),'Named snapshot save failed');
      assert(runtime.emulator.hasSnapshot(),'Saved snapshot is incomplete or marked stale');
      return {snapshot:SNAPSHOT_NAME,boot:restoredBoot.boot};
    });
    await phase('shutdown-restored',stop);
    await phase('quick-boot-restored-profile',async()=>{
      const resumed=await boot(primary,['-snapshot',SNAPSHOT_NAME,'-no-snapshot-save']);
      assert.equal(resumed.boot,restoredBoot.boot,'Emulator cold-booted instead of resuming the saved Android kernel');
      return {...resumed,snapshot:SNAPSHOT_NAME,...await checkInstalled()};
    });
    await phase('shutdown-after-quick-boot',stop);
    if (splitFailures.length) throw new AggregateError(splitFailures,'Split validation failed. See both Profile observations.');
    report.complete=true;
  } finally {
    if(active())guest.kill('SIGTERM');
    save();
  }
}

run().catch(error=>{console.error(error);process.exitCode=1;});
