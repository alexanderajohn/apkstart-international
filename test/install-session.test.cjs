'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { prepareInstall } = require('../src/core/apk-install-guard');
const { withApprovedCopy } = require('../src/core/install-staging');
const { installSession, writePart } = require('../src/core/install-session');
const { buildApkBytes } = require('./lib/make-apk');

async function fixture(fn) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'asi-source-'));
  try {
    const file = path.join(dir, 'approved.apk');
    await fs.writeFile(file, buildApkBytes({ abis: ['x86_64'] }));
    return await fn(await prepareInstall(file, 'default'));
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
}
test('consumer receives an independent reviewed copy; failures clean it and preserve the source', () => fixture(async preview => {
  let staged;
  await assert.rejects(withApprovedCopy(preview, 'default', async p => {
    staged = p.path;
    assert.notEqual(p.path, preview.path);
    await fs.writeFile(preview.path, 'replacement source');
    assert.equal((await prepareInstall(staged, 'default')).sha256, preview.sha256);
    throw Error('simulated Android failure');
  }), /simulated/);
  await assert.rejects(fs.stat(staged), { code: 'ENOENT' });
  assert.equal(await fs.readFile(preview.path, 'utf8'), 'replacement source');
}));
test('modified source and changed profile fail before Android is called', () => fixture(async preview => {
  await assert.rejects(withApprovedCopy(preview, 'p_0123456789abcdef', assert.fail), /Profile changed/);
  await fs.appendFile(preview.path, 'changed');
  await assert.rejects(withApprovedCopy(preview, 'default', assert.fail), /changed/);
}));
test('mutated install stream cannot commit; Android only abandons its own session', () => fixture(async p => {
  // An actual child consuming stdin exercises both pipe completion and the hash check.
  const part = { path: p.path, bytes: p.bytes, sha256: '0'.repeat(64) };
  const commands = [];
  const client = { adbPath: process.execPath, _adbEnv: () => process.env,
    _args: () => ['-e', "process.stdin.resume().on('end', () => console.log('Success: streamed'))"],
    exec: async args => {
      commands.push(args);
      return { stdout: args.includes('install-create') ? 'Success: created install session [73]' : 'Success' };
    } };
  const options = { pkg: p.package, replace: false, checkGuest: async () => {} };
  await assert.rejects(installSession(client, [part], options), /changed/);
  assert.ok(commands[0].includes('-R'));
  assert.deepEqual(commands.slice(1), [['shell','pm','install-abandon','73']]);
  await writePart(client, '74', 0, { ...part, sha256: p.sha256 });
}));
test('loss of guest ownership blocks commit and cleanup on an unknown guest', async () => {
  let owns = true;
  const cmds = [];
  const client = {exec: async a => {cmds.push(a);return {stdout:'Success: created install session [11]'};}};
  await assert.rejects(installSession(client, [{bytes:1,sha256:'a'.repeat(64)}], {
    pkg:'com.example.demo', replace:true, checkGuest:async()=>{if(!owns)throw Error('lost ownership');},
    write:async()=>{owns=false;}
  }), /lost ownership/);
  assert.equal(cmds.length,1);
});

test('host approval stages the imported binary Android manifest and the exact IME bytes',async()=>{
  const file=require('node:path').join(__dirname,'../assets/PinyinIME.apk');
  const {prepareInstall}=require('../src/core/apk-install-guard');
  const {withApprovedCopy}=require('../src/core/install-staging');
  const approved=await prepareInstall(file,'default');
  assert.equal(approved.package,'com.android.inputmethod.pinyin');
  assert.equal(approved.sha256,'9cc5fd7c39b4f9e02739d5a0d7be34caa893fe7634b543ee3ffecd949f11b1a6');
  let copy;
  await withApprovedCopy(approved,'default',stage=>{
    copy=stage.path;
    assert.notEqual(copy,file);
    assert.equal(stage.version,'1.0.0');
    assert.equal(stage.bytes,1668276);
    assert.equal(stage.sha256,approved.sha256);
  });
  assert.equal(require('node:fs').existsSync(copy),false);
});

test('Windows adb receives text-safe input and Android recovers the approved bytes', async () => {
  const {createHash} = require('node:crypto');
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'asi-adb-bytes-'));
  try {
    for (const length of [65537, 131073, 131074]) {
      const data = Buffer.alloc(length);
      for (let i = 0; i < length; i++) data[i] = i % 256;
      data.set([0x1a, 13, 10, 0], 489);
      const file = path.join(dir, 'payload.apk');
      await fs.writeFile(file, data);
      const sha256 = createHash('sha256').update(data).digest('hex');
      const child = `
        const chunks = [];
        process.stdin.on('data', c => chunks.push(c)).on('end', () => {
          const s = Buffer.concat(chunks).toString('latin1');
          if (!/^[a-zA-Z0-9+/]+=*$/.test(s)) process.exit(1);
          const actual = require('node:crypto').createHash('sha256').update(Buffer.from(s, 'base64')).digest('hex');
          if (actual !== process.argv[1]) process.exit(2);
          console.log('Success: streamed');
        });
      `;
      const client = {adbPath:process.execPath, _adbEnv:()=>process.env, _args:args=>{
        assert.deepEqual(args,['shell','-T','base64','-d','|','pm','install-write','-S',String(length),'37','part0.apk','-']);
        return ['-e',child,sha256];
      }};
      await writePart(client,'37',0,{path:file,bytes:length,sha256},'win32');
    }
  } finally { await fs.rm(dir,{recursive:true,force:true}); }
});
