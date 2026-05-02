import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { getCreds } from '../auth/credentials.js';
import { getCodexAccessToken, statusOf as codexStatusOf } from '../auth/codex.js';
import { getGoogleAuth, statusOf as googleStatusOf } from '../auth/google.js';
import { getAgentSync, updateAgent } from '../store/agents.js';
import { getNote, appendMessage, updateNote } from '../runner/notes.js';
import { createTransparentCutout } from '../utils/cutout.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.resolve(__dirname, '../../public');
const IMAGE_DIR = path.join(PUBLIC_DIR, 'generated', 'images');

const DEFAULT_MODEL = process.env.C_OFFICE_IMAGE_MODEL || 'gpt-image-1.5';
const DEFAULT_GOOGLE_IMAGE_MODEL = process.env.C_OFFICE_GOOGLE_IMAGE_MODEL || 'gemini-3.1-flash-image-preview';
const DEFAULT_GOOGLE_FLASH_IMAGE_MODEL = process.env.C_OFFICE_GOOGLE_FLASH_IMAGE_MODEL || 'gemini-2.0-flash-preview-image-generation';
const DEFAULT_SIZE = process.env.C_OFFICE_IMAGE_SIZE || '1024x1024';
const DEFAULT_CHARACTER_SIZE = process.env.C_OFFICE_CHARACTER_IMAGE_SIZE || '1024x1536';
const DEFAULT_QUALITY = process.env.C_OFFICE_IMAGE_QUALITY || 'medium';
const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.webp']);

export const googleImageModelInfo = {
  provider: 'google',
  display: 'Nano Banana 2',
  model: DEFAULT_GOOGLE_IMAGE_MODEL,
  officialName: 'Gemini 3.1 Flash Image Preview',
};

export const googleFlashImageModelInfo = {
  provider: 'google',
  display: '3.1 Flash Gen',
  model: DEFAULT_GOOGLE_FLASH_IMAGE_MODEL,
  officialName: 'Gemini Flash Image Generation',
};

async function getOpenAIAuthCandidates() {
  const candidates = [];
  const codex = await getCodexAccessToken();
  if (codex?.accessToken) {
    candidates.push({ token: codex.accessToken, source: 'codex-oauth', mode: codex.mode });
  }
  const creds = await getCreds('openai');
  if (creds?.apiKey) candidates.push({ token: creds.apiKey, source: 'openai-api-key', mode: 'api-key' });
  if (process.env.OPENAI_API_KEY) candidates.push({ token: process.env.OPENAI_API_KEY, source: 'env-api-key', mode: 'api-key' });
  return candidates;
}

function clip(value, max) {
  const text = String(value || '').trim();
  return text.length > max ? text.slice(0, max - 1) + '...' : text;
}

