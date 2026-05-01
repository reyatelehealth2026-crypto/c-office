import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const CODEX_AUTH_FILE = process.env.CODEX_AUTH_FILE ||
  path.join(os.homedir(), '.codex', 'auth.json');

async function readCodexAuth() {
  try {
    const raw = await fs.readFile(CODEX_AUTH_FILE, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function getCodexAccessToken() {
  const auth = await readCodexAuth();
  const token = auth?.tokens?.access_token || auth?.tokens?.accessToken || '';
  if (!token || typeof token !== 'string') return null;
  return {
    accessToken: token,
    accountId: auth?.tokens?.account_id || null,
    lastRefresh: auth?.last_refresh || null,
    mode: auth?.auth_mode || 'oauth',
  };
}

export async function statusOf() {
  const token = await getCodexAccessToken();
  return {
    connected: !!token?.accessToken,
    mode: token?.mode || 'oauth',
    lastRefresh: token?.lastRefresh || null,
  };
}
