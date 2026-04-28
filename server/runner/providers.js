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

// Per-persona canned replies for the echo provider, so users see something
// in-character even without a real LLM CLI installed. Picks one line at random.
const ECHO_LINES = {
  Orchestra: [
    'Plan locked. I\'m routing the audit to Vivi, the docs to Luna, and the deploy to Ori. We move in fifteen.',
    'Three moves: scope it, ship a slice, measure. I\'ll keep the tempo — call out blockers as they land.',
  ],
  Aira: [
    'I\'ll structure this as a three-step learning path so the next person can pick it up cold. Drafting modules now.',
    'Curriculum first, then exercises. Give me a draft outline before EOD and I\'ll layer the assessments on top.',
  ],
  Luna: [
    'Hook, promise, payoff — give me the angle and I\'ll spin a 600-word draft you can ship raw or polish twice.',
    'Tone: warm, specific, a little cheeky. I\'ll cut three takeaways at the end so readers leave with something to do.',
  ],
  Vivi: [
    'Scanned the surface — three suspect spots: token rotation, session fixation, error-message leaks. I\'ll write the proof for each.',
    'Audit pass: revoke on logout, harden the cookie flags, and add a guard in the auth middleware before this ships.',
  ],
  Kira: [
    'I\'ll spike a working slice tonight — single endpoint, in-memory only — then we iterate the schema and tests in the morning.',
    'Forging a fix now: refactor the handler, add a regression test, ship behind a flag. Should land in under an hour.',
  ],
  Miku: [
    'Two hooks tested side-by-side, post at peak, lean into UGC for the second beat. I\'ll have the asset list ready in twenty.',
    'Plan: 3 short-form posts, 1 carousel, 1 livestream tease. CTA goes to the waitlist — measure click-through, kill what flops.',
  ],
  Emi: [
    'I\'ll mock three frames with different palettes — pick one, I\'ll motion it. Quiet rule: nothing ships unaligned to the grid.',
    'Composition first, color second. I\'ll send a thumbnail set within an hour so we can lock the direction before render.',
  ],
  Nana: [
    'Pulling three signal sources, controlling for last week\'s release. I\'ll send a one-page memo with the top causal candidates.',
    'Hypothesis: the spike correlates with the Tuesday cohort. Need 24h of analytics — then I can give you a verdict, not a vibe.',
  ],
  Ori: [
    'Runbook ready: stage, smoke, prod, rollback at 5%. I\'ll page the channel before each gate so nothing surprises anyone.',
    'I\'ll batch the deploy, throttle the cache warmup, and keep an eye on the queue depth. Lights stay on — promise.',
  ],
};

function pickEchoLine(agentName) {
  const arr = ECHO_LINES[agentName] || [
    'Understood — I\'ve received the brief. Without a real LLM provider attached this is a templated reply, but the dispatch pipeline is working end-to-end.',
  ];
  return arr[Math.floor(Math.random() * arr.length)];
}

const echo = {
  name: 'echo',
  display: 'Echo (built-in demo)',
  description: 'Local echo provider — no external CLI required. Useful for testing the pipeline.',
  detect: () => true,
  async run({ prompt, agentName }, onChunk) {
    // Build a reply that mirrors the prompt header (preserves the scene
    // builder's "## Your reply" cut-point) but ends with an in-character line.
    const inCharacter = pickEchoLine(agentName);
    const reply =
      `「${agentName || 'Agent'}」 received your task:\n  ${prompt}\n\n` +
      `## Your reply (be concise, actionable, and stay in character):\n` +
      inCharacter + '\n\n' +
      `(echo provider — install Claude Code, Codex, or GPT CLI to dispatch real LLM responses.)`;
    for (let i = 0; i < reply.length; i += 32) {
      onChunk?.(reply.slice(i, i + 32));
      await new Promise(r => setTimeout(r, 14));
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
