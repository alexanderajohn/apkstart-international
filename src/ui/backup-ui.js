/* Local offline per-profile backup with explicit two-step restore approval. */
(function(){
'use strict';
const $=id=>document.getElementById(id),api=window.apkstart;
const WORDS={
  en:{
    title:'Backup & Restore Center',profile:'Active profile: ',open:'Open backup tools',close:'Hide backup tools',
    warning:'Stop Android first. New backups are encrypted folders (AES-256-GCM + scrypt), not ZIPs. Keep the password safe; it cannot be recovered. Older unencrypted backups remain importable. No data is uploaded.',
    create:'Create encrypted backup',inspect:'Inspect encrypted or legacy backup',
    ready:'Ready. Choose an external destination for the backup folder.',
    working:'Processing offline data. Keep ApkStart open and do not launch Android.',
    canceled:'Selection cancelled; nothing was changed.',
    done:'Verified backup created in: ',verified:'Snapshot verified (SHA-256)',
    current:'Profile: ',files:'Files: ',bytes:'Data size: ',parts:'Includes: ',date:'Created: ',
    verify:'Verifying data',backup:'Backing up',stage:'Staging recovery',complete:'Backup successful',
    previewNote:'RESTORE requires confirmation. The currently installed data is saved as .before-restore safety copies (not deleted). Restart ApkStart after a successful restore. Ensure enough space on all destination drives.',
    restore:'Restore after confirmation',cancel:'Cancel preview',migrate:'Import encrypted profile from another Windows PC',
    ask:'Type RESTORE to confirm replacing the active Android profile data. The original data will remain as safety copies. This cannot be undone automatically.',
    confirm:'Restore verified snapshot now? Current apps and userdata will be moved to safety copies. Android must remain stopped.',
    restored:'Restore successful! Existing data was preserved in safety-copy paths. Restart ApkStart before launching Android.',
    preserved:'Original data preserved in: ',restart:'Restart ApkStart to use restored data',
    error:'Backup/Restore blocked: ',needStop:'Android must be stopped; open Settings and choose Stop Runtime.',
    notEncrypted:'Legacy plaintext (not encrypted)',
    encrypted:'AES-256-GCM encrypted',password:'Backup password (at least 12 UTF-8 bytes)',confirmPassword:'Repeat password (for new backup)',passwordHint:'Password is never saved. You must re-enter it to verify and restore; a lost password cannot be recovered.',passTooShort:'Enter a strong backup password of at least 12 UTF-8 bytes.',passMismatch:'Passwords do not match.',encryptedVerified:'Authenticated encrypted snapshot (AES-256-GCM)',legacyWarning:'Legacy backup: SHA-256 only; contents are not encrypted or authenticated.',
    phase:{backup:'Backing up',verify:'Verifying SHA-256', 'stage-restore':'Preparing verified restore','restore-complete':'Restore finished','backup-complete':'Backup finished'},
  },
  vi:{
    title:'Trung tâm Sao lưu & Khôi phục',profile:'Profile đang dùng: ',open:'Mở công cụ sao lưu',close:'Thu gọn',
    warning:'Phải dừng Android trước. Bản sao lưu mới là THƯ MỤC đã mã hóa AES-256-GCM bằng mật khẩu, không phải ZIP. Phải giữ mật khẩu an toàn vì không thể khôi phục khi quên. Vẫn đọc được backup cũ chưa mã hóa. Không tải dữ liệu lên server.',
    create:'Tạo bản sao lưu mã hóa',inspect:'Kiểm tra backup mã hóa hoặc backup cũ',
    ready:'Sẵn sàng. Chọn thư mục ở ngoài dữ liệu ApkStart để lưu bản sao.',
    working:'Đang xử lý dữ liệu nội bộ. Không đóng ApkStart hoặc bật Android.',
    canceled:'Đã hủy lựa chọn, không có dữ liệu nào bị thay đổi.',
    done:'Đã sao lưu và kiểm tra toàn vẹn vào: ',verified:'Bản sao lưu hợp lệ (SHA-256)',
    current:'Profile: ',files:'Số file: ',bytes:'Dung lượng: ',parts:'Thành phần: ',date:'Tạo lúc: ',
    verify:'Đang xác minh',backup:'Đang sao lưu',stage:'Đang tạo bản khôi phục',complete:'Đã sao lưu',
    previewNote:'Khôi phục cần xác nhận. Dữ liệu hiện tại sẽ được giữ nguyên thành bản .before-restore (không xóa). Khởi động lại ApkStart sau khi khôi phục; đảm bảo ổ đĩa còn đủ chỗ.',
    restore:'Xác nhận khôi phục',cancel:'Hủy chọn',migrate:'Nhập profile mã hóa từ máy Windows khác',
    ask:'Nhập RESTORE để xác nhận thay thế dữ liệu Android của profile đang dùng. Dữ liệu cũ được giữ lại làm bản an toàn. Không có chức năng tự hoàn tác.',
    confirm:'Khôi phục bản sao đã xác minh ngay? Ứng dụng và dữ liệu cũ sẽ được đổi tên thành bản an toàn. Android phải đang tắt.',
    restored:'Khôi phục thành công! Đã giữ dữ liệu cũ thành bản an toàn. Hãy khởi động lại ApkStart trước khi mở Android.',
    preserved:'Dữ liệu cũ được giữ tại: ',restart:'Khởi động lại ApkStart',
    error:'Không thể sao lưu/khôi phục: ',needStop:'Hãy dừng Android trong Settings -> Stop Runtime.',
    notEncrypted:'Backup cũ chưa mã hóa',
    encrypted:'Đã mã hóa AES-256-GCM',password:'Mật khẩu backup (tối thiểu 12 byte UTF-8)',confirmPassword:'Nhập lại mật khẩu (chỉ khi tạo backup)',passwordHint:'Không lưu mật khẩu. Anh phải nhập lại khi kiểm tra và khôi phục; nếu quên sẽ không thể giải mã.',passTooShort:'Mật khẩu phải dài ít nhất 12 byte UTF-8.',passMismatch:'Hai mật khẩu không giống nhau.',encryptedVerified:'Backup mã hóa đã xác thực (AES-256-GCM)',legacyWarning:'Backup cũ: chỉ có SHA-256, chưa mã hóa hay xác thực.',
    phase:{backup:'Đang sao lưu',verify:'Đang kiểm tra SHA-256','stage-restore':'Đang chuẩn bị khôi phục','restore-complete':'Khôi phục xong','backup-complete':'Sao lưu xong'},
  },
  'zh-CN':{
    title:'备份与恢复中心',profile:'当前环境：',open:'打开备份工具',close:'收起',
    warning:'先停止 Android。新备份使用 AES-256-GCM 与密码加密，格式为文件夹而非 ZIP。请保存好密码，遗忘后无法找回。支持导入旧版未加密备份。不上传任何数据。',
    create:'创建加密备份',inspect:'检查加密或旧备份',ready:'请选择 ApkStart 数据目录以外的文件夹。',
    working:'正在本地处理数据，请勿关闭软件或启动 Android。',canceled:'已取消，没有修改数据。',
    done:'备份已创建并验证：',verified:'备份通过 SHA-256 校验',
    current:'环境：',files:'文件：',bytes:'大小：',parts:'组件：',date:'创建：',
    verify:'校验中',backup:'备份中',stage:'准备恢复',complete:'备份成功',
    previewNote:'恢复前必须确认。原数据将保存在 .before-restore 安全副本中，不自动删除。恢复后需要重启软件。',
    restore:'确认恢复',cancel:'取消预览',migrate:'从其他 Windows 电脑导入加密环境',
    ask:'输入 RESTORE 确认替换当前 Android 环境数据。原数据保留为安全副本，无法自动撤销。',
    confirm:'现在恢复这个校验过的备份吗？必须先停止 Android。',
    restored:'恢复成功，原数据已保留，请重启 ApkStart。',preserved:'原数据保存于：',
    restart:'重启 ApkStart',error:'备份/恢复受阻：',needStop:'请先在设置中停止 Android。',
    notEncrypted:'旧版未加密备份',
    encrypted:'已采用 AES-256-GCM 加密',password:'备份密码（至少 12 UTF-8 字节）',confirmPassword:'再次输入密码（仅创建新备份）',passwordHint:'不保存密码。检查或恢复时需要再次输入；密码丢失后无法恢复数据。',passTooShort:'密码至少需要 12 UTF-8 字节。',passMismatch:'两次密码不一致。',encryptedVerified:'认证通过的 AES-256-GCM 加密备份',legacyWarning:'旧版备份只校验 SHA-256，内容未加密也未认证。',
    phase:{backup:'备份中',verify:'SHA-256 校验中','stage-restore':'恢复准备中','restore-complete':'恢复完成','backup-complete':'备份完成'},
  }
};
const fmt=(n)=>n>=1024**3?(n/1024**3).toFixed(2)+' GB':n>=1024**2?(n/1024**2).toFixed(1)+' MB':n>=1024?(n/1024).toFixed(1)+' KB':String(n)+' B';
const locale=()=>{const lang=window.ASI_I18N?.getLanguage?.()||navigator.language||'en';return /^vi/i.test(lang)?WORDS.vi:/^zh/i.test(lang)?WORDS['zh-CN']:WORDS.en;};
let preview=null,busy=false;
function show(msg,error=false){$('backupProgress').textContent=msg;$('backupProgress').style.color=error?'#c0392b':'';}
function lock(on){
  busy=on;
  $('btnBackupCreate').disabled=on;
  $('btnBackupPick').disabled=on;
  $('btnBackupMigrate').disabled=on;
  $('btnBackupRestore').disabled=on||!preview;
  $('backupPassword').disabled=on;
  $('backupPasswordConfirm').disabled=on;
  $('btnBackupCancel').disabled=on;
}
function render(){
  const L=locale(),opened=!$('backupContent').hidden;
  $('backupCenterTitle').textContent=L.title;
  $('btnBackupToggle').textContent=opened?L.close:L.open;
  $('btnBackupToggle').setAttribute('aria-expanded',String(opened));
  $('backupSafety').textContent=L.warning;
  $('backupPasswordLabel').textContent=L.password;
  $('backupPasswordConfirmLabel').textContent=L.confirmPassword;
  $('backupPasswordHint').textContent=L.passwordHint;
  $('btnBackupCreate').textContent=L.create;
  $('btnBackupPick').textContent=L.inspect;
  $('btnBackupMigrate').textContent=L.migrate||'Import encrypted profile from another Windows PC';
  $('btnBackupRestore').textContent=L.restore;
  $('btnBackupCancel').textContent=L.cancel;
  $('btnBackupRestart').textContent=L.restart;
  $('backupPreviewTitle').textContent=preview?.encrypted?L.encryptedVerified:L.verified;
  $('backupRestoreNotice').textContent=L.previewNote;
  api.backupStatus().then(s=>{
    const display=window.ASI_PROFILES?.isSecondary?.()?s.profileId:'Default';
    $('backupProfileCaption').textContent=L.profile+display+' | '+(s.encrypted?L.encrypted:L.notEncrypted);
  }).catch(()=>{});
}
function setPreview(result){
  if(!result||!result.token)return;
  preview=result;
  const L=locale();
  $('backupPreview').hidden=false;
  $('backupPreviewTitle').textContent=result.encrypted?L.encryptedVerified:L.verified;
  $('backupPreviewDetails').textContent=
    L.current+result.profileId+'\n'+L.date+result.createdAt+'\n'+
    L.files+result.files+'\n'+L.bytes+fmt(result.bytes)+'\n'+
    L.parts+(result.components||[]).join(', ')+'\n'+
    (result.space||[]).map(x=>'Free: '+fmt(x.availableBytes)+' / needed '+fmt(x.requiredBytes)).join('\n')+'\n'+
    (result.encrypted?L.encrypted:L.legacyWarning)+
    (result.migration?'\nSource: '+result.sourceProfileId+' → Target: '+result.profileId+'\nAVD compatibility verified: '+JSON.stringify(result.compatibility):'');
  show(result.encrypted?L.encryptedVerified:L.legacyWarning);
  lock(false);
}
function clearPasswords(){
  $('backupPassword').value='';
  $('backupPasswordConfirm').value='';
}
function validPassword(secret){
  return typeof secret==='string'&&new TextEncoder().encode(secret).length>=12
    &&new TextEncoder().encode(secret).length<=1024;
}
async function startBackup(){
  if(busy)return;
  const L=locale();
  let secret=$('backupPassword').value;
  if(!validPassword(secret)){show(L.passTooShort,true);return;}
  if(secret!==$('backupPasswordConfirm').value){show(L.passMismatch,true);return;}
  lock(true);show(L.working);
  try{
    const request=api.backupCreate(secret);
    clearPasswords();secret='';
    const out=await request;
    if(out?.canceled){show(L.canceled);return;}
    preview=null;$('backupPreview').hidden=true;
    show(L.done+out.path+'\n'+L.files+out.files+' | '+fmt(out.bytes)+'\n'+L.encrypted);
  }catch(e){show(L.error+String(e?.message||e),true);}
  finally{secret='';clearPasswords();lock(false);}
}
async function inspect(){
  if(busy)return;
  const L=locale();lock(true);show(L.working);
  let secret=$('backupPassword').value;
  preview=null;$('backupPreview').hidden=true;
  try{
    const request=api.backupPickRestore(secret);
    clearPasswords();secret='';
    const r=await request;
    if(r?.canceled)show(L.canceled);
    else setPreview(r);
  }catch(e){show(L.error+String(e?.message||e),true);}
  finally{secret='';clearPasswords();lock(false);}
}
async function migrate(){
  if(busy)return;
  const L=locale();lock(true);show(L.working);
  let secret=$('backupPassword').value;
  preview=null;$('backupPreview').hidden=true;
  if(!validPassword(secret)){show(L.passTooShort,true);lock(false);return;}
  try{
    const request=api.backupPickMigration(secret);
    clearPasswords();secret='';
    const r=await request;
    if(r?.canceled)show(L.canceled);else setPreview(r);
  }catch(e){show(L.error+String(e?.message||e),true);}
  finally{secret='';clearPasswords();lock(false);}
}
async function restore(){
  if(busy||!preview)return;
  const L=locale(),encrypted=!!preview.encrypted;
  let secret=$('backupPassword').value;
  if(encrypted&&!validPassword(secret)){show(L.passTooShort,true);return;}
  // A typed approval deliberately separates preview from destructive commit.
  if(preview.migration){
    if(window.prompt('Type MIGRATE to import this encrypted backup into the selected profile. Existing data is preserved.')!=='MIGRATE')return;
    if(!window.confirm('Import this authenticated profile backup? Android must be stopped; destination data will be kept in .before-restore safety copies.'))return;
  }else{
    if(window.prompt(L.ask)!=='RESTORE')return;
    if(!window.confirm(L.confirm))return;
  }
  const token=preview.token;
  preview=null;$('backupPreview').hidden=true;
  lock(true);show(L.working);
  try{
    const request=api.backupRestore(token,secret);
    clearPasswords();secret='';
    const result=await request;
    if(result?.canceled){show(L.canceled);return;}
    if(result?.ok){
      show(L.restored+'\n'+L.preserved+(result.preserved||[]).join('\n'));
      $('btnBackupRestart').hidden=false;
    }
  }catch(e){show(L.error+String(e?.message||e),true);}
  finally{secret='';clearPasswords();lock(false);}
}
function init(){
  if(!$('backupCenter'))return;
  render();
  $('btnBackupToggle').addEventListener('click',()=>{$('backupContent').hidden=!$('backupContent').hidden;render();});
  $('btnBackupCreate').addEventListener('click',startBackup);
  $('btnBackupPick').addEventListener('click',inspect);
  $('btnBackupMigrate').addEventListener('click',migrate);
  $('btnBackupRestore').addEventListener('click',restore);
  $('btnBackupCancel').addEventListener('click',()=>{preview=null;$('backupPreview').hidden=true;show(locale().ready);lock(false);});
  $('btnBackupRestart').addEventListener('click',()=>api.restartApp());
  api.on('backup:progress',x=>{
    if(!busy)return;
    const L=locale(),phase=L.phase[x.phase]||x.phase;
    show(phase+': '+(x.total>0?Math.min(100,Math.round(100*(x.done||0)/x.total))+'%':'...'));
  });
  show(locale().ready);
}
window.ASI_BACKUP={renderPreview:setPreview,open:()=>{
  $('backupContent').hidden=false;render();$('backupCenter').scrollIntoView({block:'center'});
}};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
