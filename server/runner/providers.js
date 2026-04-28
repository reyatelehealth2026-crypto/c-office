// Provider abstraction layer for outbound CLI calls.
//
// We support 4 providers out of the box:
//   - echo    : zero-dependency demo provider (always available)
//   - claude  : Anthropic's Claude Code CLI ("claude -p ...")
//   - codex   : OpenAI Codex CLI            ("codex exec ...")
//   - gpt     : Generic GPT CLI fallback    ("sgpt"/"gpt"/"chatgpt")
//
// Each provider exposes:
//   detect()                       → boolean (binary on PATH)
//   run({ prompt, system }, onChunk) → Promise<{ ok, output, exitCode? }>
//
// Override commands via env vars:
//   C_OFFICE_CLAUDE_CMD, C_OFFICE_CODEX_CMD, C_OFFICE_GPT_CMD
// (space-separated argv template, ${PROMPT} placeholder is replaced)

import { spawn } from 'node:child_process';
import { execFileSync } from 'node:child_process';

function which(bin) {
  try {
    const out = execFileSync('sh', ['-c', `command -v ${JSON.stringify(bin)} 2>/dev/null`], {
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 800,
    }).toString().trim();
    return out || null;
  } catch { return null; }
}

function buildCmd(envName, fallback, prompt) {
  const tmpl = process.env[envName] || fallback;
  const parts = tmpl.split(/\s+/).filter(Boolean);
  const replaced = parts.map(p => p === '${PROMPT}' ? prompt : p);
  // If no ${PROMPT} placeholder, append prompt as a final argv.
  const hasPh = parts.includes('${PROMPT}');
  if (!hasPh) replaced.push(prompt);
  return replaced;
}

function runArgv(argv, onChunk, { timeoutMs = 60_000 } = {}) {
  return new Promise((resolve) => {
    let chunks = '';
    let killed = false;
    const child = spawn(argv[0], argv.slice(1), {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env,
    });
    const timer = setTimeout(() => {
      killed = true;
      try { child.kill('SIGTERM'); } catch {}
      setTimeout(() => { try { child.kill('SIGKILL'); } catch {} }, 1000).unref?.();
    }, timeoutMs).unref?.();

    child.stdout.on('data', (buf) => {
      const s = buf.toString('utf8');
      chunks += s;
      try { onChunk?.(s); } catch {}
    });
    child.stderr.on('data', (buf) => {
      // echo stderr in-line so users can see CLI errors
      const s = buf.toString('utf8');
      chunks += s;
      try { onChunk?.(s); } catch {}
    });
    child.on('error', (e) => {
      clearTimeout(timer);
      resolve({ ok: false, output: chunks + `\n[provider error] ${e.message}`, exitCode: -1 });
    });
    child.on('exit', (code) => {
      clearTimeout(timer);
      resolve({
        ok: !killed && code === 0,
        output: chunks || (killed ? '[timeout]' : ''),
        exitCode: code,
        killed,
      });
    });
  });
}

// ── Provider definitions ──────────────────────────────────────────────────────

const echo = {
  name: 'echo',
  display: 'Echo (built-in demo)',
  description: 'Local echo provider — no external CLI required. Useful for testing the pipeline.',
  detect: () => true,
  async run({ prompt, agentName }, onChunk) {
    const reply = `「${agentName || 'Agent'}」 received your task:\n  ${prompt}\n\n` +
      `(echo provider — install Claude Code, Codex, or GPT CLI to dispatch real LLM responses.)`;
    // Stream reply char-by-char so the UI animation feels live.
    for (let i = 0; i < reply.length; i += 24) {
      onChunk?.(reply.slice(i, i + 24));
      await new Promise(r => setTimeout(r, 18));
    }
    return { ok: true, output: reply, exitCode: 0 };
  },
};

const claude = {
  name: 'claude',
  display: 'Claude Code CLI',
  description: 'Anthropic Claude CLI (claude -p "...")',
  detect: () => !!which('claude'),
  async run({ prompt }, onChunk) {
    const argv = buildCmd('C_OFFICE_CLAUDE_CMD', 'claude -p ${PROMPT}', prompt);
    return runArgv(argv, onChunk, { timeoutMs: 120_000 });
  },
};

const codex = {
  name: 'codex',
  display: 'Codex CLI',
  description: 'OpenAI Codex CLI (codex exec "...")',
  detect: () => !!which('codex'),
  async run({ prompt }, onChunk) {
    const argv = buildCmd('C_OFFICE_CODEX_CMD', 'codex exec ${PROMPT}', prompt);
    return runArgv(argv, onChunk, { timeoutMs: 120_000 });
  },
};

const gpt = {
  name: 'gpt',
  display: 'GPT CLI',
  description: 'Generic GPT CLI (sgpt / gpt / chatgpt). Override with C_OFFICE_GPT_CMD',
  detect: () => !!(which('sgpt') || which('gpt') || which('chatgpt')),
  async run({ prompt }, onChunk) {
    let bin = process.env.C_OFFICE_GPT_CMD ? null
            : which('sgpt') ? 'sgpt'
            : which('gpt')  ? 'gpt'
            : which('chatgpt') ? 'chatgpt'
            : 'sgpt';
    const fallback = bin ? `${bin} ${'${PROMPT}'}` : 'sgpt ${PROMPT}';
    const argv = buildCmd('C_OFFICE_GPT_CMD', fallback, prompt);
    return runArgv(argv, onChunk, { timeoutMs: 120_000 });
  },
};

export const PROVIDERS = { echo, claude, codex, gpt };

export function listProviders() {
  return Object.values(PROVIDERS).map(p => ({
    name:        p.name,
    display:     p.display,
    description: p.description,
    available:   !!p.detect(),
  }));
}

export function getProvider(name) {
  return PROVIDERS[name] || null;
}

export function defaultProvider() {
  // Prefer a real LLM if installed; fall back to echo so the UI flow still works.
  for (const n of ['claude', 'codex', 'gpt']) {
    if (PROVIDERS[n].detect()) return n;
  }
  return 'echo';
}
