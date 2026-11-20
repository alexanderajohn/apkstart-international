/* SmartCheck: local pre-install disclosure. Never inject APK content as HTML. */
(function () {
'use strict';
const $ = (id) => document.getElementById(id);
const L = {
  en: {
    title:'Review APK before installation', loading:'Analyzing locally…', ready:'No obvious static compatibility blocker',
    caution:'Review warnings before installing', blocked:'Requires newer Android',
    failed:'Unable to analyze this APK', file:'File', size:'Size', pkg:'Package ID', ver:'Version',
    min:'Minimum Android API', target:'Target Android API', abi:'Native ABI', permissions:'Requested permissions',
    sensitive:'Sensitive permissions', features:'Required hardware features', signing:'Signing evidence',
    sha:'SHA-256', absent:'Not declared', unverified:'Not cryptographically verified',
    signatureV1:'V1 certificate files present', signatureBlock:'APK Signing Block present',
    split:'Split package: limited inspection only', cancel:'Cancel', proceed:'Continue to install',
    proceedSplit:'Continue without full scan', noIssues:'No additional static warnings.',
    disclaimer:'Offline static analysis only. NOT antivirus, APK signature verification, or a guarantee the app will run.',
    scanFailed:'Installation was not started. The file could not be safely parsed.',
    MIN_SDK_ABOVE_RUNTIME:'Minimum API is above Android 14 (API 34); installation is blocked.',
    OLD_OR_UNKNOWN_TARGET_SDK:'Old or unknown target SDK: normal Android 14 installation may fail.',
    ARM_TRANSLATION_REQUIRED:'ARM-only native libraries require a compatible translation image; success is not guaranteed.',
    UNSUPPORTED_NATIVE_ABI:'Native libraries may not work with this x86/x86_64 emulator.',
    SENSITIVE_PERMISSIONS:'Sensitive permissions requested: confirm they fit the app’s purpose.',
    REQUIRES_DEVICE_FEATURES:'Hardware features required by the APK may be missing in an emulator.',
    SPLIT_PACKAGE_NOT_ANALYZED:'Contents of this .apks/.xapk bundle were not analyzed. Only size and SHA-256 were checked.',
  },
  vi: {
    title:'Kiểm tra APK trước khi cài',loading:'Đang phân tích trên máy…',ready:'Chưa thấy lỗi tương thích rõ ràng qua kiểm tra tĩnh',
    caution:'Hãy đọc cảnh báo trước khi cài',blocked:'Cần Android mới hơn',failed:'Không thể phân tích APK',
    file:'Tệp',size:'Dung lượng',pkg:'Mã gói',ver:'Phiên bản',min:'Android API tối thiểu',
    target:'Android API mục tiêu',abi:'Kiến trúc thư viện',permissions:'Quyền yêu cầu',
    sensitive:'Quyền nhạy cảm',features:'Phần cứng yêu cầu',signing:'Dấu hiệu chữ ký',sha:'SHA-256',
    absent:'Không khai báo',unverified:'Chưa xác minh chữ ký bằng mật mã',
    signatureV1:'Có các tệp chứng chỉ V1',signatureBlock:'Phát hiện APK Signing Block',
    split:'Gói APK tách: chỉ kiểm tra giới hạn',cancel:'Hủy',proceed:'Tiếp tục cài',
    proceedSplit:'Tiếp tục dù chưa quét đủ',noIssues:'Chưa thấy cảnh báo tĩnh bổ sung.',
    disclaimer:'Chỉ phân tích offline. KHÔNG phải quét virus, xác minh chữ ký hay bảo đảm APK chạy được.',
    scanFailed:'Chưa cài đặt. Không thể phân tích tệp một cách an toàn.',
    MIN_SDK_ABOVE_RUNTIME:'SDK tối thiểu vượt Android 14 (API 34); đã chặn cài đặt.',
    OLD_OR_UNKNOWN_TARGET_SDK:'Target SDK cũ hoặc chưa rõ, Android 14 có thể từ chối cài bình thường.',
    ARM_TRANSLATION_REQUIRED:'APK chỉ có thư viện ARM: cần lớp dịch ARM phù hợp; chưa bảo đảm chạy.',
    UNSUPPORTED_NATIVE_ABI:'Thư viện có thể không chạy trên máy ảo x86/x86_64.',
    SENSITIVE_PERMISSIONS:'APK yêu cầu quyền nhạy cảm, hãy kiểm tra mục đích sử dụng.',
    REQUIRES_DEVICE_FEATURES:'Máy ảo có thể không hỗ trợ phần cứng ứng dụng yêu cầu.',
    SPLIT_PACKAGE_NOT_ANALYZED:'Chưa phân tích APK con trong .apks/.xapk; chỉ có dung lượng và SHA-256.',
  },
  'zh-CN': {
    title:'安装前检查 APK',loading:'正在本机分析…',ready:'静态检查没有发现明显兼容阻碍',
    caution:'请检查警告',blocked:'需要更新版本的 Android',failed:'无法解析 APK',
    file:'文件',size:'大小',pkg:'包名',ver:'版本',min:'最低 Android API',
    target:'目标 Android API',abi:'原生 ABI',permissions:'请求权限',sensitive:'敏感权限',
    features:'硬件要求',signing:'签名迹象',sha:'SHA-256',absent:'未声明',
    unverified:'尚未进行密码学签名验证',signatureV1:'发现 V1 证书文件',
    signatureBlock:'发现 APK Signing Block',split:'拆分包：仅有限检查',cancel:'取消',
    proceed:'继续安装',proceedSplit:'未经完整扫描继续',noIssues:'没有额外的静态警告。',
    disclaimer:'仅离线静态分析。非病毒扫描、签名验证或运行保证。',
    scanFailed:'未开始安装，无法安全解析文件。',
    MIN_SDK_ABOVE_RUNTIME:'最低 API 超过 Android 14 (API 34)，禁止安装。',
    OLD_OR_UNKNOWN_TARGET_SDK:'目标 SDK 较旧或未知，Android 14 可能拒绝正常安装。',
    ARM_TRANSLATION_REQUIRED:'仅包含 ARM 库，需要兼容的 ARM 翻译镜像，不保证运行。',
    UNSUPPORTED_NATIVE_ABI:'原生库可能不兼容 x86/x86_64 模拟器。',
    SENSITIVE_PERMISSIONS:'应用请求敏感权限，请确认用途。',
    REQUIRES_DEVICE_FEATURES:'模拟器可能缺少应用要求的硬件功能。',
    SPLIT_PACKAGE_NOT_ANALYZED:'未分析 .apks/.xapk 内部文件，仅检查大小和 SHA-256。',
  },
};
function words() {
  const lang=window.ASI_I18N?.getLanguage?.()||navigator.language||'en';
  return /^vi/i.test(lang)?L.vi:/^zh/i.test(lang)?L['zh-CN']:L.en;
}
function addRow(panel,key,val,code) {
  const row=document.createElement('div');row.className='asi-sc-row';
  const label=document.createElement('span');label.className='asi-sc-key';label.textContent=key;
  const value=document.createElement('span');value.className=code?'asi-sc-val asi-sc-code':'asi-sc-val';
  value.textContent=String(val==null?'':val);
  row.append(label,value);panel.appendChild(row);
}
function render(report,labels) {
  const status=$('smartCheckStatus'),details=$('smartCheckDetails'),issues=$('smartCheckFindings');
  status.className='asi-sc-status '+(report.compatibility?.level||'caution');
  status.textContent=report.supported?labels[report.compatibility?.level||'caution']:labels.split;
  details.replaceChildren();issues.replaceChildren();
  addRow(details,labels.file,report.fileName);
  addRow(details,labels.size,(report.sizeBytes/1048576).toFixed(1)+' MiB');
  if(report.supported) {
    addRow(details,labels.pkg,report.package);addRow(details,labels.ver,report.versionName);
    addRow(details,labels.min,report.minSdk||labels.absent);
    addRow(details,labels.target,report.targetSdk||labels.absent);
    addRow(details,labels.abi,report.abis?.join(', ')||labels.absent);
    addRow(details,labels.permissions,report.permissions?.length||labels.absent);
    addRow(details,labels.sensitive,report.sensitivePermissions?.join(', ')||labels.absent,true);
    if(report.features?.length)addRow(details,labels.features,report.features.join(', '),true);
    if(report.permissions?.length){
      const block=document.createElement('details');
      const summary=document.createElement('summary');summary.textContent=labels.permissions+' ('+report.permissions.length+')';
      const text=document.createElement('p');text.textContent=report.permissions.join('\n');block.append(summary,text);details.appendChild(block);
    }
  }
  const signature=report.signing?.evidence==='v1-certificate-files'?labels.signatureV1:
    report.signing?.evidence==='apk-signing-block'?labels.signatureBlock:labels.absent;
  addRow(details,labels.signing,signature+' — '+labels.unverified);
  addRow(details,labels.sha,report.sha256,true);
  const findings=report.compatibility?.findings||[];
  for(const finding of findings){
    const p=document.createElement('p');p.className='asi-sc-warning';p.textContent=labels[finding]||finding;issues.appendChild(p);
  }
  if(!findings.length){
    const p=document.createElement('p');p.textContent=labels.noIssues;issues.appendChild(p);
  }
  $('smartCheckDisclaimer').textContent=labels.disclaimer;
  const proceed=$('smartCheckProceed');proceed.textContent=report.supported?labels.proceed:labels.proceedSplit;
  proceed.disabled=report.canProceed!==true;
}
function confirm(filePath) {
  return new Promise((resolve)=>{
    const labels=words(),mask=$('smartCheckMask'),proceed=$('smartCheckProceed');
    const cancel=$('smartCheckCancel'),close=$('smartCheckClose'),status=$('smartCheckStatus');
    const focus=document.activeElement;
    let done=false;
    $('smartCheckTitle').textContent='SmartCheck · '+labels.title;
    $('smartCheckFile').textContent=String(filePath).split(/[\\/]/).pop();
    $('smartCheckDetails').replaceChildren();$('smartCheckFindings').replaceChildren();
    $('smartCheckDisclaimer').textContent=labels.disclaimer;
    status.className='asi-sc-status';status.textContent=labels.loading;
    cancel.textContent=labels.cancel;close.setAttribute('aria-label',labels.cancel);
    proceed.textContent=labels.proceed;proceed.disabled=true;
    mask.hidden=false;mask.classList.add('on');cancel.focus();
    const cancelIt=()=>finish(false);
    const continueIt=()=>{if(!proceed.disabled)finish(true);};
    const esc=(e)=>{if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();cancelIt();}};
    const outside=(e)=>{if(e.target===mask)cancelIt();};
    function finish(accepted) {
      if(done)return;done=true;mask.classList.remove('on');mask.hidden=true;
      cancel.removeEventListener('click',cancelIt);close.removeEventListener('click',cancelIt);
      proceed.removeEventListener('click',continueIt);mask.removeEventListener('click',outside);
      document.removeEventListener('keydown',esc,true);
      if(focus?.focus)focus.focus();resolve(accepted);
    }
    cancel.addEventListener('click',cancelIt);close.addEventListener('click',cancelIt);
    proceed.addEventListener('click',continueIt);mask.addEventListener('click',outside);
    document.addEventListener('keydown',esc,true);
    Promise.resolve().then(()=>window.apkstart.smartCheck(filePath)).then((result)=>{
      if(!done)render(result,labels);
    }).catch((error)=>{
      if(done)return;
      status.className='asi-sc-status blocked';status.textContent=labels.failed;
      $('smartCheckFindings').textContent=labels.scanFailed+'\n'+String(error?.message||'');
      proceed.disabled=true;
    });
  });
}
window.ASI_SMARTCHECK={confirm};
})();
