// Local credential store for c-office.
//
// File: ~/.c-office/credentials.json (mode 0600)
// Per-machine symmetric key derived from os.hostname() + a salt persisted on
// first run, then AES-256-GCM. Defeats casual `cat`; not a secrets vault.
// Same trust model as Claude Code's own ~/.claude/.credentials.json.

import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';

const CRED_DIR = process.env.COFFICE_CRED_DIR || path.join(os.homedir(), '.c-office');
const CRED_FILE = path.join(CRED_DIR, 'credentials.json');
const SALT_FILE = path.join(CRED_DIR, '.salt');

let memCache = null;            // { provider: { ... } }
let keyCache = null;

async function ensureDir() {
  await fs.mkdir(CRED_DIR, { recursive: true, mode: 0o700 });
}

async function getKey() {
  if (keyCache) return keyCache;
  await ensureDir();
  let salt;
  try {
    salt = await fs.readFile(SALT_FILE);
  } catch {
    salt = crypto.randomBytes(32);
    await fs.writeFile(SALT_FILE, salt, { mode: 0o600 });
  }
  keyCache = crypto.scryptSync(os.hostname() + ':c-office', salt, 32);
  return keyCache;
}

function encrypt(plaintext, key) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64');
}

function decrypt(b64, key) {
  const buf = Buffer.from(b64, 'base64');
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const enc = buf.subarray(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
}

async function load() {
  if (memCache) return memCache;
  try {
    const raw = await fs.readFile(CRED_FILE, 'utf8');
    const { ciphertext } = JSON.parse(raw);
    if (!ciphertext) { memCache = {}; return memCache; }
    const key = await getKey();
    memCache = JSON.parse(decrypt(ciphertext, key));
  } catch (e) {
    if (e.code === 'ENOENT') { memCache = {}; }
    else { console.error('[c-office] credential store unreadable, starting empty:', e.message); memCache = {}; }
  }
  return memCache;
}

async function persist() {
  await ensureDir();
  const key = await getKey();
  const ciphertext = encrypt(JSON.stringify(memCache), key);
  await fs.writeFile(CRED_FILE, JSON.stringify({ version: 1, ciphertext }, null, 2), { mode: 0o600 });
}

export async function getCreds(provider) {
  const all = await load();
  return all[provider] || null;
}

export async function setCreds(provider, creds) {
  await load();
  memCache[provider] = { ...creds, updatedAt: Date.now() };
  await persist();
}

export async function clearCreds(provider) {
  await load();
  if (memCache[provider]) {
    delete memCache[provider];
    await persist();
  }
}

export async function listProviders() {
  return Object.keys(await load());
}
