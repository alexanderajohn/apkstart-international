'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createRegistry}=require('../src/core/profiles');

function tempRun(callback){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'asi-profiles-test-'));
  try{return callback(root);}
  finally{fs.rmSync(root,{recursive:true,force:true});}
}
test('Default profile is a non-migrating view of original apps, icons and AVD',()=>{
  tempRun(root=>{
    const registry=createRegistry(root);
    const initial=registry.list();
    assert.equal(initial.activeId,'default');
    assert.equal(initial.profiles.length,1);
    const paths=registry.paths();
    assert.equal(paths.appsFile,path.join(root,'apps.json'));
    assert.equal(paths.iconsDir,path.join(root,'icons'));
    assert.equal(paths.apkDir,path.join(root,'apks'));
    assert.equal(paths.avdHome,null,'Default must preserve exact existing AVD decision');
    assert.equal(registry.avdName(),'apkstart');
    assert.equal(fs.existsSync(path.join(root,'profiles.json')),false,
      'Reading the default profile must not rewrite legacy files');
  });
});
test('New profiles use unique IDs and separate Android userdata directories',()=>{
  tempRun(root=>{
    const r=createRegistry(root);
    const a=r.create('Work'),b=r.create('Games');
    assert.match(a.id,/^p_[a-f0-9]{16}$/);
    assert.notEqual(a.id,b.id);
    assert.equal(r.list().activeId,'default','Profile creation must not silently switch guest');
    const first=r.paths(a.id),second=r.paths(b.id);
    assert.notEqual(first.avdHome,second.avdHome);
    assert.notEqual(first.appsFile,second.appsFile);
    assert.notEqual(first.apkDir,second.apkDir);
    assert.ok(first.avdHome.startsWith(path.join(root,'profiles')));
    assert.ok(!first.avdHome.includes('..'));
    assert.notEqual(r.avdName(a.id),r.avdName(b.id));
    assert.notEqual(r.avdName(a.id),'apkstart');
    assert.equal(r.activate(a.id).changed,true);
    assert.equal(r.currentId(),a.id);
    assert.equal(r.paths().appsFile,first.appsFile);
    assert.equal(r.activate('default').changed,true);
    assert.equal(r.paths().appsFile,path.join(root,'apps.json'));
    assert.equal(r.list().profiles.length,3);
  });
});
test('Registry refuses invalid names, unknown IDs, traversal and malformed index',()=>{
  tempRun(root=>{
    const r=createRegistry(root);
    for(const name of ['', '   ', '../escape','folder\\attack','x'.repeat(41)]) {
      assert.throws(()=>r.create(name),/name/i);
    }
    assert.throws(()=>r.activate('../default'),/Unknown/);
    assert.throws(()=>r.paths('../../etc'),/Invalid/);
    const created=r.create('Testing');
    assert.throws(()=>r.create('testing'),/exists/i);
    const raw=fs.readFileSync(r.indexFile,'utf8');
    fs.writeFileSync(r.indexFile,'{BROKEN JSON','utf8');
    assert.throws(()=>r.list(),/refusing to overwrite/);
    assert.equal(fs.readFileSync(r.indexFile,'utf8'),'{BROKEN JSON');
    fs.writeFileSync(r.indexFile,raw,'utf8');
    assert.equal(r.list().profiles.length,2);
    assert.equal(r.activate(created.id).activeId,created.id);
  });
});
test('Store switches app metadata and caches while leaving default apps intact',()=>{
  tempRun(root=>{
    const old=process.env.APPDATA;
    process.env.APPDATA=root;
    try{
      delete require.cache[require.resolve('../src/core/store')];
      const store=require('../src/core/store');
      assert.equal(store.profiles.currentId(),'default');
      store.upsertApp({package:'com.example.work',label:'Default guest'});
      const defaultApps=fs.readFileSync(path.join(store.DATA_DIR,'apps.json'),'utf8');
      const defaultIcons=store.ICON_DIR;
      const other=store.profiles.create('Isolated');
      store.profiles.activate(other.id);
      assert.deepEqual(store.getApps(),[],'New Android guest must not reuse legacy app catalog');
      assert.notEqual(store.ICON_DIR,defaultIcons);
      assert.ok(store.ICON_DIR.startsWith(path.join(store.DATA_DIR,'profiles')));
      store.upsertApp({package:'com.example.work',label:'Second guest'});
      assert.equal(store.getApps()[0].label,'Second guest');
      assert.equal(fs.readFileSync(path.join(store.DATA_DIR,'apps.json'),'utf8'),defaultApps,
        'Default app metadata must remain byte-for-byte intact');
      store.profiles.activate('default');
      assert.equal(store.getApps()[0].label,'Default guest');
      assert.equal(store.ICON_DIR,defaultIcons);
    }finally{
      if(old===undefined)delete process.env.APPDATA;else process.env.APPDATA=old;
      delete require.cache[require.resolve('../src/core/store')];
    }
  });
});
test('AVD boot, reset and installer paths are profile-aware',()=>{
  const root=path.join(__dirname,'..');
  const provision=fs.readFileSync(path.join(root,'src/core/provision.js'),'utf8');
  const emulator=fs.readFileSync(path.join(root,'src/core/emulator.js'),'utf8');
  const engine=fs.readFileSync(path.join(root,'src/core/engine.js'),'utf8');
  const installer=fs.readFileSync(path.join(root,'src/core/installer.js'),'utf8');
  assert.match(provision,/avdHome:\s*store\.profiles\.currentId/);
  assert.ok(emulator.includes('activeAvdName()'));
  assert.ok(engine.includes("store.profiles.avdName() + '.avd'"));
  assert.ok(engine.includes('Unmanaged Android emulator detected'));
  assert.ok(engine.includes('Another Android emulator is running'));
  assert.ok(installer.includes("shortcutIdentity(app.package,store.profiles.currentId())"));
});
test('Switching profiles only via explicit, idle-state, restart-bound IPC',()=>{
  const root=path.join(__dirname,'..');
  const main=fs.readFileSync(path.join(root,'src/main.js'),'utf8');
  const preload=fs.readFileSync(path.join(root,'src/preload.js'),'utf8');
  const ui=fs.readFileSync(path.join(root,'src/ui/profiles-ui.js'),'utf8');
  const html=fs.readFileSync(path.join(root,'src/ui/index.html'),'utf8');
  for(const channel of ["profiles:list","profiles:create","profiles:switch"])
    assert.ok(main.includes("ipcMain.handle('"+channel+"'"));
  assert.ok(main.includes('runtime.vmRunning'));
  assert.ok(main.includes('runtime.emulatorPorts()'));
  assert.ok(main.includes('runtime.client().isOnline()'));
  assert.ok(main.includes('app.relaunch()'));
  assert.ok(main.includes('store.profiles.activate(result.previousId)'));
  assert.ok(main.includes("args.profile !== store.profiles.currentId()"));
  for(const name of ['profilesList','profilesCreate','profilesSwitch'])
    assert.ok(preload.includes(name));
  for(const id of ['profilePicker','btnSwitchProfile','btnCreateProfile','profilesNotice'])
    assert.ok(html.includes('id="'+id+'"'));
  assert.ok(html.includes('<script src="profiles-ui.js"></script>'));
  assert.ok(ui.includes('window.confirm(L.confirm)'));
  assert.ok(ui.includes('window.prompt(L.name)'));
});

