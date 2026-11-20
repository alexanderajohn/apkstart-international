/* Android Profiles: explicit user-controlled profile creation and switching. */
(function(){
'use strict';
const $=id=>document.getElementById(id);
const WORDS={
  en:{default:'Default',label:'Android Profiles',active:'Active: ',switch:'Switch profile',
    create:'+ New profile',hint:'Each profile has separate Android app data and APKs. Stop Android before switching. ApkStart restarts; no data is deleted.',
    name:'Enter a profile name (e.g. Work, Games or Testing)',created:'Profile created. Select it and click Switch profile.',
    confirm:'Switch Android profile and restart ApkStart? This does not copy or delete any apps or userdata. Any open Android session must be stopped first.',
    restarting:'Switching profile · restarting ApkStart…',failed:'Cannot change Android profile: ',empty:'No profile name entered.',
    readinessTitle:'Live Android Readiness',readinessNote:'Read-only check for the active Android Profile; no install, repair or data reset.',
    readinessCheck:'Check running Android',readinessWorking:'Checking live Android...',readinessReady:'Ready',readinessLimited:'Partially verified',readinessBlocked:'Not ready',
    readinessError:'Readiness check failed: '},
  vi:{default:'Mặc định',label:'Môi trường Android',active:'Đang dùng: ',switch:'Chuyển profile',
    create:'+ Tạo profile',hint:'Mỗi profile có Android và APK riêng. Hãy dừng Android trước khi chuyển. ApkStart sẽ khởi động lại; không xóa dữ liệu.',
    name:'Đặt tên môi trường (ví dụ: Công việc, Giải trí, Thử nghiệm)',created:'Đã tạo profile. Chọn trong danh sách rồi bấm Chuyển.',
    confirm:'Chuyển môi trường Android và khởi động lại ApkStart? Không sao chép hay xóa ứng dụng và dữ liệu. Phải dừng Android trước.',
    restarting:'Đang chuyển profile và khởi động lại ApkStart…',failed:'Không thể chuyển profile: ',empty:'Chưa nhập tên profile.',
    readinessTitle:'Kiểm tra Android đang chạy',readinessNote:'Chỉ đọc trạng thái Android Profile hiện tại; không cài ứng dụng, sửa lỗi hay xóa dữ liệu.',
    readinessCheck:'Kiểm tra Android',readinessWorking:'Đang kiểm tra Android...',readinessReady:'Sẵn sàng',readinessLimited:'Chưa xác minh đầy đủ',readinessBlocked:'Chưa sẵn sàng',
    readinessError:'Không thể kiểm tra Android: '},
  'zh-CN':{default:'默认',label:'Android 环境',active:'当前：',switch:'切换环境',
    create:'+ 新建环境',hint:'每个环境独立存放 Android 应用和数据。切换前必须停止 Android，ApkStart 会重启且不会删除数据。',
    name:'输入环境名称（如工作、游戏、测试）',created:'环境已创建，请选择后点击切换。',
    confirm:'切换 Android 环境并重启 ApkStart 吗？不复制或删除数据。必须先停止 Android。',
    restarting:'正在切换并重启 ApkStart…',failed:'无法切换环境：',empty:'未输入名称。',
    readinessTitle:'Android 运行状态检查',readinessNote:'仅检查当前 Android 环境，不安装、不修复、不删除任何数据。',
    readinessCheck:'检查运行中的 Android',readinessWorking:'正在检查 Android...',readinessReady:'已就绪',readinessLimited:'部分验证',readinessBlocked:'尚未就绪',
    readinessError:'Android 检查失败：'},
};
function strings(){const lang=window.ASI_I18N?.getLanguage?.()||navigator.language||'en';return /^vi/i.test(lang)?WORDS.vi:/^zh/i.test(lang)?WORDS['zh-CN']:WORDS.en;}
const CHECK_NAMES={
 en:{'runtime-idle':'Runtime is idle','emulator-running':'Emulator is running',
     'runtime-ownership':'Ownership verified','serial-binding':'Bound to expected serial',
     'adb-authorization':'ADB authorization','profile-avd':'AVD matches Profile',
     'android-boot':'Android boot complete','android-api':'Android 14 / API 34',
     'package-manager':'Android package manager'},
 vi:{'runtime-idle':'Runtime không bận','emulator-running':'Emulator đang chạy',
     'runtime-ownership':'Xác minh quyền sở hữu','serial-binding':'Đúng thiết bị ADB',
     'adb-authorization':'ADB đã được cấp quyền','profile-avd':'AVD đúng Profile',
     'android-boot':'Android đã khởi động','android-api':'Android 14 / API 34',
     'package-manager':'Trình quản lý ứng dụng'},
 'zh-CN':{'runtime-idle':'运行时空闲','emulator-running':'模拟器运行中',
     'runtime-ownership':'实例归属验证','serial-binding':'ADB 序列号',
     'adb-authorization':'ADB 授权','profile-avd':'AVD 与环境对应',
     'android-boot':'Android 启动完成','android-api':'Android 14 / API 34',
     'package-manager':'Android 软件包管理器'}
};
const localeKey=()=>{const k=window.ASI_I18N?.getLanguage?.()||navigator.language||'en';return /^vi/i.test(k)?'vi':/^zh/i.test(k)?'zh-CN':'en';};
let readinessBusy=false;
let index=null,busy=false;
function notice(message,error=false){const p=$('profilesNotice');p.textContent=message;p.classList.toggle('error',error);}
function render(){
  const L=strings(),picker=$('profilePicker');
  $('profilesLabel').textContent=L.label;
  $('btnCreateProfile').textContent=L.create;
  $('btnSwitchProfile').textContent=L.switch;
  $('runtimeReadinessTitle').textContent=L.readinessTitle;
  $('runtimeReadinessNote').textContent=L.readinessNote;
  $('btnRuntimeReadiness').textContent=L.readinessCheck;
  $('btnRuntimeReadiness').disabled=readinessBusy;
  if(!index)return;
  const prior=picker.value||index.activeId;
  picker.replaceChildren();
  for(const profile of index.profiles){
    const option=document.createElement('option');
    option.value=profile.id;
    option.textContent=profile.id==='default'?L.default:profile.name;
    picker.append(option);
  }
  picker.value=index.profiles.some(p=>p.id===prior)?prior:index.activeId;
  const active=index.profiles.find(p=>p.id===index.activeId);
  $('profilesActiveLabel').textContent=L.active+(active?.id==='default'?L.default:(active?.name||L.default));
  $('btnSwitchProfile').disabled=busy||picker.value===index.activeId;
  $('btnCreateProfile').disabled=busy;
}
async function reload(){
  index=await window.apkstart.profilesList();
  render();
}
async function create(){
  if(busy)return;
  const L=strings();
  const name=window.prompt(L.name);
  if(name===null)return;
  if(!name.trim()){notice(L.empty,true);return;}
  busy=true;render();
  try{
    const result=await window.apkstart.profilesCreate(name);
    await reload();
    $('profilePicker').value=result.id;
    render();
    notice(L.created);
  }catch(e){notice(L.failed+String(e?.message||e),true);}
  finally{busy=false;render();}
}
async function change(){
  if(busy||!index)return;
  const target=$('profilePicker').value,L=strings();
  if(!target||target===index.activeId)return;
  if(!window.confirm(L.confirm))return;
  busy=true;render();
  try{
    const r=await window.apkstart.profilesSwitch(target);
    if(r?.restarting){notice(L.restarting);$('btnSwitchProfile').disabled=true;}
    else {await reload();notice(L.hint);}
  }catch(e){notice(L.failed+String(e?.message||e),true);}
  finally{busy=false;render();}
}
async function runReadiness(){
  if(readinessBusy)return;
  const L=strings(),target=$('runtimeReadinessDetails');
  readinessBusy=true;render();target.hidden=false;target.textContent=L.readinessWorking;
  try{
    const result=await window.apkstart.runtimeReadiness();
    const label=result?.status==='ready'?L.readinessReady:
      result?.status==='limited'?L.readinessLimited:L.readinessBlocked;
    const names=CHECK_NAMES[localeKey()];
    const lines=[label+' · '+(result?.expectedAvd||'')+' · '+(result?.serial||'—')];
    for(const item of result?.checks||[]){
      const mark=item.status==='pass'?'✓':item.status==='fail'?'×':'?';
      lines.push(mark+' '+(names[item.id]||item.id)+': '+item.detail);
    }
    lines.push(result?.advisory||'');
    target.textContent=lines.join('\n');
  }catch(e){target.textContent=L.readinessError+String(e?.message||e);}
  finally{readinessBusy=false;render();}
}
function init(){
  window.addEventListener('asi-language-change', () => { render(); if (!busy) notice(strings().hint); });
  if(!$('profilePicker'))return;
  $('profilePicker').addEventListener('change',render);
  $('btnSwitchProfile').addEventListener('click',change);
  $('btnCreateProfile').addEventListener('click',create);
  $('btnRuntimeReadiness').addEventListener('click',runReadiness);
  notice(strings().hint);
  reload().catch(e=>notice(strings().failed+String(e?.message||e),true));
}
window.ASI_PROFILES={reload,isSecondary:()=>!!index&&index.activeId!=='default'};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
else init();
})();
