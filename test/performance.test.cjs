'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {
 validMode,effectivePriority,cpuPercent,hostCpu,gfxFps,recommend,
}=require('../src/core/performance');
test('Per-app mode allowlist never accepts shell-like strings',()=>{
  assert.equal(validMode('save'),true);
  assert.equal(validMode('inherit'),true);
  assert.equal(validMode('smooth; DEL C:\\\\'),false);
  assert.equal(effectivePriority('save','game'),'below');
  assert.equal(effectivePriority('smooth','balanced'),'game');
  assert.equal(effectivePriority('balanced','game'),'normal');
  assert.equal(effectivePriority('inherit','game'),'game');
});
test('CPU percentages are based on elapsed host time and all logical cores',()=>{
  assert.equal(cpuPercent({seconds:10,at:1000},{seconds:14,at:3000},4),50);
  assert.equal(cpuPercent({seconds:14,at:3000},{seconds:2,at:5000},4),null);
  assert.equal(cpuPercent(null,{seconds:2,at:5000},4),null);
  assert.equal(hostCpu({total:100,idle:60},{total:200,idle:100}),60);
});
test('Android FPS parser counts recent completed frames, not stale data',()=>{
  const header='Flags,IntendedVsync,Vsync,OldestInputEvent,NewestInputEvent,HandleInputStart,AnimationStart,PerformTraversalsStart,DrawStart,SyncQueued,SyncStart,IssueDrawCommandsStart,SwapBuffers,FrameCompleted';
  const frame=(n,f=0)=>[f,...Array(12).fill(1),String(Math.round(n*1e9))].join(',');
  const lines=Array.from({length:91},(_,i)=>frame(96+i/30));
  const sample=header+'\n'+lines.join('\n')+'\n__ASI_UPTIME__\n99.5 4.0';
  assert.equal(gfxFps(sample),30);
  assert.equal(gfxFps(sample.replace('99.5 4.0','150.0 4.0')),null);
  assert.equal(gfxFps('no gfxinfo'),null);
  assert.equal(gfxFps(header+'\n'+frame(99)+'\n__ASI_UPTIME__\n99.5 0'),null);
  const dropped=header+'\n'+lines.map(x=>'1'+x.slice(1)).join('\n')+'\n__ASI_UPTIME__\n99.5 0';
  assert.equal(gfxFps(dropped),null);
});
test('Recommendation does not claim precision before CPU baseline is collected',()=>{
  const r=(cpu,ram,fps,emu)=>recommend({host:{cpuPercent:cpu,memoryUsedPercent:ram},
    emulator:{cpuPercent:emu},fps,activeAppCount:1});
  assert.equal(r(null,40,20).confidence,'limited');
  assert.equal(r(32,95,25).mode,'save');
  assert.equal(r(95,45,25).mode,'save');
  assert.equal(r(42,60,24).mode,'smooth');
  assert.equal(r(40,60,55).mode,'balanced');
  assert.equal(r(20,50,null).confidence,'limited');
});
test('Measurement script only reads processes under its provided runtime root',()=>{
  const code=fs.readFileSync(path.join(__dirname,'../src/core/win/measure-performance.ps1'),'utf8');
  assert.match(code,/ExecutablePath\.StartsWith/);
  assert.match(code,/RuntimeRoot/);
  assert.doesNotMatch(code,/Stop-Process|Remove-Item|Set-CimInstance|Invoke-WebRequest/i);
});

test('Per-APK process priority uses dedicated IPC with installed-package validation',()=>{
  const main=fs.readFileSync(path.join(__dirname,'../src/main.js'),'utf8');
  const engine=fs.readFileSync(path.join(__dirname,'../src/core/engine.js'),'utf8');
  const preload=fs.readFileSync(path.join(__dirname,'../src/preload.js'),'utf8');
  assert.ok(main.includes("ipcMain.handle('performance:sample'"));
  assert.ok(main.includes("ipcMain.handle('performance:setProfile'"));
  assert.ok(main.includes("Only installed APKs may have performance presets"));
  assert.ok(main.includes("performance.validMode(mode)"));
  assert.ok(engine.includes("performance.effectivePriority("));
  assert.ok(preload.includes("performanceSetProfile: (pkg, mode)"));
});
test('Performance Center requires manual opt-in and never assumes GPU/FPS measurements',()=>{
  const html=fs.readFileSync(path.join(__dirname,'../src/ui/index.html'),'utf8');
  const ui=fs.readFileSync(path.join(__dirname,'../src/ui/performance.js'),'utf8');
  for(const id of ['smartPerformanceCenter','btnPerfStart','btnPerfStop','perfHostCpu','perfGuestRam','perfGuestFps','perfAppSelect','btnPerfApply']) {
    assert.ok(html.includes('id="'+id+'"'),id);
  }
  assert.ok(html.includes('<script src="performance.js"></script>'));
  assert.ok(ui.includes('window.confirm(L.confirm)'));
  assert.ok(ui.includes('window.confirm(L.confirmHigh)'));
  assert.ok(ui.includes('if(!selectedApp()||!last?.recommendation)return'));
  assert.ok(ui.includes('if(!$('+"'settingsMask'"+').classList.contains('+"'on'"+')){stop();return;}'));
  assert.ok(ui.includes('en:')&&ui.includes('vi:')&&ui.includes("'zh-CN':"));
  assert.ok(!ui.includes('innerHTML'),'Metrics rendered safely with textContent');
});
test('Performance snapshot never invents GPU utilization or assigns shared VM RAM per APK',()=>{
  const monitor=fs.readFileSync(path.join(__dirname,'../src/core/performance-monitor.js'),'utf8');
  assert.ok(monitor.includes('gpuPercent:null'));
  assert.ok(monitor.includes('scope:'+"'shared-android-runtime'"));
  assert.ok(monitor.includes('telemetryUploaded:false'));
  assert.ok(monitor.includes('active.includes(pkg)'));
  assert.ok(monitor.includes('validPackageName(pkg)'));
});
