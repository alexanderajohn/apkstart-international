'use strict';

/*
 * Android app permissions require user consent by default.
 * Allowing automatic runtime grants is an explicit opt-in, never inferred from
 * a legacy ApkStart configuration or a missing settings field.
 */
function autoGrantEnabled(settings) {
  return settings?.engine?.autoGrantAppPermissions === true;
}

function installVariants(file, settings) {
  const variants = [
    ['install', '-r', '-t', '--bypass-low-target-sdk-block', file],
    ['install', '-r', '-t', file],
    ['install', '-r', file],
  ];
  if (autoGrantEnabled(settings)) {
    variants.unshift(['install', '-r', '-t', '-g', '--bypass-low-target-sdk-block', file]);
  }
  return variants;
}

module.exports = { autoGrantEnabled, installVariants };
