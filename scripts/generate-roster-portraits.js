#!/usr/bin/env node
// Generate JRPG-style anime portraits for the 9 default personas.
//
// Usage:
//   node scripts/generate-roster-portraits.js              # all 9 personas
//   node scripts/generate-roster-portraits.js --workers-only  # skip Atlas
//
// Env vars:
//   COFFICE_BASE_URL       Server base URL (default http://127.0.0.1:7878)
//   C_OFFICE_ACCESS_TOKEN  Bearer token if the access gate is enabled
//
// Behavior:
//   - POSTs each persona's prompt to /api/images/generate (mode=character).
//   - Downloads the resulting image and writes it to public/portraits/<id>.png.
//   - On per-persona failure, logs and continues with the next one.
//   - Exit 0 if at least 1 succeeded, otherwise non-zero.

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import http from 'node:http';
import https from 'node:https';

import { PERSONAS } from '../server/mapping/personas.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const PORTRAITS_DIR = path.join(REPO_ROOT, 'public', 'portraits');

const BASE_URL = (process.env.COFFICE_BASE_URL || 'http://127.0.0.1:7878').replace(/\/+$/, '');
const ACCESS_TOKEN = process.env.C_OFFICE_ACCESS_TOKEN || process.env.C_OFFICE_PUBLIC_TOKEN || '';

const args = new Set(process.argv.slice(2));
const WORKERS_ONLY = args.has('--workers-only');

function authHeaders() {
  return ACCESS_TOKEN ? { Authorization: `Bearer ${ACCESS_TOKEN}` } : {};
}

function buildPrompt(persona) {
  const traits = Array.isArray(persona.traits) ? persona.traits.join(', ') : '';
  return [
    `JRPG anime character portrait of ${persona.name}, ${persona.role}.`,
    persona.tagline || '',
    `Traits: ${traits}. Tone: ${persona.tone || 'focused, cinematic'}.`,
    `Style: high-detail anime / JRPG splash art, vibrant gradient background using ${persona.color || '#9d5cff'}, soft rim light, head-and-shoulders framing, neutral expression, transparent background optional.`,
    'No text, no logos, no watermarks.',
  ].filter(Boolean).join('\n');
}

async function postGenerate(persona) {
  const url = `${BASE_URL}/api/images/generate`;
  const body = {
    prompt: buildPrompt(persona),
    agentId: persona.id,
    mode: 'character',
    kind: 'avatar',
    size: '1024x1024',
  };
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* keep raw text */ }
  if (!res.ok) {
    const msg = json?.error || text || `HTTP ${res.status}`;
    const err = new Error(msg);
    err.statusCode = res.status;
    throw err;
  }
  if (!json?.imageUrl) {
    throw new Error('response missing imageUrl');
  }
  return json.imageUrl;
}

function downloadToFile(rawUrl, destPath) {
  return new Promise((resolve, reject) => {
    const url = rawUrl.startsWith('http') ? rawUrl : `${BASE_URL}${rawUrl}`;
    const lib = url.startsWith('https://') ? https : http;
    const headers = url.startsWith(BASE_URL) ? authHeaders() : {};
    lib.get(url, { headers }, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        downloadToFile(res.headers.location, destPath).then(resolve, reject);
        return;
      }
      if (res.statusCode !== 200) {
        res.resume();
        reject(new Error(`download HTTP ${res.statusCode} for ${url}`));
        return;
      }
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', async () => {
        try {
          await fs.writeFile(destPath, Buffer.concat(chunks));
          resolve();
        } catch (error) {
          reject(error);
        }
      });
      res.on('error', reject);
    }).on('error', reject);
  });
}

async function generateOne(persona, idx, total) {
  const label = `[${idx}/${total}] ${persona.id}`;
  const dest = path.join(PORTRAITS_DIR, `${persona.id}.png`);
  const relDest = path.relative(REPO_ROOT, dest).replace(/\\/g, '/');
  try {
    const imageUrl = await postGenerate(persona);
    await downloadToFile(imageUrl, dest);
    console.log(`${label} -> ${relDest} ok`);
    return true;
  } catch (error) {
    console.error(`${label} FAILED: ${error.message}`);
    return false;
  }
}

async function main() {
  await fs.mkdir(PORTRAITS_DIR, { recursive: true });

  const roster = WORKERS_ONLY
    ? PERSONAS.filter((p) => p.id !== 'atlas')
    : PERSONAS;

  console.log(`c-office portrait generator`);
  console.log(`base url:    ${BASE_URL}`);
  console.log(`token:       ${ACCESS_TOKEN ? 'set' : 'not set'}`);
  console.log(`personas:    ${roster.length}${WORKERS_ONLY ? ' (workers only - Atlas skipped)' : ''}`);
  console.log(`output dir:  ${path.relative(REPO_ROOT, PORTRAITS_DIR).replace(/\\/g, '/')}/`);
  console.log('');

  let ok = 0;
  let failed = 0;
  for (let i = 0; i < roster.length; i += 1) {
    const persona = roster[i];
    const success = await generateOne(persona, i + 1, roster.length);
    if (success) ok += 1; else failed += 1;
  }

  console.log('');
  console.log(`done: ${ok} succeeded, ${failed} failed`);
  if (ok === 0) process.exit(1);
}

main().catch((error) => {
  console.error('fatal:', error?.message || error);
  process.exit(1);
});
