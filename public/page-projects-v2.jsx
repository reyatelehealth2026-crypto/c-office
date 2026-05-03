/* Projects / Task Board V2 — project-scoped ops layer. */

const pxTime = (v) => {
  if (!v) return 'unknown';
  const ts = typeof v === 'number' ? v : Date.parse(v);
  if (!Number.isFinite(ts)) return 'recent';
  const diff = Math.max(0, Date.now() - ts);
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
};

const pxText = (x) => String(x || '').toLowerCase();
const pxProjectName = (p) => p?.name || p?.title || p?.id || 'General Ops';
const pxProjectId = (p) => p?.id || pxProjectName(p).toLowerCase().replace(/[^a-z0-9]+/g, '-');
const pxItemTitle = (t) => t?.title || t?.description || t?.goal || t?.name || t?.prompt || 'Untitled task';
const pxItemStatus = (t) => t?.status || t?.column || 'backlog';

const deriveProjects = (apiProjects) => {
  if (Array.isArray(apiProjects) && apiProjects.length) return apiProjects;
  const buckets = new Map();
  const add = (name, source, item) => {
    const key = name || 'General Ops';
    const curr = buckets.get(key) || { id: key.toLowerCase().replace(/[^a-z0-9]+/g, '-'), name: key, description: 'Auto-derived from local C-Office activity.', runs: 0, notes: 0, events: 0, updatedAt: 0 };
    curr[source] = (curr[source] || 0) + 1;
    curr.updatedAt = Math.max(curr.updatedAt || 0, item?.updatedAt || item?.createdAt || item?.ts || item?.t || 0);
    buckets.set(key, curr);
  };
  (window.RUNS || []).forEach(r => add(r.project || r.projectId || 'Atlas Runs', 'runs', r));
  (window.NOTES || []).forEach(n => add(n.project || n.projectId || 'Notes Inbox', 'notes', n));
  (window.ACTIVITY || []).forEach(e => add(e.project || e.projectId || e.cwd || 'Live Activity', 'events', e));
  if (!buckets.size) buckets.set('General Ops', { id:'general-ops', name:'General Ops', description:'Default project for C-Office work.', runs:0, notes:0, events:0, updatedAt: Date.now() });
  return Array.from(buckets.values());
};

const normalizeBoardItems = (board, project) => {
  if (Array.isArray(board?.tasks)) return board.tasks;
  if (Array.isArray(board?.items)) return board.items;
  const pId = pxProjectId(project);
  const items = [];
  (window.RUNS || []).forEach(r => items.push({ ...r, type:'run', title: r.goal || r.title, status: r.status === 'done' ? 'done' : r.status === 'failed' ? 'blocked' : 'active', projectId: r.projectId || pId }));
  (window.TASKS || []).forEach(t => items.push({ ...t, type:'task', title: t.description || t.subagent_type, status: t.status === 'done' ? 'done' : t.status === 'failed' ? 'blocked' : 'active', projectId: t.projectId || pId }));
  (window.NOTES || []).forEach(n => items.push({ ...n, type:'note', title: n.title, status: n.status === 'done' ? 'done' : n.status === 'running' ? 'active' : 'backlog', projectId: n.projectId || pId }));
  return items;
};

const PXProjectCard = ({ project, active, onClick }) => {
  return (
    <button className={'ux-project-card ' + (active ? 'is-selected' : '')} onClick={onClick}>
      <div className="ux-project-title-row"><div className="ux-project-card-name">{pxProjectName(project)}</div><UXStatusChip label={project.status || 'open'} state={project.status === 'blocked' ? 'danger' : 'active'} /></div>
      <div className="ux-project-card-desc">{project.description || project.summary || 'Project workspace for C-Office activity.'}</div>
      <div className="ux-project-meta-row">
        <span className="ux-event-tag">{project.runs || 0} runs</span>
        <span className="ux-event-tag">{project.notes || 0} notes</span>
        <span className="ux-event-tag">{project.events || 0} events</span>
        <span className="ux-event-tag">{pxTime(project.updatedAt || project.lastUpdated)}</span>
      </div>
    </button>
  );
};

const PXBoardCard = ({ item, selected, onClick }) => (
  <button className={'ux-board-card ' + (selected ? 'is-selected' : '')} onClick={onClick}>
    <div className="ux-board-card-title">{pxItemTitle(item)}</div>
    <div className="ux-board-card-body">{item.body || item.output || item.result || item.description || item.goal || 'No detail yet.'}</div>
    <div className="ux-project-meta-row"><span className="ux-event-tag">{item.type || 'task'}</span><span className="ux-event-tag">{pxTime(item.updatedAt || item.createdAt || item.ts)}</span></div>
  </button>
);

const PXInspector = ({ project, item }) => {
  const raw = item || project;
  const json = JSON.stringify(raw, null, 2);
  const copy = () => navigator.clipboard?.writeText(json).catch(() => window.prompt('Copy JSON', json));
  return (
    <section className="ux-project-panel"><div className="ux-project-head"><div className="ux-project-title-row"><h3 className="ux-project-title">Inspector</h3><button className="ux-soft-button" onClick={copy}>Copy JSON</button></div><div className="ux-project-subtitle">{item ? 'Selected board item' : 'Selected project'}</div></div><div className="ux-project-body ux-project-inspector">
      <div className="ux-project-detail-grid">
        <div className="ux-project-detail-cell"><label>Name</label><b>{item ? pxItemTitle(item) : pxProjectName(project)}</b></div>
        <div className="ux-project-detail-cell"><label>Status</label><b>{item ? pxItemStatus(item) : project?.status || 'open'}</b></div>
        <div className="ux-project-detail-cell"><label>Type</label><b>{item?.type || 'project'}</b></div>
        <div className="ux-project-detail-cell"><label>Updated</label><b>{pxTime(item?.updatedAt || item?.createdAt || project?.updatedAt)}</b></div>
      </div>
      <pre className="ux-result-box">{json}</pre>
    </div></section>
  );
};

