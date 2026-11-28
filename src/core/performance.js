'use strict';
// Shared Android runtime telemetry; NOT per-APK CPU/memory attribution.
const MODES=Object.freeze(['inherit','save','balanced','smooth']);
const validMode=(mode)=>MODES.includes(mode);
function effectivePriority(mode, global='balanced') {
  if(mode==='save') return 'below';
  if(mode==='smooth') return 'game';
  if(mode==='balanced') return 'normal';
  return global==='game'?'game':'normal';
}
function cpuPercent(prev,next,cores=1) {
  if(!prev||!next||!Number.isFinite(prev.seconds)||!Number.isFinite(next.seconds)
    ||!Number.isFinite(prev.at)||!Number.isFinite(next.at)||cores<1)return null;
  const elapsed=(next.at-prev.at)/1000,work=next.seconds-prev.seconds;
  if(elapsed<0.5||work<0)return null;
  return Math.round(Math.min(100,Math.max(0,work/elapsed/cores*100))*10)/10;
}
function hostCpu(prev,next) {
  if(!prev||!next||!(next.total>prev.total))return null;
  const total=next.total-prev.total,idle=next.idle-prev.idle;
  return Math.round(Math.min(100,Math.max(0,100*(total-idle)/total))*10)/10;
}
function gfxFps(raw) {
  // ADB dumpsys gfxinfo: completed frames / elapsed time, only when recent
  // relative to guest /proc/uptime. Stale/idle frames are NOT counted.
  const src=String(raw||'').slice(0,512*1024);
  const up=/__ASI_UPTIME__\s*\r?\n\s*(\d+(?:\.\d+)?)/.exec(src);
  const uptime=up?Number(up[1]):NaN;
  if(!Number.isFinite(uptime)||uptime<=0)return null;
  let ix=-1,t=[];
  for(const line of src.split(/\r?\n/)){
    if(line.startsWith('Flags,')&&line.includes('FrameCompleted')){
      ix=line.split(',').indexOf('FrameCompleted');continue;
    }
    if(ix<0||!/^\d+,/.test(line))continue;
    const fields=line.split(',');
    if(fields[0]!=='0'||!/^\d+$/.test(fields[ix]||''))continue;
    const sec=Number(fields[ix])/1e9;
    if(Number.isFinite(sec)&&sec>0)t.push(sec);
  }
  if(t.length<2)return null;
  const newest=Math.max(...t);
  if(uptime-newest>10||newest>uptime+3)return null;
  t=t.filter(sec=>sec>=newest-5&&sec<=uptime+3);
  if(t.length<2)return null;
  const span=newest-Math.min(...t);
  if(span<1)return null;
  const fps=(t.length-1)/span;
  return fps>0&&fps<=240?Math.round(fps*10)/10:null;
}
function recommend({host={},emulator={},fps=null,activeAppCount=0}={}){
  const cpu=host.cpuPercent,ram=host.memoryUsedPercent;
  if(cpu==null||ram==null)return {mode:'balanced',confidence:'limited',reasons:['INSUFFICIENT_SAMPLES']};
  if(ram>=88)return {mode:'save',confidence:'measured',reasons:['HOST_MEMORY_PRESSURE']};
  if(cpu>=90||(emulator.cpuPercent!=null&&emulator.cpuPercent>=90&&cpu>=75))
    return {mode:'save',confidence:'measured',reasons:['CPU_PRESSURE']};
  if(fps!=null&&fps<30&&cpu<75&&ram<80)
    return {mode:'smooth',confidence:'measured',reasons:['LOW_FPS_WITH_HEADROOM']};
  if(fps==null&&cpu<25&&ram<55&&activeAppCount<=1)
    return {mode:'balanced',confidence:'limited',reasons:['NO_ACTIVE_FPS_DATA']};
  return {mode:'balanced',confidence:'measured',
    reasons:[activeAppCount>2&&cpu>=70?'MULTI_WINDOW_SHARED_VM':'BALANCED_RESOURCES']};
}
module.exports={MODES,validMode,effectivePriority,cpuPercent,hostCpu,gfxFps,recommend};
