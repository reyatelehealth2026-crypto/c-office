# C-Office UX/UI Master Spec

> Product direction, interface architecture, design system, component map, and implementation plan for a full C-Office UX/UI upgrade.

---

## 0. Implementation Progress

### Phase 1 Foundation — first pass shipped

Implemented:

- `public/ux-system.css` — UX design token layer, app shell polish, topbar styles, status chips, empty/error/skeleton primitives, responsive bottom-nav behavior
- `public/ux-components.jsx` — shared dependency-free React primitives: `UXTopbar`, `UXStatusChip`, `UXEmptyState`, `UXErrorState`, `UXSkeleton`
- `public/index.html` — loaded the UX layer after legacy CSS and inserted `UXTopbar` into the global app shell

### Phase 2 Dashboard — first pass shipped

Implemented:

- `public/ux-dashboard.css` — Dashboard V2 layout, hero, metric cards, agent roster cards, provider readiness, run list, live feed, responsive rules
- `public/page-dashboard-v2.jsx` — safe dashboard override that replaces `window.Dashboard` after the legacy dashboard loads
- `public/index.html` — loaded Dashboard V2 CSS and JSX after the original dashboard file

### Phase 2 Mission Control — first pass shipped

Implemented:

- `public/ux-nav.jsx` — sidebar override that adds Mission Control as a first-class route without editing legacy `components.jsx`
- `public/ux-mission-control.css` — Mission Control layout, filter toolbar, event cards, summary metrics, inspector, raw payload viewer, responsive rules
- `public/page-mission-control.jsx` — full realtime event inspection page using existing `window.ACTIVITY`, `window.AGENTS`, and SSE-backed state
- `public/index.html` — wired Mission Control CSS, JS, route, and sidebar override

### Phase 2 Notes Workspace — first pass shipped

Implemented:

- `public/ux-notes.css` — three-panel notes layout, work inbox, search/tags, composer, context inspector, provider mini cards, responsive rules
- `public/page-notes-v2.jsx` — safe Notes override that reuses legacy `AgentPicker` and `NoteDetail` to preserve dispatch, Orchestra flow, note patch/delete, and image generation behavior
- `public/index.html` — loaded Notes V2 CSS and JSX after the original notes file

The Notes page now has left inbox/search, center note/chat detail, and right agent/provider context panel while keeping the existing functional logic intact.

Next recommended pass:

1. Redesign Tasks and Run Detail into a workflow surface.
2. Add reusable timeline/step components.
3. Add provider-unavailable error banners inside Notes composer if needed.

---

## 1. Product Vision

C-Office should feel like a premium **AI Command Center** for local-first agent work.

The interface should combine three moods:

1. **AI Ops Room** - clear system state, live activity, debugging confidence
2. **JRPG Guild Hall** - personas, quests, progression, rarity, energy
3. **Local Hacker Console** - fast commands, transparent logs, no infrastructure bloat

The goal is not decoration. The goal is fast operational understanding:

- What is running?
- Who is working?
- What changed?
- What failed?
- What should I do next?

A user should understand the current system state within 3 to 5 seconds after opening the dashboard.

---

## 2. UX Principles

### 2.1 Clarity Before Fantasy

The gacha/RPG theme should support meaning, not hide it.

Use fantasy language for flavor:

- Guild
- Quest
- Party
- Skill
- Run
- Loot
- Boss

Use operational language for actions:

- Start
- Stop
- Retry
- Inspect
- Connect
- Copy
- Delete
- Open
- Filter

### 2.2 Realtime Without Chaos

Realtime UI should feel alive, not noisy.

Rules:

- New events should be readable before they disappear.
- Auto-scroll should stop when the user scrolls upward.
- Critical events should be visually distinct.
- Repeated low-value events should be collapsible.
- Raw payloads should be hidden until inspected.

### 2.3 Local-first Trust

Users should always know:

- what is local
- what is connected
- what provider is being used
- whether credentials are stored
- whether the app is exposed beyond localhost

Security and connection status should be visible, not buried.

