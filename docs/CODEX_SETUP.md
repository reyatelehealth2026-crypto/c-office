# คู่มือเชื่อม Codex กับ C-Office

C-Office อ่าน OAuth credentials ของ Codex จากไฟล์ที่ Codex CLI สร้างไว้แล้ว ไม่มี
flow OAuth ภายใน — เพียงต้อง login ผ่าน Codex CLI ก่อน แล้ว C-Office จะ auto-detect
ทันที

## 1. ติดตั้ง Codex CLI

ถ้ายังไม่มี Codex CLI ติดตั้งก่อน:

```bash
npm install -g @openai/codex
# หรือ: brew install openai/tap/codex (macOS)
```

ตรวจสอบ:

```bash
codex --version
```

## 2. Login

```bash
codex login
```

จะเปิดเบราว์เซอร์ให้ login ด้วย ChatGPT account (Plus / Team / Enterprise / API tier
ใดก็ได้) หรือใช้ API key ก็ได้:

```bash
codex login --api-key sk-proj-...
```

หลัง login Codex CLI จะเขียนไฟล์ที่:

```
~/.codex/auth.json
```

โครงสร้างไฟล์ (ตัวเลขจริงจะ redact):

```json
{
  "tokens": {
    "access_token": "<oauth-access-token>",
    "account_id": "<account-uuid>",
    "id_token": "<jwt>",
    "refresh_token": "<refresh>"
  },
  "last_refresh": "2026-04-27T10:39:05.121Z",
  "auth_mode": "chatgpt"
}
```

> **Security:** ไฟล์นี้เก็บ access token แบบ plaintext (Codex CLI's own
> design) — ดูแลสิทธิ์ไฟล์ให้เป็น 0600 และอย่า commit เข้า git
> Default `~/.codex/` ไม่ได้อยู่ใน C-Office repo

## 3. ตรวจสอบสถานะใน C-Office

เปิด `http://127.0.0.1:7878/#/settings` → ดูการ์ด **Codex CLI**

ถ้าเห็น `READY` คือเชื่อมสำเร็จ หรือ check ผ่าน API:

```bash
curl http://127.0.0.1:7878/api/auth/status | jq '.codex'
```

ตอบกลับเมื่อ ready:

```json
{
  "connected": true,
  "mode": "chatgpt",
  "lastRefresh": "2026-04-27T10:39:05.121Z"
}
```

## 4. ใช้งานจาก Topbar

บน Dashboard มี **Provider picker** อยู่ระหว่าง command bar กับปุ่ม Launch:

1. เลือก **Codex** จาก dropdown
2. พิมพ์งานในกล่อง "Send a mission to Orchestra..."
3. กด **Launch**

C-Office ส่ง POST `/api/task` ด้วย `{ goal, provider: "codex" }` →
runner.js เรียก provider 'codex' ผ่าน `server/runner/providers.js` ที่ shell
out ไปที่ `codex exec "<prompt>"`

## 5. ปรับแต่ง command template (optional)

ค่า default คือ `codex exec ${PROMPT}` กำหนดเองได้:

```bash
# Bash / WSL
export C_OFFICE_CODEX_CMD='codex exec --model gpt-5 --json ${PROMPT}'
npm run dev

# PowerShell
$env:C_OFFICE_CODEX_CMD='codex exec --model gpt-5 --json ${PROMPT}'
npm run dev
```

ตัวแปร `${PROMPT}` จะถูกแทนที่ด้วย instruction ที่ส่งเข้ามา

ปรับ timeout (ms):

```bash
export C_OFFICE_CODEX_TIMEOUT_MS=300000   # 5 นาที (default 180s)
```

## 6. ใช้ Codex สำหรับสร้างรูป (optional)

C-Office รองรับ Codex CLI image generation (`gpt-image-2`) ด้วย:

- ตั้ง `IMAGE_PROVIDER=codex-cli` ใน env
- ที่ Image Studio → Provider ดropdown เลือก **Codex CLI Image**
- Image จะถูก generate ผ่าน `codex` CLI command ภายใน

## 7. Override auth file location (optional)

ถ้าใช้ Codex หลาย account/profile หรืออยู่ใน sandbox:

```bash
export CODEX_AUTH_FILE=/path/to/custom/auth.json
npm run dev
```

C-Office จะอ่านจาก path ที่ override

## 8. Troubleshooting

| ปัญหา | วิธีแก้ |
|---|---|
| Settings page โชว์ "setup" หรือ "disconnected" | รัน `codex login` แล้ว refresh; ตรวจ `~/.codex/auth.json` มีอยู่จริง |
| `auth.json` มีแต่ token หมดอายุ | `codex login` ใหม่ — Codex CLI จัดการ refresh เอง C-Office อ่านอย่างเดียว |
| Run with provider=codex หยุด/timeout | เพิ่ม `C_OFFICE_CODEX_TIMEOUT_MS=300000`; ตรวจว่า `codex` อยู่ใน PATH |
| Topbar dropdown ไม่มี Codex | ตรวจว่า `auth.codex.connected = true` ใน `/api/auth/status`; ถ้า connected แต่ dropdown ขึ้น `(setup)` แปลว่า field `connected` คืน false ให้ดู console log ของ C-Office |
| Permission denied อ่าน auth.json | `chmod 600 ~/.codex/auth.json` และตรวจ user ที่รัน C-Office เป็นเจ้าของไฟล์ |

## 9. ไฟล์ที่เกี่ยวข้องในโค้ด

- `server/auth/codex.js` — อ่าน `~/.codex/auth.json` + status probe
- `server/auth/probes.js` — health check endpoint
- `server/api/auth.js` — `/api/auth/status` aggregate
- `server/runner/providers.js` — codex CLI command builder
- `server/agents/runner.js` — provider selection ที่ delegate time
- `public/ux-components.jsx` — Topbar provider picker
