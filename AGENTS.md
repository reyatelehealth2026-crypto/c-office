# AGENTS.md — C-Office Agent Operating Manual

> This file is the control tower for any AI agent, Codex session, Claude Code run, or human developer working inside this repository. Treat it as the repo constitution: follow it before editing code, docs, UI, prompts, hooks, credentials, or runtime behavior.

---

## 1. Mission

C-Office is a local-first command center for AI agent teams.

It turns scattered CLI activity into a live operational dashboard:

- monitors Claude Code sessions and tool usage in realtime
- maps many subagents into 9 high-level personas
- exposes a browser UI for mission control, notes, tasks, images, projects, and agent status
- supports multi-provider dispatch through echo / Claude / Codex / GPT-style CLIs
- runs an Orchestra-led multi-agent workflow through Anthropic Agent SDK
- stores lightweight state in memory and local JSON files under `~/.c-office/`
- keeps credentials out of env sprawl through an encrypted local credential store

The product identity is not plain admin software. It is a **JRPG command room for AI work**: fast, visual, alive, and practical.

---

## 2. Non-negotiable Rules

1. **Do not reduce existing capability.** Add, tighten, or refactor, but do not silently remove routes, personas, providers, docs, UI affordances, or workflow scripts.
2. **Keep the app local-first by default.** Default host is `127.0.0.1`; external exposure needs explicit access protection.
3. **Never commit secrets.** No API keys, OAuth tokens, session files, generated credentials, or private `.env` values.
4. **Preserve the no-build frontend contract.** The frontend uses browser-loaded React UMD + Babel Standalone. Do not introduce Vite/Next/Webpack unless the user explicitly asks for a build-system migration.
5. **Preserve Node ESM.** The backend uses `type: module`; use `import` / `export`, not CommonJS.
6. **Keep realtime behavior stable.** SSE event names and snapshot shapes should remain backward-compatible unless the README and UI are updated together.
7. **Do not break Claude Code hooks.** `server/install-hooks.js` and `hooks/post-event.sh` must stay fast, fire-and-forget, and safe.
8. **Persona id is not display name.** Code routes by id such as `nyx`, `lumen`, `kai`; UI displays names such as Nana, Luna, Kira.
9. **Fail soft in UI.** Missing provider, missing credentials, empty generated image directory, or inactive watcher should show useful states, not crash the page.
10. **Write docs like operators will use them at 2 AM.** Commands first, then explanation.

---

## 3. Project Map

| Area | Path | What lives here |
|---|---|---|
| Server bootstrap | `server/index.js` | Express app, route mounting, static files, watchers, access gate |
| Runtime state | `server/state.js` | sessions, tasks, events, runs, dispatches, levels, SSE broadcasts |
| Hooks API | `server/api/hooks.js` | receives Claude Code hook payloads |
| SSE stream | `server/api/stream.js` | live browser event stream |
| Agent history | `server/api/agents.js` | persona history endpoints |
| Notes | `server/api/notes.js`, `server/runner/notes.js` | note CRUD, chat messages, provider dispatch |
| Provider runner | `server/runner/providers.js` | echo / claude / codex / gpt command abstraction |
| Orchestra tasks | `server/api/task.js`, `server/agents/runner.js` | server-side multi-agent run loop |
| Persona prompts | `server/agents/personas.js` | system prompts and allowlists for SDK agents |
| Persona mapping | `server/mapping/personas.js` | 9 persona definitions and regex routing |
| Auth | `server/api/auth.js`, `server/auth/*` | credential store and OAuth flows |
| Security gate | `server/security/access-token.js` | optional browser access token login |
| Watchers | `server/watchers/*` | Claude session and transcript watching |
| Images | `server/api/images.js`, `server/agents/image.js` | generated image status/library/adapters |
| Hooks installer | `server/install-hooks.js` | writes/removes Claude Code hooks |
| Hook script | `hooks/post-event.sh` | sends hook event to local server |
| Frontend | `public/` | React JSX, CSS, images, generated assets |
| Claude subagents | `.claude/agents/*.md` | subagent definitions usable by Claude Code Task tool |

---

## 4. Execution Protocol

Use this exact workflow when changing the repo.

### 4.1 Recon

Before editing:

```bash
npm install
npm run dev
```

Open:

```text
http://127.0.0.1:7878
```

Check the target files and connected routes. For UI changes, inspect the matching API response. For API changes, inspect the UI caller.

### 4.2 Plan

Make a small plan that answers:

- What feature or bug is being touched?
- Which routes or UI files change?
- What existing behavior must remain compatible?
- What manual command proves it works?

