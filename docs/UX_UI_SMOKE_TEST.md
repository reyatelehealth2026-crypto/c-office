# C-Office UX/UI Smoke Test

> Quick manual checks for the staged UX/UI override rollout.

---

## 1. Start the app

```bash
npm run dev
```

Open:

```text
http://127.0.0.1:7878
```

Hard refresh once:

```text
Ctrl/Cmd + Shift + R
```

---

## 2. Page smoke checklist

Check that each page renders without a blank screen or console-blocking error:

- Dashboard
- Mission Control
- Agents
- Agent Detail
- Notes
- Tasks
- Projects
- Images
- Settings
- Memory
- Playbooks

---

## 3. Critical UI behavior

### Global shell

- Sidebar expands on hover.
- Topbar appears on every main route.
- Global command input can launch an Orchestra run.
- Mobile or narrow viewport stacks panels cleanly.

### Dashboard

- System pulse cards render.
- Agent roster cards open Agent Detail.
- Provider readiness appears.
- Current runs and live activity handle empty state.

### Mission Control

- Search filters events.
- Persona filter works.
- Event type pills work.
- Grouped toggle switches grouped/ungrouped view.
- Pause visual freezes the displayed feed.
- Event inspector opens and copies JSON.

### Agent Detail

- Desk Chat tab renders.
- Quick actions start an Orchestra run.
- Profile tab renders personality metadata.
- Skills tab renders skill bars.
- History tab lists runs or empty state.

### Notes

- Left work inbox renders.
- Search and tag filters work.
- New note composer opens and saves.
- Center `NoteDetail` still supports existing dispatch flows.
- Right context panel shows assigned agent/provider state.

### Tasks

- Runs and tasks appear in the combined workflow list.
- Search/status/type filters work.
- Inspector shows timeline/result/raw payload.
- Open run link points to `/run.html?id=...`.

### Projects

- Projects menu appears in sidebar.
- Page renders project cards.
- Board columns render backlog/active/blocked/done.
- Inspector opens for selected board cards.
- Page still renders when `/api/projects` or `/api/task-board` are empty.

### Images

- Provider status loads.
- Prompt studio renders.
- Reference upload button works.
- Gallery loads from image library.
- Inspector supports copy URL, copy prompt, delete confirmation.

### Settings

- Provider cards render.
- Test buttons do not crash when provider missing.
- Hook diagnostics render.
- Live sessions panel renders.
- User profile editor loads and saves.

---

## 4. Endpoint smoke commands

```bash
curl http://127.0.0.1:7878/api/state
curl http://127.0.0.1:7878/api/auth/status
curl http://127.0.0.1:7878/api/settings
curl http://127.0.0.1:7878/api/user-profile
curl http://127.0.0.1:7878/api/notes/providers
curl http://127.0.0.1:7878/api/images/status
curl http://127.0.0.1:7878/api/images/library
curl http://127.0.0.1:7878/api/projects
curl http://127.0.0.1:7878/api/task-board
```

---

## 5. Hook smoke event

```bash
curl -X POST http://127.0.0.1:7878/hooks/event \
  -H 'X-COffice-Event: SessionStart' \
  -H 'Content-Type: application/json' \
  --data '{"session_id":"ux-smoke","pid":123,"cwd":"/tmp/c-office-smoke"}'
```

Expected:

- Mission Control shows a new event.
- Dashboard live activity updates.
- Projects can derive activity if project APIs are empty.

---

## 6. Script order sanity check

The staged override strategy depends on script order in `public/index.html`:

1. legacy component/page files load first
2. UX foundation components load early
3. V2 override pages load after their legacy equivalents
4. router constants are bound after V2 files have assigned the final `window.*` globals

Important files:

```text
public/ux-system.css
public/ux-components.jsx
public/ux-nav.jsx
public/ux-nav-projects.jsx
public/page-dashboard-v2.jsx
public/page-mission-control.jsx
public/page-mission-control-polish.jsx
public/page-detail-v2.jsx
public/page-notes-v2.jsx
public/page-tasks-v2.jsx
public/page-projects-v2.jsx
public/page-images-v2.jsx
public/page-settings-v2.jsx
```

---

## 7. Rollback guidance

Because V2 files are override layers, rollback can be done by removing individual V2 script/link tags from `public/index.html`.

Examples:

- Remove `page-images-v2.jsx` to return to legacy image studio.
- Remove `page-tasks-v2.jsx` to return to legacy operations board.
- Remove `ux-nav-projects.jsx` and `page-projects-v2.jsx` to hide Projects.

Do not delete legacy files during early rollout.
