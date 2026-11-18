'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
test('all APK entry points converge on main-process native approval',()=>{
 const s=read('src/main.js');
 assert.match(s,/ipcMain\.handle\('apk:install'[\s\S]*?runInstall\(filePath\)/);
 assert.match(s,/if \(args\.apk\) \{ runInstall\(args\.apk\)/);
 assert.match(s,/if \(args\.apk\) runInstall\(args\.apk\)/);
 assert.ok(s.includes("const preview=await prepareInstall(filePath,profileId);"));
 assert.ok(s.includes("await withApprovedCopy(preview, store.profiles.currentId()"));
 assert.ok(s.includes("defaultId:0,cancelId:0,noLink:true"));
 assert.ok(s.includes("installer.install(staged, existing"));
});
test('installer verifies exact AVD and PM installation before catalog write',()=>{
 const s=read('src/core/installer.js');
 assert.ok(s.includes('const expectedProfileId=store.profiles.currentId();'));
 assert.ok(s.includes('assertProfileGuest({ expectedProfileId'));
 const p=s.indexOf("await client.isInstalled(meta.package)");
 const catalog=s.indexOf('store.upsertApp(app);');
 assert.ok(p>0&&catalog>p);
 assert.ok(s.includes('assertProfileUnchanged(expectedProfileId'));
 assert.ok(s.includes("if(!app)throw new Error('Cannot launch an app outside the active Android Profile')"));
});
test('renderer handles explicit cancellation without reporting success',()=>{
 const s=read('src/ui/app.js');
 assert.ok(s.includes('if(r?.canceled||r?.ok===false)'));
 assert.ok(s.includes('t.dismiss();installToast=null;break;'));
});
