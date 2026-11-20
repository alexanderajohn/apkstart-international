'use strict';

/*
 * Independent fork release gate.
 * No automatic executable replacement until the international project has
 * completed artifact integrity verification, Windows tests and release review.
 * Checking for release metadata is still read-only and is not blocked.
 */
const SELF_UPDATE_ENABLED = false;

function assertSelfUpdateAllowed() {
  if (!SELF_UPDATE_ENABLED) {
    const error = new Error('Automatic installation of updates is temporarily disabled in ApkStart International. Open GitHub Releases to review updates manually.');
    error.code = 'ASI_UPDATES_DISABLED';
    throw error;
  }
}

module.exports = { SELF_UPDATE_ENABLED, assertSelfUpdateAllowed };
