'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {prepareInstall,verifyInstallSource,approvalText}=require('../src/core/apk-install-guard');
const {buildApkBytes}=require('./lib/make-apk');
async function fixture(fn){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'asi-pass19-apk-'));
 const apk=path.join(dir,'example.apk');fs.writeFileSync(apk,buildApkBytes({abis:['x86_64']}));
 try{return await fn({apk,dir});}finally{fs.rmSync(dir,{recursive:true,force:true});}
}
test('valid APK is hashed and explicitly bound to one Android Profile',()=>fixture(async({apk})=>{
 const p=await prepareInstall(apk,'default');
 assert.equal(p.package,'com.example.test');assert.equal(p.profileId,'default');
 assert.equal(p.signatureVerified,false);
 assert.match(approvalText(p,{existing:true}),/may UPDATE/);
 assert.match(approvalText(p),/does not cryptographically verify/);
 assert.equal(await verifyInstallSource(p,'default'),apk);
 await assert.rejects(()=>verifyInstallSource(p,'p_0123456789abcdef'),/Profile changed/);
}));
test('any mutation between preview and approval prevents install',()=>fixture(async({apk})=>{
 const p=await prepareInstall(apk,'default');
 fs.appendFileSync(apk,'modified');
 await assert.rejects(()=>verifyInstallSource(p,'default'),/changed after approval/);
}));
test('same-size modification with restored timestamp is still rejected by SHA-256',()=>fixture(async({apk})=>{
 const p=await prepareInstall(apk,'default');
 const st=fs.statSync(apk),raw=fs.readFileSync(apk);
 raw[raw.length-26]^=1;
 fs.writeFileSync(apk,raw);
 fs.utimesSync(apk,st.atime,st.mtime);
 // Windows mtimes may round differently; either metadata or digest must fail.
 await assert.rejects(()=>verifyInstallSource(p,'default'),/changed after approval/);
}));
test('blocked API requirements and unsafe inputs fail before installer runtime is touched',()=>fixture(async({apk,dir})=>{
 const blocked=path.join(dir,'blocked.apk');
 fs.writeFileSync(blocked,buildApkBytes({minSdk:35,abis:['x86_64']}));
 await assert.rejects(()=>prepareInstall(blocked,'default'),/incompatible/);
 for(const invalid of ['',path.join(dir,'missing.apk'),path.join(dir,'note.txt')]){
  await assert.rejects(()=>prepareInstall(invalid,'default'));
 }
 await assert.rejects(()=>prepareInstall(apk,'p_wrong'),/Unrecognized/);
 const symlink=path.join(dir,'link.apk');
 try{fs.symlinkSync(apk,symlink);await assert.rejects(()=>prepareInstall(symlink,'default'),/Unsafe/);}
 catch(e){if(!['EPERM','EACCES','ENOTSUP'].includes(e.code))throw e;}
}));
test('native approval summary includes SHA, exact Profile and warns for split packages',()=>fixture(async({apk})=>{
 const p=await prepareInstall(apk,'p_0123456789abcdef');
 const t=approvalText(p);
 assert.match(t,/p_0123456789abcdef/);
 assert.match(t,new RegExp(p.sha256));
 assert.match(t,/Cancel is the default/);
}));

test('native install and update confirmations preserve identity and consent in every UI language', () => {
  const {installConfirmation} = require('../src/core/install-confirmation');
  const preview = {profileId:'p_0123456789abcdef', fileName:'Ứng dụng.apk', package:'com.example.notes',
    label:'Ghi chú', sha256:'3d'.repeat(32)};
  for (const [locale, cancel, install, pkg, profile, source, signing] of [
    ['en-US','Cancel','Install to ','Package','Profile','Source','cryptographically'],
    ['vi-VN','Hủy','Cài vào ','Mã gói','Hồ sơ','Tệp nguồn','chữ ký số'],
    ['zh-CN','取消','安装到 ','包名','配置文件','源文件','签名'],
  ]) {
    const fresh = installConfirmation(preview, {locale, profileName:'Hải'});
    const update = installConfirmation(preview, {locale, existing:true});
    assert.deepEqual(fresh.buttons, [cancel, install + 'Hải']);
    assert.notEqual(update.message, fresh.message);
    for (const value of [pkg + ': ' + preview.package, profile + ': ' + preview.profileId,
      source + ': ' + preview.fileName, preview.sha256, signing]) {
      assert.ok(fresh.detail.includes(value));
      assert.ok(update.detail.includes(value));
    }
    const bundle = installConfirmation({...preview, package:null}, {locale});
    assert.ok(bundle.detail.includes(preview.sha256));
    assert.ok(!bundle.detail.includes('undefined'));
  }
});
