# C-Office

> ศูนย์สั่งงาน + แดชบอร์ดเรียลไทม์สำหรับทีมเอเจนต์ AI ทั้ง 9 ตัว — ดูได้ว่าใครกำลังทำงาน, สั่งงานผ่าน chat ในตัว, ใช้ CLI provider ไหนก็ได้ (Claude / Codex / GPT / Echo demo) และ progression แบบ JRPG (level up, boss fight / adventure overlay)

![status: personal-project](https://img.shields.io/badge/status-personal-purple)
![stack: node+react+sse](https://img.shields.io/badge/stack-node%20%7C%20react%20%7C%20sse-9d5cff)
![license: private](https://img.shields.io/badge/license-private-gold)

---

## ทำอะไรได้

**Live monitor**
- **The Office** — การ์ด 9 เอเจนต์ พร้อมสถานะเรียลไทม์ (busy / active / idle / offline)
- **Live Activity Feed** — event stream ของ tool calls ทุกตัว (Read, Edit, Bash, Agent, …)
- **Adventure Mode** — boss fight ที่ HP ลดลงตามจำนวน token ที่ทีมใช้
- **Adventurer's Guild** — หน้า dashboard ธีม guild hall (quests / live agents / loot)
- **Multi-project aware** — Hook ติดตั้งแบบ global → Claude Code เปิดที่โปรเจคไหนก็เห็น

**สั่งงานเอเจนต์ในตัว**
- **Notes inbox** (`/#/notes`) — จดไอเดีย เลือกเอเจนต์ คุยใน chat ปกติ ได้ประวัติเก็บใน `~/.c-office/notes.json`
- **Inline chat indicators** — เอเจนต์กำลัง **คิด / พิมพ์ / ใช้เครื่องมือ** มี dot animation + เฟืองหมุนพร้อม label เครื่องมือ (เช่น "กำลังรันคำสั่ง", "กำลังค้นเว็บ")
- **CLI provider abstraction** — เลือก provider ได้: `echo` (built-in demo, ไม่ต้องลงอะไร), `claude` (Claude Code CLI), `codex` (OpenAI Codex CLI), `gpt` (sgpt/gpt/chatgpt)
- **Send to Orchestra** — ปุ่มบน dashboard ยิง multi-agent run ผ่าน Anthropic Agent SDK; Orchestra จะ delegate ให้ Nana → Luna → Emi อัตโนมัติ
- **`.claude/agents/*.md`** — persona definition ใช้ผ่าน Task tool ใน Claude Code CLI ปกติได้เลย

**RPG progression**
- **Levels** — เอเจนต์ +1 level ทุก task ที่สำเร็จ
- **Learned skills** — Orchestrator บันทึก pattern จากรัน multi-step ไปที่ `~/.c-office/skills/`; ดูสรุปผ่าน `GET /api/skills`
- **Playbooks (SOP matrix)** — ดู skill mastery ของแต่ละเอเจนต์ในหน้า Playbooks

**Auth ที่ไม่ต้องตั้ง env var**
- **OAuth-first credential store** (`~/.c-office/credentials.json`) AES-256-GCM ที่เครื่อง
- **Settings → Connections** — connect Anthropic (อ่านจาก `~/.claude/.credentials.json` หลัง `claude login`), Google PKCE OAuth สำหรับ Gemini Imagen, paste token สำหรับ Replicate / OpenAI

## Stack

| Layer | Tech |
|---|---|
| Backend | Node 20+ ESM · Express · chokidar · SSE · `@anthropic-ai/claude-agent-sdk` · `@google/genai` |
| Frontend | React 18 (UMD) · Babel Standalone (in-browser JSX) · ไม่มี build step |
| Data sources | Hook payloads + JSONL transcripts ของ Claude Code |
| Storage | In-memory (rolling buffer 2000 events) + ไฟล์เล็กๆ ใน `~/.c-office/` |

---

## Quick Start

```bash
# 1. clone + install
git clone <this-repo>
cd c-office
npm install

# 2. รัน dev server (auto-restart เมื่อแก้โค้ด server)
npm run dev
# → http://127.0.0.1:7878

# 3. ติดตั้ง hooks เข้า ~/.claude/settings.json
npm run install-hooks

# 4. เปิด Claude Code ที่ไหนก็ได้ — แดชบอร์ดเห็นทันที
claude
```

### ใช้ Send to Orchestra (multi-agent run)

1. ไป **Settings → Connections** กด **Connect Anthropic** (ต้อง `claude login` มาก่อน)
2. กลับไป Dashboard → ใส่ goal ในกล่อง "Send to Orchestra" → กด **Send**
3. Orchestra จะ delegate ให้เอเจนต์ที่เกี่ยวข้องตามลำดับ; ดู progress ใน feed

### สั่งงานผ่าน Notes (inline chat)

1. ไป `/#/notes` → กด ➕ สร้าง note
2. เลือก persona + provider (echo / claude / codex / gpt)
3. พิมพ์ message → กด **ส่ง** → คำตอบโผล่ใน chat thread พร้อม indicator

---

## 9 Personas

| # | Persona | id (อย่าสับสน) | Role | Rarity |
|---|---|---|---|---|
| 1 | **Orchestra** | `orchestra` | Maestro · Lead Conductor | SSR |
| 2 | **Aira** | `astra` | Mentor · Knowledge Architect | SSR |
| 3 | **Luna** | `lumen` | Scribe · Content Lead | SSR |
| 4 | **Vivi** | `vex` | Sentinel · Audit & Security | SSR |
| 5 | **Kira** | `kai` | Builder · Code Forge | SR |
| 6 | **Miku** | `mira` | Growth · Multi-platform Strategist | SR |
| 7 | **Emi** | `echo` | Studio · Visual Craft | SR |
| 8 | **Nana** | `nyx` | Intel · Insights Analyst | R |
| 9 | **Ori** | `orbit` | Operations · DevOps Lead | R |

> ⚠️ **persona id ≠ display name** — ในโค้ดใช้ `id` (เช่น `nyx`, `lumen`) ในเอกสารใช้ `name` (เช่น Nana, Luna). routing rules อยู่ใน `server/mapping/personas.js`.

### Status ของการ์ด

| State | ความหมาย | Visual |
|---|---|---|
| `busy` | กำลังรัน Task/Agent หรือใช้ tool ภายใน 8 วิล่าสุด | กรอบทอง + scan line + dots + หายใจ |
| `active` | มี session สด | กรอบเขียวนุ่มๆ + shimmer ช้า |
| `idle` | ไม่มี session, ไม่ทำงาน | การ์ดเรียบๆ หรี่เล็กน้อย |
| `offline` | ไม่ถูกเรียกใช้ | grayscale |

---

## Architecture

```
┌──────────────────┐   POST /hooks/event   ┌─────────────────────────────┐
│ Claude Code CLI  │ ────────────────────► │                             │
│ (any session)    │                       │   Express :7878             │
└──────────────────┘                       │                             │
                                           │   • state.js (in-memory)    │
┌──────────────────┐  chokidar watches     │     - sessions / tasks      │
│ ~/.claude/       │ ────────────────────► │     - events RingBuffer     │
│  projects/**/    │                       │     - runs (orchestrator)   │
│  *.jsonl         │                       │     - notes inbox           │
└──────────────────┘                       │                             │
                                           │                             │
┌──────────────────┐  POST /api/task       │   • SSE bus  → /api/stream  │
│ Browser UI       │ ────────────────────► │   • OAuth creds store       │
│ (Send to Orch.)  │                       │     ~/.c-office/            │
└──────────────────┘                       │   • Provider runner         │
                                           │     (echo / claude / codex) │
                                           └──────────────┬──────────────┘
                                                          │ SSE
                                                          ▼
                                           ┌─────────────────────────────┐
                                           │   React Dashboard           │
                                           │   - Guild Hall (default)    │
                                           │   - Mission Control         │
                                           │   - Notes inbox + chat      │
                                           │   - Skills / Memory         │
                                           │   - Adventure (boss fight)  │
                                           └─────────────────────────────┘
```

### โครงไฟล์

| Path | หน้าที่ |
|---|---|
| `server/index.js` | Express + SSE bootstrap, รวม route ทุกตัว |
| `server/state.js` | In-memory state · event bus · busy decay · runs / dispatches |
| `server/api/hooks.js` | POST /hooks/event — รับ Claude Code hook payload |
| `server/api/stream.js` | SSE endpoint (`event`, `task`, `dispatch`, `run`, `auth.status`, …) |
| `server/api/notes.js` | Notes inbox CRUD + dispatch |
| `server/api/task.js` | `/api/task` — server-side multi-agent run (Send to Orchestra) |
| `server/api/auth.js` | OAuth + paste-token endpoints (`/auth/*`, `/api/auth/*`) |
| `server/agents/runner.js` | Orchestra orchestrator loop (Anthropic Agent SDK + delegate tool) |
| `server/agents/personas.js` | System prompts + tool allowlists ของแต่ละ persona |
| `server/agents/image.js` | Image-gen adapter (Gemini / Replicate / OpenAI) |
| `server/auth/credentials.js` | AES-256-GCM credential store (~/.c-office/) |
| `server/auth/{anthropic,google,oauth}.js` | OAuth flows ต่อ provider |
| `server/runner/notes.js` | Notes persistence (JSON file) |
| `server/runner/providers.js` | CLI provider abstraction (echo / claude / codex / gpt) |
| `server/runner/scene.js` | Scene script builder (legacy; ใช้ใน export ของ dispatch แต่ overlay ปิดแล้ว) |
| `server/watchers/sessions.js` | Watch session files |
| `server/watchers/transcripts.js` | Tail JSONL transcripts |
| `server/mapping/personas.js` | **9 personas + regex routing rules** |
| `server/mapping/pricing.js` | Token pricing per Claude model |
| `server/install-hooks.js` | แก้ `~/.claude/settings.json` ใส่ hook entries |
| `hooks/post-event.sh` | Fire-and-forget hook script (0.4s timeout) |
| `.claude/agents/*.md` | Subagent definitions ใช้ผ่าน Task tool ใน Claude Code |
| `public/` | Frontend — JSX transpile ในเบราว์เซอร์ผ่าน Babel Standalone |

### Busy State Decay

เอเจนต์เป็น `busy` เมื่อ:
1. มี Task/Agent tool spawn subagent (จาก `startTask`)
2. **หรือ** มี tool use ของ persona นั้นภายใน 8 วินาทีล่าสุด (`lastToolActivity`)
3. **หรือ** มี run ของ orchestrator ที่ delegate มาให้ persona นี้กำลังทำงาน
4. clear ทันทีเมื่อ `Stop` hook ยิง

Background tick (ทุก 2 วิ) re-broadcast สถานะเมื่อ busy หมดอายุ.

---

## API

### Read

| Endpoint | Method | Purpose |
|---|---|---|
| `/` | GET | Dashboard |
| `/api/state` | GET | Snapshot ทั้งระบบ (personas, sessions, events, tasks, runs, dispatches, stats, edges) |
| `/api/stream` | GET (SSE) | Live events: `event`, `session.start`, `session.end`, `task`, `dispatch`, `run`, `stats`, `persona.status`, `persona.levels`, `auth.status`, … |
| `/api/agents/:id/history?limit=N` | GET | ประวัติ event ของ persona |
| `/api/memory` | GET | Memory graph (cached 30s) |
| `/api/notes` | GET | Notes inbox |
| `/api/notes/:id` | GET | Note detail (พร้อม messages) |
| `/api/notes/providers` | GET | Provider catalog (echo/claude/codex/gpt) + default + available |
| `/api/auth/status` | GET | สถานะ connection ทุก provider |
| `/api/settings` | GET | Safe view ของ ~/.claude/settings.json |
| `/api/skills` | GET | Learned skill summaries (`~/.c-office/skills`) |
| `/api/tasks` | GET | Recent orchestrator runs |
| `/api/task/:run_id` | GET | Run detail |

### Write

| Endpoint | Method | Body |
|---|---|---|
| `/hooks/event` | POST | hook payload (called by `post-event.sh`) |
| `/api/state/reset` | POST | clear events / dispatches / runs / dedupe |
| `/api/levels/reset` | POST | reset persona levels เป็น 1 |
| `/api/notes` | POST | `{ title, body, tag, agentId }` |
| `/api/notes/:id` | PATCH | partial update |
| `/api/notes/:id` | DELETE | |
| `/api/notes/:id/message` | POST | `{ content, role }` append |
| `/api/notes/:id/dispatch` | POST | `{ provider, agentId, message }` รัน CLI provider |
| `/api/task` | POST | `{ goal }` — Send to Orchestra (Anthropic Agent SDK) |
| `/api/auth/token` | POST | `{ provider, token, clientId? }` paste credentials |
| `/api/auth/disconnect` | POST | `{ provider }` |
| `/auth/anthropic/connect` | GET | mirror `~/.claude/.credentials.json` เข้า store |
| `/auth/google/start` | GET | PKCE OAuth flow |
| `/auth/google/callback` | GET | OAuth callback |

---

## Customization

### เปลี่ยน persona mapping

แก้ `server/mapping/personas.js` — `PERSONA_RULES` ประเมินตามลำดับ first-match-wins:

```js
const PERSONA_RULES = [
  { match: /(my-special-agent)/i, persona: 'kai' },  // ใส่ rule ใหม่ขึ้นบน
  // ...กติกาเดิม
];
```

`mapPersona()` normalize input (lowercase + spaces → hyphens) ก่อน — รูลเดียวจัดการทั้ง display name ("UI Designer") และ slug ("ui-designer") ได้.

### เปลี่ยนภาพ persona

วาง PNG ลง `public/images/` แล้วแก้ field `image` ของ persona นั้นใน `personas.js`.

### ปรับ busy-window

```js
// server/state.js
const BUSY_WINDOW_MS = 8000;
```

### CLI provider override

```bash
# argv template, ${PROMPT} จะถูกแทนที่
C_OFFICE_CLAUDE_CMD='claude -p ${PROMPT} --model sonnet'
C_OFFICE_CODEX_CMD='codex exec ${PROMPT}'
C_OFFICE_GPT_CMD='sgpt ${PROMPT}'

# timeout (default 180s)
C_OFFICE_PROVIDER_TIMEOUT_MS=300000              # ทุก provider
C_OFFICE_CLAUDE_TIMEOUT_MS=120000                # เฉพาะ claude
```

### เพิ่มเอเจนต์ที่ใช้ใน Claude Code CLI

วางไฟล์ markdown ใน `.claude/agents/<name>.md` พร้อม frontmatter:

```markdown
---
name: my-agent
description: ใช้สำหรับ ...
tools: Read, Write, Bash
model: sonnet
---
You are ... (system prompt)
```

แล้วเรียกผ่าน Task tool ใน session: `Task({ subagent_type: "my-agent", prompt: "..." })` — c-office จะเห็น activity ผ่าน hook events อัตโนมัติ.

---

## Environment variables

| Name | Default | Purpose |
|---|---|---|
| `PORT` | `7878` | Server port (ถ้าเปลี่ยน ต้องแก้ URL ใน `hooks/post-event.sh` ด้วย) |
| `HOST` | `127.0.0.1` | Bind address |
| `C_OFFICE_REPLAY` | `0` | `=1` เพื่อ replay JSONL ทั้งหมดตอน boot |
| `C_OFFICE_NOTES_PATH` | `~/.c-office/notes.json` | ไฟล์เก็บ notes inbox |
| `C_OFFICE_CRED_DIR` | `~/.c-office` | โฟลเดอร์ credential store |
| `C_OFFICE_PROVIDER_TIMEOUT_MS` | `180000` | CLI provider timeout (ทุก provider) |
| `C_OFFICE_CLAUDE_TIMEOUT_MS` / `_CODEX_` / `_GPT_` | inherit | ต่อ provider |
| `C_OFFICE_CLAUDE_CMD` / `_CODEX_` / `_GPT_` | `claude -p ${PROMPT}` | argv template |
| `IMAGE_PROVIDER` | `gemini` | image gen provider (`gemini` / `replicate` / `openai`) |
| `COFFICE_IMAGE_DIR` | `public/generated` | output dir สำหรับ generated images |

> 💡 **ไม่ต้องตั้ง `ANTHROPIC_API_KEY` / `REPLICATE_API_TOKEN`** — credentials เก็บที่ `~/.c-office/credentials.json` (encrypted) ผ่าน Settings → Connections ใน UI.

---

## Troubleshooting

### Dashboard ไม่เห็น activity

```bash
# ยืนยัน hooks ติดตั้งครบ
grep -c 'c-office' ~/.claude/settings.json   # ควรได้ ≥ 5

# ยืนยัน server รันอยู่
lsof -iTCP:7878 -sTCP:LISTEN

# ทดสอบ hook endpoint
curl -X POST http://127.0.0.1:7878/hooks/event \
  -H 'X-COffice-Event: SessionStart' \
  -H 'Content-Type: application/json' \
  --data '{"session_id":"test","pid":123}'
# → {"ok":true}
```

### Persona idle ทั้งที่กำลังทำงาน

routing miss — ทดสอบ:

```bash
node -e "import('./server/mapping/personas.js').then(m => console.log(m.mapPersona('Your Subagent Name', 'agent')))"
```

ถ้าผิด → เพิ่ม regex ใน `PERSONA_RULES` (ใส่ rule ใหม่ก่อน).

### Provider timeout

CLI ใช้เวลานานกว่า default 180s → set `C_OFFICE_PROVIDER_TIMEOUT_MS=300000` (5 นาที).

### Send to Orchestra ใช้ไม่ได้

ต้อง connect Anthropic ก่อน → Settings → Connections → Connect Anthropic (ต้อง `claude login` มาก่อน).

### Port 7878 ชน

แก้ `server/index.js` (`PORT`) + `hooks/post-event.sh` (URL).

---

## Dev Scripts

```bash
npm run dev              # node --watch (auto-restart on server changes)
npm start                # production start
npm run install-hooks    # write hook entries → ~/.claude/settings.json
npm run uninstall-hooks  # remove c-office hook entries
```

Frontend (`public/*.jsx`) ไม่ต้อง restart — browser โหลดผ่าน Babel Standalone.

ไม่มี test suite หรือ linter — ทดสอบการเปลี่ยนแปลงโดยรัน `npm run dev` แล้วยิง endpoint หรือคลิกใน UI.

---

## License

Private / personal use. Not for redistribution.

---

## Credits

- Concept & persona art: custom illustrations
- Framework: Claude Code CLI by Anthropic
- UI inspiration: mobile gacha RPG collection screens · adventurer's guild boards
