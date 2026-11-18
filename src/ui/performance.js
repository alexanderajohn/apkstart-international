/* Smart Performance Engine — local-only, opt-in measurements. */
(function(){
'use strict';
const $=id=>document.getElementById(id);
const TEXT={
  en:{
    subtitle:'On-demand local performance measurements · no uploads',
    start:'Start measuring',stop:'Stop', app:'App to optimize',mode:'Per-app process preset',
    none:'No installed apps',all:'Select an installed app',inherit:'Use global mode',
    save:'Save resources',balanced:'Balanced',smooth:'Smooth / high process priority',
    labels:['Host CPU','Host RAM','Emulator CPU*','Emulator RAM*','Android frames/s*','GPU render mode'],
    note:'* Emulator CPU/RAM are shared across all Android apps. FPS estimates recent Android gfxinfo frame completions for a running app. GPU utilization is not measured; only render mode is shown.',
    privacy:'Sampling runs only while Settings is open and Start is enabled. No uploads, Android resets, silent tuning or memory/CPU-core changes.',
    initial:'Start measuring to get a recommendation. No setting changes happen automatically.',
    warming:'Measuring… CPU needs two readings. Missing/unsupported counters show N/A, not zero.',
    unavailable:'N/A', loading:'Loading app presets…',
    reason:{
      INSUFFICIENT_SAMPLES:'More measurements needed',
      HOST_MEMORY_PRESSURE:'Host RAM is under pressure; consider saving resources',
      CPU_PRESSURE:'Host CPU is heavily loaded; prioritize desktop responsiveness',
      LOW_FPS_WITH_HEADROOM:'Recent FPS is low and the host has headroom; try a smoother mode',
      BALANCED_RESOURCES:'Load appears suitable for balanced scheduling',
      NO_ACTIVE_FPS_DATA:'No recent Android FPS data. Recommendation is tentative',
      MULTI_WINDOW_SHARED_VM:'Multiple apps share a single Android VM',
    },
    suggestion:'Suggested: ',limited:'(limited evidence)',measured:'(observed measurements)',
    choose:'Choose suggested mode',apply:'Save per-app preset',
    saved:'Preset saved. It takes effect next time this APK is opened.',
    error:'Measurement or settings operation failed: ',
    confirm:'Save this scheduling preset for the selected APK? It changes process priority on next launch, not Android RAM or vCPU cores.',
    confirmHigh:'Smooth mode may increase Android process priority and make other Windows apps less responsive. Continue?',
    selectFirst:'Select an installed APK first.',
  },
  vi:{
    subtitle:'Đo hiệu năng khi anh bật · không gửi dữ liệu ra ngoài',
    start:'Bắt đầu đo',stop:'Dừng',app:'Ứng dụng cần tối ưu',mode:'Chế độ riêng cho ứng dụng',
    none:'Chưa cài APK',all:'Chọn ứng dụng đã cài',inherit:'Theo thiết lập chung',
    save:'Tiết kiệm',balanced:'Cân bằng',smooth:'Mượt / ưu tiên tiến trình cao',
    labels:['CPU Windows','RAM Windows','CPU máy ảo*','RAM máy ảo*','Khung hình/giây*','Chế độ render GPU'],
    note:'* CPU/RAM của emulator là tổng của máy ảo, không phải từng APK. FPS ước lượng từ khung hình gần đây do Android gfxinfo trả về. Không đo % GPU; chỉ hiển thị chế độ render.',
    privacy:'Chỉ đo khi Settings đang mở và anh bật đo. Không tải dữ liệu lên server, reset Android, tự chỉnh cấu hình hay đổi RAM/số nhân của máy ảo.',
    initial:'Bấm bắt đầu để đo rồi nhận gợi ý. Không tự thay đổi thiết lập.',
    warming:'Đang đo… CPU cần ít nhất hai lần lấy mẫu; chỉ số chưa hỗ trợ sẽ hiện N/A, không phải 0.',
    unavailable:'N/A',loading:'Đang tải cấu hình ứng dụng…',
    reason:{
      INSUFFICIENT_SAMPLES:'Cần thêm lần đo',
      HOST_MEMORY_PRESSURE:'RAM Windows gần đầy, nên cân nhắc tiết kiệm tài nguyên',
      CPU_PRESSURE:'CPU Windows đang tải cao, cần ưu tiên độ mượt của hệ thống',
      LOW_FPS_WITH_HEADROOM:'FPS thấp nhưng máy còn dư tài nguyên, có thể thử chế độ mượt',
      BALANCED_RESOURCES:'Tải tài nguyên phù hợp mức cân bằng',
      NO_ACTIVE_FPS_DATA:'Chưa có FPS mới từ Android, gợi ý chỉ mang tính tham khảo',
      MULTI_WINDOW_SHARED_VM:'Nhiều APK đang dùng chung một máy ảo',
    },
    suggestion:'Gợi ý: ',limited:'(ít số liệu)',measured:'(dựa trên số liệu đo)',
    choose:'Chọn mức gợi ý',apply:'Lưu cho APK',
    saved:'Đã lưu. Cấu hình có hiệu lực ở lần mở APK tiếp theo.',
    error:'Lỗi đo hoặc lưu thiết lập: ',
    confirm:'Lưu mức ưu tiên tiến trình cho APK này? Chỉ áp dụng khi mở lại, không đổi RAM hay số nhân của Android.',
    confirmHigh:'Chế độ mượt có thể tăng ưu tiên CPU cho Android khiến ứng dụng Windows khác chậm hơn. Tiếp tục?',
    selectFirst:'Hãy chọn APK đã cài.',
  },
  'zh-CN':{
    subtitle:'仅在开启后本机测量 · 不上传数据',
    start:'开始测量',stop:'停止',app:'要优化的应用',mode:'应用专属进程策略',
    none:'尚无已安装的应用',all:'选择已安装的应用',inherit:'使用全局设置',
    save:'省资源',balanced:'均衡',smooth:'流畅 / 高进程优先级',
    labels:['主机 CPU','主机 RAM','模拟器 CPU*','模拟器 RAM*','Android FPS*','GPU 渲染模式'],
    note:'* 模拟器 CPU/RAM 是共享虚拟机整体用量，非单个 APK。FPS 根据 Android gfxinfo 最近完成的帧估算。不提供 GPU 使用率，仅显示渲染模式。',
    privacy:'仅在设置面板开启并点击测量时采样。无上传、无 Android 数据重置、无静默调参。',
    initial:'开始测量以获取建议。设置不会自动更改。',warming:'采样中：CPU 至少需要两次读数；不可用指标显示 N/A。',
    unavailable:'N/A',loading:'正在读取应用配置…',
    reason:{
      INSUFFICIENT_SAMPLES:'需要更多采样',HOST_MEMORY_PRESSURE:'主机内存紧张，建议节省资源',
      CPU_PRESSURE:'主机 CPU 占用过高，优先保持 Windows 流畅',
      LOW_FPS_WITH_HEADROOM:'FPS 较低且主机有余量，可尝试流畅模式',
      BALANCED_RESOURCES:'负载适合均衡模式',NO_ACTIVE_FPS_DATA:'没有近期 Android FPS，建议仅供参考',
      MULTI_WINDOW_SHARED_VM:'多个应用共用同一 Android 虚拟机',
    },
    suggestion:'推荐：',limited:'（数据不足）',measured:'（按观测数据）',
    choose:'选择推荐模式',apply:'保存应用策略',
    saved:'已保存，将在下次启动该 APK 时生效。',
    error:'测量或保存失败：',confirm:'保存所选 APK 的进程优先级吗？下次启动生效，不改 Android 内存或 vCPU 数量。',
    confirmHigh:'流畅模式可能使其他 Windows 程序响应变慢，继续吗？',selectFirst:'请先选择已安装 APK。',
  }
};
function locale(){
  const code=window.ASI_I18N?.getLanguage?.()||navigator.language||'en';
  return /^vi/i.test(code)?TEXT.vi:/^zh/i.test(code)?TEXT['zh-CN']:TEXT.en;
}
let busy=false,timer=null,last=null,profiles={},wantedApp='';
const formatPct=v=>v==null||!Number.isFinite(v)?locale().unavailable:Number(v).toFixed(1)+'%';
const formatMB=v=>v==null||!Number.isFinite(v)?locale().unavailable:Math.round(v)+' MB';
function selectedApp(){return $('perfAppSelect').value;}
function setValues(snapshot) {
  const L=locale(),host=snapshot.host||{},guest=snapshot.emulator||{};
  $('perfHostCpu').textContent=formatPct(host.cpuPercent);
  $('perfHostRam').textContent=formatPct(host.memoryUsedPercent);
  $('perfGuestCpu').textContent=formatPct(guest.cpuPercent);
  $('perfGuestRam').textContent=formatMB(guest.workingSetMB);
  $('perfGuestFps').textContent=snapshot.fps==null?L.unavailable:Number(snapshot.fps).toFixed(1);
  $('perfGuestGpu').textContent=guest.gpuMode==='unknown'?L.unavailable:String(guest.gpuMode);
  const advice=snapshot.recommendation||{};
  const reason=(advice.reasons||[]).map(code=>L.reason[code]||code).join(' · ');
  const mode=advice.mode||'balanced';
  $('perfAdvice').textContent=L.suggestion+(L[mode]||mode)+' '+(advice.confidence==='measured'?L.measured:L.limited)+'. '+reason;
  $('btnPerfSuggest').disabled=!selectedApp();
}
async function refreshApps(){
  const select=$('perfAppSelect'),L=locale(),prior=wantedApp||select.value;
  let apps=[];
  try{apps=await window.apkstart.listApps();profiles=await window.apkstart.performanceProfiles();}
  catch(e){$('perfAdvice').textContent=L.error+String(e?.message||'');return;}
  select.replaceChildren();
  const empty=document.createElement('option');
  empty.value='';empty.textContent=apps.length?L.all:L.none;select.appendChild(empty);
  for(const app of apps){
    if(!app||typeof app.package!=='string')continue;
    const op=document.createElement('option');
    op.value=app.package;op.textContent=(app.label||app.package)+' · '+app.package;
    select.appendChild(op);
  }
  if([...select.options].some(x=>x.value===prior))select.value=prior;
  wantedApp='';
  syncMode();
}
function syncMode(){
  const pkg=selectedApp(),mode=profiles[pkg]||'inherit';
  $('perfModeSelect').value=['inherit','save','balanced','smooth'].includes(mode)?mode:'inherit';
  $('btnPerfApply').disabled=!pkg;
  $('btnPerfSuggest').disabled=!pkg||!last;
}
async function sample(){
  if(busy)return;
  busy=true;
  try{
    const response=await window.apkstart.performanceSample(selectedApp());
    last=response;
    if(response) setValues(response);
  }catch(e){$('perfAdvice').textContent=locale().error+String(e?.message||'');}
  finally{busy=false;}
}
async function start(){
  stop();
  const L=locale();
  $('perfAdvice').textContent=L.warming;
  $('btnPerfStop').disabled=false;$('btnPerfStart').disabled=true;
  await sample();
  timer=setInterval(()=>{
    if(!$('settingsMask').classList.contains('on')){stop();return;}
    sample();
  },6500);
}
function stop(){
  if(timer!=null)clearInterval(timer);
  timer=null;
  $('btnPerfStop').disabled=true;$('btnPerfStart').disabled=false;
}
async function apply(){
  const pkg=selectedApp(),mode=$('perfModeSelect').value,L=locale();
  if(!pkg){$('perfAdvice').textContent=L.selectFirst;return;}
  if(!window.confirm(L.confirm))return;
  if(mode==='smooth'&&!window.confirm(L.confirmHigh))return;
  $('btnPerfApply').disabled=true;
  try{
    const result=await window.apkstart.performanceSetProfile(pkg,mode);
    if(result?.ok){profiles[pkg]=mode;$('perfAdvice').textContent=L.saved;}
  }catch(e){$('perfAdvice').textContent=L.error+String(e?.message||'');}
  finally{$('btnPerfApply').disabled=false;}
}
function chooseSuggested(){
  if(!selectedApp()||!last?.recommendation)return;
  $('perfModeSelect').value=last.recommendation.mode||'balanced';
}
function labels(){
  const L=locale();
  $('perfSummary').textContent=L.subtitle;
  $('btnPerfStart').textContent=L.start;$('btnPerfStop').textContent=L.stop;
  $('perfAppLabel').textContent=L.app;$('perfModeLabel').textContent=L.mode;
  $('perfMeterNote').textContent=L.note;$('perfPrivacy').textContent=L.privacy;
  const ids=['perfHostCpuLabel','perfHostRamLabel','perfGuestCpuLabel','perfGuestRamLabel','perfGuestFpsLabel','perfGuestGpuLabel'];
  ids.forEach((id,i)=>$(id).textContent=L.labels[i]);
  const opts=$('perfModeSelect').options;
  ['inherit','save','balanced','smooth'].forEach((mode,i)=>opts[i].textContent=L[mode]);
  $('btnPerfSuggest').textContent=L.choose;$('btnPerfApply').textContent=L.apply;
  $('perfAdvice').textContent=L.initial;
}
async function openFor(pkg){
  wantedApp=pkg;
  labels();
  await refreshApps();
  $('smartPerformanceCenter').scrollIntoView({block:'center'});
}
function init(){
  if(!$('smartPerformanceCenter'))return;
  labels();
  $('btnPerfStart').addEventListener('click',start);
  $('btnPerfStop').addEventListener('click',stop);
  $('btnPerfSuggest').addEventListener('click',chooseSuggested);
  $('btnPerfApply').addEventListener('click',apply);
  $('perfAppSelect').addEventListener('change',()=>{syncMode();last=null;});
  $('btnSettings').addEventListener('click',()=>refreshApps());
  refreshApps();
}
window.ASI_PERFORMANCE={openFor};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
else init();
})();
