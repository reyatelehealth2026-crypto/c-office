// LLM provider adapters for orchestrator runs.
//
// All adapters expose a single function:
//   callLLM({ provider, systemPrompt, prompt, model, fetchImpl? })
//     → { ok, text, model, error?, hint? }
//
// `provider` is one of 'claude' | 'codex' | 'gemini'. The Claude path is
// handled by runner.js directly (Claude Agent SDK with tools / sub-agents
// semantics). This module covers Codex (CLI shell-out preferred, OpenAI
// Chat Completions fallback) and Gemini (Google generateContent) paths.

import { spawn, execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { getCreds } from '../auth/credentials.js';
import { getGoogleAuth } from '../auth/google.js';
import { getCodexAccessToken } from '../auth/codex.js';

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

// ── Codex CLI shell-out adapter ──────────────────────────────────────────
// Uses the `codex` CLI binary that the user already authenticated via
// `codex login`. Avoids requiring an OpenAI sk-... key for ChatGPT-tier users.

function commandCandidates(bin) {
  try {
    const cmd = process.platform === 'win32' ? 'where.exe' : 'sh';
    const args = process.platform === 'win32'
      ? [bin]
      : ['-c', `command -v ${JSON.stringify(bin)} 2>/dev/null`];
    const out = execFileSync(cmd, args, { stdio: ['ignore', 'pipe', 'ignore'], timeout: 800 })
      .toString().trim();
    return out.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  } catch { return []; }
}

function resolveCodexArgv(prompt) {
  if (process.env.C_OFFICE_CODEX_CMD) {
    const tmpl = process.env.C_OFFICE_CODEX_CMD;
    const parts = tmpl.split(/\s+/).filter(Boolean);
    const replaced = parts.map((p) => (p === '${PROMPT}' ? prompt : p));
    if (!parts.includes('${PROMPT}')) replaced.push(prompt);
    return replaced;
  }
  const candidates = commandCandidates('codex');
  if (process.platform === 'win32') {
    const cmdShim = candidates.find((file) => file.toLowerCase().endsWith('codex.cmd'));
    if (cmdShim) {
      const script = path.join(path.dirname(cmdShim), 'node_modules', '@openai', 'codex', 'bin', 'codex.js');
      if (existsSync(script)) return [process.execPath, script, 'exec', prompt];
    }
  }
  const bin = candidates[0] || 'codex';
  return [bin, 'exec', prompt];
}

async function callCodexCLI({ systemPrompt, prompt }) {
  const auth = await getCodexAccessToken().catch(() => null);
  if (!auth?.accessToken) {
    return {
      ok: false,
      error: 'Codex CLI not connected',
      hint: 'run `codex login` (see docs/CODEX_SETUP.md)',
    };
  }
  if (commandCandidates('codex').length === 0 && !process.env.C_OFFICE_CODEX_CMD) {
    return {
      ok: false,
      error: 'codex binary not on PATH',
      hint: 'install Codex CLI: npm install -g @openai/codex',
    };
  }
  const fullPrompt = systemPrompt ? `${systemPrompt}\n\n---\n\n${prompt}` : prompt;
  const argv = resolveCodexArgv(fullPrompt);
  const timeoutMs = Number(process.env.C_OFFICE_CODEX_TIMEOUT_MS) || 180_000;

  return await new Promise((resolve) => {
    const child = spawn(argv[0], argv.slice(1), { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    const timer = setTimeout(() => {
      try { child.kill('SIGKILL'); } catch {}
      resolve({ ok: false, error: `codex CLI timeout after ${timeoutMs}ms` });
    }, timeoutMs);
    child.stdout.on('data', (d) => { out += d.toString(); });
    child.stderr.on('data', (d) => { err += d.toString(); });
    child.on('error', (e) => {
      clearTimeout(timer);
      resolve({ ok: false, error: `codex spawn failed: ${e.message}` });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      const text = out.trim();
      if (code === 0 && text) {
        resolve({ ok: true, text, model: 'codex-cli' });
      } else {
        resolve({
          ok: false,
          error: `codex exited ${code}${err ? `: ${err.trim().slice(0, 240)}` : ''}`,
          hint: 'check `codex login` status; see docs/CODEX_SETUP.md',
        });
      }
    });
  });
}

export async function callLLM({ provider, systemPrompt, prompt, model, fetchImpl }) {
  if (provider === 'codex') {
    // Prefer the CLI shell-out (Codex CLI ChatGPT auth) — falls back to the
    // OpenAI Chat Completions API if the CLI isn't available but the user
    // has pasted an sk-... key in Settings.
    const cli = await callCodexCLI({ systemPrompt, prompt });
    if (cli.ok) return cli;
    const api = await callOpenAI({ systemPrompt, prompt, model, fetchImpl });
    if (api.ok) return api;
    // Surface the most actionable message.
    return cli.error.includes('not connected') && api.error.includes('not connected')
      ? { ok: false, error: 'Codex CLI not connected and no OpenAI key', hint: 'run `codex login` OR paste an sk-... key in Settings' }
      : (api.error.includes('not connected') ? cli : api);
  }
  if (provider === 'gemini') return callGemini({ systemPrompt, prompt, model });
  return { ok: false, error: `Unknown provider: ${provider}` };
}

export const SUPPORTED_PROVIDERS = ['claude', 'codex', 'gemini'];
