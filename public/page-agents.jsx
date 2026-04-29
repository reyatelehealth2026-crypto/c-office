/* ====== AGENTS ROSTER PAGE — Professional Role Categories ====== */

/* Agent role to professional category mapping */
const AGENT_CATEGORIES = {
  marketing:   { icon: '📊', label: 'Marketing',   ids: ['nana', 'mira'] },
  development: { icon: '💻', label: 'Development',  ids: ['emi', 'vex', 'kai'] },
  research:    { icon: '🔬', label: 'Research',     ids: ['nyx'] },
  content:     { icon: '✍️', label: 'Content',      ids: ['luna', 'lumen', 'astra'] },
  creative:    { icon: '🎨', label: 'Creative',     ids: ['echo'] },
  ops:         { icon: '🛰️', label: 'Operations',   ids: ['orbit'] },
};

const getCategoryForAgent = (agentId) => {
  for (const [catKey, cat] of Object.entries(AGENT_CATEGORIES)) {
    if (cat.ids.includes(agentId)) return catKey;
  }
  return 'ops';
};

const AgentsPage = ({ onOpenAgent, setPage }) => {
  const [filter, setFilter] = React.useState('ALL');
  const agents = window.AGENTS || [];

  const categories = ['ALL', ...Object.keys(AGENT_CATEGORIES)];
  const categoryLabels = { ALL: 'All' };
  Object.entries(AGENT_CATEGORIES).forEach(([k, v]) => { categoryLabels[k] = v.label; });

  // Filter agents
  const filtered = filter === 'ALL' ? agents : agents.filter(a => getCategoryForAgent(a.id) === filter);

  // Separate orchestra (lead) from the rest
  const maestro = filtered.find(a => a.id === 'orchestra');
  const crew = filtered.filter(a => a.id !== 'orchestra');

  // Group crew by category
  const grouped = {};
  crew.forEach(a => {
    const cat = getCategoryForAgent(a.id);
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(a);
  });

  return (
    <div>
      <div className="topbar">
        <div>
          <h1>Agent <span className="accent">Hub</span></h1>
          <div className="sub">{agents.length} agents · View your team by professional role</div>
        </div>
        <div className="topbar-actions">
          <span className="chip"><span className="dot"/> {agents.filter(a=>a.status!=='offline').length} online</span>
          <button className="btn gold" onClick={() => setPage && setPage('shop')}>Shop</button>
        </div>
      </div>

      {/* Category filters */}
      <div style={{display:'flex', gap: 6, alignItems:'center', marginBottom: 20, flexWrap:'wrap'}}>
        {categories.map(c => (
          <button key={c} className="btn" onClick={() => setFilter(c)}
            style={{
              padding: '6px 12px', fontSize: 12,
              borderColor: filter === c ? 'var(--coral)' : 'var(--border)',
              background: filter === c ? 'rgba(255,107,107,0.1)' : 'var(--panel)',
              color: filter === c ? '#fff' : 'var(--text-2)',
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
            {c !== 'ALL' && AGENT_CATEGORIES[c] && <span>{AGENT_CATEGORIES[c].icon}</span>}
            {categoryLabels[c]}
            {c !== 'ALL' && <span className="mono-s" style={{marginLeft: 2}}>{agents.filter(a => getCategoryForAgent(a.id) === c).length}</span>}
          </button>
        ))}
      </div>

      {/* Lead Orchestrator */}
      {maestro && (
        <div style={{marginBottom: 26}}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: '280px 1fr',
            gap: 22,
            alignItems: 'center',
            padding: 20,
            background: 'linear-gradient(110deg, rgba(255,107,107,0.06), rgba(78,205,196,0.04))',
            border: '1px solid rgba(255,107,107,0.2)',
            borderRadius: 14,
          }}>
            <div onClick={() => onOpenAgent(maestro.id)} style={{cursor: 'pointer'}}>
              <AgentCard agent={maestro} onClick={() => onOpenAgent(maestro.id)}/>
            </div>
            <div>
              <h2 style={{fontSize: 24, marginBottom: 4}}>{maestro.name}</h2>
              <div className="mono-s" style={{letterSpacing:'0.16em', color:'var(--coral)', marginBottom: 10}}>
                {maestro.role} — Lead Orchestrator
              </div>
              <div style={{fontSize: 13, lineHeight: 1.6, color:'var(--text-2)', maxWidth: 560, marginBottom: 12}}>
                {maestro.tagline}
              </div>
              <div style={{display:'flex', gap:6, flexWrap:'wrap'}}>
                {maestro.traits.map(t => <span key={t} className="badge gold">{t}</span>)}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Grouped agent cards */}
      {Object.entries(grouped).map(([catKey, catAgents]) => {
        const cat = AGENT_CATEGORIES[catKey];
        if (!cat || catAgents.length === 0) return null;
        return (
          <div key={catKey} className="category-section">
            <div className="category-header">
              <span className="cat-icon">{cat.icon}</span>
              <span className="cat-name">{cat.label}</span>
              <span className="cat-count">{catAgents.length} agents</span>
            </div>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
              gap: 10,
            }}>
              {catAgents.map(a => (
                <AgentCard key={a.id} agent={a} onClick={() => onOpenAgent(a.id)}/>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
};

Object.assign(window, { Sidebar, AgentsPage });
