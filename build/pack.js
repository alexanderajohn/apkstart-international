'use strict';
/**
 * 便携版打包：产出 dist/ApkStart-International-win64-portable/
 *   ApkStart International.exe（electron.exe 改名 + 写入图标/版本资源）+ resources/app（本应用源码）
 * 无需安装器，解压即用。
 *
 * --full（或 APKSTART_PACK_FULL=1）时产出「完整版」：
 *   额外把 build/runtime 复制进 resources/runtime，解压即用、首次启动不需要下载任何东西。
 *   输出目录默认 dist/ApkStart-v<版本>-win64-full，不会覆盖轻量版。
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { assertStandalone } = require('./guard-standalone');

const ROOT = path.join(__dirname, '..');
const PKG = require(path.join(ROOT, 'package.json'));
const FULL = process.argv.includes('--full') || process.env.APKSTART_PACK_FULL === '1';
// 允许指定输出目录（用于目标目录被正在运行的实例占用时，先构建到别处再替换）
let OUT = process.env.APKSTART_PACK_OUT
  ? path.resolve(process.env.APKSTART_PACK_OUT)
  : path.join(ROOT, 'dist', FULL ? `ApkStart-International-v${PKG.version}-win64-full` : 'ApkStart-International-win64-portable');
const ELECTRON_DIST = path.join(ROOT, 'node_modules', 'electron', 'dist');

function copy(src, dest) {
  fs.cpSync(src, dest, { recursive: true });
}

console.log(FULL ? '打包完整版（含运行时）→' : '打包便携版 →', OUT);
// 目标已存在时不做整树删除：部分环境会拦截批量删除，且打包中途失败会丢掉
// 上一个可用版本。改为先把旧目录改名保留，再全新构建；占用中则自动换目录。
if (fs.existsSync(OUT)) {
  try {
    const backup = `${OUT}.prev-${new Date().toISOString().replace(/[:.]/g, '-')}`;
    fs.renameSync(OUT, backup);
    console.log('旧版本已保留 →', backup);
  } catch (_) {
    // 某些环境（杀软 / 搜索索引 / 资源管理器）会长时间持有目录句柄，
    // 整目录改名必然 EBUSY；这时退到带版本号的目录，产物一样可用且不再重名。
    OUT = path.join(ROOT, 'dist', `ApkStart-International-v${require(path.join(ROOT, 'package.json')).version}-win64-portable`);
    console.log('旧目录被占用，改输出到 →', OUT);
  }
}
fs.mkdirSync(path.join(OUT, 'resources', 'app'), { recursive: true });

// 1. Electron 运行时
console.log('复制 Electron 运行时…');
copy(ELECTRON_DIST, OUT);
fs.rmSync(path.join(OUT, 'resources', 'default_app.asar'), { force: true });

// 1.1 语言包瘦身：Electron 自带 55 种语言，合计 41MB，我们只用中文界面。
//     只留 zh-CN / zh-TW / en-US，其余删掉（-39MB，等于整包小 15%）。
const KEEP_LOCALES = new Set(['zh-CN.pak', 'zh-TW.pak', 'en-US.pak', 'vi.pak']);
let localeSaved = 0;
try {
  const locDir = path.join(OUT, 'locales');
  for (const f of fs.readdirSync(locDir)) {
    if (KEEP_LOCALES.has(f)) continue;
    localeSaved += (() => { try { return fs.statSync(path.join(locDir, f)).size; } catch (_) { return 0; } })();
    fs.rmSync(path.join(locDir, f), { force: true });
  }
} catch (_) { /* 没有 locales 目录也不影响 */ }

// 1.2 没人会点开的文件：更新日志、调试符号、部分无用的 pak（各自 0.1~9MB）
for (const rel of ['LICENSES.chromium.html.bak', 'vk_swiftshader_icd.json.bak']) {
  fs.rmSync(path.join(OUT, rel), { force: true });
}

// 1.3 可省掉的运行库：
//     d3dcompiler_47.dll 负责把 ANGLE 的 HLSL 编成 GPU 指令，但 Windows 8.1 起
//     System32 里就自带同名 DLL，LoadLibrary 找不到包内那份会自然用系统的。
//     实测删掉后界面/图标/字体渲染完全正常（--smoke 截图对比无差异）。压紧 2.1MB。
//     注意：vk_swiftshader.dll / vulkan-1.dll 不能删 —— GPU 驱动不可用时 Chromium
//     靠它做软件兜底，删了会白屏。
let pruneSaved = 0;
for (const rel of ['d3dcompiler_47.dll']) {
  const p = path.join(OUT, rel);
  try {
    pruneSaved += fs.statSync(p).size;
    fs.rmSync(p, { force: true });
  } catch (_) { /* 本来就没有 */ }
}

console.log('复制应用…');
const appDir = path.join(OUT, 'resources', 'app');
// Preview artifacts do not redistribute the upstream-bundled Chinese IME APK.
for (const item of ['package.json', 'src', 'LICENSE', 'CREDITS.md']) {
  copy(path.join(ROOT, item), path.join(appDir, item));
}

// Portable runtime needs the native LZMA package for on-demand image expansion.
for (const name of ['lzma', 'lzma-win32-x64-msvc']) {
  const dep = path.join(ROOT, 'node_modules', '@napi-rs', name);
  if (fs.existsSync(dep)) {
    copy(dep, path.join(appDir, 'node_modules', '@napi-rs', name));
  }
}

// The source engine directory may also hold a developer's local Android runtime.
fs.mkdirSync(path.join(appDir, 'engine'), { recursive: true });
copy(path.join(ROOT, 'engine', 'README.md'), path.join(appDir, 'engine', 'README.md'));

