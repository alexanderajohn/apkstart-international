'use strict';
const fs = require('node:fs');
const path = require('node:path');

function location(registry, id = registry.currentId()) {
  return path.join(registry.paths(id).root, 'restore-in-progress.json');
}

function assertRestoreFinished(registry) {
  const file = location(registry);
  try { fs.lstatSync(file); } catch (error) {
    if (error.code === 'ENOENT') return;
    throw error;
  }
  throw Error('Interrupted Profile restore. Keep Android stopped and inspect ' + file);
}

async function beginRestore(registry, profileId, transaction, stages) {
  const file = location(registry, profileId);
  const handle = await fs.promises.open(file, 'wx', 0o600);
  try {
    const components = stages.map(({c, target, stage, safety, present}) =>
      ({component:c, target, stage, safety, present, hadOriginal:fs.existsSync(target)}));
    await handle.writeFile(JSON.stringify({version:1, profileId, transaction, components}, null, 2));
    await handle.sync();
  } finally { await handle.close(); }
  return file;
}

module.exports = {assertRestoreFinished, beginRestore};
