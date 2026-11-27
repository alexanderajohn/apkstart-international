'use strict';
/**
 * 运行时自检（不需要打开界面）
 *
 *   npm run selftest                 # 只体检现有运行时
 *   npm run selftest -- --apk a.apk  # 额外走一遍 安装 → 启动 → 截图；--sync 单独测试共享目录
 *
 * 用途：装好 Android 之后，用一条命令确认「双击装应用、独立窗口、数据互通」这条链路
 * 在当前机器上真的成立，出问题时也能定位到具体环节。
 */
const fs = require('fs');
const {randomUUID} = require('node:crypto');
const path = require('path');

const store = require('../src/core/store');
const { Runtime } = require('../src/core/engine');
const { Sharer,checkShareFolder } = require('../src/core/sharer');
const { quoteAndroidPath } = require('../src/core/adb');
const { readOwner, verifyOwner } = require('../src/core/runtime-owner');
const { prepareInstall } = require('../src/core/apk-install-guard');
const { withApprovedCopy } = require('../src/core/install-staging');
const { installSession } = require('../src/core/install-session');
const { packagePresent } = require('./asi/guest-evidence.cjs');

const argv = process.argv.slice(2);
const argOf = (name) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : '';
};
const APK = argOf('--apk');
const syncRequested = argv.includes('--sync');
if (argv.includes('--help')) {
  console.log('Usage: npm run selftest -- [--serial emulator-NNNN] [--apk reviewed.apk] [--sync]. APK and shared-folder tests require the active owned Profile.');
  process.exit(0);
}
// 留空 = 走产品路径自动拉起内置运行时并用动态 serial；指定时才连接外部设备
const SERIAL = argOf('--serial') || '';

