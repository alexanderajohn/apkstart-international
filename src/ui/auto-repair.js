/* Auto-Repair 2.0: opt-in fixes on top of read-only local evidence. */
(function () {
'use strict';
const $ = (id) => document.getElementById(id);
const LANG = {
  en:{
    subtitle:'Read-only diagnosis · repairs require your approval',
    scan:'Analyze problems', scanning:'Checking Android environment…',
    none:'No known startup issue detected by current checks.',
    empty:'Run the diagnosis to inspect the Android runtime and recent boot failures.',
    summary:'Detected issues', safe:'Apply safe setting changes',
    safeNote:'Only applies software GPU and Quick Boot settings. No app data or snapshots are deleted.',
    manual:'Manual action', apply:'Apply safe fix', openFeatures:'Open Windows Features',
    exporting:'Export privacy-safe report', export:'Export diagnostic report',
    refreshed:'Diagnostic checks completed', actionDone:'Setting saved. It takes effect at the next Android start.',
    adbOnline:'ADB connection restored', adbFailed:'ADB still offline. Check emulator status or USB debugging prompt.',
    confirm:'Apply this safe repair? It may change an emulator setting or briefly reconnect the isolated ADB server. No app data will be deleted.',
    confirmAll:'Apply suggested non-destructive GPU/Quick Boot settings? No files, snapshots or Android app data will be deleted.',
    error:'Diagnosis/repair failed. No data reset was requested.',
    requiresApproval:'Nothing has been changed automatically.',
    GPU_FAILURE:['GPU rendering failed','Try software GPU rendering on the NEXT Android start. This may be slower; it will not reset apps.'],
    SNAPSHOT_FAILURE:['Quick Boot snapshot issue','Disable snapshot loading/saving on the next launch. Existing snapshots and Android data stay intact.'],
    ADB_OFFLINE:['ADB device is offline','Reconnect the application-owned ADB server on port 5044 only. This can briefly interrupt the current emulator session.'],
    ADB_UNAUTHORIZED:['Android debugging requires consent','Unlock the Android window and respond to its debugging authorization prompt. Do not bypass it.'],
    HYPERVISOR:['Hardware virtualization unavailable','Check BIOS virtualization and Windows Hypervisor Platform. Enabling it may require administrator privileges and a reboot.'],
    MISSING_ADB:['ADB component missing','Use the Runtime setup in this window to install the official ADB tools.'],
    MISSING_EMULATOR:['Android Emulator missing','Use Runtime setup to download the emulator before launching APKs.'],
    MISSING_IMAGE:['Android system image missing','Download a supported Android system image in Runtime setup.'],
    DISK_FULL:['Storage capacity exhausted','Free disk space or move the runtime directory. Never reset Android data as a quick fix.'],
    MEMORY:['Memory allocation failed','Close heavy apps or manually lower emulator RAM in Performance settings.'],
    PORT_BUSY:['Emulator port in use','Close conflicting emulators or change the emulator port; do not terminate unrelated processes.'],
    AVD_LOCK:['AVD lock is in use','Check for an active emulator before cleaning any lock. No lock is automatically deleted.'],
    IMAGE_FAILURE:['System image problem','Inspect logs and verify system image files. Do not wipe user data automatically.'],
    DLL_MISSING:['Windows runtime library missing','Install the official Microsoft Visual C++ redistributable and inspect antivirus quarantine.'],
    UNKNOWN_FAILURE:['Startup failure needs review','Export the privacy-safe diagnostic report and inspect it before sharing.'],
  },
  vi:{
    subtitle:'Chẩn đoán chỉ đọc · sửa lỗi phải được anh xác nhận',
    scan:'Kiểm tra lỗi',scanning:'Đang kiểm tra môi trường Android…',
    none:'Chưa tìm thấy lỗi khởi động rõ ràng trong các phép kiểm tra hiện tại.',
    empty:'Bấm kiểm tra để xem môi trường Android và những lỗi khởi động gần nhất.',
    summary:'Vấn đề phát hiện',safe:'Áp dụng thiết lập sửa lỗi an toàn',
    safeNote:'Chỉ đổi cấu hình GPU software và Quick Boot. Không xóa dữ liệu hay snapshot.',
    manual:'Thao tác thủ công',apply:'Áp dụng sửa lỗi',openFeatures:'Mở tính năng Windows',
    exporting:'Xuất chẩn đoán bảo vệ riêng tư',export:'Xuất báo cáo chẩn đoán',
    refreshed:'Đã kiểm tra xong',actionDone:'Đã lưu thiết lập. Thay đổi có hiệu lực ở lần mở Android tiếp theo.',
    adbOnline:'Đã khôi phục kết nối ADB',adbFailed:'ADB vẫn offline. Hãy kiểm tra máy ảo hoặc hộp thoại cấp quyền gỡ lỗi.',
    confirm:'Áp dụng sửa lỗi an toàn? Có thể thay đổi cấu hình Android hoặc kết nối lại ADB cổng riêng. Không xóa dữ liệu ứng dụng.',
    confirmAll:'Áp dụng các thiết lập GPU/Quick Boot an toàn? Không xóa file, snapshot hay dữ liệu ứng dụng Android.',
    actionUnavailable:'Lựa chọn này không còn phù hợp sau khi kiểm tra lại.',
    error:'Không thể hoàn tất chẩn đoán/sửa lỗi; không có yêu cầu reset dữ liệu.',
    requiresApproval:'Không có thay đổi nào được tự động thực hiện.',
    GPU_FAILURE:['Lỗi đồ họa GPU','Thử chế độ GPU software ở lần khởi động Android tiếp theo. Có thể chậm hơn nhưng không reset ứng dụng.'],
    SNAPSHOT_FAILURE:['Lỗi Quick Boot snapshot','Tắt tải/lưu Quick Boot ở lần mở sau. Snapshot cũ và dữ liệu Android vẫn giữ nguyên.'],
    ADB_OFFLINE:['ADB đang offline','Chỉ kết nối lại ADB riêng của ứng dụng trên cổng 5044. Có thể gián đoạn kết nối máy ảo trong chốc lát.'],
    ADB_UNAUTHORIZED:['Android yêu cầu cấp quyền gỡ lỗi','Mở cửa sổ Android rồi tự xác nhận hộp thoại cấp quyền. Không tự bỏ qua bước này.'],
    HYPERVISOR:['Chưa có tăng tốc phần cứng','Kiểm tra ảo hóa BIOS và Windows Hypervisor Platform; thao tác bật có thể cần quyền quản trị và khởi động lại.'],
    MISSING_ADB:['Thiếu ADB','Dùng mục Thiết lập môi trường Android để cài bộ công cụ ADB chính thức.'],
    MISSING_EMULATOR:['Thiếu Android Emulator','Dùng mục thiết lập Runtime để tải bộ giả lập.'],
    MISSING_IMAGE:['Thiếu ảnh hệ thống Android','Tải ảnh hệ thống hỗ trợ từ phần Thiết lập Runtime.'],
    DISK_FULL:['Ổ đĩa thiếu chỗ trống','Dọn dung lượng hoặc chuyển thư mục runtime; không reset dữ liệu Android để sửa nhanh.'],
    MEMORY:['Không cấp phát được RAM','Đóng ứng dụng nặng hoặc giảm RAM máy ảo thủ công trong Settings.'],
    PORT_BUSY:['Cổng Emulator đã bị chiếm','Đóng ứng dụng đang dùng cổng hoặc thay cổng emulator; không tắt tiến trình không liên quan.'],
    AVD_LOCK:['AVD còn khóa đang sử dụng','Kiểm tra máy ảo còn chạy trước khi đụng file khóa. Không tự xóa lock.'],
    IMAGE_FAILURE:['Lỗi ảnh hệ thống','Kiểm tra log và file ảnh hệ thống; không xóa dữ liệu người dùng tự động.'],
    DLL_MISSING:['Thiếu thư viện Windows','Cài Microsoft Visual C++ Redistributable chính thức, kiểm tra file bị antivirus cách ly.'],
    UNKNOWN_FAILURE:['Cần xem thêm lỗi khởi động','Xuất báo cáo chẩn đoán đã che thông tin riêng tư và kiểm tra trước khi chia sẻ.'],
  },
  'zh-CN':{
    subtitle:'只读诊断 · 修复必须由用户确认',
    scan:'检查问题',scanning:'正在检查 Android 环境…',
    none:'当前检查未发现明确的启动故障。',
    empty:'运行诊断以查看 Android 环境与最近的开机故障。',
    summary:'发现的问题',safe:'应用安全设置修复',
    safeNote:'只调整 GPU 与 Quick Boot 设置，不删除应用数据或快照。',
    manual:'手动操作',apply:'应用修复',openFeatures:'打开 Windows 功能',
    exporting:'导出隐私安全报告',export:'导出诊断报告',
    refreshed:'诊断检查完成',actionDone:'已保存设置，下次启动 Android 时生效。',
    adbOnline:'ADB 已重新连接',adbFailed:'ADB 仍然离线，请检查模拟器与授权提示。',
    confirm:'确认应用安全修复？只更改模拟器设置或重连独立 ADB 端口，不删除应用数据。',
    confirmAll:'确认应用 GPU/Quick Boot 安全设置？不会删除文件、快照或 Android 应用数据。',
    actionUnavailable:'重新诊断后此操作已不可用。',
    error:'诊断或修复失败，未执行数据重置。',
    requiresApproval:'未自动执行任何修改。',
    GPU_FAILURE:['GPU 渲染失败','下次启动尝试软件 GPU，可能会变慢，不重置应用。'],
    SNAPSHOT_FAILURE:['Quick Boot 快照故障','下次启动禁用快照读写，旧快照和 Android 数据保留。'],
    ADB_OFFLINE:['ADB 设备离线','仅重连应用独立的 5044 ADB 服务，可能短暂中断连接。'],
    ADB_UNAUTHORIZED:['Android 调试授权未完成','在 Android 窗口手动同意调试授权，不自动绕过。'],
    HYPERVISOR:['硬件虚拟化不可用','检查 BIOS 虚拟化与 Windows Hypervisor Platform，可能需要管理员权限与重启。'],
    MISSING_ADB:['缺少 ADB','使用运行时设置安装官方 ADB 组件。'],
    MISSING_EMULATOR:['缺少 Android Emulator','使用运行时设置下载模拟器。'],
    MISSING_IMAGE:['缺少系统镜像','在运行时设置中下载支持的 Android 镜像。'],
    DISK_FULL:['磁盘空间不足','清理磁盘或移动运行时目录，不要为了修复而重置 Android 数据。'],
    MEMORY:['内存不足','关闭占内存的程序或手动降低模拟器内存设置。'],
    PORT_BUSY:['模拟器端口占用','检查其他模拟器或端口设置，不强杀无关进程。'],
    AVD_LOCK:['AVD 文件锁','先确认模拟器是否运行，不自动删除锁。'],
    IMAGE_FAILURE:['系统镜像异常','查看日志与镜像文件，不自动清除用户数据。'],
    DLL_MISSING:['缺少 Windows DLL','安装微软官方 VC++ 运行库并检查杀毒隔离。'],
    UNKNOWN_FAILURE:['启动失败需排查','导出并检查隐私安全诊断报告后再共享。'],
  },
};
function language() {
  const code=window.ASI_I18N?.getLanguage?.()||navigator.language||'en';
  return /^vi/i.test(code)?LANG.vi:/^zh/i.test(code)?LANG['zh-CN']:LANG.en;
}
function el(tag,cls,text) {
  const node=document.createElement(tag);
  if(cls)node.className=cls;
  if(text!=null)node.textContent=String(text);
  return node;
}
function button(text,fn,cls='btn ghost sm') {
  const b=el('button',cls,text);b.type='button';
  b.addEventListener('click',fn);
  return b;
}
let busy=false;
let latest=null;
function showMessage(value,kind='info') {
  const box=$('autoRepairResults');
  const p=el('p','asi-ar-msg '+kind,value);
  box.prepend(p);
}
function render(plan) {
  const L=language(), box=$('autoRepairResults');
  latest=plan;
  box.replaceChildren();
  if(!plan.items?.length) {
    box.append(el('p','asi-ar-ok',L.none));
    return;
  }
  box.append(el('p','asi-ar-summary',L.summary+': '+plan.items.length+' · '+L.requiresApproval));
  for(const issue of plan.items) {
    const pair=L[issue.code]||[issue.code,L.manual];
    const card=el('div','asi-ar-item '+issue.severity);
    const heading=el('strong','asi-ar-title',pair[0]);
    const desc=el('p','asi-ar-help',pair[1]);
    card.append(heading,desc);
    if(issue.action) {
      card.append(button(L.apply,()=>applyOne(issue.action)));
    } else if(issue.code==='HYPERVISOR' && window.apkstart.openWindowsFeatures) {
      card.append(button(L.openFeatures,async()=>{
        try { await window.apkstart.openWindowsFeatures(); }
        catch(e) { showMessage(L.error+' '+String(e?.message||''),'error'); }
      }));
    }
    box.append(card);
  }
  const footer=el('div','asi-ar-actions');
  const safe=plan.safeActions?.filter(a=>a==='gpu-software'||a==='snapshot-disable')||[];
  if(safe.length)footer.append(button(L.safe,()=>applyBatch(safe),'btn primary sm'));
  footer.append(button(L.export,async()=>{
    try { await window.apkstart.doctorReport(); }
    catch(e) { showMessage(L.error+' '+String(e?.message||''),'error'); }
  }));
  box.append(footer,el('p','asi-ar-note',L.safeNote));
}
async function scan() {
  if(busy)return;
  busy=true;
  const L=language(),btn=$('btnAutoRepairScan');
  btn.disabled=true;
  $('autoRepairTitle').textContent='Android Auto-Repair 2.0';
  $('autoRepairCaption').textContent=L.subtitle;
  btn.textContent=L.scan;
  $('autoRepairResults').replaceChildren(el('p','asi-ar-msg',L.scanning));
  try { render(await window.apkstart.autoRepairPlan()); }
  catch(e){latest=null;showMessage(L.error+' '+String(e?.message||''),'error');}
  finally {busy=false;btn.disabled=false;}
}
async function applyOne(action) {
  if(busy||!latest?.safeActions?.includes(action))return;
  const L=language();
  if(!window.confirm(L.confirm))return;
  await applyRequested([action],L);
}
async function applyBatch(actions) {
  if(busy || !actions.length)return;
  const L=language();
  if(!window.confirm(L.confirmAll))return;
  await applyRequested(actions,L);
}
async function applyRequested(actions,L) {
  if(busy)return;
  busy=true;
  const scanButton=$('btnAutoRepairScan');
  scanButton.disabled=true;
  let report=[];
  try {
    for(const action of actions) {
      // Server re-checks the plan before every application.
      const result=await window.apkstart.autoRepairApply(action);
      report.push(result.ok ? (result.action==='adb-reconnect'?L.adbOnline:L.actionDone):L.adbFailed);
    }
  } catch(e) {
    report.push(L.error+' '+String(e?.message||''));
  } finally {
    busy=false;scanButton.disabled=false;
    await scan();
    if(report.length)showMessage(report.join(' '),report.some(x=>x.includes(L.error)||x===L.adbFailed)?'error':'ok');
  }
}
function init() {
  const btn=$('btnAutoRepairScan'),box=$('autoRepairResults');
  if(!btn||!box)return;
  btn.addEventListener('click',scan);
  box.append(el('p','asi-ar-msg',language().empty));
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
else init();
})();