### 4.3 Implement

Implementation rules:

- prefer small cohesive changes over wide rewrites
- keep route responses JSON-friendly and stable
- use explicit names over clever abbreviations
- keep browser JSX readable because there is no compile-time safety net
- keep `server/state.js` deterministic and careful with timers
- avoid adding dependencies unless they clearly remove complexity

### 4.4 Verify

Minimum verification:

```bash
npm test
npm run dev
```

Then hit the relevant endpoints. Useful smoke checks:

```bash
curl http://127.0.0.1:7878/api/state
curl http://127.0.0.1:7878/api/notes/providers
curl http://127.0.0.1:7878/api/auth/status
curl -X POST http://127.0.0.1:7878/hooks/event \
  -H 'X-COffice-Event: SessionStart' \
  -H 'Content-Type: application/json' \
  --data '{"session_id":"agent-smoke","pid":123}'
```

If touching images:

```bash
curl http://127.0.0.1:7878/api/images/status
curl http://127.0.0.1:7878/api/images/library
```

If touching projects or task board:

```bash
curl http://127.0.0.1:7878/api/projects
curl http://127.0.0.1:7878/api/task-board
```

### 4.5 Report

Every finished change should report:

- files changed
- what changed
- how it was verified
- risks or follow-up work

---

## 5. Workflow Commands

| Command | Use |
|---|---|
| `npm install` | install dependencies |
| `npm run dev` | run server with `node --watch server/index.js` |
| `npm start` | production-style server start |
| `npm test` | Node test runner |
| `npm run install-hooks` | add C-Office hook entries to `~/.claude/settings.json` |
| `npm run uninstall-hooks` | remove C-Office hook entries from Claude settings |
| `npm run tunnel` | run tunnel helper script |
| `npm run tunnel:cloudflare` | expose local app through Cloudflare tunnel |
| `npm run tunnel:localtunnel` | expose local app through localtunnel |

### Hook health check

```bash
grep -c 'c-office' ~/.claude/settings.json
lsof -iTCP:7878 -sTCP:LISTEN
curl -X POST http://127.0.0.1:7878/hooks/event \
  -H 'X-COffice-Event: SessionStart' \
  -H 'Content-Type: application/json' \
  --data '{"session_id":"test","pid":123}'
```

---

## 6. Persona System

C-Office compresses many real subagents into 9 visual personas.

| Persona | id | Function |
|---|---:|---|
| Orchestra | `orchestra` | conductor, planner, routing, multi-agent leadership |
| Aira | `astra` | education, mentoring, curriculum, knowledge systems |
| Luna | `lumen` | copy, docs, narrative, proposals, content |
| Vivi | `vex` | security, audit, compliance, QA, code review |
| Kira | `kai` | code, backend, frontend, data, AI engineering, fallback builder |
| Miku | `mira` | growth, marketing, sales, paid media, commerce |
| Emi | `echo` | UI, brand, video, image prompts, games, 3D, XR |
| Nana | `nyx` | research, analytics, trends, benchmarks, insights |
| Ori | `orbit` | DevOps, SRE, workflows, PM, support, operations |

### Persona routing rules

Routing lives in:

```text
server/mapping/personas.js
```

Rules are evaluated top-down with first match wins. Put more specific regexes above broad ones.

When adding a new subagent:

1. Add or adjust a route in `PERSONA_RULES`.
2. Test mapping:

```bash
node -e "import('./server/mapping/personas.js').then(m => console.log(m.mapPersona('your-agent-name', 'agent')))"
```

3. If the subagent should be callable by Claude Code, add a markdown definition in `.claude/agents/<name>.md`.

---

## 7. API Contract

Keep these API principles intact:

- `GET /api/state` is the canonical full snapshot.
- `GET /api/stream` is the realtime SSE feed.
- `POST /hooks/event` must stay lightweight because hooks should never slow the CLI.
- Notes CRUD is local-file backed and should tolerate missing/corrupt local files gracefully.
- Auth endpoints should never return raw secrets.
- Provider endpoints should expose availability and safe metadata, not tokens.
- Image endpoints should keep generated files under the configured output directory.

When adding an endpoint:

- document it in README
- return `{ ok: true, ... }` or `{ ok: false, error }` consistently where practical
- validate body shape without overengineering
- avoid leaking absolute private paths unless needed for local debugging

---

## 8. Frontend Rules

The frontend is intentionally lightweight.

Rules:

