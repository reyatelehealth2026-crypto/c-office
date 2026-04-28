// Anthropic auth surface for c-office.
//
// Anthropic does not currently expose a public third-party OAuth provider.
// The only user-OAuth flow available is the one Claude Code uses for itself,
// which writes credentials to ~/.claude/.credentials.json after `claude login`.
//
// This module:
//   1. Reads those credentials and mirrors them into our encrypted store.
//   2. Refreshes them on demand using the same refresh endpoint Claude Code uses.
//   3. Exposes a connect/disconnect surface for the Settings UI.
//
// Fallback: a user can paste a raw API key in the Settings UI; that goes into
// the same credential record under `apiKey` and takes precedence if no OAuth
// access token is present.

import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { getCreds, setCreds, clearCreds } from './credentials.js';

const CLAUDE_CRED_FILE = path.join(os.homedir(), '.claude', '.credentials.json');
const REFRESH_URL = 'https://console.anthropic.com/v1/oauth/token';
const PROVIDER = 'anthropic';

async function readClaudeCreds() {
  try {
    const raw = await fs.readFile(CLAUDE_CRED_FILE, 'utf8');
    const j = JSON.parse(raw);
    // Claude Code stores under .claudeAiOauth or .oauth depending on version.
    const o = j.claudeAiOauth || j.oauth || j;
    if (!o) return null;
    return {
      accessToken:  o.accessToken  || o.access_token,
      refreshToken: o.refreshToken || o.refresh_token,
      expiresAt:    o.expiresAt    || o.expires_at || null,
      scope:        o.scopes ? (Array.isArray(o.scopes) ? o.scopes.join(' ') : o.scopes) : (o.scope || null),
      tokenType:    'Bearer',
    };
  } catch (e) {
    if (e.code === 'ENOENT') return null;
    throw e;
  }
}

// Imports Claude Code's OAuth credentials into c-office's credential store.
// Called when the user clicks "Connect Anthropic" in Settings.
export async function connectFromClaudeLogin() {
  const cc = await readClaudeCreds();
  if (!cc || !cc.accessToken) {
    return { ok: false, reason: 'no-claude-login', message: 'No Claude Code credentials found. Run `claude login` first.' };
  }
  await setCreds(PROVIDER, cc);
  return { ok: true, expiresAt: cc.expiresAt };
}

export async function setApiKey(apiKey) {
  if (!apiKey || typeof apiKey !== 'string' || !apiKey.startsWith('sk-')) {
    return { ok: false, reason: 'invalid-key' };
  }
  await setCreds(PROVIDER, { apiKey });
  return { ok: true };
}

export async function disconnect() {
  await clearCreds(PROVIDER);
}

async function refreshIfNeeded(creds) {
  if (creds.apiKey) return creds;
  if (!creds.refreshToken) return creds;
  if (creds.expiresAt && creds.expiresAt - Date.now() > 60_000) return creds;

  const resp = await fetch(REFRESH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ grant_type: 'refresh_token', refresh_token: creds.refreshToken }),
  });
  if (!resp.ok) {
    console.warn('[c-office] Anthropic token refresh failed', resp.status);
    return creds;
  }
  const j = await resp.json();
  const next = {
    accessToken:  j.access_token  || creds.accessToken,
    refreshToken: j.refresh_token || creds.refreshToken,
    expiresAt:    j.expires_in ? Date.now() + j.expires_in * 1000 : creds.expiresAt,
    scope:        j.scope || creds.scope,
    tokenType:    'Bearer',
  };
  await setCreds(PROVIDER, next);
  return next;
}

// Returns the auth surface the Claude Agent SDK needs.
// SDK accepts either { apiKey } or a bearer token; we return whichever we have.
export async function getAnthropicAuth() {
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
  if (!c) return { connected: false };
  if (c.apiKey) return { connected: true, mode: 'api-key' };
  return { connected: !!c.accessToken, mode: 'oauth', expiresAt: c.expiresAt || null };
}
