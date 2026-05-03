// Image-generation adapter. Default provider Gemini Imagen; pluggable to
// Replicate FLUX or OpenAI GPT Image 2 by setting IMAGE_PROVIDER env.
//
// Adapter contract:
//   generateImage({ prompt, size, persona }) → { url, provider, costUsd, localPath }
//
// All providers persist the result to ${COFFICE_IMAGE_DIR}/${run_id}-${ts}.png
// and return both a /generated/<file> URL (served by express.static) and the
// absolute local path.

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getCreds } from '../auth/credentials.js';
import { getGoogleAuth } from '../auth/google.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROVIDER = process.env.IMAGE_PROVIDER || 'gemini';
const IMAGE_DIR = process.env.COFFICE_IMAGE_DIR
  || path.resolve(__dirname, '..', '..', 'public', 'generated');

async function ensureDir() {
  await fs.mkdir(IMAGE_DIR, { recursive: true });
}

function publicPathFor(file) {
  return `/generated/${path.basename(file)}`;
}

async function persist(buffer, slug) {
  await ensureDir();
  const ts = Date.now();
  const file = path.join(IMAGE_DIR, `${slug || 'img'}-${ts}.png`);
  await fs.writeFile(file, buffer);
  return file;
}

// ─── Gemini · Nano Banana 2 ──────────────────────────────────────────────────
// Uses gemini-3.1-flash-image-preview (Nano Banana 2, the latest image model)
// via the generateContent API. The legacy imagen-3.0 / "3.1flashgen"
// paths are not supported by this codebase — only Nano Banana 2.
const NANO_BANANA_2_MODEL = 'gemini-3.1-flash-image-preview';

async function generateGemini({ prompt, slug }) {
  const auth = await getGoogleAuth();
  if (!auth.connected) throw new Error('Google not connected. Connect in Settings.');
  const { GoogleGenAI } = await import('@google/genai');
  const client = new GoogleGenAI(
    auth.mode === 'api-key'
      ? { apiKey: auth.apiKey }
      : { authOptions: { credentials: { access_token: auth.accessToken } } }
  );
  const resp = await client.models.generateContent({
    model: NANO_BANANA_2_MODEL,
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
  });
  const parts = resp?.candidates?.[0]?.content?.parts || [];
  const imagePart = parts.find((p) => p?.inlineData?.data);
  if (!imagePart) {
    const textPart = parts.find((p) => p?.text);
    throw new Error(`Nano Banana 2 returned no image (model=${NANO_BANANA_2_MODEL})${textPart ? ' — ' + textPart.text.slice(0, 160) : ''}`);
  }
  const buf = Buffer.from(imagePart.inlineData.data, 'base64');
  const file = await persist(buf, slug);
  return {
    url: publicPathFor(file),
    provider: 'gemini',
    model: NANO_BANANA_2_MODEL,
    costUsd: 0.04,
    localPath: file,
  };
}

// ─── Replicate FLUX ──────────────────────────────────────────────────────────
async function generateReplicate({ prompt, slug }) {
  const c = await getCreds('replicate');
  if (!c?.apiKey) throw new Error('Replicate not connected. Paste token in Settings.');
  const start = await fetch('https://api.replicate.com/v1/models/black-forest-labs/flux-1.1-pro/predictions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${c.apiKey}`,
      'Content-Type': 'application/json',
      'Prefer': 'wait',
    },
    body: JSON.stringify({ input: { prompt, aspect_ratio: '3:4', output_format: 'png' } }),
  });
  if (!start.ok) throw new Error(`Replicate ${start.status}: ${await start.text()}`);
  const j = await start.json();
  const url = Array.isArray(j.output) ? j.output[0] : j.output;
  if (!url) throw new Error('Replicate returned no output URL');
  const imgResp = await fetch(url);
  if (!imgResp.ok) throw new Error(`Image fetch ${imgResp.status}`);
  const buf = Buffer.from(await imgResp.arrayBuffer());
  const file = await persist(buf, slug);
  return { url: publicPathFor(file), provider: 'replicate', costUsd: 0.04, localPath: file };
}

// ─── OpenAI GPT Image 2 ──────────────────────────────────────────────────────
async function generateOpenAI({ prompt, slug }) {
  const c = await getCreds('openai');
  if (!c?.apiKey) throw new Error('OpenAI not connected. Paste token in Settings.');
  const resp = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${c.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model: 'gpt-image-2', prompt, size: '1024x1536', n: 1 }),
  });
  if (!resp.ok) throw new Error(`OpenAI ${resp.status}: ${await resp.text()}`);
  const j = await resp.json();
  const b64 = j.data?.[0]?.b64_json;
  if (!b64) throw new Error('OpenAI returned no b64_json');
  const buf = Buffer.from(b64, 'base64');
  const file = await persist(buf, slug);
  return { url: publicPathFor(file), provider: 'openai', model: 'gpt-image-2', costUsd: 0.04, localPath: file };
}

const ADAPTERS = {
  gemini:    generateGemini,
  replicate: generateReplicate,
  openai:    generateOpenAI,
};

export async function generateImage({ prompt, persona = 'forge' }) {
  const fn = ADAPTERS[PROVIDER];
  if (!fn) throw new Error(`Unknown IMAGE_PROVIDER: ${PROVIDER}`);
  return fn({ prompt, slug: persona });
}

export function imageProvider() { return PROVIDER; }