function safeFilename(title) {
  return String(title || 'image')
    .toLowerCase()
    .replace(/[^a-z0-9ก-๙]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'image';
}

function metadataPathFor(filePath) {
  return `${filePath}.json`;
}

function publicUrlForImageName(name) {
  return `/generated/images/${path.basename(name)}`;
}

async function writeImageMetadata(filePath, metadata) {
  const safe = {
    id: metadata.id || path.basename(filePath),
    name: path.basename(filePath),
    imageUrl: publicUrlForImageName(filePath),
    prompt: metadata.prompt || '',
    revisedPrompt: metadata.revisedPrompt || null,
    provider: metadata.provider || null,
    model: metadata.model || null,
    source: metadata.source || null,
    agentId: metadata.agentId || null,
    noteId: metadata.noteId || null,
    size: metadata.size || null,
    quality: metadata.quality || null,
    createdAt: metadata.createdAt || new Date().toISOString(),
  };
  await fs.writeFile(metadataPathFor(filePath), JSON.stringify(safe, null, 2), 'utf8');
  return safe;
}

async function readImageMetadata(filePath, stat) {
  const name = path.basename(filePath);
  let meta = {};
  try {
    meta = JSON.parse(await fs.readFile(metadataPathFor(filePath), 'utf8'));
  } catch {}
  return {
    id: meta.id || name,
    name,
    imageUrl: publicUrlForImageName(name),
    prompt: meta.prompt || '',
    revisedPrompt: meta.revisedPrompt || null,
    provider: meta.provider || null,
    model: meta.model || null,
    source: meta.source || null,
    agentId: meta.agentId || null,
    noteId: meta.noteId || null,
    size: meta.size || null,
    quality: meta.quality || null,
    bytes: stat?.size || 0,
    createdAt: meta.createdAt || stat?.birthtime?.toISOString?.() || stat?.mtime?.toISOString?.() || null,
    updatedAt: stat?.mtime?.toISOString?.() || null,
  };
}

function buildImagePrompt({ prompt, note }) {
  const source = prompt || note?.body || note?.title || '';
  if (source.length > 100 && (source.includes('highly detailed') || source.includes('concept illustration'))) {
    return source; // It's likely a professional prompt from the builder
  }
  return [
    'Create a polished game-ready raster image from this user request.',
    'Style: vivid fantasy game illustration, clean composition, high detail, no watermark.',
    'Avoid: broken anatomy, unreadable UI text, extra logos, signatures, low-resolution artifacts.',
    '',
    `User request: ${clip(source, 1800)}`,
  ].join('\n');
}

export function buildCharacterImagePrompt(agent = {}, extraPrompt = '') {
  const name = clip(agent.name || 'AI Agent', 80);
  
  // If the user provided a substantial prompt (e.g. from the Pro Builder), 
  // use it directly instead of wrapping it in the hardcoded "Office" style.
  const isProPrompt = extraPrompt.length > 100 && (
    extraPrompt.toLowerCase().includes('highly detailed') || 
    extraPrompt.toLowerCase().includes('concept illustration') ||
    extraPrompt.toLowerCase().includes('signature theme color')
  );

  if (isProPrompt) {
    return extraPrompt;
  }

  const role = clip(agent.role || 'AI teammate', 160);
  const category = clip(agent.category || 'guild member', 80);
  // Default to a neutral palette if no color is set, avoiding the "always blue" bias.
  const color = agent.color ? clip(agent.color, 32) : 'a cohesive professional color palette';
  const personality = agent.systemPrompt
    ? clip(agent.systemPrompt, 700)
    : clip(agent.tagline || 'capable, focused, dependable', 240);
  const extra = extraPrompt ? `\nUser customization: ${clip(extraPrompt, 700)}` : '';
  
  return [
    `Create a full-body character concept illustration for "${name}".`,
    `Role: ${role}. Category: ${category}. Theme: ${color}.`,
    `Visual cues: ${personality}.`,
    '',
    'Visual direction: professional digital art style, clean silhouette, expressive face, detailed materials, natural standing pose, studio lighting.',
    'Asset target: transparent-background character cutout PNG.',
    'Canvas: portrait ratio, full body, centered.',
    'Composition: one isolated character only, alpha/transparent background preferred, no scenery.',
    'Quality: high detail, clean anatomy, polished 3D-game-key-art feel.',
    'Avoid: watermark, logo, signature, cropped limbs, landscape orientation.',
    extra,
  ].filter(Boolean).join('\n');
}

async function callOpenAIImage({ auth, prompt, size, quality }) {
  const body = {
    model: DEFAULT_MODEL,
    prompt,
    size: size || DEFAULT_SIZE,
    quality: quality || DEFAULT_QUALITY,
    n: 1,
  };

  const res = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${auth.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = json?.error?.message || `OpenAI image request failed (${res.status})`;
    const err = new Error(msg);
    err.statusCode = res.status;
    err.providerCode = json?.error?.code || null;
    err.providerType = json?.error?.type || null;
    throw err;
  }

  const first = json?.data?.[0];
  let b64 = first?.b64_json || first?.image_base64 || first?.result;
  if (!b64 && first?.url) {
    const imageRes = await fetch(first.url);
    if (!imageRes.ok) throw new Error(`Image URL download failed (${imageRes.status})`);
    const bytes = Buffer.from(await imageRes.arrayBuffer());
    b64 = bytes.toString('base64');
  }
  if (!b64) throw new Error('OpenAI image response did not include image data');
  return {
    b64,
    revisedPrompt: first?.revised_prompt || json?.revised_prompt || null,
    model: body.model,
    size: body.size,
    quality: body.quality,
    source: auth.source,
  };
}

async function callOpenAITransparentImage({ auth, prompt, agent, size, quality }) {
  const referencePath = publicImagePath(agent?.image);
  const body = new FormData();
  body.append('model', DEFAULT_MODEL);
  body.append('prompt', [
    prompt,
    '',
    'Edit or generate this as a transparent-background PNG character cutout. Keep a portrait 9:16 or 2:3 canvas. The output must contain one isolated full-body character with feet visible and no scenery.',
  ].join('\n'));
  body.append('size', size || DEFAULT_CHARACTER_SIZE);
  body.append('quality', quality || 'high');
  body.append('background', 'transparent');
  body.append('output_format', 'png');
  body.append('n', '1');

  if (referencePath) {
    const bytes = await fs.readFile(referencePath);
    const image = new Blob([bytes], { type: mimeTypeForImage(referencePath) });
    body.append('image', image, path.basename(referencePath));
    body.append('input_fidelity', 'high');
  }

  const endpoint = referencePath
    ? 'https://api.openai.com/v1/images/edits'
    : 'https://api.openai.com/v1/images/generations';
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { Authorization: `Bearer ${auth.token}` },
    body,
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = json?.error?.message || `OpenAI transparent image request failed (${res.status})`;
    const err = new Error(msg);
    err.statusCode = res.status;
    err.providerCode = json?.error?.code || null;
    err.providerType = json?.error?.type || null;
    throw err;
  }

  const first = json?.data?.[0];
  const b64 = first?.b64_json || first?.image_base64 || first?.result;
  if (!b64) throw new Error('OpenAI transparent image response did not include image data');
  return {
    b64,
    revisedPrompt: first?.revised_prompt || json?.revised_prompt || null,
    model: DEFAULT_MODEL,
    size: size || DEFAULT_CHARACTER_SIZE,
    quality: quality || 'high',
    source: auth.source,
    provider: 'openai-image-edit',
    transparent: true,
  };
}

