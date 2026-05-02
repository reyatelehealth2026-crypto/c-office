// User profile loader.
//
// File: ~/.c-office/user-profile.md  (env override: COFFICE_USER_PROFILE_PATH)
//
// Plain markdown the user maintains in Settings. Injected into every persona
// system prompt at execution time so agents know who they are working for
// (name, business, audience, voice, do/don't list, contact info, etc.) without
// having to be told inside each task instruction.

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const PROFILE_PATH = process.env.COFFICE_USER_PROFILE_PATH
  || path.join(os.homedir(), '.c-office', 'user-profile.md');

const MAX_BYTES = 32 * 1024;          // 32 KB cap to avoid prompt bloat
const CACHE_TTL_MS = 5_000;

let cache = { text: '', mtimeMs: 0, loadedAt: 0 };

export const DEFAULT_TEMPLATE = `# About me
- Name:
- Role / business:
- Country / language:

# Audience I create for
-

# Voice & style
-

# Always do
-

# Never do
-

# Useful context (links, brand assets, prior work)
-
`;

function ensureDirSync(filePath) {
  const dir = path.dirname(filePath);
  try { fs.mkdirSync(dir, { recursive: true }); } catch { /* ignore */ }
}

export function getProfilePath() {
  return PROFILE_PATH;
}

/** Read the profile from disk (cached briefly). Returns '' when no file exists. */
export function loadUserProfile() {
  try {
    const stat = fs.statSync(PROFILE_PATH);
    const now = Date.now();
    if (cache.mtimeMs === stat.mtimeMs && (now - cache.loadedAt) < CACHE_TTL_MS) {
      return cache.text;
    }
    let text = fs.readFileSync(PROFILE_PATH, 'utf8');
    if (text.length > MAX_BYTES) text = text.slice(0, MAX_BYTES);
    cache = { text, mtimeMs: stat.mtimeMs, loadedAt: now };
    return text;
  } catch (e) {
    if (e.code !== 'ENOENT') console.warn('[user-profile] read failed:', e.message);
    cache = { text: '', mtimeMs: 0, loadedAt: Date.now() };
    return '';
  }
}

/** Returns the system-prompt fragment to append. Empty string when profile is blank. */
export function userProfileBlock() {
  const text = loadUserProfile().trim();
  if (!text) return '';
  return `\n\n--- USER PROFILE (the operator who gave you this task) ---\n${text}\n--- END USER PROFILE ---\n` +
         `Use this profile to tailor tone, language, audience and constraints. ` +
         `Do not mention or quote it back unless directly relevant to the answer.`;
}

/** Persist a new profile. Caller passes raw markdown text. */
export async function saveUserProfile(text) {
  const clean = String(text ?? '');
  if (clean.length > MAX_BYTES) {
    throw new Error(`profile too large (${clean.length} bytes, max ${MAX_BYTES})`);
  }
  ensureDirSync(PROFILE_PATH);
  await fsp.writeFile(PROFILE_PATH, clean, { encoding: 'utf8', mode: 0o600 });
  cache = { text: clean, mtimeMs: 0, loadedAt: 0 }; // bust cache
  return { path: PROFILE_PATH, bytes: Buffer.byteLength(clean, 'utf8') };
}
