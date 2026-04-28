/* ===== AGENT DETAIL PAGE ===== */
const AgentDetail = ({ agent, onBack, onOpenAgent }) => {
  const [tab, setTab] = React.useState('personality');
  const [flipped, setFlipped] = React.useState(false);

  const tabs = [
    { id: 'personality', label: 'Personality' },
    { id: 'skills', label: 'Skills' },
    { id: 'memory', label: 'Memory' },
    { id: 'history', label: 'History' },
  ];

  return (
    <div>
      <div style={{marginBottom: 18, display:'flex', alignItems:'center', gap:10}}>
        <button className="btn ghost" onClick={onBack} style={{padding:'6px 10px'}}>← Roster</button>
        <span className="mono-s">/ agents / {agent.id}</span>
      </div>

      <div className="grid" style={{gridTemplateColumns: '340px 1fr', gap: 24}}>
        {/* LEFT: card + quick stats */}
        <div className="stack" style={{gap: 16}}>
          <div onClick={() => setFlipped(f => !f)} style={{cursor:'pointer'}}>
            <GachaCard agent={agent} variant="foil"/>
          </div>
          <div className="mono-s" style={{textAlign:'center', color:'var(--text-4)'}}>click card to inspect · tap tabs for full profile</div>

          <div className="panel">
            <div className="panel-head"><h3>Performance</h3><div className="right">lifetime</div></div>
            <div className="grid" style={{gridTemplateColumns:'1fr 1fr', gap:10}}>
              <PerfStat label="Tasks completed" value={agent.stats.tasks}/>
              <PerfStat label="Success rate" value={agent.stats.success + '%'}/>
              <PerfStat label="Uptime" value={agent.stats.uptime}/>
              <PerfStat label="Tokens used" value={agent.stats.tokens}/>
            </div>
          </div>

          <div className="panel">
            <div className="panel-head"><h3>Current Task</h3><div className="right">{agent.status}</div></div>
            <div style={{fontSize:13, lineHeight:1.5}}>{agent.currentTask}</div>
            <div className="divider"/>
            <div className="row" style={{gap:8, flexWrap:'wrap'}}>
              {agent.traits.map(t => <span key={t} className="badge">{t}</span>)}
            </div>
            <div style={{marginTop:10}} className="mono-s">tone · {agent.tone}</div>
          </div>
        </div>

        {/* RIGHT: tabbed content */}
        <div>
          <div style={{display:'flex', gap:4, background:'var(--panel)', border:'1px solid var(--border)', borderRadius: 12, padding: 4, marginBottom: 18, width:'fit-content'}}>
            {tabs.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                style={{
                  padding:'8px 16px', fontSize:12, borderRadius:8, border:'none', cursor:'pointer',
                  fontFamily:'var(--font-mono)', letterSpacing:'0.1em', textTransform:'uppercase',
                  background: tab === t.id ? 'linear-gradient(135deg, var(--purple), #7c3aed)' : 'transparent',
                  color: tab === t.id ? '#fff' : 'var(--text-3)'
                }}>{t.label}</button>
            ))}
          </div>

          {tab === 'personality' && <PersonalityPanel agent={agent}/>}
          {tab === 'skills' && <SkillsPanel agent={agent}/>}
          {tab === 'memory' && <MemoryPanel agent={agent} onOpenAgent={onOpenAgent} compact/>}
          {tab === 'history' && <HistoryPanel agent={agent}/>}
        </div>
      </div>
    </div>
  );
};

const PerfStat = ({ label, value }) => (
  <div style={{padding:'10px 12px', background:'var(--bg-2)', borderRadius: 10, border:'1px solid var(--border)'}}>
    <div className="mono-s" style={{marginBottom:2}}>{label}</div>
    <div style={{fontFamily:'var(--font-display)', fontSize: 18, fontWeight:700}}>{value}</div>
  </div>
);

