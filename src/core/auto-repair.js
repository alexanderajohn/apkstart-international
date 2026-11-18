'use strict';
/**
 * ApkStart International Auto-Repair 2.0.
 *
 * Diagnosis is read-only. Any repair is explicitly approved by the user and
 * restricted to a small allowlist. No APK data, snapshots, AVDs, system
 * drivers, files or Windows settings are deleted/modified by this module.
 */
const doctor = require('./doctor');

const SIGNALS = [
  { code:'ADB_UNAUTHORIZED', re:/(?:adb|device|emulator).{0,70}(?:unauthorized|authorization denied)|device unauthorized|allow usb debugging/i, severity:'warn' },
  { code:'ADB_OFFLINE', re:/device\s+offline|adb.{0,60}(?:connection refused|connect failed|timed out|unable to connect)|unable to connect to adb daemon|device not found/i, severity:'warn', action:'adb-reconnect' },
  { code:'GPU_FAILURE', re:/0xC0000005|STATUS_ACCESS_VIOLATION|emulator exit 3221225477|Failed to initialize GL emulation|Failed to create.{0,35}GLES|EGL_(?:BAD|NOT_INITIALIZED|CONTEXT_LOST)|vulkan.{0,35}(?:failed|error)|ANGLE.{0,35}(?:fail|error)|Unsupported gpu|invalid.{0,12}-gpu/i, severity:'error', action:'gpu-software' },
  { code:'HYPERVISOR', re:/x86_64 emulation currently requires hardware acceleration|WHPX.{0,60}(?:failed|not available|disabled)|AEHD.{0,60}(?:failed|not available)|hardware acceleration.{0,60}(?:not available|failed)/i, severity:'warn' },
  { code:'SNAPSHOT_FAILURE', re:/snapshot.{0,100}(?:corrupt|fail(?:ed)?|invalid|incompatible|error)|(?:failed|cannot|could not).{0,55}(?:load|restore).{0,30}snapshot|ram\.img.{0,60}(?:corrupt|fail|error)|quick boot.{0,60}(?:failed|corrupt)/i, severity:'warn', action:'snapshot-disable' },
  { code:'DISK_FULL', re:/No space left|disk full|ENOSPC|insufficient disk space/i, severity:'error' },
  { code:'MEMORY', re:/Cannot allocate memory|not enough memory|out of memory|commit charge/i, severity:'error' },
  { code:'PORT_BUSY', re:/address already in use|port.{0,25}(?:in use|busy)|Failed to bind.{0,30}port/i, severity:'warn' },
  { code:'AVD_LOCK', re:/AVD.{0,40}already running|hardware-qemu\.ini\.lock|multiinstance\.lock|AVD.{0,30}in use/i, severity:'warn' },
  { code:'IMAGE_FAILURE', re:/system\.img.{0,40}(?:missing|not found|corrupt)|kernel-ranchu.{0,40}(?:missing|not found)|verity.{0,25}fail|boot loop/i, severity:'error' },
  { code:'DLL_MISSING', re:/0xc0000135|STATUS_DLL_NOT_FOUND|MSVCP140|VCRUNTIME|Qt6.{0,30}not found/i, severity:'error' },
];
const DIAG_MAP = {
  ACCESS_VIOLATION:'GPU_FAILURE', GPU_INIT:'GPU_FAILURE', GPU_MODE:'GPU_FAILURE',
  ACCEL:'HYPERVISOR', SNAPSHOT:'SNAPSHOT_FAILURE', DISK_FULL:'DISK_FULL',
  MEMORY:'MEMORY', PORT_BUSY:'PORT_BUSY', AVD_LOCK:'AVD_LOCK',
  IMAGE:'IMAGE_FAILURE', DLL:'DLL_MISSING',
};
const METADATA = {
  MISSING_ADB:{severity:'error'}, MISSING_EMULATOR:{severity:'error'},
  MISSING_IMAGE:{severity:'warn'}, HYPERVISOR:{severity:'warn'},
  ADB_UNAUTHORIZED:{severity:'warn'}, ADB_OFFLINE:{severity:'warn',action:'adb-reconnect'},
  GPU_FAILURE:{severity:'error',action:'gpu-software'},
  SNAPSHOT_FAILURE:{severity:'warn',action:'snapshot-disable'},
  DISK_FULL:{severity:'error'}, MEMORY:{severity:'error'},
  PORT_BUSY:{severity:'warn'}, AVD_LOCK:{severity:'warn'},
  IMAGE_FAILURE:{severity:'error'}, DLL_MISSING:{severity:'error'},
  UNKNOWN_FAILURE:{severity:'warn'},
};
const ALLOWED_ACTIONS = new Set(['gpu-software', 'snapshot-disable', 'adb-reconnect']);