### 2.4 One Layout System

Every major page should share one shell:

- left navigation
- top command/status bar
- main content
- optional right inspector drawer

This creates product continuity and reduces cognitive load.

---

## 3. Target Information Architecture

### 3.1 Primary Navigation

| Nav item | Purpose | Priority |
|---|---|---:|
| Dashboard | System overview, personas, live work | P0 |
| Mission Control | realtime event feed, sessions, filters | P0 |
| Notes | note inbox and agent chat | P0 |
| Tasks | Orchestra runs and run details | P0 |
| Projects | project grouping and scoped runs | P1 |
| Images | image generation and asset library | P1 |
| Skills | learned skills, playbooks, memory | P1 |
| Settings | providers, hooks, security, appearance | P0 |

### 3.2 Secondary Surfaces

| Surface | Entry point | Behavior |
|---|---|---|
| Persona detail | persona card click | right drawer or detail page |
| Run detail | task row/card click | page or split detail view |
| Event detail | feed item click | right drawer |
| Provider detail | settings provider card click | inline expansion or drawer |
| Image detail | image tile click | drawer with prompt and metadata |
| Project detail | project card click | scoped dashboard |

---

## 4. App Shell

### 4.1 Desktop Layout

```text
┌──────────────────────────────────────────────────────────────┐
│ Topbar: product, global status, quick command, profile        │
├───────────────┬──────────────────────────────┬───────────────┤
│ Sidebar       │ Main content                 │ Inspector     │
│ nav           │ page-specific workspace       │ optional      │
│               │                              │ contextual    │
└───────────────┴──────────────────────────────┴───────────────┘
```

### 4.2 Tablet Layout

- Sidebar collapses to icon rail.
- Inspector becomes slide-over drawer.
- Main content keeps two-column card layouts where possible.

### 4.3 Mobile Layout

- Sidebar becomes bottom navigation or menu drawer.
- Inspector always becomes full-screen or bottom sheet.
- Cards stack vertically.
- Quick command remains sticky at bottom or top depending page.

---

## 5. Visual Direction

### 5.1 Style Keywords

- premium dark command center
- soft neon accents
- glassy but readable panels
- tactical RPG guild interface
- clean spacing
- strong status language
- restrained glow
- high-contrast data surfaces

### 5.2 Avoid

- neon soup
- random gradients everywhere
- tiny unreadable labels
- overanimated cards
- excessive shadows
- every object looking equally important
- hidden primary actions
- raw JSON as default UI

---

## 6. Design Tokens

### 6.1 Color Tokens

Use semantic tokens instead of hardcoded colors.

```css
:root {
  --bg-app: #070812;
  --bg-app-soft: #0d1020;
  --surface-1: rgba(255,255,255,0.045);
  --surface-2: rgba(255,255,255,0.075);
  --surface-3: rgba(255,255,255,0.11);

  --border-soft: rgba(255,255,255,0.10);
  --border-strong: rgba(255,255,255,0.18);

  --text-primary: #f8fafc;
  --text-secondary: #cbd5e1;
  --text-muted: #7f8da3;
  --text-faint: #526072;

  --accent-primary: #9d5cff;
  --accent-secondary: #22d3ee;
  --accent-gold: #fbbf24;
  --accent-pink: #f472b6;

  --success: #34d399;
  --warning: #f59e0b;
  --danger: #fb7185;
  --info: #38bdf8;
  --offline: #64748b;

  --busy: #fbbf24;
  --active: #34d399;
  --idle: #94a3b8;
  --offline-status: #64748b;
}
```

### 6.2 Spacing Tokens

```css
:root {
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 20px;
  --space-6: 24px;
  --space-8: 32px;
  --space-10: 40px;
  --space-12: 48px;
}
```

### 6.3 Radius Tokens

```css
:root {
  --radius-sm: 8px;
  --radius-md: 12px;
  --radius-lg: 16px;
  --radius-xl: 22px;
  --radius-pill: 999px;
}
```

### 6.4 Shadow and Glow Tokens

