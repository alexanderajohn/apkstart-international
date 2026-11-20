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
  return [['install', '-R', ...(autoGrantEnabled(settings) ? ['-g'] : []), file]];
}

module.exports = { autoGrantEnabled, installVariants };
