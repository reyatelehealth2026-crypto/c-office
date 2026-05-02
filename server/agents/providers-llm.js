// LLM provider adapters for orchestrator runs.
//
// All adapters expose a single function:
//   callLLM({ provider, systemPrompt, prompt, model, fetchImpl? })
//     → { ok, text, model, error?, hint? }
//
// `provider` is one of 'claude' | 'codex' | 'gemini'. The Claude path is
// handled by runner.js directly (Claude Agent SDK with tools / sub-agents
// semantics). This module covers the simpler Codex (OpenAI Chat Completions)
// and Gemini (Google generateContent) paths.

import { getCreds } from '../auth/credentials.js';
import { getGoogleAuth } from '../auth/google.js';

const TIMEOUT_MS = 120_000;
const DEFAULT_MODELS = {
  codex: 'gpt-4o',
  gemini: 'gemini-3.1-pro-preview',
};

async function fetchWithTimeout(fetchImpl, url, options = {}) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
  try {
    return await fetchImpl(url, { ...options, signal: ac.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function callOpenAI({ systemPrompt, prompt, model, fetchImpl = globalThis.fetch }) {
  const c = await getCreds('openai');
  if (!c?.apiKey) {
    return { ok: false, error: 'OpenAI not connected', hint: 'paste an sk-... key in Settings' };
  }
  const m = model || DEFAULT_MODELS.codex;
  try {
    const r = await fetchWithTimeout(fetchImpl, 'https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${c.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: m,
        messages: [
          ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
          { role: 'user', content: prompt },
        ],
      }),
    });
    if (r.status === 401) return { ok: false, error: 'unauthorized', hint: 'OpenAI key invalid' };
    if (r.status === 429) return { ok: false, error: 'rate-limited (429)', hint: 'wait then retry' };
    if (!r.ok) return { ok: false, error: `OpenAI HTTP ${r.status}` };
    const j = await r.json().catch(() => ({}));
    const text = j?.choices?.[0]?.message?.content || '';
    return { ok: !!text.trim(), text: text.trim(), model: j?.model || m };
  } catch (e) {
    return { ok: false, error: e?.name === 'AbortError' ? `timeout after ${TIMEOUT_MS}ms` : (e?.message || String(e)) };
  }
}

async function callGemini({ systemPrompt, prompt, model }) {
  const auth = await getGoogleAuth();
  if (!auth?.connected) {
    return { ok: false, error: 'Google not connected', hint: 'connect OAuth, configure CLI, or paste a Gemini API key' };
  }
  const m = model || DEFAULT_MODELS.gemini;

  // Use REST API directly to ensure latest tool features (like google_search) are fully supported.
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`;
  const headers = { 'Content-Type': 'application/json' };
  if (auth.apiKey) headers['x-goog-api-key'] = auth.apiKey;
  else if (auth.accessToken) headers.Authorization = 'Bearer ' + auth.accessToken;

  const body = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    tools: [{ google_search: {} }],
    safetySettings: [
      { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
    ],
  };

  if (systemPrompt) {
    body.system_instruction = { role: 'system', parts: [{ text: systemPrompt }] };
  }

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    const json = await res.json();
    if (!res.ok) {
      return { ok: false, error: json.error?.message || `HTTP ${res.status}`, hint: json.error?.status };
    }

    const candidate = json.candidates?.[0];
    let outText = candidate?.content?.parts?.filter(p => p.text).map(p => p.text).join('').trim() || '';

    if (!outText) return { ok: false, error: `Gemini returned no text (model=${m})` };

    return { ok: true, text: outText, model: json.modelVersion || m };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
}

export async function callLLM({ provider, systemPrompt, prompt, model, fetchImpl }) {
  if (provider === 'codex') return callOpenAI({ systemPrompt, prompt, model, fetchImpl });
  if (provider === 'gemini') return callGemini({ systemPrompt, prompt, model });
  return { ok: false, error: `Unknown provider: ${provider}` };
}

export const SUPPORTED_PROVIDERS = ['claude', 'codex', 'gemini'];
