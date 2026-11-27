'use strict';
const { validPackageName } = require('../../src/core/pkgname');

async function packagePresent(client, pkg) {
  if (!validPackageName(pkg)) throw Error('Invalid test package');
  // pm path uses the same unsuccessful exit on some guests for absence and
  // transport failure. A successful package listing distinguishes these cases.
  const { stdout } = await client.exec(['shell','pm','list','packages','--user','0',pkg]);
  const rows = stdout.trim().split(/\r?\n/).filter(Boolean);
  if (rows.some(row => !/^package:[\w.]+$/.test(row))) throw Error('Unexpected package-manager response');
  return rows.includes('package:' + pkg);
}
async function verifyCanary(client, pkg, expected) {
  if (!validPackageName(pkg) || !/^[a-f0-9]{64}$/i.test(expected)) throw Error('Invalid canary parameters');
  const { stdout } = await client.exec(['shell','run-as',pkg,'sha256sum','files/asi-canary']);
  const match = /^([a-f0-9]{64})\s+files\/asi-canary$/i.exec(stdout.trim());
  if (!match || match[1].toLowerCase() !== expected.toLowerCase()) throw Error('Private app data canary differs or is missing');
  return true;
}
async function stopAndObserve(client,pkg,check,{timeoutMs=10000,pollMs=300}={}) {
  if (!validPackageName(pkg)) throw Error('Invalid test package');
  await check();
  await client.exec(['shell','am','force-stop','--user','0',pkg]);
  const started=Date.now();
  for (;;) {
    await check();
    const {stdout}=await client.exec(['shell','ps','-A','-o','NAME'],{timeout:5000});
    const rows=stdout.trim().split(/\r?\n/).map(row=>row.trim());
    if (rows.shift()!=='NAME' || !rows.length) throw Error('Cannot verify Android process list');
    if (!rows.some(name=>name===pkg||name.startsWith(pkg+':'))) return Date.now()-started;
    if (Date.now()-started>=timeoutMs) throw Error('App process still present after Android force-stop: '+pkg);
    await new Promise(resolve=>setTimeout(resolve,pollMs));
  }
}
async function launchAndObserve(client,pkg,check) {
  if (!validPackageName(pkg)) throw Error('Invalid test package');
  await check();
  const started = await client.exec(['shell','monkey','-p',pkg,'-c','android.intent.category.LAUNCHER','1']);
  if (!/Events injected:\s*1\b/.test(started.stdout)) throw Error('Android launcher did not issue an event');
  await new Promise(resolve=>setTimeout(resolve,4000));
  const pid = await client.exec(['shell','pidof',pkg]);
  if (!/^\d+(?:\s+\d+)*$/.test(pid.stdout.trim())) throw Error('App process did not survive the observation period');
}
// The caller has already checked the foreground system Activity. Only use a
// visible, enabled deny control from the matching permission controller.
function appManagerDenyControl(xml, controller) {
  if (!['com.android.permissioncontroller','com.google.android.permissioncontroller'].includes(controller)) return null;
  const nodes = (xml.match(/<node\b[^>]*>/g) || []).map(tag =>
    Object.fromEntries([...tag.matchAll(/([\w-]+)="([^"]*)"/g)].map(m=>[m[1],m[2]])));
  const dialog = nodes.filter(n=>n.package === controller);
  const prompt = dialog.find(n=>/\bApp Manager\b/i.test(n.text) && /(?:^|:)id\/permission_message$/.test(n['resource-id']));
  if (!prompt) return null;
  const denyIds = ['com.android.permissioncontroller:id/permission_deny_button',
    'com.android.permissioncontroller:id/permission_deny_dont_ask_again_button',
    'com.android.permissioncontroller:id/permission_deny_and_dont_ask_again_button'];
  const deny = dialog.filter(n=>n.clickable==='true' && n.enabled==='true' && denyIds.includes(n['resource-id']));
  if (deny.length!==1) return null;
  const bounds = /^\[(\d+),(\d+)\]\[(\d+),(\d+)\]$/.exec(deny[0].bounds);
  if (!bounds) return null;
  const [left,top,right,bottom]=bounds.slice(1).map(Number);
  if (left>=right || top>=bottom) return null;
  return {prompt:prompt.text, control:deny[0]['resource-id'], x:Math.floor((left+right)/2), y:Math.floor((top+bottom)/2)};
}
module.exports = { packagePresent, verifyCanary, stopAndObserve, launchAndObserve, appManagerDenyControl };
