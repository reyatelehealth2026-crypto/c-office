# C-Office Design System

> Design tokens, visual foundations, UI kit components, and brand assets for **C-Office** — an AI Agent Command Center. Bright navy surfaces, solid borders, agentic UI, JRPG-flavored persona system.

---

## Sources

- **Local codebase:** `c-office-main/` (Node + React UMD + Babel Standalone, no build step)
- **GitHub repo:** `vrzycodex/c-office`
- **UX/UI Master Spec:** `docs/UX_UI_MASTER_SPEC.md`

---

## Product Context

C-Office is a **local-first AI ops command center** for managing multiple Claude Code CLI agents. Three moods:

1. **AI Ops Room** — clear system state, live activity, debugging confidence
2. **JRPG Guild Hall** — anime personas, gacha cards, rarity tiers
3. **Local Hacker Console** — fast commands, transparent logs

### Core Features
- **Live Monitor** — 9 anime-persona agent cards (busy/active/idle/offline)
- **Mission Control** — event stream of tool calls + sessions
- **Notes Workspace** — chat + dispatch via multi-provider routing
- **Orchestra** — goal delegation through persona logic
- **RPG Progression** — agent leveling, learned skills, playbooks
- **Image Studio** — Gemini/Replicate/OpenAI generation

### The 9 Personas
| # | Name | ID | Role | Element |
|---|---|---|---|---|
| 1 | Orchestra | `orchestra` | Maestro · Lead Conductor | 👑 Command |
| 2 | Aira | `astra` | Mentor · Knowledge Architect | 🎓 Education |
| 3 | Luna | `lumen` | Scribe · Content Lead | ✒️ Narrative |
| 4 | Vivi | `vex` | Sentinel · Audit & Security | 🛡️ Defense |
| 5 | Kira | `kai` | Builder · Code Forge | ⚡ Engineering |
| 6 | Miku | `mira` | Growth · Multi-platform Strategist | 📈 Commerce |
| 7 | Emi | `echo` | Studio · Visual Craft | 🎨 Creative |
| 8 | Nana | `nyx` | Intel · Insights Analyst | 🔍 Research |
| 9 | Ori | `orbit` | Operations · DevOps Lead | ⚙️ Operations |

---

## CONTENT FUNDAMENTALS

### Tone & Voice
- **Operational + playful**: action verbs ("Launch", "Inspect") wrapped in JRPG flavor ("Guild", "Quest", "Loot")
- **Bilingual**: long-form Thai with inline English; UI labels are English
- **Confident & warm**: Orchestra speaks with directive clarity
- **Abbreviation-heavy** in HUD: "DB", "AG", "NT" for nav; "Lv." for levels
- **No decorative emoji** — emoji only for persona elements (👑🎓✒️🛡️⚡📈🎨🔍⚙️)
- **Uppercase mono labels**: kickers, status, badges in JetBrains Mono with `letter-spacing: 0.08–0.18em`
- **Agentic copy**: surface what the agent is *doing right now* — `Edit server/api/hooks.js`, `Bash: npm test`

### Copy Patterns
- Status: `WORKING`, `ONLINE`, `IDLE`, `OFFLINE`, `READY`
- Tool badges: `Edit`, `Read`, `Write`, `Bash`, `Agent`, `Grep`
- Buttons: `Launch`, `Send`, `Inspect`, `Connect`
- Hero: "AI Agent Hub", "Send a mission to Orchestra..."

---

## VISUAL FOUNDATIONS

### Color Philosophy
**Bright navy + solid surfaces.** Visible deep-blue base (`#12142e`) — not near-black. Stepped surface tiers create clear visual hierarchy without relying on transparency or heavy glass blur. Neon accents reserved for *active* states and *working* agents.

### Background Tiers
| Token | Hex | Use |
|---|---|---|
| `--bg-app` | `#12142e` | Page canvas |
| `--bg-app-soft` | `#161938` | Topbar, footer chrome |
| `--bg-panel` | `#161938` | Section panels |
| `--bg-card` | `#1a1d42` | Card surfaces, hero |
| `--bg-card-2` | `#1e2148` | Inner cards, row hover |
| `--bg-elevated` | `#252850` | Inputs, progress tracks |

App canvas may carry **3 soft radial glows** (violet top-left @ 10–14%, cyan top-right @ 8–10%, gold bottom @ 0–8%) plus a 48px grid overlay. Cards/panels use **solid fills** — no rgba surfaces, no glass blur.

### Color Tokens
| Role | Hex | Usage |
|---|---|---|
| Primary (Violet) | `#9d5cff` | Brand, focus rings, primary nav |
| Secondary (Cyan) | `#22d3ee` | Live kicker, primary buttons, links |
| Gold | `#fbbf24` | Working state, SSR rarity, busy alerts |
| Pink | `#f472b6` | Education element |
| Magenta | `#ec4899` | Growth element |
| Lime/Success | `#34d399` | Online, ready, success |
| Danger | `#fb7185` | Errors, offline-with-issue |
| Info | `#38bdf8` | Neutral information |
| Border | `#2a2d5a` → `#3a3d6a` → `#4a4d8a` | Default → hover → active |
| Text | `#fff` / `#cbd5e1` / `#a0a3c0` / `#7f8da3` | Heading / body / secondary / muted |