function buildRepairPlan({ env = {}, vmRunning = false, adbState = '', failure = null,
  diagnosis = null, logLines = [], settings = {} } = {}) {
  const items = [];
  const seen = new Set();
  const add = (code) => {
    if (!METADATA[code] || seen.has(code)) return;
    seen.add(code);
    const {severity, action} = METADATA[code];
    const actionable = !!action
      && (action !== 'adb-reconnect' || (vmRunning && env.adb?.ok && adbState !== 'unauthorized'))
      && (action !== 'snapshot-disable' || settings.engine?.keepSnapshot !== false);
    items.push({code,severity,action:actionable?action:null});
  };
  if (env.adb?.ok === false) add('MISSING_ADB');
  if (env.emulator?.ok === false) add('MISSING_EMULATOR');
  if (env.sysimg?.ok === false) add('MISSING_IMAGE');
  if (env.accel?.ok === false) add('HYPERVISOR');
  if (vmRunning) {
    if (adbState === 'unauthorized') add('ADB_UNAUTHORIZED');
    else if (adbState === 'offline' || adbState === 'no-device') add('ADB_OFFLINE');
  } else {
    // A persisted failure can outlive the process. Don't treat it as a current
    // problem when Android is already running successfully.
    const diagnosticCode = String(diagnosis?.code || failure?.diagnosis?.code || '');
    if (DIAG_MAP[diagnosticCode]) add(DIAG_MAP[diagnosticCode]);
    if (Number(failure?.exitCode) === 3221225477) add('GPU_FAILURE');
    const log = (Array.isArray(logLines) ? logLines.slice(-200).join('\n') : String(logLines || '')).slice(-32000);
    for (const signal of SIGNALS) {
      if (signal.re.test(log)) add(signal.code);
    }
    if (failure && !items.some((item) => !item.code.startsWith('MISSING_') && item.code !== 'HYPERVISOR')) {
      add('UNKNOWN_FAILURE');
    }
  }
  // Pure plan: no shell, no data mutation, no raw log or personally identifying path.
  const safeActions = [...new Set(items.map((item) => item.action).filter((item) => item && ALLOWED_ACTIONS.has(item)))];
  return {
    version: 2, running: !!vmRunning,
    source: vmRunning ? 'live' : failure ? 'last-failure' : 'environment',
    items, safeActions,
    requiresUserApproval: true,
    dataPolicy: 'No Android app data or snapshots are deleted.',
  };
}

async function applySafeRepair(action, {plan, settings, saveSettings, runtime, emulatorVersion = '', adbPort = 5044} = {}) {
  if (!ALLOWED_ACTIONS.has(action) || !plan?.safeActions?.includes(action)) {
    throw Object.assign(new Error('Repair action not available for this diagnosis'), {code:'ASI_REPAIR_NOT_ALLOWED'});
  }
  if (typeof saveSettings !== 'function') throw new TypeError('Missing settings callback');
  if (action === 'gpu-software') {
    const candidates = doctor.gpuCandidates(emulatorVersion);
    const gpu = candidates.find((candidate) => candidate === 'software' || candidate === 'swiftshader_indirect')
      || candidates.find((candidate) => candidate === 'swiftshader') || '';
    if (!gpu) throw new Error('No supported software GPU mode found');
    if (settings?.engine?.gpuMode !== gpu) saveSettings({engine:{gpuMode:gpu}});
    return {ok:true, action, nextBoot:true, changed:settings?.engine?.gpuMode !== gpu, detail:'software-gpu-selected'};
  }
  if (action === 'snapshot-disable') {
    // Merely disable Quick Boot loading on the next launch. Never invalidate or
    // delete snapshot files; NEVER set the emulator -wipe-data flag.
    if (settings?.engine?.keepSnapshot !== false) saveSettings({engine:{keepSnapshot:false}});
    return {ok:true, action, nextBoot:true, changed:settings?.engine?.keepSnapshot !== false, detail:'quickboot-disabled'};
  }
  // Avoid touching global ADB (5037) or a user-selected server. The
  // application's dedicated ADB port is 5044. Only reconnect a running VM.
  if (action === 'adb-reconnect') {
    if (Number(adbPort) !== 5044 || !runtime?.vmRunning || !runtime.emulator?.resetAdbServer) {
      throw Object.assign(new Error('Isolated ADB repair is not available'), {code:'ASI_ADB_ISOLATION_REQUIRED'});
    }
    const started = await runtime.emulator.resetAdbServer();
    const online = started && await runtime.client().isOnline().catch(() => false);
    return {ok:!!online, action, nextBoot:false, changed:!!started, detail:online?'adb-online':'adb-still-offline'};
  }
  throw new Error('Unreachable repair branch');
}

module.exports = { buildRepairPlan, applySafeRepair, ALLOWED_ACTIONS };