```css
:root {
  --shadow-card: 0 18px 60px rgba(0,0,0,0.28);
  --shadow-popover: 0 24px 80px rgba(0,0,0,0.45);
  --glow-primary: 0 0 32px rgba(157,92,255,0.28);
  --glow-cyan: 0 0 28px rgba(34,211,238,0.22);
  --glow-gold: 0 0 28px rgba(251,191,36,0.22);
}
```

### 6.5 Typography Scale

| Token | Size | Use |
|---|---:|---|
| `--font-xs` | 11px | badges, metadata |
| `--font-sm` | 12px | labels, compact rows |
| `--font-md` | 14px | body UI |
| `--font-lg` | 16px | card title |
| `--font-xl` | 20px | section title |
| `--font-2xl` | 26px | page title |
| `--font-3xl` | 34px | hero number / dashboard title |

---

## 7. Component System

### 7.1 Foundation Components

| Component | Purpose | Status |
|---|---|---|
| `AppShell` | global layout wrapper | partial via `index.html` shell |
| `SidebarNav` | primary navigation | shipped as `SidebarV2` override |
| `Topbar` | global status, command, provider summary | shipped as `UXTopbar` |
| `PageHeader` | title, description, actions | pending |
| `Panel` | reusable surface/card wrapper | CSS utility `ux-panel` shipped |
| `StatusChip` | busy/active/idle/offline/provider states | shipped as `UXStatusChip` |
| `MetricCard` | numeric summary cards | shipped for Dashboard/Mission Control as `UXMetricCard` |
| `ActionButton` | consistent primary/secondary/ghost actions | partial CSS shipped |
| `IconButton` | compact actions | pending |
| `Tabs` | page sections | pending |
| `Drawer` | contextual inspector | partial as Mission Control inspector |
| `Modal` | destructive or focused flows | pending |
| `Toast` | success/error feedback | pending |
| `Skeleton` | loading state | shipped as `UXSkeleton` |
| `EmptyState` | no data yet state | shipped as `UXEmptyState` |
| `ErrorState` | readable failure state | shipped as `UXErrorState` |

### 7.2 Product Components

| Component | Purpose | Status |
|---|---|---|
| `PersonaCard` | dashboard persona summary | shipped for Dashboard V2 as `UXAgentCardV2` |
| `PersonaInspector` | status, history, skills, actions | pending |
| `ActivityFeed` | realtime event list | shipped as Dashboard preview and Mission Control feed |
| `ActivityFeedItem` | single readable event | shipped as Dashboard preview row and Mission Control event card |
| `RunCard` | Orchestra run summary | shipped as Dashboard run row |
| `RunTimeline` | delegation steps | pending |
| `ProviderCard` | connection and provider readiness | shipped as Dashboard provider readiness row and Notes provider mini card |
| `NoteListItem` | note inbox row | shipped as `UXNoteCard` |
| `ChatMessage` | notes chat message | legacy reused in `NoteDetail` |
| `Composer` | message input and provider/agent selector | legacy reused in `NoteDetail`, new inbox composer shipped |
| `ImageTile` | generated/uploaded asset preview | pending |
| `ProjectCard` | project summary | pending |
| `TaskBoardColumn` | kanban column | pending |
| `TaskCard` | compact task card | pending |
| `SkillMatrix` | persona skill view | pending |

---

## 8. Page Specs

## 8.1 Dashboard

### Job

Answer instantly:

- Is the system alive?
- Who is working?
- What is running now?
- Are providers connected?
- What changed recently?

### Layout

```text
Topbar
PageHeader + Quick Command
Metric row
Persona grid + Live Feed
Current Runs + Progression Widget
```

### Required elements

- global health card
- provider readiness chips
- 9 persona cards
- current run strip
- live activity preview
- quick Send to Orchestra action
- hooks status hint

### Persona Card Fields

- avatar/image
- name
- role
- rarity
- status
- level
- current task
- last activity
- quick action menu

### Empty states

- no hooks installed
- no activity yet
- no provider connected
- no current run

---

## 8.2 Mission Control

### Job