async function callGoogleImage({ auth, prompt, model = DEFAULT_GOOGLE_IMAGE_MODEL }) {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const headers = { 'Content-Type': 'application/json' };
  if (auth.apiKey) headers['x-goog-api-key'] = auth.apiKey;
  else if (auth.accessToken) headers.Authorization = `Bearer ${auth.accessToken}`;
  else throw new Error('Google credential is missing apiKey/accessToken');
  const requestParts = Array.isArray(prompt) ? prompt : [{ text: prompt }];

  const res = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      contents: [{ parts: requestParts }],
      generationConfig: { responseModalities: ['TEXT', 'IMAGE'] },
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = json?.error?.message || `Google image request failed (${res.status})`;
    const err = new Error(msg);
    err.statusCode = res.status;
    err.providerCode = json?.error?.status || json?.error?.code || null;
    throw err;
  }
  const responseParts = json?.candidates?.[0]?.content?.parts || [];
  const imagePart = responseParts.find((part) => part.inlineData?.data || part.inline_data?.data);
  const textPart = responseParts.find((part) => part.text);
  const b64 = imagePart?.inlineData?.data || imagePart?.inline_data?.data;
  if (!b64) throw new Error('Google image response did not include inline image data');
  return {
    b64,
    revisedPrompt: textPart?.text || null,
    model,
    size: 'native',
    quality: 'pro',
    source: auth.mode || (auth.apiKey ? 'google-api-key' : 'google-oauth'),
    provider: 'google',
  };
}

function mimeTypeForImage(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.webp') return 'image/webp';
  return 'image/png';
}

function publicImagePath(imageUrl) {
  if (!imageUrl || !String(imageUrl).startsWith('/')) return null;
  const resolved = path.resolve(PUBLIC_DIR, `.${imageUrl}`);
  if (!resolved.startsWith(PUBLIC_DIR) || !fsSync.existsSync(resolved)) return null;
  return resolved;
}

async function referenceImagePart(agent) {
  const filePath = publicImagePath(agent?.image);
  if (!filePath) return null;
  const bytes = await fs.readFile(filePath);
  return {
    inlineData: {
      mimeType: mimeTypeForImage(filePath),
      data: bytes.toString('base64'),
    },
  };
}

