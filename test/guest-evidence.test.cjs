'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const { packagePresent, verifyCanary }=require('../scripts/asi/guest-evidence.cjs');
const reply=stdout=>({exec:async()=>({stdout})});
test('isolation requires a successful exact package listing',async()=>{
  assert.equal(await packagePresent(reply('package:com.test.app2\n'),'com.test.app'),false);
  assert.equal(await packagePresent(reply('package:com.test.app\n'),'com.test.app'),true);
  await assert.rejects(packagePresent(reply('Error: package service is offline'),'com.test.app'));
  await assert.rejects(packagePresent({exec:async()=>{throw Error('disconnected');}},'com.test.app'));
});
test('private canary must match the digest supplied by the fixture author',async()=>{
  const hash='d'.repeat(64);
  assert.equal(await verifyCanary(reply(hash+'  files/asi-canary'),'com.test.app',hash),true);
  await assert.rejects(verifyCanary(reply(hash+'  files/asi-canary'),'com.test.app','e'.repeat(64)));
});

test('hosted permission interaction selects only the named fixture and system deny button',()=>{
  const {appManagerDenyControl} = require('../scripts/asi/guest-evidence.cjs');
  const owner='com.google.android.permissioncontroller';
  const msg='<node package="'+owner+'" resource-id="com.android.permissioncontroller:id/permission_message" text="Allow App Manager to send notifications?" />';
  const button='<node package="'+owner+'" resource-id="com.android.permissioncontroller:id/permission_deny_button" clickable="true" enabled="true" bounds="[10,20][100,80]" />';
  assert.deepEqual(appManagerDenyControl(msg+button,owner),{prompt:'Allow App Manager to send notifications?',control:'com.android.permissioncontroller:id/permission_deny_button',x:55,y:50});
  const second = button.replace('permission_deny_button','permission_deny_dont_ask_again_button');
  assert.equal(appManagerDenyControl(msg+second,owner).control, 'com.android.permissioncontroller:id/permission_deny_dont_ask_again_button');
  const observed = button.replace('permission_deny_button','permission_deny_and_dont_ask_again_button');
  assert.equal(appManagerDenyControl(msg+observed,owner).control,'com.android.permissioncontroller:id/permission_deny_and_dont_ask_again_button');
  assert.equal(appManagerDenyControl(msg+button+second,owner),null);
  for(const xml of [msg+button+button,msg.replace('App Manager','Another app')+button,msg+button.replace('deny_button','allow_button'),msg+button.replace('enabled="true"','enabled="false"')])
    assert.equal(appManagerDenyControl(xml,owner),null);
  assert.equal(appManagerDenyControl(msg+button,'org.example.fake'),null);
});

test('Android stop is sent once and relaunch waits for every package process to exit',async()=>{
  const {stopAndObserve}=require('../scripts/asi/guest-evidence.cjs');
  const pkg='org.example.fixture';
  const rows=['NAME\ninit\n'+pkg,'NAME\ninit\n'+pkg+':remote','NAME\ninit\n'+pkg+'2'];
  let stops=0,checks=0;
  const client={exec:async args=>{
    if(args[1]==='am'){assert.deepEqual(args,['shell','am','force-stop','--user','0',pkg]);stops++;return {stdout:''};}
    assert.deepEqual(args,['shell','ps','-A','-o','NAME']);
    return {stdout:rows.shift()};
  }};
  await stopAndObserve(client,pkg,async()=>{checks++;},{pollMs:0});
  assert.equal(stops,1);assert.equal(checks,4);assert.equal(rows.length,0);
  const check=async()=>{};
  await assert.rejects(stopAndObserve(reply('NAME\ninit\n'+pkg),pkg,check,{timeoutMs:0}),/still present/);
  await assert.rejects(stopAndObserve(reply(''),pkg,check),/verify Android process list/);
});
