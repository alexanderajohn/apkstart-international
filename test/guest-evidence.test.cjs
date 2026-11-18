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
