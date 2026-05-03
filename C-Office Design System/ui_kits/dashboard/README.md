# C-Office Dashboard UI Kit

Interactive recreation of the C-Office command center dashboard, built with React 18 UMD + Babel Standalone (matching the original no-build-step architecture).

## Files

| File | Description |
|---|---|
| `index.html` | Entry point — app shell, styles, script loading |
| `components.jsx` | Shared components: `KitStatusChip`, `KitAgentCard`, `KitMetricCard`, `KitEmptyState`, persona data |
| `sidebar.jsx` | `KitSidebar` — 72px→240px expandable icon-rail navigation |
| `dashboard.jsx` | `KitDashboard` + `KitTopbar` — full dashboard with hero, metrics, agent roster, runs, feed, providers |

## Components Available

- **KitSidebar** — Expandable sidebar with 9-item nav, brand mark, pilot avatar
- **KitTopbar** — Sticky top bar with kicker + title, command input, status chips
- **KitDashboard** — Full dashboard page: hero CTA, system pulse metrics, agent roster grid, recent runs, live activity feed, provider readiness
- **KitAgentCard** — Agent row card with avatar, name, status chip, role, level
- **KitMetricCard** — Metric display with label, value, note, accent glow
- **KitStatusChip** — Status indicator pill (busy/active/danger/muted)
- **KitEmptyState** — Placeholder for empty panels

## Mock Data

All 9 personas are included with realistic mock status, levels, and taglines. Feed and run data are hardcoded for demonstration.