const ProjectsPageV2 = () => {
  window.useCOfficeRefresh?.();
  const [projectsRaw, setProjectsRaw] = React.useState([]);
  const [board, setBoard] = React.useState(null);
  const [query, setQuery] = React.useState('');
  const [activeId, setActiveId] = React.useState(null);
  const [selectedItem, setSelectedItem] = React.useState(null);
  const refresh = React.useCallback(() => {
    fetch('/api/projects').then(r => r.json()).then(j => setProjectsRaw(Array.isArray(j.projects) ? j.projects : Array.isArray(j) ? j : [])).catch(() => setProjectsRaw([]));
    fetch('/api/task-board').then(r => r.json()).then(setBoard).catch(() => setBoard(null));
  }, []);
  React.useEffect(() => { refresh(); }, [refresh]);

  const projects = deriveProjects(projectsRaw).filter(p => !query || JSON.stringify(p).toLowerCase().includes(query.toLowerCase()));
  const active = projects.find(p => pxProjectId(p) === activeId) || projects[0] || null;
  React.useEffect(() => { if (!activeId && projects[0]) setActiveId(pxProjectId(projects[0])); }, [projects.length, activeId]);
  const items = normalizeBoardItems(board, active).filter(t => !active || !t.projectId || t.projectId === pxProjectId(active) || !projectsRaw.length);
  const columns = [
    { id:'backlog', label:'Backlog' },
    { id:'active', label:'Active' },
    { id:'blocked', label:'Blocked' },
    { id:'done', label:'Done' },
  ];
  const colItems = (id) => items.filter(t => {
    const s = pxItemStatus(t);
    if (id === 'backlog') return ['backlog','idea','queued','open','todo'].includes(s);
    if (id === 'active') return ['active','running','in_progress'].includes(s);
    if (id === 'blocked') return ['blocked','failed','error'].includes(s);
    if (id === 'done') return ['done','complete','completed','archived'].includes(s);
    return false;
  });
  const activities = (window.ACTIVITY || []).slice(0, 6);

  return (
    <div className="ux-projects">
      <section className="ux-project-toolbar"><input className="ux-project-search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search projects, cwd, notes, runs..."/><button className="ux-soft-button" onClick={refresh}>Refresh</button></section>

      <aside className="ux-project-panel ux-project-list"><div className="ux-project-head"><div className="ux-project-title-row"><h3 className="ux-project-title">Projects</h3><UXStatusChip label={`${projects.length}`} state={projects.length ? 'active' : 'muted'} /></div><div className="ux-project-subtitle">Project cards derived from API data or live local activity.</div></div><div className="ux-project-body">{projects.length ? projects.map(p => <PXProjectCard key={pxProjectId(p)} project={p} active={pxProjectId(active) === pxProjectId(p)} onClick={() => { setActiveId(pxProjectId(p)); setSelectedItem(null); }} />) : <UXEmptyState title="No projects" body="Runs, notes, or project API data will appear here." />}</div></aside>

      <main className="ux-project-main">
        <div className="ux-project-metrics"><UXMetricCard label="Tasks" value={items.length} note="scoped board" color="var(--ux-accent-secondary)"/><UXMetricCard label="Runs" value={items.filter(i => i.type === 'run').length} note="workflows" color="var(--ux-accent-pink)"/><UXMetricCard label="Notes" value={items.filter(i => i.type === 'note').length} note="context" color="var(--ux-accent-gold)"/><UXMetricCard label="Activity" value={activities.length} note="recent feed" color="var(--ux-success)"/></div>
        <section className="ux-project-panel"><div className="ux-project-head"><div className="ux-project-title-row"><h3 className="ux-project-title">{pxProjectName(active)}</h3><UXStatusChip label={active?.status || 'open'} state="active" /></div><div className="ux-project-subtitle">{active?.description || active?.summary || 'Scoped board for project work.'}</div></div><div className="ux-project-body"><div className="ux-board">{columns.map(c => { const list = colItems(c.id); return <div className="ux-board-column" key={c.id}><div className="ux-board-column-head"><div className="ux-board-column-title">{c.label}</div><UXStatusChip label={`${list.length}`} state={list.length ? 'active' : 'muted'} /></div>{list.length ? list.map(item => <PXBoardCard key={`${item.type}-${item.id || pxItemTitle(item)}`} item={item} selected={selectedItem === item} onClick={() => setSelectedItem(item)} />) : <UXEmptyState title="Empty" body="No cards in this lane." />}</div>; })}</div></div></section>
        <section className="ux-project-panel"><div className="ux-project-head"><h3 className="ux-project-title">Recent activity</h3><div className="ux-project-subtitle">Latest live events attached to the workspace.</div></div><div className="ux-project-body ux-activity-mini-list">{activities.length ? activities.map((a,i) => <div className="ux-activity-mini" key={a.id || i}><div className="ux-activity-mini-title">{a.persona || a.agent || a.source || 'System'} · {a.type || a.event || 'event'}</div><div className="ux-activity-mini-body">{a.summary || a.message || a.text || JSON.stringify(a).slice(0, 160)}</div></div>) : <UXEmptyState title="No activity" body="Live events will appear when hooks fire." />}</div></section>
        <PXInspector project={active} item={selectedItem}/>
      </main>
    </div>
  );
};

window.ProjectsPage = ProjectsPageV2;