const PersonalityPanel = ({ agent }) => (
  <div className="grid" style={{gridTemplateColumns:'1fr 1fr', gap: 18}}>
    <div className="panel">
      <div className="panel-head"><h3>Personality Matrix</h3><div className="right">radar</div></div>
      <div style={{display:'flex', justifyContent:'center'}}>
        <Radar data={agent.personality} size={300} color={agent.rarity==='SSR'?'#fbbf24':'#9d5cff'}/>
      </div>
    </div>
    <div className="stack">
      <div className="panel">
        <div className="panel-head"><h3>Trait Breakdown</h3></div>
        {Object.entries(agent.personality).map(([k,v]) => (
          <div key={k} style={{marginBottom: 10}}>
            <div style={{display:'flex', justifyContent:'space-between', marginBottom: 4}}>
              <span style={{fontSize:12, textTransform:'capitalize'}}>{k}</span>
              <span className="mono-s">{v}/100</span>
            </div>
            <div style={{height: 6, background:'var(--bg-2)', borderRadius:3, overflow:'hidden'}}>
              <div style={{height:'100%', width: v + '%', background: agent.gradient, borderRadius:3}}/>
            </div>
          </div>
        ))}
      </div>
      <div className="panel">
        <div className="panel-head"><h3>Tagline</h3></div>
        <div style={{fontSize:14, lineHeight:1.5, color:'var(--text)'}}>{agent.tagline}</div>
      </div>
    </div>
  </div>
);

const SkillsPanel = ({ agent }) => {
  const cats = [...new Set(agent.skills.map(s => s.cat))];
  return (
    <div className="stack" style={{gap:14}}>
      {cats.map(c => (
        <div key={c} className="panel">
          <div className="panel-head"><h3>{c}</h3><div className="right">{agent.skills.filter(s=>s.cat===c).length} skills</div></div>
          <div className="grid" style={{gridTemplateColumns:'repeat(auto-fill, minmax(240px, 1fr))', gap:10}}>
            {agent.skills.filter(s => s.cat === c).map(s => (
              <div key={s.name} style={{padding:12, background:'var(--bg-2)', borderRadius:10, border:'1px solid var(--border)'}}>
                <div style={{display:'flex', justifyContent:'space-between', alignItems:'baseline', marginBottom: 8}}>
                  <div style={{fontSize:13, fontWeight:600}}>{s.name}</div>
                  <div className="mono" style={{fontSize:11, color:'var(--gold)'}}>Lv {s.level}</div>
                </div>
                <div style={{display:'flex', gap:3}}>
                  {Array.from({length:10}).map((_,i) => (
                    <div key={i} style={{
                      flex:1, height:4, borderRadius:2,
                      background: i < s.level ? agent.gradient : 'var(--bg-3)'
                    }}/>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};

const HistoryPanel = ({ agent }) => {
  const [items, setItems] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/agents/${agent.id}/history?limit=200`)
      .then(r => r.json())
      .then(j => { if (!cancelled) { setItems(j.items || []); setLoading(false); } })
      .catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [agent.id]);
  const fmt = (ts) => {
    if (!ts) return '—';
    const dt = Date.now() - ts;
    if (dt < 0) return 'now';
    const s = Math.floor(dt/1000);
    if (s < 60) return s + 's';
    const m = Math.floor(s/60);
    if (m < 60) return m + 'm';
    const h = Math.floor(m/60);
    if (h < 24) return h + 'h';
    return Math.floor(h/24) + 'd';
  };
  return (
    <div className="panel">
      <div className="panel-head"><h3>Mission History</h3><div className="right">{loading ? 'loading…' : `${items.length} events`}</div></div>
      <div className="stack" style={{gap:0}}>
        {!loading && items.length === 0 && <div className="muted" style={{fontSize:12, padding:'14px 4px'}}>No activity yet for {agent.name}.</div>}
        {items.map((r,i) => {
          const tokens = r.tokens ?? ((r.usage?.input_tokens||0)+(r.usage?.output_tokens||0));
          return (
            <div key={r.id || i} className="feed-row" style={{borderBottom: i < items.length-1 ? '1px solid var(--border)' : 'none'}}>
              <div className="mono-s" style={{width: 50}}>{fmt(r.ts)}</div>
              <div style={{flex:1, minWidth:0}}>
                <div style={{fontSize:13, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>
                  <span style={{color:'var(--text-3)'}}>{r.verb}{r.toolName ? ` · ${r.toolName}`:''}</span> {r.text}
                </div>
              </div>
              {tokens > 0 && <span className="mono-s">{tokens.toLocaleString()} tok</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
};

Object.assign(window, { AgentDetail, PersonalityPanel, SkillsPanel, HistoryPanel });
