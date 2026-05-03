# C-Office

> **AI Agent Command Center** — ศูนย์สั่งงาน + live dashboard สำหรับทีมเอเจนต์ AI ทั้ง 9 ตัว ดูว่าใครกำลังทำงาน, ยิงงานผ่าน chat, อ่าน activity จาก Claude Code hooks, สลับ CLI provider ได้ และเล่า progression แบบ JRPG command room.

![status: personal-project](https://img.shields.io/badge/status-personal-purple)
![stack: node+react+sse](https://img.shields.io/badge/stack-node%20%7C%20react%20%7C%20sse-9d5cff)
![runtime: local-first](https://img.shields.io/badge/runtime-local--first-22c55e)
![license: MIT](https://img.shields.io/badge/license-MIT-22c55e)

---

## 0. TL;DR

```bash
git clone https://github.com/reyatelehealth2026-crypto/c-office.git
cd c-office
npm install
npm run dev
```

Open:

```text
http://127.0.0.1:7878
```

Install Claude Code hooks:

```bash
npm run install-hooks
```

Smoke test:

```bash
curl http://127.0.0.1:7878/api/state
curl -X POST http://127.0.0.1:7878/hooks/event \
  -H 'X-COffice-Event: SessionStart' \
  -H 'Content-Type: application/json' \
  --data '{"session_id":"smoke","pid":123}'
```

---

## 1. What This Is

C-Office คือ command deck สำหรับคนที่ใช้หลายเอเจนต์ทำงานจริง ไม่ใช่แค่หน้า dashboard สวย ๆ

มันทำ 4 อย่างหลัก:

1. **Observe** — อ่าน Claude Code session, transcript, hook payload, tool call และ status แบบ realtime
2. **Route** — map subagent จำนวนมากให้กลายเป็น 9 persona ที่อ่านง่ายใน dashboard
3. **Command** — สั่งงานผ่าน Notes, provider CLI, หรือ Send to Orchestra
4. **Remember** — เก็บ notes, skill summaries, credentials และ runtime state แบบ local-first

อารมณ์ของระบบคือ **AI ops room + gacha RPG overlay + local command console**: เห็นภาพ, สั่งได้, debug ได้, และไม่ต้องตั้ง infrastructure ใหญ่โต.

---

## 2. Core Features

### Live Monitor

- **The Office** — การ์ด 9 เอเจนต์ พร้อมสถานะ `busy / active / idle / offline`
- **Live Activity Feed** — event stream ของ tool calls เช่น Read, Edit, Bash, Agent
- **Adventure Mode** — boss fight ที่ HP ลดลงตาม token/team activity
- **Adventurer's Guild** — dashboard ธีม guild hall สำหรับ quests / agents / loot
- **Multi-project aware** — ติดตั้ง hook แบบ global แล้ว Claude Code เปิด project ไหนก็เห็น activity

### Agent Command

- **Notes inbox** (`/#/notes`) — จดไอเดีย เลือกเอเจนต์ คุยใน chat ได้
- **Inline chat indicators** — เห็นสถานะคิด / พิมพ์ / ใช้เครื่องมือ
- **Provider picker** — เลือก Claude / Codex / Gemini ก่อนยิงงาน (persist ใน localStorage)
- **CLI provider abstraction** — รองรับ `echo`, `claude`, `codex`, `gpt`
- **Send to Orchestra** — ยิง goal ให้ Orchestra delegate ต่อให้เอเจนต์อื่น
- **Claude subagent files** — ใช้ `.claude/agents/*.md` ผ่าน Claude Code Task tool ได้

### Real-AI Skill Catalog

Per-agent installable AI capabilities — system-prompt fragments + tool hints
that an admin curates and assigns to specific agents. **Not** game-style perks:
the runner appends installed skill prompts to the agent system prompt at
delegate time, so the agent actually behaves differently.

- 9 default skills seeded on first launch (Brand Voice, Web Research SOP,
  Code Review Checklist, Bilingual TH/EN, Compliance FDA/PDPA, Image Brief,
  Sales Copy, Data Analysis SOP, TDD)
- Storage: `~/.c-office/agent-skills/<id>.md` (markdown + frontmatter)
- API: `GET /api/agent-skills`, `POST /api/agent-skills` (custom create),
  `POST /api/agents/:agentId/skills { skillId }` (install on agent),
  `DELETE /api/agents/:agentId/skills/:skillId`
- UI: Agents page → editor panel → "AI Skills" section with install/uninstall

### Granular Run Control

Stop and resume an Orchestra run without losing the work that's already done.
All step results are persisted under `~/.c-office/runs/<run_id>.json` and
survive server restarts.

- **Pause** — soft cancel; runner finishes the current step and stops; status
  becomes `paused`. Endpoint: `POST /api/task/:run_id/pause`
- **Resume** — re-enters the pipeline using `existingRunId`; completed steps
  stay. Endpoint: `POST /api/task/:run_id/resume`
- **Retry from step** — drops steps from N forward and replays. Endpoint:
  `POST /api/task/:run_id/retry-step { stepIdx }`
- **Cancel** — hard terminate but keep all completed step outputs in
  `run.steps[]`
- **Per-step Copy** — copy any step's output to clipboard from the dashboard
  Active Mission panel without waiting for the run to finish

### RPG Progression

- **Levels** — เอเจนต์ level up เมื่อ task สำเร็จ
- **Learned skills** — auto-persist past Orchestra runs as Hermes-style
  playbooks under `~/.c-office/skills/` (separate from the curated catalog
  above)
- **Playbooks** — matrix skill mastery ของแต่ละ persona

### Design System

Public design tokens, UI kit, and persona portraits live in `C-Office Design
System/`. The runtime override layer (`public/ux-readable.css`) brings the
spec into the production app — bright navy surfaces, solid 2px borders,
JRPG agent cards with status ring + busy pulse + scan line, six-color accent
palette with per-route nav tinting.

Preview the spec:

```bash
# Open any of these directly in a browser
ls "C-Office Design System/preview/"
# brand-personas.html · comp-agent-cards.html · comp-buttons.html
# comp-nav.html · comp-panels.html · comp-rarity.html
# spacing-radii.html · spacing-shadows.html · type-fonts.html · type-scale.html
# colors-{primary,neutrals,backgrounds,semantic}.html
```

### Auth & Credentials

- **OAuth-first credential store** — เก็บใน `~/.c-office/credentials.json` แบบ encrypted local file
- **Settings → Connections** — connect Anthropic, Google, Replicate, OpenAI
- **No env-var sprawl** — ไม่จำเป็นต้องโยน token ลง shell ทุกครั้ง
- **Provider setup guides:**
  - [Codex CLI](docs/CODEX_SETUP.md) — ChatGPT login + token refresh + image gen

---

## 3. UX/UI Upgrade Plan

A full UX/UI redesign spec lives here:

```text
docs/UX_UI_MASTER_SPEC.md
```

It covers:

- product vision
- information architecture
- app shell
- visual direction
- design tokens
- component system
- page-by-page specs
- realtime UX rules
- accessibility
- responsive behavior
- phased implementation checklist

Use it before redesigning dashboard, notes, mission control, tasks, images, projects, or settings.

---

## 4. Stack

| Layer | Tech |
|---|---|
| Backend | Node 20+ ESM, Express, chokidar, SSE |
| Agent SDK | `@anthropic-ai/claude-agent-sdk` |
| Image SDK | `@google/genai` plus adapter layer |
| Frontend | React 18 UMD, Babel Standalone, browser JSX |
| Data sources | Claude Code hook payloads + JSONL transcripts |
| Storage | In-memory rolling buffers + local JSON files under `~/.c-office/` |
| Runtime style | local-first, no database, no build step |

---

## 5. Quick Start

### 5.1 Install

```bash
git clone https://github.com/reyatelehealth2026-crypto/c-office.git
cd c-office
npm install
```

### 5.2 Run Dev Server

```bash
npm run dev
```

Default URL:

```text
http://127.0.0.1:7878
```

### 5.3 Install Claude Code Hooks

```bash
npm run install-hooks
```

This writes C-Office hook entries into:

```text
~/.claude/settings.json
```

Now open Claude Code anywhere:

```bash
claude
```

C-Office should start seeing sessions and events.

### 5.4 Uninstall Hooks

```bash
npm run uninstall-hooks
```

---

## 6. Workflow Commands

| Command | Purpose |
|---|---|
| `npm run dev` | Start server with auto-restart using `node --watch` |
| `npm start` | Start production-style server |
| `npm test` | Run Node test runner |
| `npm run install-hooks` | Install Claude Code hook entries |
| `npm run uninstall-hooks` | Remove Claude Code hook entries |
| `npm run tunnel` | Run tunnel helper script |
| `npm run tunnel:cloudflare` | Expose local app through Cloudflare tunnel |
| `npm run tunnel:localtunnel` | Expose local app through localtunnel |

### Hook Health Check

```bash
grep -c 'c-office' ~/.claude/settings.json
lsof -iTCP:7878 -sTCP:LISTEN
curl -X POST http://127.0.0.1:7878/hooks/event \
  -H 'X-COffice-Event: SessionStart' \
  -H 'Content-Type: application/json' \
  --data '{"session_id":"hook-test","pid":123}'
```

Expected response:

```json
{"ok":true}
```

---

## 7. Use Send to Orchestra

1. Run the server:

```bash
npm run dev
```

2. Open dashboard:

```text
http://127.0.0.1:7878
```

3. Go to **Settings → Connections**
4. Click **Connect Anthropic**
5. Make sure `claude login` has already been completed on the machine
6. Return to dashboard
7. Type a goal into **Send to Orchestra**
8. Watch Orchestra delegate the mission

Orchestra can route work through persona logic and report progress into the feed.

---

## 8. Use Notes Chat

1. Go to:

```text
/#/notes
```

2. Create a note
3. Pick an agent persona
4. Pick provider: `echo`, `claude`, `codex`, or `gpt`
5. Send a message
6. Watch reply + indicators in the thread

Notes are stored locally at:

```text
~/.c-office/notes.json
```

---

## 9. The 9 Personas

| # | Persona | id | Role | Best at |
|---|---|---:|---|---|
| 1 | Orchestra | `orchestra` | Maestro · Lead Conductor | planning, routing, delegation |
| 2 | Aira | `astra` | Mentor · Knowledge Architect | learning, docs structure, curriculum |
| 3 | Luna | `lumen` | Scribe · Content Lead | copy, docs, narrative, proposals |
| 4 | Vivi | `vex` | Sentinel · Audit & Security | security, compliance, review, QA |
| 5 | Kira | `kai` | Builder · Code Forge | full-stack code, backend, data, AI engineering |
| 6 | Miku | `mira` | Growth · Multi-platform Strategist | marketing, sales, paid media, commerce |
| 7 | Emi | `echo` | Studio · Visual Craft | UI, image prompts, design, video, 3D, games |
| 8 | Nana | `nyx` | Intel · Insights Analyst | research, analytics, trends, benchmarks |
| 9 | Ori | `orbit` | Operations · DevOps Lead | DevOps, SRE, PM, workflows, support |

Important:

```text
persona id ≠ display name
```

Examples:

- Nana is `nyx`
- Luna is `lumen`
- Kira is `kai`

Routing rules live in:

```text
server/mapping/personas.js
```

Test routing:

```bash
node -e "import('./server/mapping/personas.js').then(m => console.log(m.mapPersona('security-auditor', 'agent')))"
```

---

## 10. Status Model

| State | Meaning | Visual idea |
|---|---|---|
| `busy` | Persona is using tools, running a task, or receiving a delegated run | gold border, scan line, dots, breathing animation |
| `active` | Session is alive but not currently busy | soft green frame, slow shimmer |
| `idle` | No active work but known to the system | dim clean card |
| `offline` | Not seen / not called | grayscale |

A persona becomes `busy` when:

1. Task/Agent tool spawns a subagent
2. A recent tool use belongs to that persona
3. Orchestra delegates a running task to that persona
4. Stop hook has not cleared activity yet

Busy decay is handled by a background tick.

---

## 11. Architecture

```text
┌──────────────────┐   POST /hooks/event   ┌─────────────────────────────┐
│ Claude Code CLI  │ ────────────────────► │ Express :7878               │
│ any session      │                       │                             │
└──────────────────┘                       │ state.js                    │
                                           │ - sessions                  │
┌──────────────────┐  chokidar watches     │ - tasks                     │
│ ~/.claude/       │ ────────────────────► │ - events ring buffer        │
│ projects/**/*.jsonl                      │ - runs / dispatches         │
└──────────────────┘                       │ - notes                     │
                                           │                             │
┌──────────────────┐  POST /api/task       │ SSE bus → /api/stream       │
│ Browser UI       │ ────────────────────► │ Provider runner             │
│ dashboard/notes  │                       │ Auth credential store       │
└──────────────────┘                       └──────────────┬──────────────┘
                                                          │ SSE
                                                          ▼
                                           ┌─────────────────────────────┐
                                           │ React Dashboard             │
                                           │ - Guild Hall                │
                                           │ - Mission Control           │
                                           │ - Notes chat                │
                                           │ - Skills / Memory           │
                                           │ - Images                    │
                                           │ - Projects / Task board     │
                                           └─────────────────────────────┘
```

---

## 12. File Map

| Path | Purpose |
|---|---|
| `server/index.js` | Express bootstrap, access gate, routes, static frontend, watchers |
| `server/state.js` | Runtime state, event bus, busy decay, runs, dispatches, levels |
| `server/api/hooks.js` | `POST /hooks/event` receiver |
| `server/api/stream.js` | SSE endpoint |
| `server/api/notes.js` | Notes inbox CRUD + dispatch endpoint |
| `server/api/task.js` | Send to Orchestra API |
| `server/api/auth.js` | Auth, token, OAuth endpoints |
| `server/api/images.js` | Image generation/upload/library endpoints |
| `server/api/projects.js` | Project management endpoints |
| `server/api/task-board.js` | Task board endpoints |
| `server/agents/runner.js` | Orchestra multi-agent loop |
| `server/agents/personas.js` | Agent SDK system prompts and tool allowlists |
| `server/agents/image.js` | Image provider adapter |
| `server/auth/credentials.js` | AES-256-GCM local credential store |
| `server/security/access-token.js` | Optional access-token gate |
| `server/watchers/sessions.js` | Watches Claude Code session files |
| `server/watchers/transcripts.js` | Tails Claude Code JSONL transcripts |
| `server/mapping/personas.js` | 9 persona definitions and routing regexes |
| `server/install-hooks.js` | Installs/uninstalls hook entries |
| `hooks/post-event.sh` | Fire-and-forget hook sender |
| `.claude/agents/*.md` | Claude Code subagent definitions |
| `public/` | React frontend loaded directly by browser |
| `AGENTS.md` | Operating manual for AI agents and developers |
| `docs/UX_UI_MASTER_SPEC.md` | full UX/UI redesign plan and implementation checklist |

---

## 13. API Reference

### Read Endpoints

| Endpoint | Method | Purpose |
|---|---|---|
| `/` | GET | Dashboard |
| `/api/state` | GET | Full system snapshot |
| `/api/stream` | GET | SSE live event stream |
| `/api/agents/:id/history?limit=N` | GET | Persona event history |
| `/api/memory` | GET | Memory graph |
| `/api/notes` | GET | Notes inbox |
| `/api/notes/:id` | GET | Note detail |
| `/api/notes/providers` | GET | Provider catalog |
| `/api/providers` | GET | Provider catalog alias |
| `/api/auth/status` | GET | Provider connection status |
| `/api/settings` | GET | Safe Claude settings view |
| `/api/skills` | GET | Learned skill summaries (auto-persisted from past runs) |
| `/api/agent-skills` | GET | Catalog of installable AI capabilities |
| `/api/agent-skills/:id` | GET | Single skill record |
| `/api/tasks` | GET | Recent Orchestra runs |
| `/api/task/:run_id` | GET | Run detail |
| `/api/task/:run_id/trace` | GET | Run trace as markdown |
| `/api/images/status` | GET | Image provider status |
| `/api/images/library` | GET | Generated image library |
| `/api/projects` | GET | Projects list |
| `/api/task-board` | GET | Task board state |
| `/api/persona-tuning` | GET | Pending persona auto-tune suggestions |
| `/api/user-profile` | GET | User profile |

### Write Endpoints

| Endpoint | Method | Body |
|---|---|---|
| `/hooks/event` | POST | Claude Code hook payload |
| `/api/state/reset` | POST | clear events / dispatches / runs / dedupe |
| `/api/levels/reset` | POST | reset persona levels |
| `/api/notes` | POST | `{ title, body, tag, agentId }` |
| `/api/notes/:id` | PATCH | partial note update |
| `/api/notes/:id` | DELETE | delete note |
| `/api/notes/:id/message` | POST | `{ content, role }` |
| `/api/notes/:id/dispatch` | POST | `{ provider, agentId, message }` |
| `/api/task` | POST | `{ goal, provider?, projectId? }` |
| `/api/task/:run_id/cancel` | POST | `{ reason? }` — hard terminate; preserves completed steps |
| `/api/task/:run_id/pause` | POST | _none_ — soft cancel (resumable) |
| `/api/task/:run_id/resume` | POST | _none_ — re-enter pipeline using existingRunId |
| `/api/task/:run_id/retry-step` | POST | `{ stepIdx }` — drop steps from N forward and replay |
| `/api/task/:run_id/comment` | POST | `{ text, stepIdx? }` — mid-run user note |
| `/api/agent-skills` | POST | `{ name, summary, category, tools, body }` (custom) |
| `/api/agent-skills/:id` | PATCH | partial skill update (builtin protected) |
| `/api/agent-skills/:id` | DELETE | remove a custom skill |
| `/api/agents/:agentId/skills` | POST | `{ skillId }` — install skill on agent |
| `/api/agents/:agentId/skills/:skillId` | DELETE | uninstall skill from agent |
| `/api/auth/token` | POST | `{ provider, token, clientId? }` |
| `/api/auth/disconnect` | POST | `{ provider }` |
| `/auth/anthropic/connect` | GET | mirror Claude credentials into local store |
| `/auth/google/start` | GET | start Google PKCE OAuth |
| `/auth/google/callback` | GET | Google OAuth callback |
| `/api/images/generate` | POST | generate image through selected provider |
| `/api/images/upload` | POST | upload image asset |
| `/api/images/library/:name` | DELETE | delete generated image |
| `/api/user-profile` | PUT | update user profile |

---

## 14. Environment Variables

| Name | Default | Purpose |
|---|---|---|
| `PORT` | `7878` | Server port |
| `HOST` | `127.0.0.1` | Bind address |
| `C_OFFICE_ACCESS_TOKEN` | unset | Enables browser access gate when set |
| `C_OFFICE_REPLAY` | `0` | Replay JSONL transcripts at boot when `1` |
| `C_OFFICE_NOTES_PATH` | `~/.c-office/notes.json` | Notes storage path |
| `C_OFFICE_CRED_DIR` | `~/.c-office` | Credential store directory |
| `C_OFFICE_PROVIDER_TIMEOUT_MS` | `180000` | Default provider timeout |
| `C_OFFICE_CLAUDE_TIMEOUT_MS` | inherit | Claude provider timeout |
| `C_OFFICE_CODEX_TIMEOUT_MS` | inherit | Codex provider timeout |
| `C_OFFICE_GPT_TIMEOUT_MS` | inherit | GPT provider timeout |
| `C_OFFICE_CLAUDE_CMD` | `claude -p ${PROMPT}` | Claude command template |
| `C_OFFICE_CODEX_CMD` | `codex exec ${PROMPT}` | Codex command template |
| `C_OFFICE_GPT_CMD` | `sgpt ${PROMPT}` | GPT command template |
| `IMAGE_PROVIDER` | `gemini` | Image provider: `gemini`, `replicate`, `openai` |
| `COFFICE_IMAGE_DIR` | `public/generated` | Generated image output dir |
| `COFFICE_AGENT_SKILLS_DIR` | `~/.c-office/agent-skills` | Per-agent installable skill catalog directory |
| `COFFICE_SKILLS_DIR` | `~/.c-office/skills` | Auto-learned playbooks (Hermes-style) directory |
| `COFFICE_MAX_USD_PER_RUN` | `5.0` | Per-run cost ceiling (USD) before runner aborts |

Example provider override:

```bash
C_OFFICE_CLAUDE_CMD='claude -p ${PROMPT} --model sonnet'
C_OFFICE_PROVIDER_TIMEOUT_MS=300000
npm run dev
```

---

## 15. Security Notes

C-Office is local-first by default. Keep it that way unless you know what you are exposing.

### Local default

```bash
HOST=127.0.0.1 npm run dev
```

### External/tunnel use

If you bind externally or use a tunnel, set an access token:

```bash
C_OFFICE_ACCESS_TOKEN='change-this-long-random-token' \
HOST=0.0.0.0 \
npm run dev
```

Then open:

```text
/access
```

Do not expose the dashboard publicly without a token.

### Never commit

- `.env`
- `~/.c-office/credentials.json`
- OAuth tokens
- API keys
- Claude credentials
- local notes
- transcript dumps
- generated private images

---

## 16. Customization

### Change Persona Mapping

Edit:

```text
server/mapping/personas.js
```

Add specific rules above broad rules:

```js
const PERSONA_RULES = [
  { match: /(my-special-agent)/i, persona: 'kai' },
  // existing rules...
];
```

### Change Persona Images

1. Put image in:

```text
public/images/
```

2. Edit persona `image` field in:

```text
server/mapping/personas.js
```

### Adjust Busy Window

Edit:

```text
server/state.js
```

Look for:

```js
const BUSY_WINDOW_MS = 8000;
```

### Add Claude Code Subagent

Create:

```text
.claude/agents/<name>.md
```

Example:

```markdown
---
name: my-agent
description: Use for ...
tools: Read, Write, Bash
model: sonnet
---
You are ...
```

Call through Claude Code Task tool:

```text
Task({ subagent_type: "my-agent", prompt: "..." })
```

---

## 17. Troubleshooting

### Dashboard does not see activity

```bash
grep -c 'c-office' ~/.claude/settings.json
lsof -iTCP:7878 -sTCP:LISTEN
curl -X POST http://127.0.0.1:7878/hooks/event \
  -H 'X-COffice-Event: SessionStart' \
  -H 'Content-Type: application/json' \
  --data '{"session_id":"test","pid":123}'
```

### Persona idle even though work is running

Likely routing miss.

```bash
node -e "import('./server/mapping/personas.js').then(m => console.log(m.mapPersona('Your Subagent Name', 'agent')))"
```

If wrong, add a regex in `PERSONA_RULES`.

### Provider timeout

```bash
C_OFFICE_PROVIDER_TIMEOUT_MS=300000 npm run dev
```

Or provider-specific:

```bash
C_OFFICE_CLAUDE_TIMEOUT_MS=120000 npm run dev
```

### Send to Orchestra does not work

Check:

1. `claude login` completed
2. Settings → Connections → Connect Anthropic
3. `/api/auth/status` returns connected status

```bash
curl http://127.0.0.1:7878/api/auth/status
```

### Port 7878 already in use

```bash
lsof -iTCP:7878 -sTCP:LISTEN
```

Use another port:

```bash
PORT=8787 npm run dev
```

If hooks still point at 7878, update hook URL or reinstall hooks after changing configuration.

### Frontend changed but not updating

Frontend files in `public/*.jsx` do not require server restart. Refresh browser. JSX files are served with `no-store` cache headers.

---

## 18. Development Protocol

Before changing code, read:

```text
AGENTS.md
```

For UX/UI work, also read:

```text
docs/UX_UI_MASTER_SPEC.md
```

Minimum dev loop:

```bash
npm install
npm run dev
npm test
```

Useful checks:

```bash
curl http://127.0.0.1:7878/api/state
curl http://127.0.0.1:7878/api/notes/providers
curl http://127.0.0.1:7878/api/images/status
curl http://127.0.0.1:7878/api/projects
```

When changing behavior, update docs in the same pass.

---

## 19. Design Direction

C-Office should feel like:

- premium RPG command room
- AI ops cockpit
- readable realtime monitor
- local hacker console
- playful but operational

Avoid:

- random neon soup
- unreadable dashboards
- fragile hidden state
- secret-leaking debug output
- dependency bloat
- breaking the no-build frontend contract

---

## 20. License

[MIT](LICENSE) © 2026 C-Office contributors.

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, conventions, and PR checklist.

---

## 21. Credits

- Concept & persona art: custom illustrations
- Framework inspiration: Claude Code CLI workflows
- UI inspiration: mobile gacha RPG collection screens, adventurer guild boards, realtime ops rooms
