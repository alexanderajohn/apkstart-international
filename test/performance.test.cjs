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
