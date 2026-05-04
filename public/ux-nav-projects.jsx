/* Projects route patch for SidebarV2. Loaded after ux-nav.jsx. */

const UX_NAV_PROJECTS = [
  { id: 'dashboard', label: 'Dashboard', icon: 'DB', color: 'var(--ux-accent-primary)' },
  { id: 'mission-control', label: 'Mission Control', icon: 'MC', color: 'var(--ux-accent-secondary)' },
  { id: 'agents', label: 'Agents', icon: 'AG', color: 'var(--ux-accent-secondary)' },
  { id: 'notes', label: 'Notes', icon: 'NT', color: 'var(--ux-accent-gold)' },
  { id: 'tasks', label: 'Tasks', icon: 'TS', color: 'var(--ux-accent-pink)' },
  { id: 'projects', label: 'Projects', icon: 'PR', color: 'var(--ux-accent-secondary)' },
  { id: 'images', label: 'Images', icon: 'IM', color: 'var(--ux-success)' },
  { id: 'skills', label: 'Playbooks', icon: 'SK', color: 'var(--ux-accent-secondary)' },
  { id: 'memory', label: 'Archive', icon: 'MM', color: 'var(--ux-accent-primary)' },
  { id: 'settings', label: 'Settings', icon: 'ST', color: 'var(--ux-text-muted)' },
];

const SIDEBAR_COLLAPSED_KEY = 'coffice.sidebar.collapsed';

const SidebarProjectsV2 = ({ page, setPage }) => {
  const [collapsed, setCollapsed] = React.useState(() => {
    try { return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1'; } catch { return false; }
  });
  const expanded = !collapsed;
  const toggle = () => {
    setCollapsed(prev => {
      const next = !prev;
      try { localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? '1' : '0'); } catch { /* ignore */ }
      return next;
    });
  };
  const notesCount = (window.NOTES || []).length;
  const runCount = (window.RUNS || []).length;
  const runningTasks = (window.TASKS || []).filter(t => t.status === 'running').length;
  const activeRuns = (window.RUNS || []).filter(r => r.status === 'running').length;

  const badgeFor = (id) => {
    if (id === 'agents' && (window.AGENTS || []).length) return (window.AGENTS || []).length;
    if (id === 'notes' && notesCount) return notesCount;
    if (id === 'tasks' && (runningTasks || activeRuns)) return runningTasks || activeRuns;
    if (id === 'projects' && (runCount || notesCount)) return Math.min(runCount + notesCount, 99);
    if (id === 'mission-control' && (window.ACTIVITY || []).length) return Math.min((window.ACTIVITY || []).length, 99);
    return null;
  };

  return (
    <aside className={'sidebar ' + (expanded ? 'expanded' : 'collapsed')} aria-label="Primary navigation">
      <div className="brand">
        <div className="brand-mark"/>
        <div className="brand-copy">
          <div className="brand-name">C-OFFICE</div>
          <div className="brand-sub">AI Agent Hub</div>
        </div>
        <button
          type="button"
          className="sidebar-toggle"
          onClick={toggle}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >{collapsed ? '›' : '‹'}</button>
      </div>
      {UX_NAV_PROJECTS.map(n => {
        const badge = badgeFor(n.id);
        return (
          <button key={n.id} type="button" className={`nav-item ${page === n.id ? 'active' : ''}`} style={{ '--nav-color': n.color }} onClick={() => setPage(n.id)} aria-current={page === n.id ? 'page' : undefined} title={collapsed ? n.label : undefined}>
            <span className="ico">{n.icon}</span><span className="nav-label">{n.label}</span>{badge != null && <span className="badge cyan" style={{ marginLeft: 'auto', fontSize: 9 }}>{badge}</span>}
          </button>
        );
      })}
      <div className="sidebar-foot"><div className="pilot-avatar">P</div><div className="pilot-meta"><b>Commander</b><br/><span>Admin</span></div></div>
    </aside>
  );
};

window.Sidebar = SidebarProjectsV2;
