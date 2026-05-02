# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this project is

C-Office is a real-time monitor for Claude Code CLI sessions, themed as a gacha-RPG "office" of 9 personas. Hooks installed into `~/.claude/settings.json` POST event payloads to a local Express server, which also tails JSONL transcripts under `~/.claude/projects/`. State is held in memory and pushed to a React dashboard via SSE.

There is **no build step**. Backend is ESM Node, frontend is React 18 (UMD) + Babel Standalone transpiling JSX in the browser.

## Commands

```bash
npm run dev               # node --watch — auto-restart on server file changes
npm start                 # production start (no watch)
npm run install-hooks     # writes hook entries into ~/.claude/settings.json (idempotent, makes timestamped backup)
npm run uninstall-hooks   # removes c-office hook entries (matched by `c-office:post-event` marker)
npm run tunnel            # expose http://127.0.0.1:7878 publicly (Cloudflare Quick Tunnel, fallback to localtunnel)
npm run tunnel:cloudflare # force Cloudflare Quick Tunnel via npx cloudflared
npm run tunnel:localtunnel# force localtunnel.me via npx localtunnel
```

### Public-link access

`scripts/tunnel.js` runs an outbound tunnel to whichever local port the server is on (`PORT`, default 7878). No port-forward and no DNS needed. **Always set an access token before exposing publicly** — `server/security/access-token.js` already runs as a global middleware:

- Set `C_OFFICE_ACCESS_TOKEN=<secret>` (or `C_OFFICE_PUBLIC_TOKEN=<secret>`) before `npm start`
- Browser users land on a small `/access` login page; CLI/API callers send `Authorization: Bearer <secret>` or `?token=<secret>`
- A signed cookie persists the session across page loads so the dashboard stops re-prompting after the first visit

If the env var is unset the gate is bypassed (local-only convenience). The tunnel script prints a yellow warning when it detects no token is configured.

Server listens on `http://127.0.0.1:7878` (override with `PORT` / `HOST` env). Frontend `.jsx` files are served from `public/` and edits are picked up on browser reload — `node --watch` is **not** needed for frontend changes.

### Useful env vars

- `C_OFFICE_REPLAY=1` — replay every existing JSONL line in `~/.claude/projects` on startup. Default is to seed file offsets to current EOF so the dashboard only shows new activity.
- `PORT`, `HOST` — bind address (defaults `7878` / `127.0.0.1`). If you change the port you must also update the URL in `hooks/post-event.sh`.

### No tests / linter

There is no test suite, no lint config, no typechecker. Verify changes by running `npm run dev` and exercising the dashboard / `curl`-ing `/hooks/event`. There is also no `npm install` lockfile drift guard — only two runtime deps (`express`, `chokidar`).

## Architecture

### Two ingestion paths, one state

Events flow into `server/state.js` from **two independent sources** that observe the same Claude Code activity:

1. **HTTP hooks** — `hooks/post-event.sh` (installed into `~/.claude/settings.json`) fires on `SessionStart`, `SessionEnd`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `SubagentStart`, `SubagentStop`, `Stop`. POSTs JSON to `/hooks/event` and is handled by `server/api/hooks.js`. Fire-and-forget with a 400 ms timeout — the script always exits 0 so Claude never blocks.
2. **JSONL tail** — `server/watchers/transcripts.js` watches `~/.claude/projects/**/*.jsonl` with chokidar, tracks per-file byte offsets in `state.fileOffsets`, and replays new lines as events. The JSONL stream is the only source that carries the assistant `usage` block (token counts) needed for cost accounting.

Both paths emit the same `tool_use_id` for the same tool call, so **deduplication is structural, not optional**. `server/util/dedupe.js` is an LRU set keyed by:
- `tu:<tool_use_id>` for tool-use events
- `tr:<tool_use_id>` for tool-result events
- `usage:<assistant_msg_uuid>` for usage tracking (kept separate so the hook duplicate cannot drown the token tally)

When adding new event sources or fields, **always provide a `dedupeKey`** or events will appear twice.

