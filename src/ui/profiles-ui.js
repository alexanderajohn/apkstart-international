/* Android Profiles: explicit user-controlled profile creation and switching. */
(function(){
'use strict';
const $=id=>document.getElementById(id);
const WORDS={
  en:{default:'Default',label:'Android Profiles',active:'Active: ',switch:'Switch profile',
    create:'+ New profile',hint:'Each profile has separate Android app data and APKs. Stop Android before switching. ApkStart restarts; no data is deleted.',
    name:'Enter a profile name (e.g. Work, Games or Testing)',created:'Profile created. Select it and click Switch profile.',
    confirm:'Switch Android profile and restart ApkStart? This does not copy or delete any apps or userdata. Any open Android session must be stopped first.',
    restarting:'Switching profile · restarting ApkStart…',failed:'Cannot change Android profile: ',empty:'No profile name entered.'},
  vi:{default:'Mặc định',label:'Môi trường Android',active:'Đang dùng: ',switch:'Chuyển profile',
    create:'+ Tạo profile',hint:'Mỗi profile có Android và APK riêng. Hãy dừng Android trước khi chuyển. ApkStart sẽ khởi động lại; không xóa dữ liệu.',
    name:'Đặt tên môi trường (ví dụ: Công việc, Giải trí, Thử nghiệm)',created:'Đã tạo profile. Chọn trong danh sách rồi bấm Chuyển.',
    confirm:'Chuyển môi trường Android và khởi động lại ApkStart? Không sao chép hay xóa ứng dụng và dữ liệu. Phải dừng Android trước.',
    restarting:'Đang chuyển profile và khởi động lại ApkStart…',failed:'Không thể chuyển profile: ',empty:'Chưa nhập tên profile.'},
  'zh-CN':{default:'默认',label:'Android 环境',active:'当前：',switch:'切换环境',
    create:'+ 新建环境',hint:'每个环境独立存放 Android 应用和数据。切换前必须停止 Android，ApkStart 会重启且不会删除数据。',
    name:'输入环境名称（如工作、游戏、测试）',created:'环境已创建，请选择后点击切换。',
    confirm:'切换 Android 环境并重启 ApkStart 吗？不复制或删除数据。必须先停止 Android。',
    restarting:'正在切换并重启 ApkStart…',failed:'无法切换环境：',empty:'未输入名称。'},
};
function strings(){const lang=window.ASI_I18N?.getLanguage?.()||navigator.language||'en';return /^vi/i.test(lang)?WORDS.vi:/^zh/i.test(lang)?WORDS['zh-CN']:WORDS.en;}
let index=null,busy=false;
function notice(message,error=false){const p=$('profilesNotice');p.textContent=message;p.classList.toggle('error',error);}
function render(){
  const L=strings(),picker=$('profilePicker');
  $('profilesLabel').textContent=L.label;
  $('btnCreateProfile').textContent=L.create;
  $('btnSwitchProfile').textContent=L.switch;
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
function init(){
  if(!$('profilePicker'))return;
  $('profilePicker').addEventListener('change',render);
  $('btnSwitchProfile').addEventListener('click',change);
  $('btnCreateProfile').addEventListener('click',create);
  notice(strings().hint);
  reload().catch(e=>notice(strings().failed+String(e?.message||e),true));
}
window.ASI_PROFILES={reload,isSecondary:()=>!!index&&index.activeId!=='default'};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
else init();
})();
