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
    healthToggle:'Disaster Recovery & Integrity Health Check',healthTitle:'Disaster Recovery & Integrity Health Check',
    healthNotice:'Offline read-only scan. Encrypted archives are NOT authenticated until you verify one with its password. No automatic repair or deletion.',
    healthRun:'Scan local recovery health',healthEmpty:'Run a local scan. No file changes will be made.',
    healthArchiveLabel:'Encrypted archives',healthVerify:'Authenticate selected archive with password',
    healthQuarantineLabel:'Interrupted cleanup fragments',healthPreview:'Inspect selected rescue',
    healthRescueTitle:'Manual fragment rescue preview',
    healthRescueNotice:'RESCUE only returns remaining .cleanup-pending files to original safety-copy names. Missing parts are NOT rebuilt; active Android data and encrypted archives stay unchanged.',
    healthRescueApply:'Rescue fragments after confirmation',healthRescueCancel:'Cancel rescue preview',
    healthAsk:'Type RESCUE to move surviving cleanup fragments back to their safety-copy names. It does not recreate deleted data.',
    healthConfirm:'Rescue ONLY surviving cleanup fragments? Live Android data and encrypted archives will not be changed.',
    healthResult:'Local health scan completed (read-only).',healthArchiveOk:'Encrypted archive authenticated. Files: ',
    healthRescueDone:'Remaining fragments moved back into safety copies. This may still be a partial recovery.',
    healthRescueNone:'No orphaned cleanup fragments available for rescue.',
    healthNoArchive:'Choose a listed encrypted archive before verifying it.',
    drillToggle:'Recovery Readiness & Restore Drill',drillTitle:'Recovery Readiness & Restore Drill',
    drillNotice:'Full encrypted authentication and target-drive space preflight; then a staged restore/rollback using only synthetic temporary files. No plaintext backup data written, no Android boot or live-profile modifications.',
    drillSealed:'Inspect selected encrypted Safety Vault archive',drillExternal:'Choose external encrypted backup for readiness',
    drillEmpty:'Select a backup and enter the password for a full integrity/readiness check.',
    drillSelect:'Find and select an encrypted Safety Vault archive first, or choose an external backup.',
    drillPreviewTitle:'Authenticated recovery-readiness preview',
    drillPreviewNotice:'Re-enter password, type DRILL and confirm. Simulated temporary staging tests generic OS rename operations only, not real AVD boot.',
    drillRun:'Run isolated synthetic restore drill',drillCancel:'Cancel drill preview',
    drillAsk:'Type DRILL to rehearse a staged restore/rollback with synthetic files only. Your real Android profile will not be modified.',
    drillConfirm:'Run the isolated synthetic drill? Every encrypted file will be authenticated again, and only synthetic data will be used for temporary file operations.',
    drillVerified:'Encrypted backup authenticated. Restore drill available.',
    drillDone:'Synthetic restore-and-rollback drill passed. Android guest boot and live restore were NOT tested.',
    drillWarning:'This DOES NOT prove an Android emulator will boot. Physical Windows and Android AVD recovery still need separate testing.',
    auditToggle:'Recovery Audit Trail & Verification Reports',auditTitle:'Recovery Audit Trail & Verification Reports',
    auditNotice:'Offline per-profile audit: event kinds, outcomes, file counts and opaque SHA-256 evidence IDs only. No passwords, raw file paths, tokens or Android app names. Local hash chain is NOT a digital signature.',
    auditView:'Verify event-chain integrity and view history',auditExport:'Export sanitized JSON verification report',
    auditEmpty:'No recovery verification events recorded yet.',auditFailed:'Audit integrity FAILED. History cannot be trusted or exported.',
    auditVerified:'Local audit chain verified',auditExported:'Verification report exported without overwriting an existing file.',
    auditWarning:'Warning: local unkeyed hash chains can be rewritten or truncated by disk administrators. PASS reflects only a historic test, not a live recovery guarantee.',
    auditPass:'Passed',auditFail:'Failed',auditCancel:'Cancelled',
    signingTitle:'Signed Verification Reports & External Checkpoints',
    signingNotice:'Optional Ed25519 signatures. The private key stays encrypted by your passphrase on this PC. Save the checkpoint and independently trusted public-key fingerprint OFF this PC. This is NOT cloud notarization or Android boot verification.',
    signingStatus:'Inspect signing identity',signingCreate:'Create encrypted Ed25519 key',
    signingCheckpoint:'Export independent checkpoint',signingReport:'Export signed verification report',
    signingVerify:'Verify external checkpoint or report',signingNone:'No signing identity created.',
    signingReady:'Signing identity ready. Trust fingerprint independently: ',
    signingAsk:'Type CREATE SIGNING KEY to create a new passphrase-encrypted signing identity. There is no automatic key recovery.',
    signingPassword:'Enter signing passphrase in Backup Password (12+ bytes). It is never stored.',
    signingMismatch:'Re-enter the same passphrase in Repeat Password.',
    signingSaved:'Signed evidence exported. Move checkpoint to independent storage and save fingerprint separately.',
    signingVerified:'Ed25519 signature and local audit checkpoint consistency PASS. Compare fingerprint with your independently trusted copy: ',
    signingCaveat:'A replaced signing key and local history can still fool checks if fingerprint/checkpoint are not trusted independently.',






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
    healthToggle:'Kiểm tra sức khỏe & Khôi phục sự cố',healthTitle:'Disaster Recovery & Integrity Health Check',
    healthNotice:'Chỉ kiểm tra offline. Bản mã hóa CHƯA được xác thực cho đến khi nhập mật khẩu để kiểm tra riêng. Không tự sửa hay xóa.',
    healthRun:'Quét tình trạng khôi phục',healthEmpty:'Hãy chạy kiểm tra cục bộ. Không thay đổi dữ liệu.',
    healthArchiveLabel:'Các bản mã hóa',healthVerify:'Xác thực bản mã hóa bằng mật khẩu',
    healthQuarantineLabel:'Mảnh dữ liệu dọn dẹp bị gián đoạn',healthPreview:'Xem trước RESCUE',
    healthRescueTitle:'Xem trước khôi phục các mảnh dữ liệu',
    healthRescueNotice:'RESCUE chỉ trả các file .cleanup-pending còn lại về tên bản an toàn cũ. KHÔNG dựng lại file đã xóa, không thay đổi Android đang dùng hoặc backup mã hóa.',
    healthRescueApply:'RESCUE sau khi xác nhận',healthRescueCancel:'Hủy xem trước',
    healthAsk:'Nhập RESCUE để trả những mảnh còn sót về tên bản an toàn. File đã xóa không thể tự dựng lại.',
    healthConfirm:'Chỉ đưa các mảnh còn lại về bản an toàn? Không sửa dữ liệu Android hoặc backup mã hóa.',
    healthResult:'Quét sức khỏe xong (chỉ đọc).',healthArchiveOk:'Bản mã hóa đã xác thực. Số file: ',
    healthRescueDone:'Đã đưa những mảnh còn lại về bản an toàn. Có thể vẫn thiếu file đã xóa.',
    healthRescueNone:'Không có phần dữ liệu dọn dẹp bị gián đoạn có thể RESCUE.',
    healthNoArchive:'Chọn bản mã hóa trước khi xác thực.',
    drillToggle:'Kiểm tra sẵn sàng & diễn tập khôi phục',drillTitle:'Recovery Readiness & Restore Drill',
    drillNotice:'Xác thực tất cả file mã hóa, kiểm tra ổ đĩa và diễn tập khôi phục/hoàn tác bằng file giả lập. Không ghi plaintext thật ra ổ, không mở Android, không sửa profile đang dùng.',
    drillSealed:'Kiểm tra bản Safety Vault mã hóa đã chọn',drillExternal:'Chọn backup mã hóa bên ngoài để kiểm tra',
    drillEmpty:'Chọn backup và nhập mật khẩu để xác thực khả năng khôi phục.',
    drillSelect:'Hãy tìm và chọn bản Safety Vault mã hóa, hoặc chọn backup bên ngoài.',
    drillPreviewTitle:'Xem trước kiểm tra khôi phục đã xác thực',
    drillPreviewNotice:'Nhập lại mật khẩu, gõ DRILL và xác nhận. Chỉ diễn tập đổi tên trên ổ tạm, không thử Android khởi động thật.',
    drillRun:'Diễn tập khôi phục bằng dữ liệu giả lập',drillCancel:'Hủy xem trước',
    drillAsk:'Nhập DRILL để diễn tập staging/rollback bằng file giả lập. Không thay đổi Android Profile thật.',
    drillConfirm:'Tiến hành diễn tập riêng biệt? Tất cả file mã hóa được xác thực lại, thao tác đĩa chỉ dùng dữ liệu giả lập.',
    drillVerified:'Backup mã hóa đã xác thực. Có thể diễn tập.',
    drillDone:'Diễn tập staging/rollback thành công. CHƯA thử khởi động Android hoặc khôi phục userdata thật.',
    drillWarning:'Diễn tập KHÔNG bảo đảm AVD khởi động. Vẫn phải kiểm thử khôi phục thực tế trên Windows.',
    auditToggle:'Nhật ký khôi phục & báo cáo kiểm chứng',auditTitle:'Recovery Audit Trail & Verification Reports',
    auditNotice:'Nhật ký riêng theo profile, chỉ lưu loại thao tác, kết quả, số file và mã SHA-256 ẩn danh. Không lưu mật khẩu, đường dẫn, token, tên app. Chuỗi hash cục bộ KHÔNG phải chữ ký số.',
    auditView:'Kiểm tra toàn vẹn và xem lịch sử',auditExport:'Xuất báo cáo kiểm chứng JSON đã ẩn dữ liệu nhạy cảm',
    auditEmpty:'Chưa có sự kiện kiểm chứng khôi phục.',auditFailed:'TOÀN VẸN NHẬT KÝ THẤT BẠI. Không thể tin hoặc xuất lịch sử.',
    auditVerified:'Đã xác minh chuỗi nhật ký cục bộ',auditExported:'Đã xuất báo cáo kiểm chứng, không ghi đè file cũ.',
    auditWarning:'Lưu ý: người có quyền sửa ổ đĩa vẫn có thể viết lại hoặc cắt nhật ký. PASS chỉ phản ánh kết quả kiểm tra trước đây, không bảo đảm khôi phục lúc này.',
    auditPass:'Đạt',auditFail:'Lỗi',auditCancel:'Đã hủy',
    signingTitle:'Báo cáo ký số & Checkpoint độc lập',
    signingNotice:'Chữ ký Ed25519 tùy chọn. Khóa riêng được mã hóa bằng mật khẩu trên máy. Lưu checkpoint và dấu vân tay khóa công khai ở nơi ĐỘC LẬP. Không phải công chứng trên cloud hay xác nhận Android khởi động.',
    signingStatus:'Kiểm tra khóa ký số',signingCreate:'Tạo khóa ký số Ed25519 mã hóa',
    signingCheckpoint:'Xuất checkpoint độc lập',signingReport:'Xuất báo cáo kiểm chứng ký số',
    signingVerify:'Đối chiếu checkpoint hoặc báo cáo bên ngoài',signingNone:'Chưa tạo khóa ký số.',
    signingReady:'Đã tạo khóa. Phải lưu dấu vân tay ở nơi độc lập: ',
    signingAsk:'Nhập CREATE SIGNING KEY để tạo khóa ký số mã hóa bằng mật khẩu. Không có cách tự khôi phục mật khẩu.',
    signingPassword:'Nhập mật khẩu khóa ký số ở ô Backup Password (tối thiểu 12 byte); không lưu mật khẩu.',
    signingMismatch:'Nhập lại đúng mật khẩu ở ô Repeat Password.',
    signingSaved:'Đã xuất bản ký số. Hãy lưu checkpoint và dấu vân tay khóa ở nơi độc lập.',
    signingVerified:'Chữ ký Ed25519 hợp lệ và lịch sử trùng checkpoint. Đối chiếu dấu vân tay với bản tin cậy: ',
    signingCaveat:'Nếu kẻ tấn công thay được cả khóa và nhật ký trên máy, việc kiểm tra không đáng tin khi chưa xác minh dấu vân tay/checkpoint độc lập.',






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
    healthToggle:'灾难恢复与完整性健康检查',healthTitle:'灾难恢复与完整性健康检查',
    healthNotice:'仅进行离线只读扫描。加密存档在输入密码完整验证前不能视为已认证。不会自动修复或删除。',
    healthRun:'扫描本地恢复健康状态',healthEmpty:'运行本地扫描，不会修改文件。',
    healthArchiveLabel:'加密存档',healthVerify:'输入密码认证所选存档',
    healthQuarantineLabel:'清理中断遗留文件',healthPreview:'预览 RESCUE',
    healthRescueTitle:'手动恢复残留文件预览',
    healthRescueNotice:'RESCUE 仅将剩余的 .cleanup-pending 文件返回原安全副本名称。不能重建已删除数据，不触碰当前 Android 和加密存档。',
    healthRescueApply:'确认后恢复残留文件',healthRescueCancel:'取消预览',
    healthAsk:'输入 RESCUE 将剩余文件恢复为原安全副本名称，已删除的数据不会重建。',
    healthConfirm:'仅恢复剩余的安全副本片段？不会修改当前 Android 或加密存档。',
    healthResult:'只读健康扫描完成。',healthArchiveOk:'加密存档验证通过。文件数：',
    healthRescueDone:'残留文件已返回安全副本位置，但可能缺少已删除部分。',
    healthRescueNone:'没有可恢复的清理中断残留文件。',
    healthNoArchive:'先选择一个加密存档。',
    drillToggle:'恢复就绪检查与还原演练',drillTitle:'恢复就绪检查与还原演练',
    drillNotice:'验证所有加密文件及磁盘空间，再仅使用合成临时数据模拟阶段还原与回滚。不写入真实备份明文，不启动 Android，不修改运行中的环境。',
    drillSealed:'检查选定的加密安全存档',drillExternal:'选择外部加密备份以检查就绪性',
    drillEmpty:'选择加密备份并输入密码进行完整验证。',
    drillSelect:'先查找并选择加密安全存档，或选择外部备份。',
    drillPreviewTitle:'已认证的恢复就绪预览',
    drillPreviewNotice:'再次输入密码，输入 DRILL 并确认。仅在临时盘模拟重命名，不检验真实 Android 启动。',
    drillRun:'运行隔离式合成还原演练',drillCancel:'取消演练预览',
    drillAsk:'输入 DRILL 以合成数据进行阶段还原与回滚演练，不修改真实 Android 环境。',
    drillConfirm:'运行隔离式演练？所有加密文件将重新认证，临时文件仅包含合成数据。',
    drillVerified:'加密备份验证通过，可执行演练。',
    drillDone:'合成阶段还原与回滚演练通过；未测试 Android 系统启动及真实恢复。',
    drillWarning:'此演练不能保证 AVD 能启动，仍需在实际 Windows 机器测试。',
    auditToggle:'恢复审计记录与验证报告',auditTitle:'恢复审计记录与验证报告',
    auditNotice:'仅记录当前环境的事件类型、结果、文件数及匿名 SHA-256 标识，不记录密码、路径、令牌或 Android 应用名称。链式哈希不是数字签名。',
    auditView:'验证日志完整性并查看记录',auditExport:'导出脱敏 JSON 验证报告',
    auditEmpty:'暂无恢复验证记录。',auditFailed:'审计日志完整性验证失败。不能信任或导出。',
    auditVerified:'本地审计哈希链验证通过',auditExported:'已导出验证报告，没有覆盖现有文件。',
    auditWarning:'注意：拥有磁盘访问权限的管理员仍可重写或截断链式日志。PASS 仅代表历史检查结果，不能证明当前仍可恢复。',
    auditPass:'成功',auditFail:'失败',auditCancel:'已取消',
    signingTitle:'签名验证报告与外部检查点',
    signingNotice:'可选 Ed25519 签名。私钥由密码加密保存在本机。请将检查点和可信公钥指纹独立保存到其他设备。并非云端公证或 Android 启动验证。',
    signingStatus:'查看签名密钥状态',signingCreate:'创建加密 Ed25519 签名密钥',
    signingCheckpoint:'导出独立检查点',signingReport:'导出签名验证报告',
    signingVerify:'验证外部检查点或报告',signingNone:'尚未创建签名密钥。',
    signingReady:'签名密钥已建立。请在其他位置保存公钥指纹：',
    signingAsk:'输入 CREATE SIGNING KEY 创建由密码保护的新签名密钥。无法自动恢复密码。',
    signingPassword:'在备份密码栏输入签名密码（至少12字节），程序不会保存。',
    signingMismatch:'在确认密码栏再次输入同一密码。',
    signingSaved:'已导出签名材料。请在独立位置保存检查点和可信指纹。',
    signingVerified:'Ed25519 签名与本地历史一致。请核对独立保存的公钥指纹：',
    signingCaveat:'若攻击者同时替换本机密钥与历史，没有独立可信的指纹和检查点则无法检测。',






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
let preview=null,cleanupPreview=null,healthRescuePreview=null,drillPreview=null,busy=false,auditWarningMessage='';
function show(msg,error=false){$('backupProgress').textContent=String(msg)+(auditWarningMessage?'\nAudit warning: '+auditWarningMessage:'');$('backupProgress').style.color=error||auditWarningMessage?'#c0392b':'';}
function noticeAudit(result){if(result?.auditWarning)auditWarningMessage=result.auditWarning;}
function lock(on){
  if(on)auditWarningMessage='';
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
  $('btnBackupHealthToggle').disabled=on;
  $('btnBackupHealthRun').disabled=on;
  $('btnBackupHealthVerify').disabled=on||!$('backupHealthArchiveSelect').value;
  $('backupHealthArchiveSelect').disabled=on;
  $('backupHealthQuarantineSelect').disabled=on;
  $('btnBackupRescuePreview').disabled=on||!$('backupHealthQuarantineSelect').value;
  $('btnBackupRescueApply').disabled=on||!healthRescuePreview;
  $('btnBackupRescueCancel').disabled=on||!healthRescuePreview;
  $('btnBackupDrillToggle').disabled=on;
  $('btnBackupDrillSealed').disabled=on;
  $('btnBackupDrillExternal').disabled=on;
  $('btnBackupDrillRun').disabled=on||!drillPreview;
  $('btnBackupDrillCancel').disabled=on||!drillPreview;
  $('btnBackupAuditToggle').disabled=on;
  $('btnBackupAuditView').disabled=on;
  $('btnBackupAuditExport').disabled=on;
  $('btnBackupSigningStatus').disabled=on;
  $('btnBackupSigningCreate').disabled=on;
  $('btnBackupSigningCheckpoint').disabled=on;
  $('btnBackupSigningReport').disabled=on;
  $('btnBackupSigningVerify').disabled=on;
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
  $('btnBackupHealthToggle').textContent=L.healthToggle;
  $('btnBackupHealthToggle').setAttribute('aria-expanded',String(!$('backupHealthPanel').hidden));
  $('backupHealthTitle').textContent=L.healthTitle;
  $('backupHealthNotice').textContent=L.healthNotice;
  $('btnBackupHealthRun').textContent=L.healthRun;
  $('backupHealthArchiveLabel').textContent=L.healthArchiveLabel;
  $('btnBackupHealthVerify').textContent=L.healthVerify;
  $('backupHealthQuarantineLabel').textContent=L.healthQuarantineLabel;
  $('btnBackupRescuePreview').textContent=L.healthPreview;
  $('backupRescueTitle').textContent=L.healthRescueTitle;
  $('backupRescueNotice').textContent=L.healthRescueNotice;
  $('btnBackupRescueApply').textContent=L.healthRescueApply;
  $('btnBackupRescueCancel').textContent=L.healthRescueCancel;
  $('btnBackupDrillToggle').textContent=L.drillToggle;
  $('btnBackupDrillToggle').setAttribute('aria-expanded',String(!$('backupDrillPanel').hidden));
  $('backupDrillTitle').textContent=L.drillTitle;
  $('backupDrillNotice').textContent=L.drillNotice;
  $('btnBackupDrillSealed').textContent=L.drillSealed;
  $('btnBackupDrillExternal').textContent=L.drillExternal;
  $('backupDrillPreviewTitle').textContent=L.drillPreviewTitle;
  $('backupDrillPreviewNotice').textContent=L.drillPreviewNotice;
  $('btnBackupDrillRun').textContent=L.drillRun;
  $('btnBackupDrillCancel').textContent=L.drillCancel;
  $('btnBackupAuditToggle').textContent=L.auditToggle;
  $('btnBackupAuditToggle').setAttribute('aria-expanded',String(!$('backupAuditPanel').hidden));
  $('backupAuditTitle').textContent=L.auditTitle;
  $('backupAuditNotice').textContent=L.auditNotice;
  $('btnBackupAuditView').textContent=L.auditView;
  $('btnBackupAuditExport').textContent=L.auditExport;
  $('backupSigningTitle').textContent=L.signingTitle;
  $('backupSigningNotice').textContent=L.signingNotice;
  $('btnBackupSigningStatus').textContent=L.signingStatus;
  $('btnBackupSigningCreate').textContent=L.signingCreate;
  $('btnBackupSigningCheckpoint').textContent=L.signingCheckpoint;
  $('btnBackupSigningReport').textContent=L.signingReport;
  $('btnBackupSigningVerify').textContent=L.signingVerify;
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
  noticeAudit(result);
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
function renderSigningStatus(r){
  const L=locale();
  $('backupSigningStatus').textContent=r?.initialized
    ?L.signingReady+r.fingerprint+'\n'+(r.warning||L.signingCaveat)
    :L.signingNone+'\n'+L.signingCaveat;
  lock(false);
}
function renderSigningVerification(r){
  const L=locale();
  $('backupSigningResult').textContent=(r?.ok
    ?L.signingVerified+r.fingerprint+'\n'+r.kind+' · '+r.checkpointEvents+
      ' / '+r.currentEvents+' events\n'+L.signingCaveat
    :L.signingCaveat);
  lock(false);
}
async function inspectSigning(){
  if(busy)return;
  lock(true);show(locale().working);
  try{renderSigningStatus(await api.signingStatus());}
  catch(e){show(locale().error+String(e?.message||e),true);}
  finally{lock(false);}
}
async function createSigning(){
  if(busy)return;
  const L=locale();
  let secret=$('backupPassword').value;
  if(!validPassword(secret)){show(L.signingPassword,true);return;}
  if(secret!==$('backupPasswordConfirm').value){show(L.signingMismatch,true);return;}
  if(window.prompt(L.signingAsk)!=='CREATE SIGNING KEY')return;
  lock(true);show(L.working);
  try{
    const task=api.signingInitialize(secret,'CREATE SIGNING KEY');
    clearPasswords();secret='';
    const result=await task;
    if(result?.canceled){show(L.canceled);return;}
    renderSigningStatus(result);show(L.signingReady+result.fingerprint);
  }catch(e){show(L.error+String(e?.message||e),true);}
  finally{secret='';clearPasswords();lock(false);}
}
async function exportSigned(kind){
  if(busy)return;
  const L=locale();
  let secret=$('backupPassword').value;
  if(!validPassword(secret)){show(L.signingPassword,true);return;}
  lock(true);show(L.working);
  try{
    const task=api.signingExport(kind,secret);
    clearPasswords();secret='';
    const result=await task;
    if(result?.canceled){show(L.canceled);return;}
    if(result?.ok){
      $('backupSigningResult').textContent=L.signingSaved+
        '\n'+result.fingerprint+' · '+result.events+' events\n'+result.warning;
      show(L.signingSaved);
    }
  }catch(e){show(L.error+String(e?.message||e),true);}
  finally{secret='';clearPasswords();lock(false);}
}
async function verifySigned(){
  if(busy)return;
  lock(true);show(locale().working);
  try{
    const result=await api.signingVerifyExternal();
    if(result?.canceled){show(locale().canceled);return;}
    renderSigningVerification(result);
    if(result?.ok)show(locale().signingVerified+result.fingerprint);
  }catch(e){show(locale().error+String(e?.message||e),true);}
  finally{lock(false);}
}
async function manageSigningKey(action){
  if(busy)return;
  const L=locale();
  // Existing password and confirmation fields are used as two distinct secrets.
  // Export/import: signing-key password then backup encryption password.
  // Rotation: old signing password then NEW signing password.
  let first=$('backupPassword').value,second=$('backupPasswordConfirm').value;
  if(!validPassword(first)||!validPassword(second)){
    show('Both password fields require a strong secret (12+ UTF-8 bytes).',true);return;
  }
  const ack=action==='import'?'IMPORT SIGNING KEY':action==='rotate'?'ROTATE SIGNING KEY':null;
  if(ack&&window.prompt('Type '+ack+' to approve this change')!==ack)return;
  lock(true);show(L.working);
  try{
    let task;
    if(action==='export')task=api.signingKeyExport(first,second);
    else if(action==='import')task=api.signingKeyImport(first,second,ack);
    else task=api.signingKeyRotate(first,second,ack);
    clearPasswords();first='';second='';
    const result=await task;
    if(result?.canceled){show(L.canceled);return;}
    $('backupSigningResult').textContent='Signing key '+action+' completed.\n'+
      (result.fingerprint||result.newFingerprint||'')+'\n'+(result.warning||'');
    show('Signing key '+action+' completed.');
    renderSigningStatus(await api.signingStatus());
  }catch(e){show(L.error+String(e?.message||e),true);}
  finally{first='';second='';clearPasswords();lock(false);}
}
function renderAudit(result){
  const L=locale();
  if(!result||result.integrity!=='verified'){
    $('backupAuditSummary').textContent=L.auditFailed;
    $('backupAuditEvents').textContent='';
    lock(false);
    $('btnBackupAuditExport').disabled=true;
    return;
  }
  const t=result.totals||{};
  $('backupAuditSummary').textContent=[
    L.auditVerified+' · '+result.eventsCount+' events',
    L.auditPass+': '+(t.passed||0)+' · '+L.auditFail+': '+(t.failed||0)+
      ' · '+L.auditCancel+': '+(t.cancelled||0),
    'SHA-256 head: '+result.head.slice(0,16)+'…',
    L.auditWarning,
  ].join('\n');
  $('backupAuditEvents').textContent=(result.events||[]).length
    ?result.events.map(e=>e.timestamp+' · '+e.event+' · '+e.status+
      ' · '+e.source+' · '+(e.files===null?'—':e.files)+' files'+
      (e.synthetic?' · synthetic':'')).join('\n')
    :L.auditEmpty;
  lock(false);
}
async function inspectAudit(){
  if(busy)return;
  lock(true);show(locale().working);
  try{
    const summary=await api.auditSummary();
    renderAudit(summary);
    show(summary.integrity==='verified'?locale().auditVerified:locale().auditFailed,
      summary.integrity!=='verified');
  }catch(e){show(locale().error+String(e?.message||e),true);}
  finally{lock(false);}
}
async function exportAudit(){
  if(busy)return;
  lock(true);show(locale().working);
  try{
    const result=await api.auditExport();
    if(result?.canceled){show(locale().canceled);return;}
    if(result?.ok)show(locale().auditExported+' '+result.events+' events');
  }catch(e){show(locale().error+String(e?.message||e),true);}
  finally{lock(false);}
}
function resetDrill(){
  const token=drillPreview?.token;
  drillPreview=null;$('backupDrillPreviewPanel').hidden=true;
  if(token)api.drillCancel(token).catch(()=>{});
  lock(false);
}
function renderDrillPreview(result){
  if(!result?.token)return;
  noticeAudit(result);
  drillPreview=result;
  $('backupDrillPreviewPanel').hidden=false;
  const L=locale();
  const lines=[
    L.drillVerified,
    L.current+result.profileId,
    L.files+result.files,
    L.bytes+fmt(result.bytes),
    L.parts+result.components.join(', '),
    L.date+result.createdAt,
    'Backup age: '+result.ageDays+' days',
    ...(result.diskSpace||[]).map(d=>'Target volume free '+fmt(d.availableBytes)+' / required '+fmt(d.requiredBytes)),
    ...(result.warnings||[]),
    'Preview expires at: '+result.expiresAt
  ];
  $('backupDrillPreviewDetails').textContent=lines.join('\n');
  $('backupDrillSummary').textContent=L.drillVerified+' '+L.drillWarning;
  lock(false);
}
function renderDrillResult(result){
  if(!result?.ok||!result.drill)return;
  const L=locale();
  drillPreview=null;$('backupDrillPreviewPanel').hidden=true;
  $('backupDrillSummary').textContent=[
    L.drillDone,
    L.files+result.filesVerified,
    L.bytes+fmt(result.bytesVerified),
    L.parts+result.syntheticStages.join(', '),
    L.drillWarning
  ].join('\n');
  lock(false);
}
async function previewDrill(kind){
  if(busy)return;
  const L=locale();
  if(kind==='sealed'&&($('backupSealedChoices').hidden||!$('backupSealedSelect').value)){
    show(L.drillSelect,true);return;
  }
  let secret=$('backupPassword').value;
  if(!validPassword(secret)){show(L.passTooShort,true);return;}
  resetDrill();lock(true);show(L.working);
  try{
    const request=kind==='sealed'
      ?api.drillSealedPreview($('backupSealedSelect').value,secret)
      :api.drillExternalPreview(secret);
    clearPasswords();secret='';
    const result=await request;
    noticeAudit(result);
    noticeAudit(result);
    if(result?.canceled){show(L.canceled);return;}
    renderDrillPreview(result);show(L.drillVerified);
  }catch(e){show(L.error+String(e?.message||e),true);}
  finally{secret='';clearPasswords();lock(false);}
}
async function runDrill(){
  if(busy||!drillPreview)return;
  const L=locale();
  let secret=$('backupPassword').value;
  if(!validPassword(secret)){show(L.passTooShort,true);return;}
  if(window.prompt(L.drillAsk)!=='DRILL')return;
  if(!window.confirm(L.drillConfirm))return;
  const token=drillPreview.token;
  drillPreview=null;$('backupDrillPreviewPanel').hidden=true;
  lock(true);show(L.working);
  try{
    const request=api.drillRun(token,secret,'DRILL');
    clearPasswords();secret='';
    const result=await request;
    noticeAudit(result);
    if(result?.canceled){show(L.canceled);return;}
    if(result?.ok){renderDrillResult(result);show(L.drillDone);}
  }catch(e){show(L.error+String(e?.message||e),true);}
  finally{secret='';clearPasswords();lock(false);}
}
function resetHealthRescue(){
  const token=healthRescuePreview?.token;
  healthRescuePreview=null;
  $('backupRescuePreviewPanel').hidden=true;
  if(token)api.rescueCancel(token).catch(()=>{});
  lock(false);
}
function renderHealthReport(report){
  if(!report)return;
  resetHealthRescue();
  const L=locale();
  const archives=$('backupHealthArchiveSelect'),quarantines=$('backupHealthQuarantineSelect');
  archives.replaceChildren();quarantines.replaceChildren();
  for(const archive of report.archives||[]){
    const o=document.createElement('option');
    o.value=archive.id;o.textContent=archive.createdAt+' · '+archive.id.slice(7);
    archives.appendChild(o);
  }
  for(const fragment of report.quarantine||[]){
    const o=document.createElement('option');
    o.value=fragment.id;
    o.textContent=fragment.pointId+' · '+fragment.components.join(', ')+
      (fragment.rescuable?'':' · REVIEW ONLY');
    o.disabled=!fragment.rescuable;
    quarantines.appendChild(o);
  }
  const rows=[
    L.healthResult,
    L.current+report.profileId,
    'Plaintext points: '+report.localRecoveryPoints,
    'Encrypted archive entries (not authenticated): '+report.encryptedArchives,
    'Cleanup-pending groups: '+(report.quarantine||[]).length,
    'Interrupted restore stages: '+(report.stages||[]).length,
    'Unpublished encrypted folders: '+(report.partialArchives||[]).length,
    'Issues: '+(report.issues||[]).length,
    ...(report.quarantine||[]).slice(0,15).map(q=>
      (q.rescuable?'FRAGMENT':'REVIEW')+' · '+q.pointId+' · '+fmt(q.bytes||0)),
    ...(report.stages||[]).slice(0,10).map(q=>'RESTORE STAGE · '+q.component),
    ...(report.partialArchives||[]).slice(0,10).map(q=>'PARTIAL · '+q.name),
    ...(report.issues||[]).slice(0,10).map(q=>'ATTENTION · '+(q.type||'unknown')+': '+q.reason),
    'No automatic repair or deletion. Fragment rescue does not reconstruct lost files.'
  ];
  $('backupHealthSummary').textContent=rows.join('\n');
  lock(false);
}
function renderRescuePreview(result){
  if(!result?.token)return;
  healthRescuePreview=result;
  $('backupRescuePreviewPanel').hidden=false;
  $('backupRescueDetails').textContent=
    locale().current+result.profileId+'\n'+result.id+'\n'+
    locale().files+result.files+'\n'+locale().bytes+fmt(result.bytes)+'\n'+
    locale().parts+result.components.join(', ')+'\nExpires: '+result.expiresAt;
  lock(false);
}
async function runHealth(){
  if(busy)return;
  const L=locale();resetHealthRescue();lock(true);show(L.working);
  try{
    const report=await api.healthReport();renderHealthReport(report);show(L.healthResult);
  }catch(e){show(L.error+String(e?.message||e),true);}
  finally{lock(false);}
}
async function verifyHealthArchive(){
  if(busy)return;
  const L=locale(),id=$('backupHealthArchiveSelect').value;
  if(!id){show(L.healthNoArchive,true);return;}
  let password=$('backupPassword').value;
  if(!validPassword(password)){show(L.passTooShort,true);return;}
  lock(true);show(L.working);
  try{
    const request=api.healthVerify(id,password);
    clearPasswords();password='';
    const result=await request;
    noticeAudit(result);
    $('backupHealthSummary').textContent+=
      '\n'+L.healthArchiveOk+result.files+' · '+fmt(result.bytes)+' · '+id;
    show(L.healthArchiveOk+result.files);
  }catch(e){show(L.error+String(e?.message||e),true);}
  finally{password='';clearPasswords();lock(false);}
}
async function previewHealthRescue(){
  if(busy)return;
  const id=$('backupHealthQuarantineSelect').value;
  if(!id){show(locale().healthRescueNone,true);return;}
  resetHealthRescue();lock(true);show(locale().working);
  try{renderRescuePreview(await api.rescuePreview(id));}
  catch(e){show(locale().error+String(e?.message||e),true);}
  finally{lock(false);}
}
async function applyHealthRescue(){
  if(busy||!healthRescuePreview)return;
  const L=locale();
  if(window.prompt(L.healthAsk)!=='RESCUE')return;
  if(!window.confirm(L.healthConfirm))return;
  const token=healthRescuePreview.token;
  healthRescuePreview=null;$('backupRescuePreviewPanel').hidden=true;
  lock(true);show(L.working);
  try{
    const result=await api.rescueApply(token,'RESCUE');
    if(result?.canceled){show(L.canceled);return;}
    if(result?.ok){
      renderHealthReport(await api.healthReport());
      show(L.healthRescueDone);
    }
  }catch(e){show(L.error+String(e?.message||e),true);}
  finally{lock(false);}
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
    noticeAudit(result);
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
    noticeAudit(result);
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
    noticeAudit(result);
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
  $('btnBackupHealthToggle').addEventListener('click',()=>{
    $('backupHealthPanel').hidden=!$('backupHealthPanel').hidden;render();
  });
  $('btnBackupHealthRun').addEventListener('click',runHealth);
  $('btnBackupDrillToggle').addEventListener('click',()=>{
    $('backupDrillPanel').hidden=!$('backupDrillPanel').hidden;render();
  });
  $('btnBackupDrillSealed').addEventListener('click',()=>previewDrill('sealed'));
  $('btnBackupDrillExternal').addEventListener('click',()=>previewDrill('external'));
  $('btnBackupDrillRun').addEventListener('click',runDrill);
  $('btnBackupAuditToggle').addEventListener('click',()=>{
    $('backupAuditPanel').hidden=!$('backupAuditPanel').hidden;render();
  });
  $('btnBackupAuditView').addEventListener('click',inspectAudit);
  $('btnBackupAuditExport').addEventListener('click',exportAudit);
  $('btnBackupSigningStatus').addEventListener('click',inspectSigning);
  $('btnBackupSigningCreate').addEventListener('click',createSigning);
  $('btnBackupSigningCheckpoint').addEventListener('click',()=>exportSigned('checkpoint'));
  $('btnBackupSigningReport').addEventListener('click',()=>exportSigned('report'));
  $('btnBackupSigningVerify').addEventListener('click',verifySigned);
  $('btnBackupSigningKeyExport').addEventListener('click',()=>manageSigningKey('export'));
  $('btnBackupSigningKeyImport').addEventListener('click',()=>manageSigningKey('import'));
  $('btnBackupSigningKeyRotate').addEventListener('click',()=>manageSigningKey('rotate'));
  $('btnBackupDrillCancel').addEventListener('click',()=>{
    resetDrill();show(locale().canceled);
  });
  $('btnBackupHealthVerify').addEventListener('click',verifyHealthArchive);
  $('btnBackupRescuePreview').addEventListener('click',previewHealthRescue);
  $('btnBackupRescueApply').addEventListener('click',applyHealthRescue);
  $('btnBackupRescueCancel').addEventListener('click',()=>{
    resetHealthRescue();show(locale().canceled);
  });
  $('backupHealthQuarantineSelect').addEventListener('change',resetHealthRescue);
  $('backupHealthArchiveSelect').addEventListener('change',resetHealthRescue);
  $('btnBackupCleanupPreview').addEventListener('click',inspectCleanup);
  $('btnBackupCleanupApply').addEventListener('click',applyCleanup);
  $('btnBackupCleanupCancel').addEventListener('click',()=>{
    resetCleanup();show(locale().cleanupCanceled);
  });
  $('backupRecoverySelect').addEventListener('change',resetCleanup);
  $('backupSealedSelect').addEventListener('change',resetCleanup);
  $('backupSealedSelect').addEventListener('change',resetDrill);
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
  renderCleanupPreview,renderHealthReport,renderRescuePreview,renderDrillPreview,renderDrillResult,
  renderAudit,renderSigningStatus,renderSigningVerification,open:()=>{
  $('backupContent').hidden=false;render();$('backupCenter').scrollIntoView({block:'center'});
}};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