### State machine (`server/state.js`)

`state` is a single in-memory object: `sessions` (Map), `events` (RingBuffer cap 2000), `tasks` (Map by tool_use_id), `personaStatus`, `personaLevels`, `lastToolActivity`, plus daily-rolling `stats`. There is no database; restarting the server drops everything except what gets replayed from JSONL.

The **busy-state decay** is the trickiest invariant:
- A persona becomes `busy` when (a) a `Task`/`Agent` tool spawns a subagent, **or** (b) any tool_use/result event for that persona arrives within the last `BUSY_WINDOW_MS` (8 s).
- A `Stop` hook (turn-end) clears busy immediately.
- A 2 s `setInterval` re-runs `recomputePersonaStatus()` and emits `persona.status` only when the snapshot changes — this is what lets the UI return to `active`/`idle` after silence even if no new events arrive.

If you change `BUSY_WINDOW_MS` or the recompute logic, exercise both the "fast tool stream" and "long silent assistant turn" cases.

### Persona routing (`server/mapping/personas.js`)

Every session/subagent is mapped to one of 9 personas. **Persona `id` ≠ display name** — keep this table handy:

| id | name |
|---|---|
| `orchestra` | Orchestra |
| `astra` | Aira |
| `lumen` | Luna |
| `vex` | Vivi |
| `kai` | Kira |
| `mira` | Miku |
| `echo` | Emi |
| `nyx` | Nana |
| `orbit` | Ori |

Routing rules in `PERSONA_RULES` are evaluated **in order, first match wins**. They are intentionally ordered most-specific-functional first (e.g. `paid-media-search-query-analyst` matches Nana's analytics rule before Miku's paid-media keyword rule). Adding a new rule near the top is usually correct; adding it at the bottom risks being shadowed.

`mapPersona()` normalizes input to lowercase-hyphen slug form, so each regex must match both display ("UI Designer") and slug ("ui-designer"). Look at the `echo` (Emi) rule for the established pattern.

Special cases handled inside `mapPersona`:
- `sessionKind === 'interactive'` or no `subagent_type` → always `orchestra`.
- Anything that falls through every rule → `kai` (default for unclassified engineering work).

### Server entry points (`server/index.js`)

| Route | Purpose |
|---|---|
| `GET /api/state` | Full snapshot — personas (with merged runtime stats), sessions, events, tasks, edges |
| `POST /api/state/reset` | `clearState()` — drops events/tasks/dedupe and resets persona levels to 1; keeps live sessions and file offsets |
| `GET /api/stream` | SSE — emits `event`, `session.start`, `session.end`, `task`, `stats`, `persona.status` |
| `POST /hooks/event` | Hook ingress (called by `post-event.sh`) |
| `GET /api/agents/:id/history` | Per-persona event history |
| `GET /api/memory` | Memory graph from `~/.claude/projects/*/memory/*.md` (cached 30 s) |
| `GET /api/settings` | Read-only safe view of `~/.claude/settings.json` |

Static `express.static` serves `public/`; the middleware sets `Content-Type: text/babel` for `.jsx` so Babel Standalone in `index.html` can `<script type="text/babel" src="...">` them directly.

### Frontend (`public/`)

`public/data.js` is the live data layer. It bootstraps from `/api/state`, opens an `EventSource('/api/stream')`, mutates `window.AGENTS` / `window.ACTIVITY` / etc. in place, and uses a custom `useCOfficeRefresh()` hook backed by `useSyncExternalStore` to trigger React re-renders. JSX files are loaded via `<script type="text/babel" src="...">` in `index.html`.

The page router lives directly in `index.html`'s inline JSX block; pages are sibling files (`page-dashboard.jsx`, `page-detail.jsx`, etc.) that all read from the `window.*` globals.

### Hook installer (`server/install-hooks.js`)