test('Windows UI smoke covers creating a second profile without changing active AVD',()=>{
  const root=path.join(__dirname,'..');
  const main=fs.readFileSync(path.join(root,'src/main.js'),'utf8');
  const ci=fs.readFileSync(path.join(root,'.github/workflows/ci.yml'),'utf8');
  assert.ok(main.includes("process.argv.includes('--profiles')"));
  assert.ok(main.includes("profilesCreate('CI Smoke Profile')"));
  assert.ok(main.includes("before.activeId==='default'&&after.activeId==='default'"));
  assert.ok(ci.includes("'--profiles'"));
  assert.ok(ci.includes('asi-profiles-smoke.png'));
});

test('shortcut identity survives restart and unqualified legacy links belong to Default',()=>{
  const {shortcutProfile,shortcutIdentity}=require('../src/core/shortcut-profile');
  const p='p_0123456789abcdef', pkg='com.example.app';
  const secondary=shortcutIdentity(pkg,p), primary=shortcutIdentity(pkg,'default');
  assert.notEqual(secondary.suffix,primary.suffix);
  assert.notEqual(secondary.aumid,primary.aumid);
  assert.equal(shortcutProfile(['--launch',pkg]),'default');
  assert.equal(shortcutProfile(secondary.args.split(' ')),p);
  assert.equal(shortcutProfile(['--profile','bogus']),null);
  assert.equal(shortcutProfile(['--profile',p,'--profile','default']),null);
});