Let users inspect realtime activity without drowning in noise.

### Required elements

- filter bar
- event type filters
- persona filters
- project/session filters
- event list
- event detail drawer
- pause/resume stream button
- clear local view button

### Feed Item Fields

- timestamp
- persona/status icon
- source
- event type
- readable summary
- expandable details

### Interaction rules

- Auto-scroll only when user is already at bottom.
- Pause stream should freeze visual updates but not break SSE connection if practical.
- Repeated events can group into a collapsible bundle.

---

## 8.3 Notes

### Job

Make Notes feel like a work notebook plus agent chat.

### Layout

```text
Left: note inbox/search/tags
Center: selected note + chat thread
Right: agent/provider/context inspector
```

### Required elements

- note search
- tag filter
- create note button
- selected note body
- chat messages
- sticky composer
- agent selector
- provider selector
- provider availability indicator

### Message states

- queued
- thinking
- typing
- using tool
- complete
- error

---

## 8.4 Tasks

### Job

Show Orchestra runs as workflows, not random logs.

### Task List Fields

- goal
- run id short
- status
- primary persona
- project
- created time
- duration
- progress
- result summary

### Run Detail Sections

1. Overview
2. Delegation timeline
3. Per-persona output
4. Artifacts
5. Errors and retry options

### Required actions

- inspect
- copy result
- rerun if supported
- open related note/project

---

## 8.5 Projects

### Job

Group runs, notes, images, and activity by project.

### Project Card Fields

- title
- status
- recent activity
- active runs
- linked notes
- image/assets count
- last updated

### Detail Page

- overview
- scoped activity
- scoped notes
- scoped tasks
- assets

---

## 8.6 Images

### Job

Turn image generation into a small creative studio.

### Layout

```text
Left: provider/preset/prompt controls
Center: gallery/canvas
Right: selected image metadata
```

### Required elements

- provider status
- prompt input
- optional reference upload
- preset selector
- generate button
- gallery grid
- image detail drawer
- delete action
- copy prompt action

### Empty states

- provider not connected
- no generated images
- generation failed
- upload unsupported or failed

---

## 8.7 Skills / Memory

### Job

Show agent learning and reusable patterns.

### Required elements

- persona filter
- skill cards
- mastery matrix
- recent learned patterns
- memory graph preview
- empty state for no skills yet

---

## 8.8 Settings

### Job

Make setup and trust obvious.

### Sections

1. Profile
2. Connections
3. Providers
4. Hooks
5. Access and Security
6. Appearance
7. Advanced Debug

### Provider Card Fields

- provider name
- status
- method
- last checked
- available actions
- short help text
- security note

### Security Highlights

- show current host
- show whether access token gate is enabled
- warn if exposed externally without token
- show local credential storage note

---

## 9. Interaction Patterns

### 9.1 Quick Command

A global command input should eventually support:

- send goal to Orchestra
- search notes
- jump to page
- filter activity
- open persona

Initial placeholder can focus on Send to Orchestra only.

### 9.2 Inspector Drawer

Use the right drawer for:

- persona detail
- event detail
- run detail preview
- provider detail
- image metadata

Drawer should include:

- title
- status
- key metadata
- actions
- expandable raw detail if needed

### 9.3 Destructive Actions

Require confirmation for:

- delete note
- delete image
- reset state
- reset levels
- disconnect provider

---

## 10. Accessibility Requirements

- Every status color must have text label.
- Buttons need visible focus states.
- Inputs need labels or accessible names.
- Contrast should be readable on dark backgrounds.
- Animations should be subtle and non-essential.
- Avoid tiny text below 11px.
- Tap targets should be at least 40px on touch screens.

---

## 11. Responsive Rules

| Breakpoint | Behavior |
|---|---|
| Desktop | sidebar + main + optional inspector |
| Tablet | icon sidebar + main, inspector as drawer |
| Mobile | stacked layout, nav drawer or bottom nav |

Responsive priorities:

1. Keep actions reachable.
2. Keep status labels visible.
3. Collapse secondary metadata first.
4. Never hide error or security warnings.

