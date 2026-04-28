/* ====== SIDEBAR / SHELL ====== */
const NAV = [
  { id: 'dashboard', label: 'Dashboard', icon: '▤', group: 'Overview' },
  { id: 'agents', label: 'Agents', icon: '◆', group: 'Overview' },
  { id: 'notes', label: 'Notes', icon: '✎', group: 'Overview' },
  { id: 'tasks', label: 'Mission Log', icon: '▷', group: 'Operations' },
  { id: 'skills', label: 'Skills', icon: '✦', group: 'Operations' },
  { id: 'memory', label: 'Memory Graph', icon: '◎', group: 'Operations' },
  { id: 'adventure', label: 'Adventure', icon: '⚔', group: 'Operations' },
  { id: 'settings', label: 'Settings', icon: '⚙', group: 'System' },
];

const Sidebar = ({ page, setPage }) => {
  const groups = [...new Set(NAV.map(n => n.group))];
  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark"/>
        <div>
          <div className="brand-name">C-OFFICE</div>
          <div className="brand-sub">Agent Orchestration</div>
        </div>
      </div>
      {groups.map(g => (
        <React.Fragment key={g}>
          <div className="nav-group-label">{g}</div>
          {NAV.filter(n => n.group === g).map(n => (
            <div key={n.id}
              className={`nav-item ${page === n.id ? 'active' : ''}`}
              onClick={() => setPage(n.id)}>
              <span className="ico" style={{fontSize:14}}>{n.icon}</span>
              <span>{n.label}</span>
              {n.id === 'agents' && <span className="badge" style={{marginLeft:'auto', fontSize:9}}>{AGENTS.length}</span>}
              {n.id === 'notes' && (window.NOTES?.length || 0) > 0 && (
                <span className="badge cyan" style={{marginLeft:'auto', fontSize:9}}>{window.NOTES.length}</span>
              )}
              {n.id === 'tasks' && TASKS.filter(t=>t.status==='running').length > 0 && (
                <span className="badge gold" style={{marginLeft:'auto', fontSize:9}}>{TASKS.filter(t=>t.status==='running').length}</span>
              )}
            </div>
          ))}
        </React.Fragment>
      ))}
      <div className="sidebar-foot">
        <div className="pilot-avatar">P</div>
        <div className="pilot-meta">
          <b>Pilot</b><br/><span>Commander</span>
        </div>
      </div>
    </aside>
  );
};

/* ====== AGENTS ROSTER PAGE ====== */
const AgentsPage = ({ onOpenAgent }) => {
  const [filter, setFilter] = React.useState('ALL');
  const filtered = filter === 'ALL' ? AGENTS : AGENTS.filter(a => a.rarity === filter);
  const rarities = ['ALL', 'SSR', 'SR', 'R'];

  // maestro pinned at top
  const maestro = filtered.find(a => a.id === 'orchestra');
  const crew = filtered.filter(a => a.id !== 'orchestra');

  return (
    <div>
      <div className="topbar">
        <div>
          <h1><span className="accent">Agent</span> Roster</h1>
          <div className="sub">{AGENTS.length} agents · summon a new unit to expand your crew</div>
        </div>
        <div className="topbar-actions">
          <span className="chip"><span className="dot"/> {AGENTS.filter(a=>a.status!=='offline').length} online</span>
          <button className="btn gold">＋ Summon</button>
        </div>
      </div>

      {/* filters */}
      <div style={{display:'flex', gap: 20, alignItems:'center', marginBottom: 20, flexWrap:'wrap'}}>
        <div style={{display:'flex', gap:6}}>
          {rarities.map(r => (
            <button key={r} className="btn" onClick={() => setFilter(r)}
              style={{
                padding: '6px 12px', fontSize: 12,
                borderColor: filter === r ? 'var(--purple)' : 'var(--border)',
                background: filter === r ? 'rgba(157,92,255,0.12)' : 'var(--panel)',
                color: filter === r ? '#fff' : 'var(--text-2)'
              }}>{r}</button>
          ))}
        </div>
      </div>

      {maestro && (
        <div style={{marginBottom: 26}}>
          <div className="mono-s" style={{marginBottom: 10, letterSpacing:'0.2em', color:'var(--gold)'}}>★ MAESTRO — LEAD CONDUCTOR</div>
          <div style={{display:'grid', gridTemplateColumns:'260px 1fr', gap:22, alignItems:'center', padding: 20, background:'linear-gradient(110deg, rgba(251,191,36,0.08), rgba(157,92,255,0.06))', border:'1px solid rgba(251,191,36,0.25)', borderRadius: 18}}>
            <GachaCard agent={maestro} onClick={() => onOpenAgent(maestro.id)}/>
            <div>
              <h2 style={{fontSize: 28, marginBottom: 6}}>{maestro.name}</h2>
              <div className="mono-s" style={{letterSpacing:'0.18em', color:'var(--gold)', marginBottom: 12}}>{maestro.role}</div>
              <div style={{fontSize: 14, lineHeight: 1.6, color:'var(--text-2)', maxWidth: 560, marginBottom: 14}}>{maestro.tagline}</div>
              <div style={{display:'flex', gap:8, flexWrap:'wrap'}}>
                {maestro.traits.map(t => <span key={t} className="badge gold">{t}</span>)}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="mono-s" style={{marginBottom: 10, letterSpacing:'0.2em'}}>CREW · {crew.length}</div>
      <div className="card-grid">
        {crew.map(a => (
          <GachaCard key={a.id} agent={a} onClick={() => onOpenAgent(a.id)}/>
        ))}
      </div>
    </div>
  );
};

Object.assign(window, { Sidebar, AgentsPage });
