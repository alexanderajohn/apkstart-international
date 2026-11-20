'use strict';
const { createHash } = require('node:crypto');
const { validPackageName } = require('./pkgname');
const { expectedAvd } = require('./runtime-readiness');

function shortcutProfile(argv) {
  const flags = argv.filter(a => a === '--profile').length;
  if (!flags) return 'default';
  const value = argv[argv.indexOf('--profile') + 1];
  if (flags !== 1 || !value) return null;
  try { expectedAvd(value); return value; } catch { return null; }
}
function shortcutIdentity(pkg, profile) {
  expectedAvd(profile);
  if (!validPackageName(pkg)) throw Error('Invalid Android app shortcut');
  const digest = createHash('sha256').update(profile + '/' + pkg).digest('hex').slice(0,16);
  return { args:'--launch "' + pkg + '" --profile ' + profile, suffix:digest,
    aumid:profile === 'default' ? ('ApkStartInternational.Desktop.' + pkg).slice(0,128) :
      'ApkStartInternational.Desktop.' + profile + '.' + digest };
}
module.exports = { shortcutProfile, shortcutIdentity };
