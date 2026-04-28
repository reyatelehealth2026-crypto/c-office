// Generic PKCE OAuth helpers shared by the per-provider modules.
import crypto from 'node:crypto';

const PENDING = new Map();              // state → { verifier, provider, createdAt }
const PENDING_TTL_MS = 10 * 60 * 1000;

function b64url(buf) {
  return buf.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

export function pkce() {
  const verifier  = b64url(crypto.randomBytes(32));
  const challenge = b64url(crypto.createHash('sha256').update(verifier).digest());
  return { verifier, challenge };
}

export function newState(provider, verifier) {
  const state = b64url(crypto.randomBytes(16));
  PENDING.set(state, { verifier, provider, createdAt: Date.now() });
  // soft GC of stale entries
  for (const [k, v] of PENDING) {
    if (Date.now() - v.createdAt > PENDING_TTL_MS) PENDING.delete(k);
  }
  return state;
}

export function consumeState(state, provider) {
  const entry = PENDING.get(state);
  if (!entry || entry.provider !== provider) return null;
  if (Date.now() - entry.createdAt > PENDING_TTL_MS) { PENDING.delete(state); return null; }
  PENDING.delete(state);
  return entry;
}

// Tokens we care about across providers — normalize the shape.
export function normalizeTokens(raw, now = Date.now()) {
  const expiresAt = raw.expires_in ? now + raw.expires_in * 1000 : null;
  return {
    accessToken:  raw.access_token,
    refreshToken: raw.refresh_token || null,
    expiresAt,
    scope:        raw.scope || null,
    tokenType:    raw.token_type || 'Bearer',
  };
}