// 3.5 完整版：把运行时（emulator + platform-tools + 系统镜像）也放进去
if (FULL) {
  const runtime = path.join(ROOT, 'build', 'runtime');
  const runtimeExe = path.join(runtime, 'emulator', 'emulator.exe');
  if (!fs.existsSync(runtimeExe)) {
    console.error('\n[!] 找不到 build/runtime/emulator/emulator.exe。');
    console.error('    先跑 node build/prepare-runtime.js（npm run runtime）生成运行时，再打完整版。\n');
    process.exit(1);
  }
  console.log('内置运行时（约 1 GB，需要一会儿）…');
  fs.cpSync(runtime, path.join(OUT, 'resources', 'runtime'), { recursive: true });
}

// 3.6 独立运行守卫：产物里不许出现 MuMu / 雷电 / 蓝叠等第三方模拟器。
// 命中就让构建失败 —— 这类问题只会在「别人的电脑」上暴露，本地永远测不出来。
assertStandalone(path.join(OUT, 'resources'), { label: '便携版 resources' });

// 4. 改名主程序
const exePath = path.join(OUT, 'ApkStart International.exe');
fs.renameSync(path.join(OUT, 'electron.exe'), exePath);

/**
 * 给 ApkStart International.exe 写入图标与版本资源。
 *
 * 为什么必须做：直改名出来的 exe 里面还是 Electron 的东西 ——
 * FileDescription=Electron、ProductName=Electron、CompanyName=GitHub, Inc.、
 * 版本号 33.4.11，图标也是 Electron 的。于是资源管理器、任务栏固定项、
 * 快捷方式属性、杀软/系统信息里全显示「Electron」和默认图标，
 * 用户看到的就是「图标是默认的」。
 *
 * rcedit 是 electron-builder / electron-winstaller 用的同一个工具，
 * 这里直接用 node_modules 里现成的那份，不需要联网。
 */
// Windows PE VERSIONINFO must use 4 numeric parts (prerelease labels are invalid).
function numericFileVersion(version) {
  const nums = String(version).match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!nums) throw new Error('Invalid release version: ' + version);
  const ordinal = /(?:beta|rc)[.-]?(\d+)/i.exec(String(version));
  return [nums[1],nums[2],nums[3],ordinal ? ordinal[1] : '0'].join('.');
}
function embedExeMeta(exe) {
  const rcedit = [
    path.join(ROOT, 'node_modules', 'electron-winstaller', 'vendor', 'rcedit.exe'),
    path.join(ROOT, 'node_modules', 'rcedit', 'bin', 'rcedit-x64.exe'),
  ].find((p) => fs.existsSync(p));
  if (!rcedit) {
    console.warn('  [!] 找不到 rcedit.exe，exe 图标/版本信息保持 Electron 默认值');
    return false;
  }
  const ico = path.join(ROOT, 'src', 'ui', 'assets', 'appicon.ico');
  if (!fs.existsSync(ico)) {
    console.warn(`  [!] 找不到 ${ico}，跳过图标写入`);
    return false;
  }
  const args = [
    exe,
    '--set-icon', ico,
    // 四段式文件版本（和 MSIX 的口径一致），产品版本用三段式
    '--set-file-version', numericFileVersion(PKG.version),
    '--set-product-version', numericFileVersion(PKG.version),
    '--set-version-string', 'ProductName', 'ApkStart International',
    '--set-version-string', 'FileDescription', 'ApkStart International Android app runner',
    '--set-version-string', 'CompanyName', 'ApkStart International contributors',
    '--set-version-string', 'LegalCopyright', 'Copyright (c) 2026 ApkStart International contributors',
    '--set-version-string', 'OriginalFilename', 'ApkStart International.exe',
    '--set-version-string', 'InternalName', 'ApkStart International',
  ];
  try {
    execFileSync(rcedit, args, { stdio: 'pipe', windowsHide: true });
    console.log(`  exe 图标/版本已写入（${PKG.version}，FileDescription=ApkStart 安卓应用运行器）`);
    return true;
  } catch (e) {
    console.warn(`  [!] rcedit 失败：${e.message}`);
    return false;
  }
}
if (!embedExeMeta(exePath)) throw Error('Cannot embed Windows candidate identity');

// 5. 版本信息
const pkg = PKG;
const fullNote = FULL ? 'Bundled runtime (NOT cleared for redistribution)' : 'Developer preview: no bundled runtime or Pinyin IME; Android SDK downloads on demand';
fs.writeFileSync(path.join(OUT, 'VERSION.txt'),
  `ApkStart International ${pkg.version}\n${fullNote}\n构建时间：${new Date().toLocaleString('en-US')}\n`);

// 6. 体积报告：每次打包都打印，避免以后又悄悄变胖
function dirSize(dir) {
  let n = 0;
  try {
    for (const it of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, it.name);
      n += it.isDirectory() ? dirSize(p) : fs.statSync(p).size;
    }
  } catch (_) { /* ignore */ }
  return n;
}
const totalMB = dirSize(OUT) / 1048576;
console.log(
  `完成。整包 ${totalMB.toFixed(0)} MB（语言包省了 ${(localeSaved / 1048576).toFixed(0)} MB，`
  + `冗余运行库省了 ${(pruneSaved / 1048576).toFixed(1)} MB）。`,
);
console.log('压缩：node build/zip.js ' + path.relative(ROOT, OUT) + ' <输出.zip>');
console.log(`运行 ${path.join(OUT, 'ApkStart International.exe')} 即可使用。`);
if (!FULL) console.log('想要「一次下载、装完不联网」的完整版：node build/pack.js --full');
