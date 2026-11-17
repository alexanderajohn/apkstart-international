'use strict';

/**
 * Best-effort privacy filter for diagnostic text exported to disk.
 * No network calls and no opt-out that might silently leak raw credentials.
 *
 * This filter is intentionally conservative about altering diagnostic content:
 * device serials, error codes, localhost and emulator ports remain visible.
 * A user must still inspect any report before sharing it.
 */
const MASK = '[REDACTED]';
const FIELD_SECRET = /^(?:api[_-]?key|access[_-]?token|refresh[_-]?token|token|secret|password|passwd|passphrase|authorization|proxy[_-]?authorization|cookie|set[_-]?cookie|session(?:[_-]?id)?|client[_-]?secret|private[_-]?key|credential(?:s)?)$/i;
const QUERY_SECRET = /([?&](?:api[_-]?key|access[_-]?token|refresh[_-]?token|token|secret|password|passwd|session(?:[_-]?id)?|client[_-]?secret)=)[^&#\s]*/gi;
const VALUE_SECRET = /(\b(?:api[_-]?key|access[_-]?token|refresh[_-]?token|token|secret|password|passwd|passphrase|session(?:[_-]?id)?|client[_-]?secret)\b\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\s&;,]+)/gi;
const SENSITIVE_HEADER = /(\b(?:authorization|proxy-authorization|cookie|set-cookie|x-api-key)\s*:\s*)[^\r\n]+/gi;
const WIN_USER = /([a-z]:[\\/](?:users|documents and settings)[\\/])[^\\/\s"'<>]+/gi;
const POSIX_USER = /(\/(?:users|home)\/)[^\/\s"'<>]+/g;
const EMAIL = /\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\b/gi;

function redactText(value) {
  return String(value == null ? '' : value)
    .replace(SENSITIVE_HEADER, '$1' + MASK)
    .replace(QUERY_SECRET, '$1' + MASK)
    .replace(VALUE_SECRET, '$1' + MASK)
    .replace(/\b(Bearer)\s+[a-z0-9_.~+/=-]{8,}/gi, '$1 ' + MASK)
    .replace(/(https?:\/\/)[^\s\/:@]+:[^\s\/@]+@/gi, '$1' + MASK + '@')
    .replace(WIN_USER, '$1[USER]')
    .replace(POSIX_USER, '$1[USER]')
    .replace(EMAIL, '[EMAIL]');
}

function redactValue(value, depth = 0) {
  if (depth > 12) return '[TRUNCATED]';
  if (typeof value === 'string') return redactText(value);
  if (Array.isArray(value)) return value.map((item) => redactValue(item, depth + 1));
  if (value && typeof value === 'object') {
    const result = {};
    for (const [key, child] of Object.entries(value)) {
      result[key] = FIELD_SECRET.test(key) ? MASK : redactValue(child, depth + 1);
    }
    return result;
  }
  return value;
}

module.exports = { redactText, redactValue };
