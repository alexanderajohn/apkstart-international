const test=require('node:test'), assert=require('node:assert/strict'), fs=require('node:fs'), path=require('node:path');
const root=path.join(__dirname,'..');
const dict={};
for(const code of ['en','vi','zh-CN']) dict[code]=JSON.parse(fs.readFileSync(path.join(root,'src/ui/i18n',code+'.json'),'utf8'));
test('catalog keys align',()=>{const expected=Object.keys(dict.en).sort();for(const code of ['vi','zh-CN']) assert.deepEqual(Object.keys(dict[code]).sort(),expected);});
test('all translations are non-empty strings',()=>{for(const d of Object.values(dict)) for(const value of Object.values(d)) assert.ok(typeof value==='string' && value.trim());});
test('renderer loads all local i18n scripts',()=>{const html=fs.readFileSync(path.join(root,'src/ui/index.html'),'utf8'); for(const f of ['catalogs.js','translator.js','bridge.js']) assert.ok(html.includes('i18n/'+f));});
test('upstream MIT license remains',()=>assert.ok(fs.readFileSync(path.join(root,'LICENSE'),'utf8').includes('MIT')));

test('failed launches never clear installed app data automatically', () => {
  const source=fs.readFileSync(path.join(root,'src/core/installer.js'),'utf8');
  assert.doesNotMatch(source,/pm\s+clear\s+\$\{pkg\}/);
});
test('fork self-updater blocks automatic executable replacement', () => {
  const policy=require('../src/core/update-policy');
  assert.equal(policy.SELF_UPDATE_ENABLED,false);
  assert.throws(() => policy.assertSelfUpdateAllowed(), {code:'ASI_UPDATES_DISABLED'});
  const source=fs.readFileSync(path.join(root,'src/core/updater.js'),'utf8');
  assert.match(source,/async prepare\(info\)\s*\{\s*assertSelfUpdateAllowed\(\)/);
  assert.match(source,/apply\(job, opts = \{\}\)\s*\{\s*assertSelfUpdateAllowed\(\)/);
});
test('fork release endpoint stays separate from upstream', () => {
  const source=fs.readFileSync(path.join(root,'src/core/sources.js'),'utf8');
  assert.match(source,/OWNER_GH = 'alexanderajohn'/);
  assert.match(source,/REPO = 'apkstart-international'/);
});

test('primary user journeys have translated labels', () => {
  const keys=['运行时与环境','一键完成','重置安卓数据','系统语言','检查更新','打开设置','性能与资源占用'];
  for (const key of keys) {
    for (const locale of ['en','vi']) assert.notEqual(dict[locale][key], key, locale + ': ' + key);
  }
});
test('catalog includes at least 100 checked UI strings', () => {
  assert.ok(Object.keys(dict.en).length >= 100);
});

test('Android permission auto-grants require explicit opt-in', () => {
  const policy = require('../src/core/permission-policy');
  assert.equal(policy.autoGrantEnabled({}), false);
  assert.equal(policy.autoGrantEnabled({engine:{}}), false);
  assert.equal(policy.autoGrantEnabled({engine:{autoGrantAppPermissions:false}}), false);
  assert.equal(policy.autoGrantEnabled({engine:{autoGrantAppPermissions:'true'}}), false);
  assert.equal(policy.autoGrantEnabled({engine:{autoGrantAppPermissions:true}}), true);
  assert.ok(policy.installVariants('example.apk', {}).every(args => !args.includes('-g')));
  assert.ok(policy.installVariants('example.apk', {engine:{autoGrantAppPermissions:true}}).some(args => args.includes('-g')));
});
test('automatic special Android permission overrides are absent', () => {
  const adb=fs.readFileSync(path.join(root,'src/core/adb.js'),'utf8');
  assert.doesNotMatch(adb,/cmd appops set \$\{pkg\} \$\{op\} allow/);
  assert.match(adb,/installVariants\(file, store.getSettings\(\)\)/);
});
test('settings exposes an explicit permission opt-in', () => {
  const store=fs.readFileSync(path.join(root,'src/core/store.js'),'utf8');
  const html=fs.readFileSync(path.join(root,'src/ui/index.html'),'utf8');
  const app=fs.readFileSync(path.join(root,'src/ui/app.js'),'utf8');
  assert.match(store,/autoGrantAppPermissions:\s*false/);
  assert.match(html,/id="setAutoGrantAppPermissions"/);
  assert.match(app,/save\(\{ engine: \{ autoGrantAppPermissions: enabled \} \}\)/);
  assert.match(app,/autoGrantAppPermissions === true/);
});
test('installer does not automatically dismiss Android permission dialogs', () => {
  const installer=fs.readFileSync(path.join(root,'src/core/installer.js'),'utf8');
  assert.doesNotMatch(installer,/rt\.client\.dismissPermissionDialog\(/);
  assert.match(installer,/if \(autoGrant\) \{/);
});

test('dynamic renderer notifications follow the selected UI language', () => {
  const vm = require('node:vm');
  const context={window:{ASI_CATALOGS:dict}};
  const src=fs.readFileSync(path.join(root,'src/ui/i18n/translator.js'),'utf8');
  vm.runInNewContext(src,context,{filename:'translator.js'});
  const translate=context.window.ASI_TRANSLATOR.t;
  assert.equal(translate('3 个应用','en'),'3 apps');
  assert.equal(translate('1 个应用','en'),'1 app');
  assert.equal(translate('2 个应用','vi'),'2 ứng dụng');
  assert.equal(translate('正在打开 Example App','vi'),'Đang mở Example App…');
  assert.equal(translate('正在安装 Example App','en'),'Installing Example App…');
  assert.equal(translate('Example App 已安装','vi'),'Đã cài Example App');
  assert.equal(translate('5 分钟前','en'),'5 minutes ago');
  assert.equal(translate('2 小时前','vi'),'2 giờ trước');
  assert.equal(translate('正在安装 Example App','zh-CN'),'正在安装 Example App');
  assert.equal(translate('用户原始文本','vi'),'用户原始文本');
});
test('destructive app data prompt is localized and remains explicit', () => {
  const app=fs.readFileSync(path.join(root,'src/ui/app.js'),'utf8');
  assert.match(app,/window\.confirm\(question\)/);
  for (const language of ['en','vi','zh-CN']) {
    assert.ok(dict[language]['清除「{app}」的全部数据？此操作不可撤销。']);
  }
});

test('uninstall confirmation dialogs use localized strings', () => {
  const app=fs.readFileSync(path.join(root,'src/ui/app.js'),'utf8');
  assert.ok(app.includes('window.ASI_I18N?.t('));
  const required=["确定卸载「{app}」？\n\n应用数据会一并被清除，桌面快捷方式也会被删除。","确定卸载 ApkStart？\n\n将取消 .apk 文件关联并移除程序。此操作不可撤销。"];
  for (const key of required) for (const lang of ['en','vi','zh-CN']) assert.ok(dict[lang][key]);
});
