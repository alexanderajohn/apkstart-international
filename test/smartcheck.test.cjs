'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { inspectApk, assessCompatibility } = require('../src/core/smartcheck');
const { buildApkBytes } = require('./lib/make-apk');

async function withApk(bytes, fn) {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'asi-smartcheck-'));
  const filename = path.join(folder, 'example.apk');
  try {
    fs.writeFileSync(filename, bytes);
    await fn(filename);
  } finally {
    fs.rmSync(folder, { recursive: true, force: true });
  }
}

test('SmartCheck scans an APK locally, hashes it and extracts manifest permissions', async () => {
  const bytes = buildApkBytes({ permissions: [
    'android.permission.CAMERA', 'android.permission.INTERNET',
    'android.permission.RECORD_AUDIO',
  ] });
  await withApk(bytes, async (file) => {
    const result = await inspectApk(file);
    assert.equal(result.package, 'com.example.test');
    assert.equal(result.minSdk, 21);
    assert.equal(result.targetSdk, 34);
    assert.deepEqual(result.abis, ['arm64-v8a']);
    assert.deepEqual(result.permissions, [
      'android.permission.CAMERA', 'android.permission.INTERNET',
      'android.permission.RECORD_AUDIO',
    ]);
    assert.equal(result.sensitivePermissions.length, 2);
    assert.equal(result.sha256, crypto.createHash('sha256').update(bytes).digest('hex'));
    assert.equal(result.signing.verified, false);
    assert.equal(result.compatibility.level, 'caution');
    assert.ok(result.compatibility.findings.includes('ARM_TRANSLATION_REQUIRED'));
    assert.ok(result.canProceed);
    assert.equal(result.fileName, 'example.apk');
    assert.equal(result.filePath, undefined, 'Do not send local paths to renderer');
    assert.equal(result.iconPng, undefined, 'Do not send large PNG buffers to renderer');
  });
});

test('Min SDK above Android 14 blocks install by default', async () => {
  await withApk(buildApkBytes({ minSdk: 35, targetSdk: 35, abis: ['x86_64'] }), async (file) => {
    const result = await inspectApk(file);
    assert.equal(result.compatibility.level, 'blocked');
    assert.ok(result.compatibility.findings.includes('MIN_SDK_ABOVE_RUNTIME'));
    assert.equal(result.canProceed, false);
  });
});

test('A package with matching x86_64 native libraries has no static ABI blocker', async () => {
  await withApk(buildApkBytes({ abis: ['x86_64'] }), async (file) => {
    const result = await inspectApk(file);
    assert.equal(result.compatibility.level, 'ready');
    assert.deepEqual(result.permissions, []);
    assert.equal(result.signing.evidence, 'not-detected');
    assert.equal(result.signing.verified, false);
  });
});

test('Signature artifact is evidence only, not cryptographic validation', async () => {
  await withApk(buildApkBytes({
    abis: ['x86_64'],
    extraEntries: [{ name: 'META-INF/CERT.RSA', data: Buffer.from('fake-not-a-certificate') }],
  }), async (file) => {
    const result = await inspectApk(file);
    assert.equal(result.signing.evidence, 'v1-certificate-files');
    assert.equal(result.signing.verified, false);
  });
});

test('Old target SDK is a warning, not a malware or binary safety verdict', () => {
  const result = assessCompatibility({
    minSdk: 19, targetSdk: 21, abis: [], sensitivePermissions: [], features: [],
  });
  assert.equal(result.level, 'caution');
  assert.ok(result.findings.includes('OLD_OR_UNKNOWN_TARGET_SDK'));
});

test('Unsupported split packages get limited inspection but retain hash', async () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'asi-bundle-check-'));
  try {
    const file = path.join(folder, 'sample.xapk');
    const bytes = Buffer.alloc(1025, 0x41);
    fs.writeFileSync(file, bytes);
    const result = await inspectApk(file);
    assert.equal(result.supported, false);
    assert.equal(result.compatibility.level, 'caution');
    assert.equal(result.canProceed, true);
    assert.equal(result.sha256.length, 64);
  } finally {
    fs.rmSync(folder, { recursive: true, force: true });
  }
});

test('Unreadable file names, wrong extensions and tiny files are rejected', async () => {
  await assert.rejects(() => inspectApk('/tmp/random.txt'), /Please select/);
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'asi-invalid-check-'));
  try {
    const filename = path.join(folder, 'tiny.apk');
    fs.writeFileSync(filename, Buffer.from('not an apk'));
    await assert.rejects(() => inspectApk(filename), /not a valid Android package/);
  } finally {
    fs.rmSync(folder, { recursive: true, force: true });
  }
});
