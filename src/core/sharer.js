'use strict';
/**
 * 本机 ↔ 安卓 的共享目录双向同步
 *
 * 没有 root 的情况下无法真正「挂载」目录，所以采用增量同步：
 * 任何一侧新增/修改的文件都会在几秒内同步到另一侧，语义上等价于共享文件夹。
 */
const fs = require('fs');
const path = require('path');
const {randomUUID} = require('node:crypto');
const store = require('./store');
const {validRelative, within} = require('./backup-center');
const {readOwner, verifyOwner} = require('./runtime-owner');
const {quoteAndroidPath} = require('./adb');

function plainPath(target) {
  if (!path.isAbsolute(target)) throw Error('Choose an absolute shared folder');
  const parent = path.dirname(target);
  if (parent !== target) plainPath(parent);
  try {
    if (fs.lstatSync(target).isSymbolicLink()) throw Error('Linked shared folder or file');
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  return target;
}

function checkShareFolder(dir, id = store.profiles.currentId()) {
  plainPath(dir);
  if (path.resolve(dir) === path.parse(dir).root) throw Error('Select a folder below the drive root');
  const managed = path.join(store.profiles.profileRoot(id),'shared');
  if ((within(dir,store.DATA_DIR) || within(store.DATA_DIR,dir)) &&
      !(id !== 'default' && path.resolve(dir) === path.resolve(managed))) throw Error('Choose a shared folder outside application data');
  for (const profile of store.profiles.list().profiles) {
    if (profile.id === id) continue;
    const other = store.getSettings(profile.id).sharedDir;
    if (within(other,dir) || within(dir,other)) throw Error('Shared folder overlaps another Android Profile');
  }
}

const MAX_FILE = 512 * 1024 * 1024; // 单文件 512MB 上限

function walk(dir, base = dir, out = []) {
  let items = [];
  plainPath(dir);
  try { items = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return out; }
  for (const it of items) {
    if (it.name.startsWith('.')) continue;
    const full = path.join(dir, it.name);
    if (it.isDirectory()) walk(full, base, out);
    else if (it.isFile()) {
      try {
        const st = fs.statSync(full);
        if (st.size <= MAX_FILE) {
          out.push({ abs: full, rel: path.relative(base, full).split(path.sep).join('/'), mtime: st.mtimeMs, size: st.size });
        }
      } catch (_) { /* ignore */ }
    }
  }
  return out;
}

class Sharer {
  constructor(runtime) {
    this.runtime = runtime;
    this._busy = false;
    this._timer = null;
    this._lastError = '';
  }

  get localDir() { return store.getSettings().sharedDir; }
  get remoteDir() { return store.getSettings().deviceSharedDir; }

  loadState(stateFile, localDir, remoteDir) {
    try {
      const stored = JSON.parse(fs.readFileSync(plainPath(stateFile),'utf8'));
      if (stored.version === 2) {
        return Object.assign(Object.create(null),
          stored.localDir === localDir && stored.remoteDir === remoteDir ? stored.files : {});
      }
      return Object.assign(Object.create(null),stored);
    } catch (error) {
      if (error.code === 'ENOENT') return Object.create(null);
      throw error;
    }
  }

  saveState(stateFile, files, localDir, remoteDir) {
    const state = {version:2,localDir,remoteDir,files};
    const temp = stateFile + '.' + randomUUID();
    try {
      fs.writeFileSync(temp, JSON.stringify(state), {flag:'wx',mode:0o600});
      fs.renameSync(temp,plainPath(stateFile));
    } finally { fs.rmSync(temp,{force:true}); }
  }

  async sync({ onLog = () => {} } = {}) {
    if (this._busy) return { skipped: true };
    this._busy = true;
    const result = { pushed: 0, pulled: 0, errors: [] };
    try {
      const id = store.profiles.currentId(), localDir = this.localDir, remoteDir = this.remoteDir;
      checkShareFolder(localDir,id);
      if (!remoteDir.startsWith('/') || !validRelative(remoteDir.slice(1))) throw Error('Invalid Android shared folder');
      const stateFile = path.join(store.profiles.profileRoot(id),'shared-state.json');
      const client = this.runtime.client();
      const owner = readOwner(store.profiles,id);
      const check = async () => {
        if (id !== store.profiles.currentId() || store.profileSwitching || localDir !== this.localDir || remoteDir !== this.remoteDir)
          throw Error('Android Profile or shared folder changed during synchronization');
        await verifyOwner(client,store.profiles,id,owner);
      };
      await check();
      fs.mkdirSync(plainPath(localDir), {recursive:true});
      await client.shellMkdir(remoteDir);
      const state = this.loadState(stateFile,localDir,remoteDir);

      // --- 本机 → 设备 ---
      // 状态里同时记「本机 mtime」和「设备 mtime」两个值。
      // 老实现只记一个 mtime、拉完写回本机时间，于是下一轮拿本机时间去和设备的
      // 时间比 —— 永远不相等 → 每 8 秒把同一个文件从设备拉一遍，落盘时间又变，
      // 再下一轮继续拉……表现就是「硬盘一直转、文件反复重写、空间越用越少」。
      const stateOf = (prev) => (prev ? {
        size: prev.size,
        lmtime: prev.lmtime || prev.mtime || 0,
        rmtime: prev.rmtime || 0,
        dir: prev.dir || '',
      } : null);

      const remoteList = await client.listRemoteStat(remoteDir) ?? await this.listRemoteRecursive(client,remoteDir);
      const remoteFiles = new Map(remoteList.map(row=>[row.rel,row]));
      const keepLocal = new Set();
      const localFiles = walk(localDir);
      for (const f of localFiles) {
        const prev = stateOf(state[f.rel]);
        const changed = !prev || prev.size !== f.size || Math.abs(prev.lmtime - f.mtime) > 1500;
        if (!changed) continue;
        const onDevice = remoteFiles.get(f.rel);
        if (onDevice && (!prev || onDevice.size !== prev.size || !prev.rmtime || !onDevice.mtime ||
            Math.abs(onDevice.mtime-prev.rmtime)>1500)) {
          keepLocal.add(f.rel);
          result.errors.push('Both copies need review: '+f.rel);
          continue;
        }
        const remote = `${remoteDir}/${f.rel}`;
        try {
          if (!validRelative(f.rel)) throw Error('Unsupported shared filename');
          await check();
          await client.shellMkdir(path.posix.dirname(remote));
          await check();
          await client.push(plainPath(f.abs), remote);
          state[f.rel] = { size: f.size, lmtime: f.mtime, rmtime: 0, dir: 'up', at: Date.now() };
          keepLocal.add(f.rel);
          result.pushed++;
        } catch (e) {
          keepLocal.add(f.rel);
          result.errors.push(`↑ ${f.rel}: ${e.message}`);
        }
      }

      for (const r of remoteList) {
        // 超大文件（视频/游戏数据包）不往回拉：本地目录不该成为设备缓存的下水道
        if (!validRelative(r.rel) || !Number.isSafeInteger(r.size) || r.size < 0 || r.size > MAX_FILE) {
          result.errors.push('Unsupported Android shared entry'); continue;
        }
        if (keepLocal.has(r.rel) || r.rel.split('/').some(part=>part.startsWith('.'))) continue;
        const prev = stateOf(state[r.rel]);
        const sizeSame = !!prev && prev.size === r.size;
        const rmtimeSame = !!(prev && prev.rmtime && r.mtime)
          && Math.abs(prev.rmtime - r.mtime) <= 1500;
        if (prev && sizeSame && (rmtimeSame || (prev.dir === 'up' && !prev.rmtime))) {
          // 大小一致，且要么设备时间没变、要么这个文件就是我们刚推上去的：
          // 只把设备时间记下来收工，绝不重复下载
          if (r.mtime && prev.rmtime !== r.mtime) {
            state[r.rel] = { ...prev, rmtime: r.mtime };
          }
          continue;
        }
        if (prev && sizeSame && !r.mtime) continue;   // 拿不到设备时间且大小相同 → 视为一致
        const local = path.join(localDir, r.rel);
        let staging;
        try {
          await check();
          const original = fs.lstatSync(plainPath(local),{throwIfNoEntry:false});
          fs.mkdirSync(path.dirname(local), {recursive:true});
          staging = fs.mkdtempSync(path.join(path.dirname(local),'.asi-transfer-'));
          const temporary = path.join(staging,'file');
          await client.pull(`${remoteDir}/${r.rel}`, temporary);
          const downloaded = fs.lstatSync(temporary);
          if (!downloaded.isFile() || downloaded.size !== r.size) throw Error('Incomplete Android download');
          await check();
          plainPath(temporary);
          plainPath(local);
          if (original) {
            const current = fs.lstatSync(local);
            if (current.dev!==original.dev || current.ino!==original.ino || current.size!==original.size ||
                current.mtimeMs!==original.mtimeMs) throw Error('Shared file changed during download');
            fs.renameSync(temporary,local);
          } else {
            try {
              fs.linkSync(temporary,local);
            } catch (error) {
              if (!['ENOTSUP','EOPNOTSUPP','ENOSYS','EPERM'].includes(error.code)) throw error;
              fs.copyFileSync(temporary,local,fs.constants.COPYFILE_EXCL);
            }
          }
          const st = fs.statSync(local);
          state[r.rel] = { size: st.size, lmtime: st.mtimeMs, rmtime: r.mtime || 0, dir: 'down', at: Date.now() };
          result.pulled++;
        } catch (e) {
          result.errors.push(`↓ ${r.rel}: ${e.message}`);
        } finally {
          if (staging) {
            fs.rmSync(plainPath(path.join(staging,'file')), {force:true});
            fs.rmdirSync(plainPath(staging));
          }
        }
      }

      await check();
      this.saveState(stateFile,state,localDir,remoteDir);
      this._lastError = result.errors[0] || '';
      return result;
    } catch (e) {
      this._lastError = e.message;
      return { ...result, error: e.message };
    } finally {
      this._busy = false;
    }
  }

  async listRemoteRecursive(client, base, prefix = '', depth = 0, out = []) {
    if (depth > 6) return out;
    // 优先一次 find + stat 拿全量（比逐目录 ls -l 快，也不受日期格式差异影响）
    if (depth === 0 && !prefix) {
      try {
        const text = await client.shell(
          `cd ${quoteAndroidPath(base)} 2>/dev/null && find . -type f -exec stat -c '%s|%Y|%n' {} + 2>/dev/null`,
        );
        const rows = String(text).split('\n').map((l) => l.trim()).filter(Boolean)
          .map((l) => /^(\d+)\|(\d+)\|(.+)$/.exec(l))
          .filter(Boolean)
          .map((m) => ({ rel: m[3].replace(/^\.\//, ''), size: Number(m[1]), mtime: Number(m[2]) * 1000 }));
        if (rows.length) return rows;
      } catch (_) { /* 落到 ls 解析 */ }
    }
    const items = await client.listRemote(prefix ? `${base}/${prefix}` : base);
    for (const it of items) {
      if (!validRelative(it.name) || it.name.includes('/')) continue;
      const rel = prefix ? `${prefix}/${it.name}` : it.name;
      if (it.isDir) {
        // eslint-disable-next-line no-await-in-loop
        await this.listRemoteRecursive(client, base, rel, depth + 1, out);
      } else {
        out.push({ rel, size: it.size, mtime: Date.now() });
      }
    }
    return out;
  }

  start(intervalMs = 8000) {
    if (this._timer) return;
    this._timer = setInterval(() => { this.sync().catch(() => {}); }, intervalMs);
    if (this._timer.unref) this._timer.unref();
  }

  stop() {
    if (this._timer) clearInterval(this._timer);
    this._timer = null;
  }

  get lastError() { return this._lastError; }
}

module.exports = { Sharer, checkShareFolder, plainPath };
