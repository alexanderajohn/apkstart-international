'use strict';
const { createHash } = require('node:crypto');
const { validPackageName } = require('./pkgname');
const { expectedAvd } = require('./runtime-readiness');

// Chromium may reorder switches before positional arguments in a second instance.
// Use attached values for new links and still accept an existing ordered shortcut.
function switchValue(argv, name) {
  const options = argv.filter(arg => arg === name || arg.startsWith(name + '='));
  if (options.length === 0) return undefined;
  if (options.length !== 1) return null;
  return options[0] === name ? argv[argv.indexOf(name) + 1] || null : options[0].slice(name.length + 1);
}
function shortcutProfile(argv) {
  const value = switchValue(argv, '--profile');
  if (value === undefined) return 'default';
  try { expectedAvd(value); return value; } catch { return null; }
}
function shortcutLaunch(argv) {
  const value = switchValue(argv, '--launch');
  return validPackageName(value) ? value : null;
}
function shortcutIdentity(pkg, profile) {
  expectedAvd(profile);
  if (!validPackageName(pkg)) throw Error('Invalid Android app shortcut');
  const digest = createHash('sha256').update(profile + '/' + pkg).digest('hex').slice(0,16);
  return { args:'--launch=' + pkg + ' --profile=' + profile, suffix:digest,
    aumid:profile === 'default' ? ('ApkStartInternational.Desktop.' + pkg).slice(0,128) :
      'ApkStartInternational.Desktop.' + profile + '.' + digest };
}
module.exports = { shortcutProfile, shortcutLaunch, shortcutIdentity };