Writes into `~/.claude/settings.json` using **deep-merge with idempotency**. Detection works by embedding the literal marker `c-office:post-event` as a `# comment` at the end of each hook command string. Existing hooks (e.g. user's `rtk-rewrite.sh`) are preserved. Every install/uninstall first writes `~/.claude/settings.json.bak.<timestamp>`.

If you add a new hook event to listen on, append it to the `EVENTS` array — uninstall scans the same array.

## Agent execution layer

`server/agents/` adds a **server-side agent execution surface** alongside the passive monitor. The dashboard's "Send to Orchestra" input + `POST /api/task { goal }` invokes `runOrchestrator()` in `server/agents/runner.js`, which:

1. Calls Anthropic via `@anthropic-ai/claude-agent-sdk` with Orchestra's system prompt (`server/agents/personas.js`) and a single tool: `delegate(persona, instruction)`.
2. Loops while `stop_reason === 'tool_use'`. For each delegation:
   - `persona === 'echo'` → image adapter (`server/agents/image.js`, default Gemini Imagen, swap with `IMAGE_PROVIDER=replicate|openai`).
   - any other persona → child `messages.create` with that persona's system prompt + tool allowlist.
3. Emits **synthetic events through the existing `pushEvent` / `startTask` / `finishTask` pipeline** so the gacha busy animation, persona-status broadcast, level-ups, and event feed light up unchanged. Each delegation gets a synthetic `tool_use_id` so the dedupe contract still holds.
4. Persists run state in `state.runs` (Map by run_id). Snapshot exposes the last 50 runs; `'run'` is a new SSE event type for live updates.

The CLI surface is independent: `.claude/agents/<persona>.md` files (orchestra, nana, luna, emi to start) make the same personas usable via the Task tool inside any Claude Code session — existing hook events already render them in the dashboard with no extra wiring. **Slug ↔ persona id ↔ display name** are three different things; `mapPersona()` reconciles them, but when authoring system prompts and `delegate` enums use **persona ids** (`nyx`, `lumen`, `echo`, …).

### Pipeline phases & timeouts (`server/agents/runner.js`)

Each run flows through `analyze → plan → plan-critique → execute → critique → verify`. Key invariants:

- **Phase 0 (analyze)** is skipped when `runOrchestrator` is invoked with `existingRunId` — that means the user already supplied follow-up feedback, and re-asking the clarification question would just loop. The `ANALYZE_SYSTEM` prompt is biased hard toward `CLEAR`; only genuinely missing concrete facts (no subject, no destination, no language) trigger a clarifying question. Style/tone/length ambiguity is *not* a reason to ask.
- **Per-phase wall-clock timeouts** live in `PHASE_TIMEOUTS_MS` (`plan: 60s, execute: 600s, critique: 90s, verify: 60s`). The claude path is wrapped with `withPhaseTimeout()`; non-claude providers (`codex`, `gemini`) are wrapped with the equivalent `Promise.race` — *both* must time out, otherwise an unresponsive provider hangs the run forever.
- **Tool-using personas** get `maxTurns = 30` and the prompt includes an explicit "TOOL BUDGET: at most 6 tool calls, then STOP and write final" instruction. On `error_max_turns` we keep any accumulated assistant text; if there's still nothing, we fire one **synthesis turn** (no tools, `maxTurns=1`) to force a final answer instead of failing the step.
- **Echo (image) step** distills `prior` (research/writing outputs) + `step.instruction` into a focused image prompt via a Haiku 4.5 composer call before invoking `generateImage()`. The composed prompt is logged to scratchpad as `[image-prompt]` so it shows up in the run trace. Falls back to direct concat if the composer fails.

### Image Studio Look Lock (`public/page-images.jsx`)

Image generation has three top-level controls — `IMAGE_STYLES` (Photorealistic / Cinematic / Anime / Manga / 3D / Pixel / Oil / Watercolor / Concept / Flat), `ASPECT_RATIOS` (1:1, 4:3, 3:4, 16:9, 9:16, 21:9), and `RESOLUTIONS` (1K/2K/4K/8K). At send time `decoratePrompt()` appends the chosen modifiers after a `--- LOOK LOCK ---` marker, and `generate()` also passes `size`/`quality` to `/api/images/generate`. Server-side `buildImagePrompt()` recognises the marker and passes the prompt through verbatim instead of wrapping it in the legacy "vivid fantasy game illustration" preamble that used to override user style.

## OAuth credential store

There is **no `ANTHROPIC_API_KEY`, no `REPLICATE_API_TOKEN` env var**. Credentials live in `~/.c-office/credentials.json`, AES-256-GCM encrypted with a per-machine key derived from `os.hostname()` + a one-time salt under `~/.c-office/.salt`. Same trust model as Claude Code's own `~/.claude/.credentials.json` — defeats casual `cat`, not a determined local attacker.

Auth surface (`server/auth/`, `server/api/auth.js`):

| Provider | Flow | Notes |
|---|---|---|
| Anthropic | "Connect" button reads `~/.claude/.credentials.json` (after `claude login`) and mirrors into the c-office store; refresh handled in `server/auth/anthropic.js` | Anthropic does not (yet) expose a public third-party OAuth provider. Fallback: paste an `sk-ant-…` key. |
| Google (Gemini Imagen) | Full PKCE OAuth, loopback redirect to `/auth/google/callback` | First requires a `client_id` from Google Cloud Console — pasted in Settings (Desktop or Web client; PKCE means no secret needed). |
| Replicate, OpenAI | Settings paste-token only | No public third-party OAuth. |

The Settings → Connections panel shows live status per provider via the `'auth.status'` SSE event. **On SSE connect** `server/api/stream.js` immediately pushes the current `statusSnapshot()` so newly-loaded clients reflect real state instead of "disconnected"; on bootstrap `public/data.js` also fetches `/api/auth/status` once for first-paint correctness. The dashboard's "Send to Orchestra" button is gated on Anthropic being connected.

When adding a new provider:
1. Drop a module in `server/auth/<provider>.js` exposing `getXAuth()`, `statusOf()`, optionally `startAuth/handleCallback` for OAuth.
2. Wire it in `server/api/auth.js` (route + status snapshot).
3. Read it from the consuming adapter — never `process.env.X_API_KEY`.

## Conventions to follow

- **ESM only** — `package.json` has `"type": "module"`. Use `import`, no CommonJS.
- **No new runtime deps casually**. Two prod deps total. The lack of a build step is a feature; keep it.
- **Persona display names live in `personas.js`**; do not hard-code "Aira" / "Vivi" / etc. elsewhere — read them from the persona object so future renames stay localized.
- **New events need a `dedupeKey`.** See "Two ingestion paths" above.
- **Hook script must stay non-blocking.** `hooks/post-event.sh` runs inside the user's Claude Code process — anything that can't finish in 400 ms must be backgrounded with `&` + `disown` and exit 0.
- **In-memory only.** Don't add a database without an explicit ask; clients tolerate restart-loss because JSONL replay (with `C_OFFICE_REPLAY=1`) covers the historical case.
- **Pricing constants** live in `server/mapping/pricing.js` and are keyed by full model ID with `opus`/`haiku` substring fallbacks. Add new model IDs here when Claude Code starts emitting them.

## Troubleshooting checklist

- "Dashboard sees nothing": confirm hooks are installed (`grep -c 'c-office' ~/.claude/settings.json` should be ≥ 5), server is on `:7878`, and a `curl -X POST http://127.0.0.1:7878/hooks/event -H 'X-COffice-Event: SessionStart' -H 'Content-Type: application/json' --data '{"session_id":"test","pid":123}'` returns `{"ok":true}`.
- "Persona stuck idle while clearly busy": likely a `PERSONA_RULES` miss. Test interactively: `node -e "import('./server/mapping/personas.js').then(m => console.log(m.mapPersona('Your Subagent Name', 'agent')))"`.
- "Persona stuck busy after Stop": check that the `Stop` hook entry actually exists in settings (re-run `npm run install-hooks`); only `Stop` clears `lastToolActivity` immediately.
- "Duplicated events in feed": a new code path is missing a `dedupeKey` — same `tool_use_id` is being fed by both `hooks.js` and `transcripts.js`.
