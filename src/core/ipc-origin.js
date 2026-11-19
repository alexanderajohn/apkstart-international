'use strict';
const path = require('node:path');
const {pathToFileURL} = require('node:url');

const shellActions = new Set(['shell:state','shell:minimize','shell:maximize','shell:close',
  'shell:rotate','shell:back','shell:forward','shell:keyEvent']);
const splashActions = new Set(['splash:version','splash:isFirstRun','splash:bundled','splash:close']);

function authorizeSender(event, channel, windows) {
  const frame = event.senderFrame;
  if (!frame || !event.sender || frame !== event.sender.mainFrame) throw Error('Untrusted IPC frame');
  const page = Object.keys(windows).find(name => windows[name] && !windows[name].isDestroyed() &&
    event.sender === windows[name].webContents);
  if (!page) throw Error('Unknown IPC window');
  const expected = pathToFileURL(path.join(__dirname,'..','ui',page+'.html')).href;
  const url = new URL(frame.url);
  url.hash = '';
  if (url.href !== expected || (page === 'shell' && !shellActions.has(channel)) ||
      (page === 'splash' && !splashActions.has(channel))) throw Error('IPC access denied');
}

function externalWebUrl(value) {
  const url = new URL(value);
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw Error('Expected a web URL');
  return url.href;
}
module.exports = {authorizeSender,externalWebUrl};
