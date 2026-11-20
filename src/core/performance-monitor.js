'use strict';
/** On-demand sampling only: no persistent monitoring, network or uploads. */
const os=require('node:os'),path=require('node:path');
const {execFile}=require('node:child_process');
const {validPackageName}=require('./pkgname');
const model=require('./performance');
function hostTicks(){
  let total=0,idle=0;
  for(const item of os.cpus()){
    for(const n of Object.values(item.times))total+=Number(n)||0;
    idle+=Number(item.times.idle)||0;
  }
  return {total,idle};
}
function hostMemory(){
  const total=os.totalmem(),free=os.freemem();
  return {totalMB:Math.round(total/1048576),availableMB:Math.round(free/1048576),
    memoryUsedPercent:total?Math.round(1000*(1-free/total))/10:null};
}
function windowsProcesses(root){
  if(process.platform!=='win32'||!root)return Promise.resolve(null);
  const script=path.join(__dirname,'win','measure-performance.ps1');
  return new Promise(resolve=>{
    execFile('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass',
      '-File',script,'-RuntimeRoot',root],
      {windowsHide:true,timeout:10000,maxBuffer:200*1024},(err,out)=>{
        if(err)return resolve(null);
        try{
          const data=JSON.parse(String(out).trim());
          resolve(Array.isArray(data.processes)?data.processes.filter(p=>
            Number.isInteger(p.pid)&&p.pid>0&&
            Number.isFinite(p.cpuSeconds)&&p.cpuSeconds>=0&&
            Number.isFinite(p.workingSetBytes)&&p.workingSetBytes>=0):null);
        }catch(_){resolve(null);}
      });
  });
}
class PerformanceMonitor{
  constructor(runtime){
    this.runtime=runtime;this.prevHost=null;this.prevProc=null;
    this.cached=null;this.cachedAt=0;this.inflight=null;
  }
  snapshot(pkg=''){
    if(this.inflight)return this.inflight;
    if(this.cached&&Date.now()-this.cachedAt<2500&&this.cached.requestedPackage===pkg)
      return Promise.resolve(this.cached);
    this.inflight=this._sample(pkg).finally(()=>{this.inflight=null;});
    return this.inflight;
  }
  async _sample(pkg){
    const ticks=hostTicks(),memory=hostMemory();
    const hostCpu=model.hostCpu(this.prevHost,ticks);
    this.prevHost=ticks;
    const samples=await windowsProcesses(this.runtime.provisioner.paths().root);
    const active=this.runtime.activeApps||[];
    const running=!!this.runtime.vmRunning;
    const valid=validPackageName(pkg)&&active.includes(pkg);
    const emulator={running,cpuPercent:null,workingSetMB:null,processCount:null,
      gpuMode:this.runtime.emulator?.profile?.gpu||'unknown',gpuPercent:null};
    if(samples&&samples.length){
      const cpuSeconds=samples.reduce((s,p)=>s+p.cpuSeconds,0);
      const workingSetBytes=samples.reduce((s,p)=>s+p.workingSetBytes,0);
      const next={seconds:cpuSeconds,at:Date.now()};
      emulator.cpuPercent=model.cpuPercent(this.prevProc,next,os.cpus().length);
      emulator.workingSetMB=Math.round(workingSetBytes/1048576);
      emulator.processCount=samples.length;
      this.prevProc=next;
    }else{this.prevProc=null;}
    let fps=null;
    if(valid&&running){
      try{
        const output=await this.runtime.client().shell(
          'dumpsys gfxinfo '+pkg+' framestats; echo __ASI_UPTIME__; cat /proc/uptime',
          {timeout:9000}
        );
        fps=model.gfxFps(output);
      }catch(_){/* unsupported/offline => unavailable, never 0 */ }
    }
    const host={...memory,cpuPercent:hostCpu};
    const advice=model.recommend({host,emulator,fps,activeAppCount:active.length});
    this.cached={at:Date.now(),requestedPackage:pkg,appPackage:valid?pkg:'',
      activeApps:active,scope:'shared-android-runtime',
      host,emulator,fps,
      fpsSource:fps==null?'unavailable':'android-gfxinfo-framestats',
      recommendation:advice,telemetryUploaded:false};
    this.cachedAt=Date.now();
    return this.cached;
  }
}
module.exports={PerformanceMonitor,hostTicks,hostMemory,windowsProcesses};
