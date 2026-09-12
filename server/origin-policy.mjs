// Shared origin policy (task 2.5): the single source of truth for which
// browser/native origins may reach the HTTP API and open the multiplayer
// WebSocket. It is a PURE decision layer — it never sees or logs a token, join
// payload, device ID, or service credential, only an origin string.
//
// ORIGIN_ALLOWLIST is parsed exactly once at startup and fails closed: a
// wildcard, `null`, a malformed URL, or any entry carrying a path, query, or
// fragment aborts startup rather than silently widening access.

const MULTIPLAYER_PATH = '/api/mp';

export class OriginPolicyError extends Error {
  constructor(message) {
    super(message);
    this.name = 'OriginPolicyError';
  }
}

/**
 * Normalize a single allowlist entry to its canonical `scheme://host[:port]`
 * origin, or throw {@link OriginPolicyError} if it is unsafe/ambiguous.
 */
function normalizeAllowlistEntry(raw) {
  const value = String(raw).trim();
  if (value === '*' || value.includes('*')) {
    throw new OriginPolicyError(`ORIGIN_ALLOWLIST must not contain a wildcard: ${value}`);
  }
  if (value.toLowerCase() === 'null') {
    throw new OriginPolicyError('ORIGIN_ALLOWLIST must not contain the literal "null" origin');
  }
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new OriginPolicyError(`ORIGIN_ALLOWLIST entry is not a valid origin: ${value}`);
  }
  // An origin has no meaningful path/query/fragment; reject anything richer so
  // an operator cannot believe a path scopes access.
  if ((url.pathname && url.pathname !== '/') || url.search || url.hash) {
    throw new OriginPolicyError(
      `ORIGIN_ALLOWLIST entry must be a bare origin without path/query/fragment: ${value}`,
    );
  }
  if (url.username || url.password) {
    throw new OriginPolicyError(`ORIGIN_ALLOWLIST entry must not embed credentials: ${value}`);
  }
  // The URL parser lowercases scheme+host and drops a default port. `url.origin`
  // is the canonical form; for non-special schemes (capacitor://) it can be
  // "null", so fall back to reconstructing from parts.
  if (url.origin && url.origin !== 'null') return url.origin;
  const host = url.host || url.hostname;
  return `${url.protocol}//${host}`;
}

/**
 * Parse ORIGIN_ALLOWLIST into an ordered list of canonical origins. Empty /
 * undefined input yields an empty list; any invalid entry throws.
 */
export function parseAllowlist(raw) {
  if (raw === undefined || raw === null) return [];
  const text = String(raw);
  if (text.trim() === '') return [];
  return text
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part !== '')
    .map(normalizeAllowlistEntry);
}

function canonicalizeOrigin(origin) {
  if (typeof origin !== 'string' || origin.trim() === '') return null;
  let url;
  try {
    url = new URL(origin.trim());
  } catch {
    return null;
  }
  if (!url.host && !url.hostname) return null;
  if (url.origin && url.origin !== 'null') return url.origin;
  const host = url.host || url.hostname;
  if (!host) return null;
  return `${url.protocol}//${host}`;
}

const ALLOWED_METHODS = 'GET, POST, OPTIONS';
const DEFAULT_ALLOWED_HEADERS = 'Authorization, Content-Type';

/**
 * Build a policy object from a pre-parsed allowlist.
 *
 * @param {object} opts
 * @param {string[]} opts.allowlist canonical origins (from parseAllowlist)
 * @param {boolean} [opts.production] enforce production hardening
 * @param {boolean} [opts.allowOriginlessUpgrade] permit missing-Origin WS
 *   upgrades — honored only in non-production
 */
export function createOriginPolicy({ allowlist = [], production = false, allowOriginlessUpgrade = false } = {}) {
  const approved = new Set(allowlist);
  const originlessUpgradeAllowed = allowOriginlessUpgrade && !production;

  function isApproved(origin) {
    const canonical = canonicalizeOrigin(origin);
    return canonical !== null && approved.has(canonical);
  }

  function decideHttp({ origin, method = 'GET', isPreflight = false, requestHeaders } = {}) {
    const headers = {};
    const preflight = isPreflight || String(method).toUpperCase() === 'OPTIONS';

    // No Origin header => same-origin (browser same-origin fetch or a native
    // same-scheme request). Allow and add nothing CORS-related.
    if (origin === undefined || origin === null || origin === '') {
      return { allowed: true, isPreflight: preflight, reason: 'same-origin', headers };
    }

    if (!isApproved(origin)) {
      return { allowed: false, isPreflight: preflight, reason: 'origin-not-approved', headers };
    }

    const canonical = canonicalizeOrigin(origin);
    headers['Access-Control-Allow-Origin'] = canonical;
    headers['Vary'] = 'Origin';
    headers['Access-Control-Allow-Credentials'] = 'true';
    if (preflight) {
      headers['Access-Control-Allow-Methods'] = ALLOWED_METHODS;
      headers['Access-Control-Allow-Headers'] =
        typeof requestHeaders === 'string' && requestHeaders.trim() !== ''
          ? requestHeaders
          : DEFAULT_ALLOWED_HEADERS;
      headers['Access-Control-Max-Age'] = '600';
    }
    return { allowed: true, isPreflight: preflight, reason: 'origin-approved', headers };
  }

  function decideUpgrade({ origin, path } = {}) {
    if (path !== MULTIPLAYER_PATH) {
      return { allowed: false, reason: 'path-not-allowed' };
    }
    if (origin === undefined || origin === null || origin === '') {
      return originlessUpgradeAllowed
        ? { allowed: true, reason: 'originless-allowed' }
        : { allowed: false, reason: 'origin-missing' };
    }
    if (!isApproved(origin)) {
      return { allowed: false, reason: 'origin-not-approved' };
    }
    return { allowed: true, reason: 'origin-approved' };
  }

  return {
    allowlist: [...approved],
    production,
    originlessUpgradeAllowed,
    isApproved,
    decideHttp,
    decideUpgrade,
  };
}

export { MULTIPLAYER_PATH };