async function callGoogleCharacterImage({ auth, prompt, agent, model }) {
  // Intentionally ignoring the old agent image (reference) as requested,
  // to ensure completely fresh generations.
  return callGoogleImage({
    auth,
    model,
    prompt: [
      {
        text: [
          prompt,
          '',
          'IMPORTANT: Generate a portrait-ratio character concept with a PURE SOLID WHITE or PURE SOLID GRAY background. This is for a transparent character cutout. Keep this as a game roster character, not a landscape scene and not a portrait card. No scenery, no background details, just the character on a solid color.',
        ].join('\n'),
      }
    ],
  });
}

async function callGoogleImageWithModelFallback({ auth, prompt, agent, model, isCharacter }) {
  try {
    return isCharacter
      ? await callGoogleCharacterImage({ auth, prompt, agent, model })
      : await callGoogleImage({ auth, prompt, model });
  } catch (error) {
    const flashUnavailable =
      model === DEFAULT_GOOGLE_FLASH_IMAGE_MODEL &&
      (error?.statusCode === 404 || /not found|not supported/i.test(error?.message || ''));
    if (!flashUnavailable) throw error;
    const fallback = isCharacter
      ? await callGoogleCharacterImage({ auth, prompt, agent, model: DEFAULT_GOOGLE_IMAGE_MODEL })
      : await callGoogleImage({ auth, prompt, model: DEFAULT_GOOGLE_IMAGE_MODEL });
    return {
      ...fallback,
      providerRequested: '3.1 Flash Gen',
      fallbackModel: DEFAULT_GOOGLE_IMAGE_MODEL,
      fallbackReason: error.message || 'Flash image model unavailable',
    };
  }
}

function isCodexMissingImageScope(error, auth) {
  const rawMessage = error?.message || String(error);
  return (
    auth?.source === 'codex-oauth' &&
    (error?.statusCode === 401 || error?.statusCode === 403) &&
    rawMessage.includes('api.model.images.request')
  );
}

