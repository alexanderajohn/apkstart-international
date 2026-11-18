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
    recoveryFind:'Find local recovery points',recoveryChoose:'Saved recovery points',recoveryInspect:'Verify selected recovery point',
    recoveryNone:'No local safety copies found in this profile.',recoveryAvailable:'Local recovery points found: ',
    recoveryTitle:'Recovery Vault — verified local safety copy',recoveryButton:'Recover after confirmation',
    recoveryNote:'Local safety copies are NOT encrypted or signed. SHA-256 guards against changes after preview, not provenance. RECOVER + native confirmation required. Current and source copies are preserved.',
    recoveryAsk:'Type RECOVER to restore this safety copy. Current Android data will be saved separately.',
    recoveryConfirm:'Recover this safety copy into the active Android profile? Existing data will be preserved. Android must be stopped.',
    recovered:'Recovery complete. The source safety copy and previous active data were preserved. Restart ApkStart.',
    recoveryRestoreType:'Before restore',recoveryRecoveryType:'Before recovery',
    sealPoint:'Encrypt selected safety point',sealedList:'Find encrypted Safety Vault archives',
    sealedLabel:'Encrypted Safety Vault archives',sealedOpen:'Authenticate and preview sealed point',
    sealedEmpty:'No encrypted Safety Vault archives for this profile.',
    sealedCount:'Encrypted Safety Vault archives: ',
    sealedPassword:'Enter and confirm a password (12+ UTF-8 bytes) to seal the point.',
    sealAsk:'Type SEAL to create a new encrypted safety copy. Existing plaintext remains in place.',
    sealedDone:'Encrypted safety point verified and created: ',
    plaintextRemains:'IMPORTANT: Original plaintext safety files are still present and unprotected. Sealing does not erase them.',
    sealedTitle:'Encrypted Safety Vault — authenticated archive',sealedPreviewNote:'AES-256-GCM authenticated encrypted safety copy. RESTORE and native confirmation are required; current live data will be preserved.',
    retentionToggle:'Retention & Cleanup tools',retentionTitle:'Safety Vault Retention & Cleanup',
    retentionNotice:'Read-only age and disk usage report. No automatic deletion; archive authenticity is checked only during a passworded cleanup preview.',
    retentionDays:'Flag plaintext points older than (days)',retentionReport:'Inspect storage usage',
    retentionEmpty:'Read-only inventory, no automatic cleanup is scheduled.',
    retentionPlain:'Plaintext recovery points: ',retentionSealed:'Encrypted vault archives (not yet authenticated): ',
    retentionOld:'Plaintext older than threshold: ',retentionAdvisory:'Days threshold is advisory only. No files were deleted.',
    cleanupVerify:'Authenticate selected plaintext point against selected encrypted archive',
    cleanupTitle:'Authenticated plaintext cleanup preview',
    cleanupNotice:'WARNING: permanently delete ONLY the selected plaintext safety point. The encrypted archive and live profile stay untouched. Not secure erase; password needed for recovery. Interrupted deletion may leave fragments.',
    cleanupButton:'Delete plaintext after confirmation',cleanupCancel:'Cancel cleanup preview',
    cleanupSelect:'Select a plaintext recovery point AND its matching encrypted archive first.',
    cleanupAsk:'Type DELETE PLAINTEXT to permanently remove the selected local safety point. This cannot be undone without the encrypted password.',
    cleanupConfirm:'Remove the verified plaintext recovery point now? The encrypted archive and live data will stay intact. This is not secure erasure.',
    cleanupDone:'Plaintext cleanup finished. Estimated removed data: ',cleanupCanceled:'Cleanup cancelled; no deletion requested.',
    cleanupExpired:'Verify the encrypted archive again before deleting.',


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
    recoveryFind:'Tìm điểm khôi phục cục bộ',recoveryChoose:'Điểm khôi phục đã lưu',recoveryInspect:'Kiểm tra điểm khôi phục đã chọn',
    recoveryNone:'Profile này chưa có bản an toàn cục bộ.',recoveryAvailable:'Số điểm khôi phục tìm thấy: ',
    recoveryTitle:'Recovery Vault — bản dữ liệu cũ đã kiểm tra',recoveryButton:'Phục hồi sau khi xác nhận',
    recoveryNote:'Bản an toàn cục bộ KHÔNG mã hóa hoặc ký số. SHA-256 chỉ phát hiện thay đổi sau khi xem trước. Cần nhập RECOVER và xác nhận Windows. Dữ liệu cũ và bản nguồn đều được giữ lại.',
    recoveryAsk:'Nhập RECOVER để phục hồi dữ liệu của profile đang dùng. Dữ liệu hiện tại sẽ được giữ riêng.',
    recoveryConfirm:'Phục hồi điểm đã chọn vào profile đang dùng? Dữ liệu hiện tại sẽ được giữ lại. Phải dừng Android.',
    recovered:'Phục hồi thành công! Giữ nguyên bản an toàn nguồn và đã bảo vệ dữ liệu hiện tại. Hãy khởi động lại ApkStart.',
    recoveryRestoreType:'Trước khôi phục',recoveryRecoveryType:'Trước phục hồi',
    sealPoint:'Mã hóa điểm khôi phục đã chọn',sealedList:'Tìm các bản an toàn đã mã hóa',
    sealedLabel:'Kho Safety Vault đã mã hóa',sealedOpen:'Xác thực và xem trước bản đã mã hóa',
    sealedEmpty:'Profile này chưa có bản Safety Vault đã mã hóa.',
    sealedCount:'Số bản Safety Vault đã mã hóa: ',
    sealedPassword:'Nhập và xác nhận mật khẩu từ 12 byte UTF-8 trở lên để mã hóa.',
    sealAsk:'Nhập SEAL để tạo bản mã hóa mới. Bản plaintext gốc vẫn được giữ.',
    sealedDone:'Đã tạo và xác thực bản an toàn mã hóa: ',
    plaintextRemains:'QUAN TRỌNG: Bản an toàn plaintext gốc vẫn tồn tại và chưa được bảo vệ. Mã hóa không tự xóa chúng.',
    sealedTitle:'Encrypted Safety Vault — bản lưu đã xác thực',sealedPreviewNote:'Bản an toàn AES-256-GCM đã xác thực. Cần nhập RESTORE và xác nhận Windows; dữ liệu hiện tại vẫn được giữ lại.',
    retentionToggle:'Quản lý thời hạn & dọn dẹp',retentionTitle:'Safety Vault — Thời hạn & dọn dẹp',
    retentionNotice:'Chỉ thống kê tuổi và dung lượng. Không tự xóa; phải xác thực bản mã hóa bằng mật khẩu khi xem trước dọn dẹp.',
    retentionDays:'Đánh dấu điểm plaintext cũ hơn (ngày)',retentionReport:'Kiểm tra dung lượng',
    retentionEmpty:'Chỉ kiểm kê, không có lịch tự động xóa.',
    retentionPlain:'Điểm khôi phục plaintext: ',retentionSealed:'Kho mã hóa (chưa xác thực): ',
    retentionOld:'Plaintext quá ngưỡng ngày: ',retentionAdvisory:'Ngưỡng ngày chỉ để gợi ý. Không xóa dữ liệu.',
    cleanupVerify:'Xác thực điểm plaintext với bản mã hóa đã chọn',
    cleanupTitle:'Xem trước dọn dẹp plaintext đã xác thực',
    cleanupNotice:'CẢNH BÁO: chỉ xóa vĩnh viễn điểm plaintext đã chọn. Bản mã hóa và dữ liệu đang dùng không bị xóa. Không phải xóa an toàn trên SSD; cần mật khẩu để khôi phục. Gián đoạn có thể còn file.',
    cleanupButton:'Xóa plaintext sau khi xác nhận',cleanupCancel:'Hủy xem trước dọn dẹp',
    cleanupSelect:'Anh cần chọn cả điểm plaintext lẫn bản mã hóa tương ứng trước.',
    cleanupAsk:'Nhập DELETE PLAINTEXT để xóa vĩnh viễn điểm an toàn plaintext đã chọn. Không thể hoàn tác nếu không có mật khẩu bản mã hóa.',
    cleanupConfirm:'Xóa điểm plaintext đã xác thực ngay? Bản mã hóa và dữ liệu đang dùng sẽ được giữ nguyên. Không phải xóa an toàn.',
    cleanupDone:'Đã dọn bản plaintext. Dung lượng ước tính: ',cleanupCanceled:'Đã hủy, không xóa dữ liệu.',
    cleanupExpired:'Hãy xác thực lại bản mã hóa trước khi dọn.',


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
    recoveryFind:'查找本地恢复点',recoveryChoose:'已保存的恢复点',recoveryInspect:'验证所选恢复点',
    recoveryNone:'此环境没有本地安全副本。',recoveryAvailable:'找到恢复点：',
    recoveryTitle:'恢复保险库 — 已校验本地安全副本',recoveryButton:'确认后恢复',
    recoveryNote:'本地安全副本未加密、未签名。SHA-256 只能检测预览后更改，不能证明来源。必须输入 RECOVER 并通过原生系统确认。原副本和当前数据都会保留。',
    recoveryAsk:'输入 RECOVER 恢复所选安全副本，当前 Android 数据会另存。',
    recoveryConfirm:'将安全副本恢复到当前 Android 环境？当前数据会保留。请先关闭 Android。',
    recovered:'恢复成功！原安全副本与恢复前数据已保留，请重启 ApkStart。',
    recoveryRestoreType:'恢复前',recoveryRecoveryType:'回滚前',
    sealPoint:'加密所选恢复点',sealedList:'查找已加密的安全保险库',
    sealedLabel:'加密安全保险库',sealedOpen:'验证并预览加密恢复点',
    sealedEmpty:'当前环境没有加密安全存档。',
    sealedCount:'加密安全存档：',
    sealedPassword:'输入并确认至少 12 个 UTF-8 字节的密码以加密。',
    sealAsk:'输入 SEAL 以创建加密副本。原明文安全副本会保留。',
    sealedDone:'已创建并验证加密安全副本：',
    plaintextRemains:'重要：原始明文安全文件仍存在且未受加密保护。加密操作不会自动删除它们。',
    sealedTitle:'加密安全保险库 — 已认证存档',sealedPreviewNote:'AES-256-GCM 认证加密副本。恢复需输入 RESTORE 并经原生系统确认；当前数据会保留。',
    retentionToggle:'保留与清理工具',retentionTitle:'安全保险库 — 保留与清理',
    retentionNotice:'只读统计保存时间和占用空间。不会自动删除；只有输入密码后才能验证加密存档用于清理。',
    retentionDays:'标记超过天数的明文恢复点',retentionReport:'查看存储占用',
    retentionEmpty:'只读清单，不执行自动清理。',
    retentionPlain:'明文恢复点：',retentionSealed:'加密存档（尚未认证）：',
    retentionOld:'超过保留天数的明文：',retentionAdvisory:'天数仅用于提示。未删除任何文件。',
    cleanupVerify:'根据选定加密存档验证明文恢复点',
    cleanupTitle:'已认证明文清理预览',
    cleanupNotice:'警告：仅永久删除所选明文恢复点，不触碰加密存档或活动环境。这不是安全擦除；恢复需要密码。意外中断可能遗留文件。',
    cleanupButton:'确认后删除明文',cleanupCancel:'取消清理预览',
    cleanupSelect:'请先选择明文恢复点及其匹配的加密存档。',
    cleanupAsk:'输入 DELETE PLAINTEXT 永久删除所选明文安全副本。没有加密密码则无法恢复。',
    cleanupConfirm:'现在删除经验证的明文恢复点吗？加密存档和当前数据将保留，这不是安全擦除。',
    cleanupDone:'明文清理完成。估计移除数据：',cleanupCanceled:'清理取消，没有执行删除。',
    cleanupExpired:'请重新验证加密存档后再清理。',


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
let preview=null,cleanupPreview=null,busy=false;
function show(msg,error=false){$('backupProgress').textContent=msg;$('backupProgress').style.color=error?'#c0392b':'';}
function lock(on){
  busy=on;
  $('btnBackupCreate').disabled=on;
  $('btnBackupPick').disabled=on;
  $('btnBackupMigrate').disabled=on;
  $('btnBackupRecoveryFind').disabled=on;
  $('btnBackupSealPoint').disabled=on||$('backupRecoveryChoices').hidden;
  $('btnBackupSealedList').disabled=on;
  $('btnBackupSealedOpen').disabled=on||$('backupSealedChoices').hidden;
  $('btnBackupRetentionToggle').disabled=on;
  $('btnBackupRetentionReport').disabled=on;
  $('backupRetentionDays').disabled=on;
  $('btnBackupCleanupPreview').disabled=on||$('backupRecoveryChoices').hidden||$('backupSealedChoices').hidden;
  $('btnBackupCleanupApply').disabled=on||!cleanupPreview;
  $('btnBackupCleanupCancel').disabled=on||!cleanupPreview;
  $('backupSealedSelect').disabled=on;
  $('btnBackupRecoveryInspect').disabled=on||$('backupRecoveryChoices').hidden;
  $('backupRecoverySelect').disabled=on;
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
  $('btnBackupRecoveryFind').textContent=L.recoveryFind;
  $('backupRecoverySelectLabel').textContent=L.recoveryChoose;
  $('btnBackupRecoveryInspect').textContent=L.recoveryInspect;
  $('btnBackupSealPoint').textContent=L.sealPoint;
  $('btnBackupSealedList').textContent=L.sealedList;
  $('backupSealedLabel').textContent=L.sealedLabel;
  $('btnBackupSealedOpen').textContent=L.sealedOpen;
  const retentionOpen=!$('backupRetentionPanel').hidden;
  $('btnBackupRetentionToggle').textContent=L.retentionToggle;
  $('btnBackupRetentionToggle').setAttribute('aria-expanded',String(retentionOpen));
  $('backupRetentionTitle').textContent=L.retentionTitle;
  $('backupRetentionNotice').textContent=L.retentionNotice;
  $('backupRetentionDaysLabel').textContent=L.retentionDays;
  $('btnBackupRetentionReport').textContent=L.retentionReport;
  $('btnBackupCleanupPreview').textContent=L.cleanupVerify;
  $('backupCleanupTitle').textContent=L.cleanupTitle;
  $('backupCleanupNotice').textContent=L.cleanupNotice;
  $('btnBackupCleanupApply').textContent=L.cleanupButton;
  $('btnBackupCleanupCancel').textContent=L.cleanupCancel;
  $('btnBackupRestore').textContent=preview?.recovery?L.recoveryButton:L.restore;
  $('btnBackupCancel').textContent=L.cancel;
  $('btnBackupRestart').textContent=L.restart;
  $('backupPreviewTitle').textContent=preview?.recovery?L.recoveryTitle:preview?.sealed?L.sealedTitle:preview?.encrypted?L.encryptedVerified:L.verified;
  $('backupRestoreNotice').textContent=preview?.recovery?L.recoveryNote:preview?.sealed?L.sealedPreviewNote:L.previewNote;
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
  $('backupPreviewTitle').textContent=result.recovery?L.recoveryTitle:result.sealed?L.sealedTitle:result.encrypted?L.encryptedVerified:L.verified;
  $('btnBackupRestore').textContent=result.recovery?L.recoveryButton:L.restore;
  $('backupRestoreNotice').textContent=result.recovery?L.recoveryNote:result.sealed?L.sealedPreviewNote:L.previewNote;
  $('backupPreviewDetails').textContent=
    L.current+result.profileId+'\n'+L.date+result.createdAt+'\n'+
    L.files+result.files+'\n'+L.bytes+fmt(result.bytes)+'\n'+
    L.parts+(result.components||[]).join(', ')+'\n'+
    (result.space||[]).map(x=>'Free: '+fmt(x.availableBytes)+' / needed '+fmt(x.requiredBytes)).join('\n')+'\n'+
    (result.recovery?L.recoveryNote:result.sealed?L.sealedPreviewNote:result.encrypted?L.encrypted:L.legacyWarning)+
    (result.migration?'\nSource: '+result.sourceProfileId+' → Target: '+result.profileId+'\nAVD compatibility verified: '+JSON.stringify(result.compatibility):'');
  show(result.recovery?L.recoveryTitle:result.encrypted?L.encryptedVerified:L.legacyWarning);
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
function resetCleanup(){
  const token=cleanupPreview?.token;
  cleanupPreview=null;
  $('backupCleanupPreviewPanel').hidden=true;
  if(token)api.cleanupCancel(token).catch(()=>{});
  lock(false);
}
function renderRetention(result){
  const L=locale(),t=result.totals||{};
  $('backupRetentionSummary').textContent=[
    L.current+result.profileId,
    L.retentionPlain+(t.plaintextPoints||0)+' / '+fmt(t.plaintextBytes||0),
    L.retentionSealed+(t.encryptedArchives||0)+' / '+fmt(t.encryptedBytes||0),
    L.retentionOld+fmt(t.oldPlaintextBytes||0)+' ('+result.retentionDays+' days)',
    ...(result.plaintext||[]).slice(0,20).map(pt=>
      (pt.oldEnough?'[age] ':'')+pt.id+' · '+pt.ageDays+' days · '+fmt(pt.bytes)),
    L.retentionAdvisory
  ].join('\n');
}
function renderCleanupPreview(result){
  if(!result||!result.token)return;
  cleanupPreview=result;
  const L=locale();
  $('backupCleanupPreviewPanel').hidden=false;
  $('backupCleanupDetails').textContent=
    L.current+result.profileId+'\n'+result.pointId+'\n'+result.archiveId+'\n'+
    L.files+result.files+'\n'+L.bytes+fmt(result.bytes)+'\n'+
    L.parts+result.components.join(', ')+'\nValid until: '+result.expiresAt;
  $('backupCleanupNotice').textContent=L.cleanupNotice;
  show(L.cleanupTitle);
  lock(false);
}
async function reportRetention(){
  if(busy)return;
  const L=locale(),days=Number($('backupRetentionDays').value);
  if(!Number.isInteger(days)||days<1||days>3650){
    show(L.error+'Days must be from 1 to 3650',true);return;
  }
  lock(true);show(L.working);
  try{renderRetention(await api.retentionReport(days));}
  catch(e){show(L.error+String(e?.message||e),true);}
  finally{lock(false);}
}
async function inspectCleanup(){
  if(busy)return;
  const L=locale();
  if($('backupRecoveryChoices').hidden||$('backupSealedChoices').hidden){
    show(L.cleanupSelect,true);return;
  }
  let secret=$('backupPassword').value;
  if(!validPassword(secret)){show(L.passTooShort,true);return;}
  resetCleanup();lock(true);show(L.working);
  try{
    const request=api.cleanupPreview($('backupRecoverySelect').value,$('backupSealedSelect').value,secret);
    clearPasswords();secret='';
    renderCleanupPreview(await request);
  }catch(e){show(L.error+String(e?.message||e),true);}
  finally{secret='';clearPasswords();lock(false);}
}
async function applyCleanup(){
  if(busy||!cleanupPreview)return;
  const L=locale();
  let secret=$('backupPassword').value;
  if(!validPassword(secret)){show(L.passTooShort,true);return;}
  if(window.prompt(L.cleanupAsk)!=='DELETE PLAINTEXT')return;
  if(!window.confirm(L.cleanupConfirm))return;
  const token=cleanupPreview.token;
  cleanupPreview=null;$('backupCleanupPreviewPanel').hidden=true;
  lock(true);show(L.working);
  try{
    const request=api.cleanupApply(token,secret,'DELETE PLAINTEXT');
    clearPasswords();secret='';
    const result=await request;
    if(result?.canceled){show(L.cleanupCanceled);return;}
    if(result?.ok){
      $('backupRecoveryChoices').hidden=true;
      show(L.cleanupDone+fmt(result.estimatedReclaimedBytes)+'\n'+
        'Encrypted archive preserved: '+result.archiveId);
      const days=Number($('backupRetentionDays').value)||30;
      renderRetention(await api.retentionReport(days));
    }
  }catch(e){show(L.error+String(e?.message||e),true);}
  finally{secret='';clearPasswords();lock(false);}
}
async function findRecovery(){
  if(busy)return;
  const L=locale();
  resetCleanup();lock(true);show(L.working);
  preview=null;$('backupPreview').hidden=true;
  $('backupRecoveryChoices').hidden=true;
  try{
    const listing=await api.recoveryList(),points=listing.points||[];
    const select=$('backupRecoverySelect');
    select.replaceChildren();
    if(!points.length){show(L.recoveryNone);return;}
    for(const point of points){
      const option=document.createElement('option');
      option.value=point.id;
      option.textContent=(point.id.startsWith('restore:')?L.recoveryRestoreType:L.recoveryRecoveryType)+
        ' · '+point.updatedAt+' · '+point.components.join(', ');
      select.appendChild(option);
    }
    $('backupRecoveryChoices').hidden=false;
    show(L.recoveryAvailable+points.length);
  }catch(e){show(L.error+String(e?.message||e),true);}
  finally{lock(false);}
}
async function inspectRecovery(){
  if(busy||$('backupRecoveryChoices').hidden)return;
  const L=locale();lock(true);show(L.working);
  preview=null;$('backupPreview').hidden=true;
  try{setPreview(await api.recoveryPreview($('backupRecoverySelect').value));}
  catch(e){show(L.error+String(e?.message||e),true);}
  finally{lock(false);}
}
async function sealPoint(){
  if(busy||$('backupRecoveryChoices').hidden)return;
  const L=locale(),pointId=$('backupRecoverySelect').value;
  let secret=$('backupPassword').value;
  if(!validPassword(secret)){show(L.passTooShort,true);return;}
  if(secret!==$('backupPasswordConfirm').value){show(L.passMismatch,true);return;}
  if(window.prompt(L.sealAsk)!=='SEAL')return;
  lock(true);show(L.working);
  try{
    const request=api.sealedCreate(pointId,secret,'SEAL');
    clearPasswords();secret='';
    const result=await request;
    if(result?.canceled){show(L.canceled);return;}
    show(L.sealedDone+result.path+'\n'+L.plaintextRemains);
  }catch(e){show(L.error+String(e?.message||e),true);}
  finally{secret='';clearPasswords();lock(false);}
}
async function listSealed(){
  if(busy)return;
  const L=locale();resetCleanup();lock(true);show(L.working);
  preview=null;$('backupPreview').hidden=true;
  $('backupSealedChoices').hidden=true;
  try{
    const result=await api.sealedList(),archives=result.archives||[];
    const select=$('backupSealedSelect');select.replaceChildren();
    if(!archives.length){show(L.sealedEmpty);return;}
    for(const item of archives){
      const option=document.createElement('option');
      option.value=item.id;option.textContent=item.createdAt+' · '+item.id.slice(7);
      select.appendChild(option);
    }
    $('backupSealedChoices').hidden=false;
    show(L.sealedCount+archives.length);
  }catch(e){show(L.error+String(e?.message||e),true);}
  finally{lock(false);}
}
async function inspectSealed(){
  if(busy||$('backupSealedChoices').hidden)return;
  const L=locale();let secret=$('backupPassword').value;
  if(!validPassword(secret)){show(L.passTooShort,true);return;}
  lock(true);show(L.working);
  preview=null;$('backupPreview').hidden=true;
  try{
    const request=api.sealedPreview($('backupSealedSelect').value,secret);
    clearPasswords();secret='';
    setPreview(await request);
  }catch(e){show(L.error+String(e?.message||e),true);}
  finally{secret='';clearPasswords();lock(false);}
}
async function restore(){
  if(busy||!preview)return;
  const L=locale(),encrypted=!!preview.encrypted;
  let secret=$('backupPassword').value;
  if(encrypted&&!validPassword(secret)){show(L.passTooShort,true);return;}
  // A typed approval deliberately separates preview from destructive commit.
  if(preview.recovery){
    if(window.prompt(L.recoveryAsk)!=='RECOVER')return;
    if(!window.confirm(L.recoveryConfirm))return;
  }else if(preview.migration){
    if(window.prompt('Type MIGRATE to import this encrypted backup into the selected profile. Existing data is preserved.')!=='MIGRATE')return;
    if(!window.confirm('Import this authenticated profile backup? Android must be stopped; destination data will be kept in .before-restore safety copies.'))return;
  }else{
    if(window.prompt(L.ask)!=='RESTORE')return;
    if(!window.confirm(L.confirm))return;
  }
  const token=preview.token,previewRecovery=!!preview.recovery;
  preview=null;$('backupPreview').hidden=true;
  lock(true);show(L.working);
  try{
    const request=previewRecovery?api.recoveryApply(token,'RECOVER'):api.backupRestore(token,secret);
    clearPasswords();secret='';
    const result=await request;
    if(result?.canceled){show(L.canceled);return;}
    if(result?.ok){
      show((result.recovery?L.recovered:L.restored)+'\n'+L.preserved+(result.preserved||[]).join('\n'));
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
  $('btnBackupRecoveryFind').addEventListener('click',findRecovery);
  $('btnBackupRecoveryInspect').addEventListener('click',inspectRecovery);
  $('btnBackupSealPoint').addEventListener('click',sealPoint);
  $('btnBackupSealedList').addEventListener('click',listSealed);
  $('btnBackupSealedOpen').addEventListener('click',inspectSealed);
  $('btnBackupRetentionToggle').addEventListener('click',()=>{
    $('backupRetentionPanel').hidden=!$('backupRetentionPanel').hidden;render();
  });
  $('btnBackupRetentionReport').addEventListener('click',reportRetention);
  $('btnBackupCleanupPreview').addEventListener('click',inspectCleanup);
  $('btnBackupCleanupApply').addEventListener('click',applyCleanup);
  $('btnBackupCleanupCancel').addEventListener('click',()=>{
    resetCleanup();show(locale().cleanupCanceled);
  });
  $('backupRecoverySelect').addEventListener('change',resetCleanup);
  $('backupSealedSelect').addEventListener('change',resetCleanup);
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
window.ASI_BACKUP={renderPreview:setPreview,renderRetention,
  renderCleanupPreview,open:()=>{
  $('backupContent').hidden=false;render();$('backupCenter').scrollIntoView({block:'center'});
}};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