const results = [];
function record(name, ok, detail = '') {
  results.push({ name, ok, detail });
  const mark = ok === null ? '○' : ok ? '✓' : '✗';
  console.log(`  ${mark} ${name}${detail ? `  —  ${detail}` : ''}`);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function step(name, fn) {
  process.stdout.write('');
  try {
    const detail = await fn();
    record(name, true, detail || '');
    return true;
  } catch (e) {
    record(name, e && e.skipped ? null : false, e.message);
    return false;
  }
}

(async () => {
  console.log('\nApkStart 运行时自检');
  console.log(`设备：${SERIAL}`);
  console.log('─'.repeat(64));

  console.log('\n[组件]');
  const runtime = new Runtime(path.join(__dirname, '..'));
  const prov = runtime.provisioner;

  let env = null;
  await step('adb 可用', async () => {
    env = await prov.checkEnv();
    if (!env.adb.ok) throw new Error('未安装 adb，请先运行「一键部署」');
    return `v${env.adb.version}`;
  });
  await step('Android Emulator 就绪', async () => {
    if (!env.emulator.ok) throw new Error('未安装运行时引擎，请先运行「一键部署」');
    return `v${env.emulator.version}`;
  });
  await step('系统镜像完整', async () => {
    if (!env.sysimg.ok) throw new Error(env.sysimg.note || '镜像缺失');
    return `Android ${env.sysimg.api} · ${(env.sysimg.size / 1073741824).toFixed(2)}GB`;
  });
  record('硬件加速', env.accel.ok ? true : null,
    env.accel.ok ? env.accel.note : '自动回退软件模拟（能跑，但明显慢）');

  console.log('\n[设备]');
  let client = runtime.client(SERIAL || undefined);
  const online = await step('运行时已就绪', async () => {
    if (SERIAL) {
      if (!await client.isOnline()) throw new Error(`外部设备不在线：${SERIAL}`);
      return SERIAL;
    }
    const r = await runtime.ensure({ onLog: () => {} });
    if (!r.ok) throw new Error(r.error || '运行时不可用');
    client = r.client;
    return client.serial;
  });

  if (!online) {
    console.log('\n设备未就绪，后续项目跳过。');
  } else {
    await step('Android 版本', async () => {
      const [ver, sdk, abi] = await Promise.all([
        client.androidVersion(), client.sdkInt(), client.shell('getprop ro.product.cpu.abi').catch(() => ''),
      ]);
      if (!ver) throw new Error('读不到系统版本');
      return `Android ${ver} (API ${sdk}) · ${String(abi).trim()}`;
    });
    await step('屏幕分辨率', async () => {
      const s = await client.wmSize();
      if (!s) throw new Error('wm size 无返回');
      return `${s.width}×${s.height}`;
    });
    await step('Android freeform setting', async () => {
      const value = await client.shell('settings get global enable_freeform_support');
      return value === '1' ? 'enabled' : 'disabled';
    });

    const profile = store.profiles.currentId();
    const owner = readOwner(store.profiles,profile);
    const check = () => verifyOwner(client,store.profiles,profile,owner);
    if (syncRequested) {
      await step('双向同步', async () => {
        await check();
        const sharer = new Sharer({client:()=>client});
        checkShareFolder(store.getSettings().sharedDir);
        const localDir = store.getSettings().sharedDir;
        fs.mkdirSync(localDir, { recursive: true });
        const probe = path.join(localDir, `selftest-${randomUUID()}.txt`);
        const payload = `apkstart selftest ${new Date().toISOString()}`;
        fs.writeFileSync(probe, payload,{flag:'wx'});

        const up = await sharer.sync();
        if (up.error) throw Error(up.error);
        if (up.errors && up.errors.length) throw new Error(up.errors[0]);
        const remote = `${store.getSettings().deviceSharedDir}/${path.basename(probe)}`;
        await check();
        const back = await client.shell(`cat ${quoteAndroidPath(remote)}`);
        if (!String(back).includes('apkstart selftest')) throw new Error('本机 → 设备 未同步');

        const reverse = path.join(localDir, `selftest-from-device-${randomUUID()}.txt`);
        await check();
        await client.shell(`echo device-side > ${quoteAndroidPath(store.getSettings().deviceSharedDir + '/' + path.basename(reverse))}`);
        await sharer.sync();
        if (!fs.existsSync(reverse) || !fs.readFileSync(reverse, 'utf8').includes('device-side')) {
          throw new Error('设备 → 本机 未同步');
        }
        fs.rmSync(probe, { force: true });
        fs.rmSync(reverse, { force: true });
        await check();
        await client.shell(`rm -f ${quoteAndroidPath(remote)} ${quoteAndroidPath(store.getSettings().deviceSharedDir + '/' + path.basename(reverse))}`);
        return '上行 + 下行均正常';
      });
    }

    if (APK) {
      console.log('\n[应用链路]');
      let approved;
      const installed = await step('Install reviewed APK in the active Profile', async () => {
        await check();
        approved = await prepareInstall(path.resolve(APK),profile);
        if (await packagePresent(client,approved.package)) throw Error('Package already exists in this Profile');
        await withApprovedCopy(approved,profile,staged=>installSession(client,[staged],{
          pkg:approved.package,replace:false,grant:false,checkGuest:check
        }));
        await check();
        if (!await client.isInstalled(approved.package)) throw Error('Android did not confirm the package');
        return approved.package + ' ' + approved.sha256;
      });
      if (installed) {
        const launched = await step('独立窗口启动', async () => {
          await check();
          const component = await client.resolveLauncher(approved.package);
          await client.startApp(approved.package, component, {freeform:false});
          await sleep(4000);
          const top = await client.shell('dumpsys activity activities | grep -E "mResumedActivity|topResumedActivity"');
          if (!String(top).includes(approved.package)) throw new Error('应用未在前台');
          return approved.package;
        });
        if (launched) await step('截图', async () => {
          await check();
          const png = await client.screenshot();
          const out = path.join(__dirname, '..', 'test', 'out');
          fs.mkdirSync(out, { recursive: true });
          const file = path.join(out, 'selftest.png');
          fs.writeFileSync(file, png);
          if (png.length < 4096) throw new Error('截图内容异常');
          return file;
        });
      }
    } else {
      console.log('\n[应用链路] 未指定 --apk，跳过');
    }
  }

  // 自检自己拉起的运行时要主动停掉：否则 emulator 子进程的 stdio 管道
  // 会让 Node 事件循环一直不退出，命令看起来「卡住」
  if (!SERIAL && runtime.emulator.proc?.spawnfile && runtime.emulator.running()) {
    await runtime.stop({}).catch(() => {});
  }

  const failed = results.filter((r) => r.ok === false);
  console.log('\n' + '─'.repeat(64));
  console.log(`结果：${results.filter((r) => r.ok === true).length} 通过，${failed.length} 失败，`
    + `${results.filter((r) => r.ok === null).length} 跳过`);
  if (failed.length) {
    console.log('失败项：');
    failed.forEach((f) => console.log(`  · ${f.name}：${f.detail}`));
    process.exit(1);
  }
  console.log('全部检查通过 ✅\n');
  process.exit(0);
})().catch((e) => {
  console.error('\n自检异常终止：', e.message);
  process.exit(1);
});