- no build step
- no TypeScript migration unless explicitly requested
- no heavy UI libraries without approval
- keep JSX browser-compatible through Babel Standalone
- preserve realtime SSE reconnect behavior
- every page should handle loading, empty, and error states
- avoid giant hidden side effects in render paths
- prefer small reusable functions/components over one huge screen blob

Visual direction:

- premium gacha/RPG dashboard
- high contrast but not noisy
- cards should show status clearly
- motion should communicate activity, not become decoration soup
- keep mobile readability in mind

---

## 9. Security & Credentials

C-Office may touch powerful provider credentials. Be paranoid in the useful way.

Do not commit:

- `.env`
- `credentials.json`
- OAuth tokens
- Claude credentials
- generated API keys
- user notes from `~/.c-office/`
- session transcripts from `~/.claude/projects/`

Credential store:

```text
~/.c-office/credentials.json
```

It is encrypted locally with AES-256-GCM. Code should treat it as sensitive even when encrypted.

External access:

- default `HOST=127.0.0.1` is local-only
- if binding to `0.0.0.0`, require `C_OFFICE_ACCESS_TOKEN`
- tunnel commands are convenient but should not expose private dashboards without an access token

---

## 10. Provider Rules

Provider dispatch supports multiple CLI styles.

Environment override pattern:

```bash
C_OFFICE_CLAUDE_CMD='claude -p ${PROMPT} --model sonnet'
C_OFFICE_CODEX_CMD='codex exec ${PROMPT}'
C_OFFICE_GPT_CMD='sgpt ${PROMPT}'
C_OFFICE_PROVIDER_TIMEOUT_MS=300000
```

Implementation expectations:

- escape prompt passing safely
- keep timeout behavior explicit
- emit status updates before and after provider execution
- surface provider unavailable errors cleanly in the UI
- do not assume every machine has every CLI installed

---

## 11. Storage Rules

C-Office uses small local files rather than a database.

Expected local paths:

| Path | Purpose |
|---|---|
| `~/.c-office/notes.json` | notes inbox and messages |
| `~/.c-office/credentials.json` | encrypted provider credentials |
| `~/.c-office/skills/` | learned skill summaries |
| `public/generated/` or `COFFICE_IMAGE_DIR` | generated images |

When editing storage code:

- create missing directories lazily
- use atomic-ish writes where practical
- tolerate empty files
- never crash the whole server on one bad local file

---

## 12. Testing & Smoke Matrix

There is currently a light test surface. Until a full suite exists, use manual smoke tests.

| Change area | Must check |
|---|---|
| Hooks | `POST /hooks/event`, dashboard activity feed |
| State | `GET /api/state`, SSE updates, persona status decay |
| Notes | create note, send message, provider list |
| Provider runner | echo provider at minimum, timeout behavior |
| Auth | `/api/auth/status`, connect/disconnect UI state |
| Images | status, library, generate/upload/delete paths |
| Personas | mapping test command and dashboard card output |
| UI | page loads without console-breaking syntax error |
| Access token | `/access`, protected routes, tunnel scenario |

---

## 13. Change Style

Prefer this:

```js
const status = getProviderStatus(provider);
if (!status.available) {
  return res.status(400).json({ ok: false, error: 'provider_unavailable', provider });
}
```

Avoid this:

```js
try { /* huge mystery block */ } catch(e) { res.end('bad') }
```

Keep code readable enough that the next agent can continue without archaeology gear.

---

## 14. Documentation Standard

Whenever behavior changes, update at least one of:

- `README.md` for user/operator-facing behavior
- `AGENTS.md` for repo workflow and agent rules
- inline comments for tricky routing, watcher, hook, auth, or SSE logic

README should answer:

1. What is this?
2. How do I run it?
3. How do I connect providers?
4. How do I debug it?
5. What files matter?

AGENTS should answer:

1. How should an agent work in this repo?
2. What must never be broken?
3. What commands prove the change?
4. Where does each responsibility live?

---

## 15. Definition of Done

A change is done only when:

- the app starts with `npm run dev`
- no obvious route or browser syntax break is introduced
- related API endpoints respond
- docs are updated if commands/routes/behavior changed
- no secrets or machine-local files are committed
- the final report states what changed and how it was checked

---

## 16. Default Agent Behavior

When a user gives a vague instruction like “upgrade”, “make it stronger”, “fix this”, or “โหดขึ้น”:

1. Preserve all existing working behavior.
2. Improve structure, clarity, safety, and operator usefulness.
3. Add missing documentation and guardrails.
4. Avoid speculative rewrites.
5. Make the smallest complete change that feels production-sharper.

C-Office should feel like a living command deck, not a pile of scripts wearing a cape. Build accordingly. 🛰️