function providerKey(provider) {
  return String(provider || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function isGoogleImageProvider(provider) {
  return [
    'google',
    'gemini',
    'nanobanana',
    'nanobanana2pro',
    'flashgen',
    '31flashgen',
    'geminiflashimage',
  ].includes(providerKey(provider));
}

function googleModelForProvider(provider) {
  const key = providerKey(provider);
  return key === 'flashgen' || key === '31flashgen' || key === 'geminiflashimage'
    ? DEFAULT_GOOGLE_FLASH_IMAGE_MODEL
    : DEFAULT_GOOGLE_IMAGE_MODEL;
}

function googleDisplayForProvider(provider) {
  return googleModelForProvider(provider) === DEFAULT_GOOGLE_FLASH_IMAGE_MODEL
    ? googleFlashImageModelInfo.display
    : googleImageModelInfo.display;
}

function isTransparentOpenAIProvider(provider) {
  return [
    'codeximage2',
    'openaiimage2',
    'gptimageedit',
    'transparentcutout',
  ].includes(providerKey(provider));
}

async function callOpenAIImageWithFallback({ auths, prompt, size, quality, run }) {
  let lastError = null;
  for (let i = 0; i < auths.length; i += 1) {
    const auth = auths[i];
    try {
      return await (run ? run(auth) : callOpenAIImage({ auth, prompt, size, quality }));
    } catch (error) {
      error.auth = auth;
      lastError = error;
      if (isCodexMissingImageScope(error, auth) && i < auths.length - 1) continue;
      throw error;
    }
  }
  throw lastError || new Error('Image generation failed');
}

function imageErrorResponse(error, auth) {
  const rawMessage = error?.message || String(error);
  const missingImageScope = isCodexMissingImageScope(error, auth);

  if (missingImageScope) {
    return {
      status: 403,
      body: {
        code: 'CODEX_OAUTH_IMAGE_SCOPE_MISSING',
        error: 'Codex OAuth ต่อได้แล้ว แต่ token ชุดนี้ยังไม่มีสิทธิ์สร้างภาพ (api.model.images.request) จึงใช้สร้างภาพจากหน้าเว็บนี้ไม่ได้ ให้ใช้ OpenAI credential ที่มีสิทธิ์ Images API หรือใช้เครื่องมือสร้างภาพใน Codex โดยตรง',
        source: auth.source,
        providerError: rawMessage,
      },
    };
  }

  return {
    status: error?.statusCode || 500,
    body: {
      code: error?.providerCode || 'IMAGE_GENERATION_FAILED',
      error: rawMessage,
      source: auth?.source || null,
    },
  };
}

export async function imageStatusRoute(_req, res) {
  const auths = await getOpenAIAuthCandidates();
  const auth = auths[0] || { token: '', source: null, mode: null };
  const codex = await codexStatusOf();
  const google = await googleStatusOf();
  res.json({
    provider: 'openai',
    providers: [
      { provider: 'openai', display: 'OpenAI Images', connected: auths.length > 0, model: DEFAULT_MODEL },
      { ...googleImageModelInfo, connected: !!google.connected, mode: google.mode || null },
      { ...googleFlashImageModelInfo, connected: !!google.connected, mode: google.mode || null },
      { provider: 'openai', display: 'Codex Image Edit', connected: auths.length > 0, model: DEFAULT_MODEL, transparent: true },
    ],
    connected: auths.length > 0,
    source: auth.source,
    sources: auths.map(item => item.source),
    mode: auth.mode,
    codex,
    google,
    model: DEFAULT_MODEL,
    size: DEFAULT_SIZE,
    quality: DEFAULT_QUALITY,
    scopeNote: auth.source === 'codex-oauth' ? 'Codex OAuth connected; image permission is verified on first generation.' : null,
  });
}

export async function imageLibraryRoute(_req, res) {
  await fs.mkdir(IMAGE_DIR, { recursive: true });
  const entries = await fs.readdir(IMAGE_DIR, { withFileTypes: true });
  const images = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const ext = path.extname(entry.name).toLowerCase();
    if (!IMAGE_EXTS.has(ext)) continue;
    const filePath = path.join(IMAGE_DIR, entry.name);
    const stat = await fs.stat(filePath).catch(() => null);
    if (!stat) continue;
    images.push(await readImageMetadata(filePath, stat));
  }
  images.sort((a, b) => Date.parse(b.createdAt || b.updatedAt || 0) - Date.parse(a.createdAt || a.updatedAt || 0));
  res.json({ ok: true, images, dir: '/generated/images' });
}

export async function deleteImageRoute(req, res) {
  const name = path.basename(req.params.name || '');
  if (!name || !IMAGE_EXTS.has(path.extname(name).toLowerCase())) {
    return res.status(400).json({ error: 'invalid image name' });
  }
  const filePath = path.resolve(IMAGE_DIR, name);
  if (!filePath.startsWith(IMAGE_DIR)) return res.status(400).json({ error: 'invalid image path' });
  await fs.unlink(filePath).catch((error) => {
    if (error?.code !== 'ENOENT') throw error;
  });
  await fs.unlink(metadataPathFor(filePath)).catch(() => {});
  res.json({ ok: true, deleted: name });
}

export async function generateImageRoute(req, res) {
  const { noteId, prompt, size, quality, provider = 'openai', agentId, mode } = req.body || {};
  const note = noteId ? await getNote(noteId) : null;
  if (noteId && !note) return res.status(404).json({ error: 'note not found' });
  const agent = agentId ? getAgentSync(agentId) : null;
  if (agentId && !agent) return res.status(404).json({ error: 'agent not found' });

  const useGoogle = isGoogleImageProvider(provider);
  const useTransparentOpenAI = isTransparentOpenAIProvider(provider);
  const googleModel = googleModelForProvider(provider);
  const auths = useGoogle ? [] : await getOpenAIAuthCandidates();
  const googleAuth = useGoogle ? await getGoogleAuth() : null;
  if (!useGoogle && !auths.length) {
    return res.status(400).json({
      error: 'ยังไม่พบ Codex OAuth หรือ OpenAI credential ในเครื่อง ให้ login Codex ก่อน หรือเชื่อม OpenAI ในหน้าตั้งค่า',
      code: 'OPENAI_NOT_CONNECTED',
    });
  }
  if (useGoogle && !googleAuth?.connected) {
    return res.status(400).json({
      error: 'ยังไม่พบ Google/Gemini credential ในเครื่อง ให้เชื่อม Google หรือใส่ Gemini API key ใน Settings ก่อน',
      code: 'GOOGLE_NOT_CONNECTED',
      provider: 'google',
      model: DEFAULT_GOOGLE_IMAGE_MODEL,
    });
  }

  const finalPrompt = mode === 'character' || agent
    ? buildCharacterImagePrompt(agent || {}, prompt)
    : buildImagePrompt({ prompt, note });
  if (!finalPrompt.trim()) return res.status(400).json({ error: 'prompt required' });

  if (note?.id) {
    await updateNote(note.id, { status: 'running' });
    await appendMessage(note.id, {
      role: 'user',
      content: clip(prompt || note.body || note.title, 1000),
      kind: 'image_request',
    });
  }

  try {
    let result = useTransparentOpenAI
      ? await callOpenAIImageWithFallback({
          auths,
          prompt: finalPrompt,
          size: size || DEFAULT_CHARACTER_SIZE,
          quality: quality || 'high',
          run: (auth) => callOpenAITransparentImage({ auth, prompt: finalPrompt, agent, size, quality }),
        })
      : useGoogle
        ? await callGoogleImageWithModelFallback({
            auth: googleAuth,
            prompt: finalPrompt,
            agent,
            model: googleModel,
            isCharacter: mode === 'character' || !!agent,
          })
        : await callOpenAIImageWithFallback({ auths, prompt: finalPrompt, size, quality });
    if (useGoogle && googleModel === DEFAULT_GOOGLE_FLASH_IMAGE_MODEL && result?.model === DEFAULT_GOOGLE_FLASH_IMAGE_MODEL) {
      result.providerRequested = '3.1 Flash Gen';
    }
    await fs.mkdir(IMAGE_DIR, { recursive: true });
    const id = crypto.randomUUID();
    const name = `${Date.now()}-${safeFilename(note?.title || prompt)}-${id.slice(0, 8)}.png`;
    const filePath = path.join(IMAGE_DIR, name);
    await fs.writeFile(filePath, Buffer.from(result.b64, 'base64'));
    const cutoutPath = agent?.id && mode === 'character' && useGoogle
      ? await createTransparentCutout(filePath)
      : null;
    const finalFilePath = cutoutPath || filePath;
    const imageUrl = `/generated/images/${path.basename(finalFilePath)}`;
    const libraryMeta = await writeImageMetadata(finalFilePath, {
      id,
      prompt: finalPrompt,
      revisedPrompt: result.revisedPrompt,
      provider: useGoogle ? googleDisplayForProvider(provider) : useTransparentOpenAI ? 'codex-image-edit' : 'openai-image',
      model: result.model,
      source: result.source,
      agentId: agent?.id || null,
      noteId: note?.id || null,
      size: result.size,
      quality: result.quality,
    });
    if (agent?.id) updateAgent(agent.id, { generatedImage: imageUrl, lastImagePrompt: finalPrompt });

    const message = {
      role: 'agent',
      agentId: note?.agentId || 'echo',
      provider: useGoogle ? googleDisplayForProvider(provider) : useTransparentOpenAI ? 'codex-image-edit' : 'openai-image',
      kind: 'image',
      content: `สร้างภาพจริงเสร็จแล้ว\n${imageUrl}`,
      imageUrl,
      prompt: finalPrompt,
      revisedPrompt: result.revisedPrompt,
      model: result.model,
      source: result.source,
      ok: true,
    };
    if (note?.id) {
      await appendMessage(note.id, message);
      await updateNote(note.id, { status: 'done' });
    }
    res.json({ ok: true, imageUrl, image: libraryMeta, agentId: agent?.id || null, ...result, prompt: finalPrompt });
  } catch (e) {
    const response = useGoogle
      ? {
          status: e?.statusCode || 500,
          body: {
            code: e?.providerCode || 'GOOGLE_IMAGE_GENERATION_FAILED',
            error: e.message || String(e),
            source: googleAuth?.mode || null,
            provider: 'google',
            model: googleModel,
          },
        }
      : imageErrorResponse(e, e.auth || auths[0]);
    if (note?.id) {
      await appendMessage(note.id, {
        role: 'agent',
        agentId: note.agentId || 'echo',
        provider: 'openai-image',
        kind: 'error',
        content: response.body.error,
        code: response.body.code,
        source: response.body.source,
        ok: false,
      }).catch(() => {});
      await updateNote(note.id, { status: 'queued' }).catch(() => {});
    }
    res.status(response.status).json(response.body);
  }
}