---

## 12. Implementation Phases

## Phase 1 - Foundation

Goal: create the UI skeleton and design system.

Tasks:

- add/normalize design tokens
- build shared app shell
- build shared panel/card/button/chip styles
- create loading/empty/error states
- unify typography and spacing
- create responsive sidebar/topbar behavior

Deliverables:

- app shell used by all main pages
- consistent dark premium theme
- no route behavior changes

## Phase 2 - Core Surfaces

Goal: upgrade the highest-use pages.

Tasks:

- redesign Dashboard
- redesign Mission Control feed
- redesign Notes layout
- add persona inspector drawer
- add provider status chips in topbar

Deliverables:

- readable system overview
- usable realtime feed
- better notes/chat workflow

## Phase 3 - Workflow Surfaces

Goal: make work traceable and reusable.

Tasks:

- redesign Tasks list
- redesign Run detail
- redesign Projects
- redesign Task Board
- add better timeline components

Deliverables:

- clear run lifecycle
- project-scoped operations
- workflow visibility

## Phase 4 - Creative and Trust Polish

Goal: strengthen Images and Settings.

Tasks:

- redesign Images studio
- redesign Settings/Connections
- add hook diagnostics view
- add access-token warning states
- refine animation and responsive behavior

Deliverables:

- safer setup experience
- mature creative asset workflow
- final polish pass

---

## 13. Implementation Checklist

### Foundation

- [x] Define CSS variables for tokens
- [x] Create base layout shell
- [x] Create sidebar polish layer
- [x] Create topbar
- [x] Create reusable panel/card styles
- [x] Create status chips
- [x] Create metric cards
- [x] Create empty states
- [x] Create error states
- [x] Create skeleton loading states
- [x] Create drawer pattern

### Dashboard

- [x] Add global health summary
- [x] Add provider readiness row
- [x] Redesign persona cards
- [x] Add current run strip
- [x] Improve live activity preview
- [x] Add quick Send to Orchestra field
- [x] Add no-hooks empty/warning state

### Mission Control

- [x] Add event filters
- [x] Add persona filters
- [x] Add pause/resume visual stream
- [x] Add event detail drawer
- [ ] Add grouped repeated events

### Notes

- [x] Three-panel layout
- [x] Search and tags
- [x] Sticky composer
- [x] Better provider/agent selectors
- [x] Message states
- [ ] Error state for provider unavailable

### Tasks

- [ ] Better run cards
- [ ] Run timeline
- [ ] Delegation view
- [ ] Result summary
- [ ] Error/retry affordances

### Images

- [ ] Studio layout
- [ ] Provider status
- [ ] Prompt presets
- [ ] Gallery grid
- [ ] Image detail drawer
- [ ] Copy prompt
- [ ] Delete confirmation

### Settings

- [ ] Provider cards
- [ ] Hook diagnostics
- [ ] Access-token warning
- [ ] Local credential explainer
- [ ] Appearance controls if available

---

## 14. First Code Pass Recommendation

Start with these files or areas:

1. `public/` global CSS and layout files
2. main dashboard JSX entry
3. shared UI helpers/components if currently centralized
4. notes page JSX
5. settings/connections page JSX

Do not start with image or task board pages first. They benefit from the shared system after the shell exists.

---

## 15. Success Metrics

The redesign is successful when:

- dashboard state is understandable in under 5 seconds
- provider/hook problems are visible without opening devtools
- users can send an Orchestra task from the primary dashboard
- notes chat needs fewer clicks to select agent/provider
- activity feed can be filtered by persona and event type
- all major pages have loading/empty/error states
- mobile layout remains usable
- no-build frontend contract is preserved
- local-first security remains clear

---

## 16. Final Direction

The upgraded C-Office UI should not look like a generic admin template.

It should look like a living operations deck where AI agents are visible teammates, workflows are traceable, and local-first control feels powerful rather than technical.

Build the interface like a guild master uses it during a raid, but make the data legible enough for an engineer at 2 AM. 🛡️
