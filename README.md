# C-Office

> แดชบอร์ดเรียลไทม์สไตล์ "ออฟฟิศเกมกาชา" สำหรับมอนิเตอร์ Claude Code CLI ทุกเซสชันของคุณ — เห็นได้ว่าเอเจนต์ไหนกำลังทำงาน ทำอะไรอยู่ ใช้ไปกี่ token แล้ว พร้อมเอฟเฟกต์แอนิเมชันเมื่อเอเจนต์กำลังลงมือทำงาน

![status: personal-project](https://img.shields.io/badge/status-personal-purple)
![stack: node+react+sse](https://img.shields.io/badge/stack-node%20%7C%20react%20%7C%20sse-9d5cff)
![license: private](https://img.shields.io/badge/license-private-gold)

---

## ทำอะไรได้

- **The Office** — แสดงการ์ดของ 9 เอเจนต์ทั้งหมด คลิกเพื่อดูรายละเอียด
- **Live Animation** — การ์ดของเอเจนต์ที่กำลังทำงาน (busy) จะเรืองทอง + มี scan line ไหล + typing dots
- **Live Activity Feed** — event stream แบบ real-time ของ tool calls ทุกตัว (Read, Edit, Bash, Agent, ...)
- **Agent Roster** — หน้าแสดงโปรไฟล์เอเจนต์ครบถ้วน พร้อม radar chart บุคลิกภาพ + skill levels
- **Multi-project aware** — Hook ติดตั้งแบบ global → Claude Code เปิดที่โปรเจคไหนก็ tracking ได้
- **Smart persona mapping** — auto-map subagent_type (เช่น "UI Designer") → persona (Emi) ตาม regex rules

## Stack

| Layer | Tech |
|---|---|
| Backend | Node 20+ · Express · chokidar (file watcher) · SSE |
| Frontend | React 18 (UMD) · Babel Standalone (in-browser JSX) |
| Data source | Hook payloads ที่ POST มาจาก Claude Code + JSONL transcripts |
| Storage | In-memory (rolling buffer 2000 events) + no DB |

ไม่มี build step — เปิด server ปุ๊บใช้ได้ปั๊บ

---

## Quick Start

```bash
# 1. clone + install
git clone <this-repo>
cd c-office
npm install

# 2. รัน dev server (node --watch จะ restart เมื่อแก้ server code)
npm run dev
# → http://127.0.0.1:7878

# 3. ติดตั้ง hooks เข้า ~/.claude/settings.json
npm run install-hooks

# 4. เปิด Claude Code ที่ไหนก็ได้ — แดชบอร์ดจะเห็นทันที
claude
```

### Uninstall hooks

```bash
npm run uninstall-hooks
```

### Production start (ไม่มี auto-reload)

```bash
npm start
```

---

## 9 Personas

ทุกเซสชันของ Claude Code จะถูก map ไปยัง persona ตัวใดตัวหนึ่งจาก 9 ตัว โดยใช้ `subagent_type` ของ Task/Agent tool (สำหรับ subagent) หรือ interactive session (→ Orchestra เสมอ)

| # | Persona | Role | Rarity | ดูดมาจากเอเจนต์ประเภทไหน |
|---|---|---|---|---|
| 1 | **Orchestra** | Maestro · Lead Conductor | SSR | Interactive sessions + `Plan`, Product Manager |
| 2 | **Aira** | Mentor · Knowledge Architect | SSR | Training, study-abroad, book author, developer advocate, ZK steward |
| 3 | **Luna** | Scribe · Content Lead | SSR | Content Creator, Technical Writer, Narrative Designer, Proposal |
| 4 | **Vivi** | Sentinel · Audit & Security | SSR | Security Engineer, Code Reviewer, Compliance Auditor, QA Testing |
| 5 | **Kira** | Builder · Code Forge | SR | Backend/Frontend/Mobile/Firmware/Solidity/AI Engineer |
| 6 | **Miku** | Growth · Multi-platform Strategist | SR | TikTok, Douyin, SEO, Paid Media, Sales, Growth Hacker |
| 7 | **Emi** | Studio · Visual Craft | SR | UI Designer, Brand Guardian, Unity/Unreal/Godot, XR, Video Editor |
| 8 | **Nana** | Intel · Insights Analyst | R | Trend Researcher, UX Researcher, Analytics, Benchmarking |
| 9 | **Ori** | Operations · DevOps Lead | R | DevOps, SRE, Workflow, Project Manager, Incident Response |

รายละเอียดเต็ม (personality matrix, skills, tagline): `server/mapping/personas.js`

### ตัวอย่าง Status ของการ์ด

| State | ความหมาย | Visual |
|---|---|---|
| `busy` | กำลังรัน Task/Agent subagent หรือใช้ tool ภายใน 8 วิล่าสุด | กรอบทอง + scan line + typing dots + หายใจ |
| `active` | มี session สด (Claude เปิดอยู่) | กรอบเขียวนุ่มๆ + shimmer ช้า |
| `idle` | ไม่มี session, ไม่ทำงาน | การ์ดเรียบๆ หรี่เล็กน้อย |
| `offline` | ไม่ถูกเรียกใช้ | grayscale + หรี่ลงมาก |

---

## Architecture

```
┌──────────────────┐   POST /hooks/event    ┌─────────────────────┐
│  Claude Code CLI │ ─────────────────────► │                     │
│  (any session,   │   (PreToolUse,         │   Express server    │
│   any project)   │    PostToolUse,        │   (:7878)           │
└──────────────────┘    SessionStart, ...)  │                     │
                                            │   • state.js        │
┌──────────────────┐   chokidar watches     │     - sessions      │
│  ~/.claude/      │ ─────────────────────► │     - tasks         │
│   projects/**/   │   (JSONL transcripts)  │     - events ring   │
│   *.jsonl        │                        │     - personaStatus │
└──────────────────┘                        │                     │
                                            │   • SSE bus         │
                                            └──────────┬──────────┘
                                                       │ /api/stream
                                                       ▼
                                            ┌─────────────────────┐
                                            │  React Dashboard    │
                                            │  (gacha-style UI)   │
                                            └─────────────────────┘
```

### ไฟล์สำคัญ

| Path | หน้าที่ |
|---|---|
| `server/index.js` | Express + SSE bootstrap |
| `server/state.js` | In-memory state + event bus + busy-state decay logic |
| `server/api/hooks.js` | รับ POST จาก Claude Code hooks → normalize → push event |
| `server/api/stream.js` | SSE endpoint ส่ง event ให้ frontend |
| `server/watchers/sessions.js` | Watch session files (start/end lifecycle) |
| `server/watchers/transcripts.js` | Tail JSONL transcripts → replay tool events |
| `server/mapping/personas.js` | **9 persona definitions + regex routing rules** |
| `server/mapping/pricing.js` | Token pricing per model |
| `server/install-hooks.js` | แก้ `~/.claude/settings.json` ใส่ hook entries |
| `hooks/post-event.sh` | Fire-and-forget shell script ที่ Claude Code เรียก (0.4s timeout) |
| `public/` | Frontend — JSX transpiled ในเบราว์เซอร์ด้วย Babel Standalone |

### Busy State Decay

เอเจนต์จะกลายเป็น `busy` เมื่อ:
1. มี Task/Agent tool spawn subagent (จาก `startTask`)
2. **หรือ** มี tool use ของเอเจนต์นั้นภายใน 8 วินาทีที่ผ่านมา (`lastToolActivity` map)
3. clear ทันทีเมื่อ `Stop` hook ยิง (turn จบ)

Background tick (ทุก 2 วิ) ทำหน้าที่ re-broadcast สถานะเมื่อ busy หมดอายุ → การ์ดบน UI เปลี่ยนกลับเป็น `active`/`idle` โดยอัตโนมัติ

---

## API

| Endpoint | Method | Purpose |
|---|---|---|
| `/` | GET | หน้า dashboard |
| `/api/state` | GET | Snapshot ทั้งระบบ (personas, sessions, events, tasks, stats) |
| `/api/stream` | GET (SSE) | Event stream (`event`, `stats`, `persona.status`, `task`) |
| `/api/memory` | GET | Memory graph (nodes + edges) |
| `/api/agents/:id/history?limit=N` | GET | ประวัติ event ของเอเจนต์ตัวเดียว |
| `/hooks/event` | POST | รับ payload จาก Claude Code hook (internal) |

---

## Customization

### เปลี่ยน persona mapping

แก้ `server/mapping/personas.js`:

```js
const PERSONA_RULES = [
  // เพิ่มกติกาใหม่ขึ้นก่อน (first match wins)
  { match: /(my-special-agent|another-pattern)/i, persona: 'kai' },
  // ...กติกาเดิม
];
```

รูลจะเช็คทั้ง display name ("My Special Agent") และ slug form ("my-special-agent") เพราะ `mapPersona()` normalize input (lowercase + spaces → hyphens) ก่อน

### แทนที่ภาพ persona

1. วางไฟล์ PNG ลง `public/images/`
2. แก้ `image` field ของ persona นั้นใน `personas.js` ให้ชี้ path ใหม่

### เพิ่ม/แก้ skills, personality, tagline

แก้ persona object ใน `personas.js` — frontend อ่านจาก API state ตรงๆ ไม่ต้อง rebuild

### ปรับ busy-window

`server/state.js`:

```js
const BUSY_WINDOW_MS = 8000;  // ปรับจำนวนวินาทีที่ถือว่ายัง busy
```

---

## Troubleshooting

### ไม่เห็นเอเจนต์ออนไลน์

```bash
# 1. ยืนยัน hook ติดตั้งแล้ว
grep -c 'c-office' ~/.claude/settings.json
# ควรได้ ≥ 5 (SessionStart, SessionEnd, UserPromptSubmit, PreToolUse, PostToolUse)

# 2. ยืนยัน server รันอยู่
lsof -iTCP:7878 -sTCP:LISTEN

# 3. ดู hook endpoint ยิงถึงไหม
curl -i -X POST http://127.0.0.1:7878/hooks/event \
  -H 'X-COffice-Event: SessionStart' \
  -H 'Content-Type: application/json' \
  --data '{"session_id":"test","pid":123}'
# ควรได้ 200 {"ok":true}
```

### เอเจนต์แสดง `idle` ทั้งที่กำลังทำงาน

ตรวจว่า persona routing ทำถูกต้อง:

```bash
node -e "
import('./server/mapping/personas.js').then(m => {
  console.log(m.mapPersona('Your Subagent Name', 'agent'));
});"
```

ถ้า map ผิด persona → ปรับ regex ใน `PERSONA_RULES`

### SSE disconnect หลัง restart server

Frontend มี auto-reconnect อยู่แล้ว (ทุก 2 วิ) — ถ้ายังไม่ update ให้ hard-reload หน้าเว็บ (`Cmd+Shift+R`)

### Port 7878 ชน

แก้ port ใน `server/index.js` (ตัวแปร `PORT`) + ใน `hooks/post-event.sh` (URL)

---

## Dev Scripts

```bash
npm run dev              # node --watch (auto-restart on server changes)
npm start                # production start
npm run install-hooks    # write hook entries → ~/.claude/settings.json
npm run uninstall-hooks  # remove them
```

Frontend files (`public/*.jsx`) ไม่ต้อง restart — browser โหลดตรงๆ ผ่าน Babel Standalone

---

## License

Private / personal use. Not for redistribution.

---

## Credits

- Concept & persona art: custom illustrations
- Framework: Claude Code CLI by Anthropic
- UI inspiration: mobile gacha RPG collection screens
