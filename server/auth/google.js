// Google OAuth (PKCE, loopback redirect) for the Gemini Imagen scope.
//
// The user must register a Desktop or "Web" OAuth client in Google Cloud Console
// and supply the client_id (no secret needed for PKCE). c-office does NOT ship
// with a default client_id — first-run, the Settings UI shows a paste field
// for it; we persist it under the `google` provider record alongside tokens.
//
// On Connect → /auth/google/start redirects to Google's authorize endpoint
// with PKCE. /auth/google/callback exchanges the code for tokens and stores them.

import { pkce, newState, consumeState, normalizeTokens } from './oauth.js';
import { getCreds, setCreds, clearCreds } from './credentials.js';

const PROVIDER = 'google';
const AUTHORIZE_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SCOPES = [
  'https://www.googleapis.com/auth/cloud-platform',
  'https://www.googleapis.com/auth/generative-language.retriever',
];

function redirectUri(req) {
  const proto = req.protocol;
  const host = req.get('host');
  return `${proto}://${host}/auth/google/callback`;
}

export async function setClientId(clientId) {
  if (!clientId || typeof clientId !== 'string') return { ok: false, reason: 'invalid' };
  const existing = (await getCreds(PROVIDER)) || {};
  await setCreds(PROVIDER, { ...existing, clientId });
  return { ok: true };
}

export async function startAuth(req, res) {
  const cfg = await getCreds(PROVIDER);
  if (!cfg?.clientId) {
    return res.status(400).send(
      'Google OAuth client_id not set. Paste it in Settings → Connections first.'
    );
  }
  const { verifier, challenge } = pkce();
  const state = newState(PROVIDER, verifier);
  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set('client_id', cfg.clientId);
  url.searchParams.set('redirect_uri', redirectUri(req));
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', SCOPES.join(' '));
  url.searchParams.set('code_challenge', challenge);
  url.searchParams.set('code_challenge_method', 'S256');
  url.searchParams.set('state', state);
  url.searchParams.set('access_type', 'offline');
  url.searchParams.set('prompt', 'consent');
  res.redirect(url.toString());
}

export async function handleCallback(req, res) {
  const { code, state, error } = req.query;
  if (error) return res.status(400).send(`Google OAuth error: ${error}`);
  if (!code || !state) return res.status(400).send('Missing code/state');
  const entry = consumeState(state, PROVIDER);
  if (!entry) return res.status(400).send('Invalid or expired state');

  const cfg = await getCreds(PROVIDER);
  if (!cfg?.clientId) return res.status(400).send('client_id missing');

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    code_verifier: entry.verifier,
    client_id: cfg.clientId,
    redirect_uri: redirectUri(req),
  });

  const resp = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!resp.ok) {
    const txt = await resp.text();
    return res.status(502).send(`Token exchange failed: ${resp.status} ${txt}`);
  }
  const j = await resp.json();
  const tokens = normalizeTokens(j);
  await setCreds(PROVIDER, { ...cfg, ...tokens });
  res.redirect('/#/settings');
}

async function refreshIfNeeded(creds) {
  if (creds.apiKey) return creds;
  if (!creds.refreshToken) return creds;
  if (creds.expiresAt && creds.expiresAt - Date.now() > 60_000) return creds;
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: creds.refreshToken,
    client_id: creds.clientId,
  });
  const resp = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!resp.ok) {
    console.warn('[c-office] Google token refresh failed', resp.status);
    return creds;
  }
  const j = await resp.json();
  const next = {
    ...creds,
    ...normalizeTokens(j),
    refreshToken: j.refresh_token || creds.refreshToken,
  };
  await setCreds(PROVIDER, next);
  return next;
}

export async function setApiKey(apiKey) {
  if (!apiKey || typeof apiKey !== 'string') return { ok: false, reason: 'invalid' };
  const existing = (await getCreds(PROVIDER)) || {};
  await setCreds(PROVIDER, { ...existing, apiKey });
  return { ok: true };
}

export async function disconnect() {
  await clearCreds(PROVIDER);
}

export async function getGoogleAuth() {
  const c = await getCreds(PROVIDER);
  if (!c) return { connected: false };
  if (c.apiKey) return { connected: true, mode: 'api-key', apiKey: c.apiKey };
  const fresh = await refreshIfNeeded(c);
  return {
    connected: !!fresh.accessToken,
    mode: 'oauth',
    accessToken: fresh.accessToken,
    expiresAt: fresh.expiresAt,
  };
}

export async function statusOf() {
  const c = await getCreds(PROVIDER);
  if (!c) return { connected: false, hasClientId: false };
  if (c.apiKey) return { connected: true, mode: 'api-key', hasClientId: !!c.clientId };
  return {
    connected: !!c.accessToken,
    mode: 'oauth',
    expiresAt: c.expiresAt || null,
    hasClientId: !!c.clientId,
  };
}