### Typography System
| Role | Font | Weight | Size | Tracking |
|---|---|---|---|---|
| Display / Hero | Space Grotesk | 800 | clamp(28–42px) | -0.045em |
| Page Title | Space Grotesk | 800 | clamp(18–24px) | -0.02em |
| Section Title | Space Grotesk | 800 | 16px | -0.01em |
| Card Title | Space Grotesk | 700 | 13–14px | 0.02em |
| Body | Inter | 400 | 13–14px | 0 |
| HUD Kicker | JetBrains Mono | 800 | 10px | 0.18em UPPER |
| Mono Label | JetBrains Mono | 700 | 9–10px | 0.08–0.12em UPPER |
| Tool Badge | JetBrains Mono | 800 | 9–10px | 0.06em UPPER |
| Thai text | Sarabun | 400–700 | inherits | inherits |

### Spacing
4px base: 4, 8, 12, 16, 20, 24, 32, 40, 48. Card gap 10–14px. Card padding 14–18px. Page padding 18–28px.

### Border Radii
**No over-rounding.** Max corner radius is 16px on major sections.
| Token | px | Use |
|---|---|---|
| `--radius-xs` | 4 | Tool badges, micro tags |
| `--radius-sm` | 6 | Small chips |
| `--radius-md` | 10 | Cards, rows, list items |
| `--radius-lg` | 12 | Inputs, panels |
| `--radius-xl` | 14 | Large surfaces |
| `--radius-2xl` | 16 | Hero / outermost panels (max) |
| `--radius-pill` | 999 | Status chips, badges |

### Borders
**2px solid** is the default for panel surfaces. 1px solid for inner row borders. No dashed defaults. Hover/active states bump to `--border-2` (`#3a3d6a`) or accent color.

### Shadows
Subtle and matte — **no heavy glass blur**.
- `--shadow-card`: `0 8px 28px rgba(0,0,0,0.4)`
- `--shadow-popover`: `0 16px 48px rgba(0,0,0,0.55)`

### Glows
Used **only on active/working states**, not decoratively.
- Active border ring: `0 0 0 2px rgba(<accent>,0.4)`
- Status dot glow: `0 0 8–12px <accent>` on 6–8px circles
- Working pulse: keyframe shadow expansion `0 0 0 0 → 0 0 0 6px transparent`

### Hover & Press
- **Cards/rows:** `translateY(-3px to -4px)` + border-color shift to accent
- **Buttons:** `translateY(-2px)` + shimmer sweep on hover (105deg gradient sweep)
- **Press:** `translateY(0) scale(0.97)` 80ms
- **Disabled:** `opacity: 0.4; cursor: not-allowed`

### Motion
- **Transitions:** 140–200ms `cubic-bezier(.2,.8,.2,1)` for card lifts
- **Status pulse:** 1.6s ease-in-out infinite (status dots, working ring)
- **Thinking dots:** 3-dot stagger, `1.2s` cycle, 0.15s offset between dots
- **Scan line:** 2s linear sweep across active cards/missions
- **No spring/bounce** — motion stays smooth and professional

### Card System
- **Standard card:** solid `#1a1d42` bg, `2px solid #2a2d5a` border, `--radius-md/lg` corners, `--shadow-card`
- **Active card:** border-color matches state accent, optional 2px glow ring + scan line
- **Agent card (agentic):** avatar + status ring + name/role + current tool badge + task detail + progress bar + thinking dots when working
- **Persona gallery card:** larger 180px portrait area, full-color art on tinted gradient backdrop, rarity badge + element icon overlay
- **Rarity tiers:** SSR gold-orange-pink gradient · SR violet-pink · R cyan-lime · N grey

### App Shell
- **Sidebar:** 72px collapsed → 240px expanded on hover. 9 nav items, 2-letter mono icon codes (`DB`, `MC`, `AG`, `NT`, `TS`, `IM`, `SK`, `MM`, `ST`), per-route accent colors, badge counters on Agents/Mission Control/Tasks. Active state = colored left border + tinted icon box.
- **Topbar:** sticky `#161938` with `2px` bottom border. 3-column grid: kicker+title left | command input center | status chips right.
- **Main content:** padded 18–28px, dashboard grid 1.15fr/0.85fr split.

---

## ICONOGRAPHY

### Approach
**Text-based icon system** — no icon font, no SVG sprites.
- **Navigation:** 2-letter monospace codes in 30×30px rounded squares with `2px` border
- **Persona elements:** Single emoji per persona (👑🎓✒️🛡️⚡📈🎨🔍⚙️)
- **Status:** 6–8px circles with matching accent glow
- **Rarity:** Text labels (`SSR`, `SR`, `R`, `N`) with gradient or solid colored borders
- **Tool badges:** Mono uppercase tokens with tinted bg + 1px border (`Edit`, `Read`, `Bash`, `Write`, `Agent`)

### Character Art
- **Style:** High-quality anime illustrations, full-color, fantasy RPG
- **Format:** PNG with transparency
- **9 portraits** in `assets/images/`

```
assets/images/
├── Orchestra.png    — Maestro, silver hair, gold crown
├── Aira.png         — Knowledge architect, warm tones
├── Luna.png         — Content scribe
├── Vivi.png         — Security sentinel
├── Kira.png         — Code forge builder
├── Miku.png         — Growth strategist
├── Emi.png          — Visual craft, forest archer
├── Nana.png         — Intel analyst
└── Ori.png          — DevOps operations
```

---

## File Index

| Path | Description |
|---|---|
| `README.md` | This file — product context, visual foundations, content guide |
| `SKILL.md` | Skill definition for Claude Code integration |
| `colors_and_type.css` | CSS custom properties — colors, type, spacing, radii, shadows |
| `assets/images/*.png` | 9 anime persona portrait illustrations |
| `preview/*.html` | Design system preview cards (rendered in Design System tab) |
| `ui_kits/dashboard/` | Interactive dashboard recreation — agentic mission feed, status cards, live activity |

---
