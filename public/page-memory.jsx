/* ===== MEMORY GRAPH PAGE ===== */
const catColor = {
  project: '#fbbf24', topic: '#9d5cff', fact: '#22d3ee',
  design: '#f472b6', pref: '#34d399', idea: '#fb923c',
  insight: '#60a5fa', intel: '#ef4444', rule: '#94a3b8', persona: '#c084fc',
};

const MemoryPanel = ({ agent, onOpenAgent, compact }) => {
  const [selected, setSelected] = React.useState(null);
  const nodes = agent ? MEMORY_NODES.filter(n => n.agent === agent.id) : MEMORY_NODES;
  const nodeIds = new Set(nodes.map(n => n.id));
  const edges = MEMORY_EDGES.filter(([a,b]) => nodeIds.has(a) && nodeIds.has(b));
  const W = 100, H = 100;

  const [agentFilter, setAgentFilter] = React.useState('ALL');
  const filteredNodes = agentFilter === 'ALL' ? nodes : nodes.filter(n => n.agent === agentFilter);
  const filteredIds = new Set(filteredNodes.map(n => n.id));
  const filteredEdges = edges.filter(([a,b]) => filteredIds.has(a) && filteredIds.has(b));

  return (
    <div className={compact ? '' : 'stack'} style={{gap:14}}>
      {!compact && (
        <div className="topbar">
          <div>
            <h1>Memory <span className="accent">Graph</span></h1>
            <div className="sub">{MEMORY_NODES.length} nodes · {MEMORY_EDGES.length} links · shared across agents</div>
          </div>
          <div className="topbar-actions">
            <select value={agentFilter} onChange={e=>setAgentFilter(e.target.value)}
              style={{background:'var(--panel)', border:'1px solid var(--border)', borderRadius:10, padding:'8px 12px', color:'var(--text)', fontFamily:'var(--font-body)', fontSize:13}}>
              <option value="ALL">All agents</option>
              {AGENTS.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
        </div>
      )}

      <div className="grid" style={{gridTemplateColumns: compact ? '1fr' : '1fr 300px', gap:14}}>
        <div className="panel" style={{padding:0, overflow:'hidden', minHeight: 500, background:'radial-gradient(circle at 50% 50%, rgba(157,92,255,0.08), transparent 70%), var(--panel)'}}>
          <div style={{position:'absolute', top:14, left:14, zIndex:2}}>
            <div className="mono-s" style={{letterSpacing:'0.2em'}}>KNOWLEDGE NODES</div>
            <div style={{fontFamily:'var(--font-display)', fontSize:18, fontWeight:700}}>{filteredNodes.length} <span style={{color:'var(--text-3)', fontSize:12, fontWeight:400}}>nodes</span></div>
          </div>

          <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={compact ? 400 : 560} style={{display:'block'}} preserveAspectRatio="xMidYMid meet">
            <defs>
              <radialGradient id="glow" cx="50%" cy="50%">
                <stop offset="0%" stopColor="#fff" stopOpacity="0.8"/>
                <stop offset="100%" stopColor="#fff" stopOpacity="0"/>
              </radialGradient>
            </defs>
            {filteredEdges.map(([a,b],i) => {
              const A = nodes.find(n=>n.id===a), B = nodes.find(n=>n.id===b);
              if (!A || !B) return null;
              const active = selected && (selected === a || selected === b);
              return <line key={i} x1={A.x} y1={A.y} x2={B.x} y2={B.y}
                stroke={active ? '#fbbf24' : 'rgba(157,92,255,0.35)'}
                strokeWidth={active ? 0.35 : 0.2}
                />;
            })}
            {filteredNodes.map(n => {
              const col = catColor[n.cat] || '#9d5cff';
              const r = n.size/4;
              const active = selected === n.id;
              return (
                <g key={n.id} style={{cursor:'pointer'}} onClick={() => setSelected(n.id)}>
                  <circle cx={n.x} cy={n.y} r={r*1.8} fill={col} opacity={active ? 0.3 : 0.12}/>
                  <circle cx={n.x} cy={n.y} r={r} fill={col} stroke="#fff" strokeWidth={active ? 0.4 : 0.2} strokeOpacity="0.5"/>
                  <text x={n.x} y={n.y + r + 1.8} textAnchor="middle"
                    style={{fontFamily:'var(--font-body)', fontSize: 1.8, fill: active ? '#fff' : 'var(--text-2)', pointerEvents:'none'}}>
                    {n.label}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>

        <div className="panel">
          <div className="panel-head"><h3>Node Details</h3></div>
          {selected ? (() => {
            const n = MEMORY_NODES.find(x => x.id === selected);
            const ag = AGENTS.find(a => a.id === n.agent);
            const connected = MEMORY_EDGES
              .filter(([a,b]) => a === n.id || b === n.id)
              .map(([a,b]) => MEMORY_NODES.find(x => x.id === (a === n.id ? b : a)));
            return (
              <div>
                <span className="badge" style={{background: `${catColor[n.cat]}22`, color: catColor[n.cat], borderColor: `${catColor[n.cat]}55`}}>{n.cat}</span>
                <div style={{fontSize:18, fontWeight:600, margin:'10px 0 6px'}}>{n.label}</div>
                <div className="row" style={{gap:8, marginBottom: 14}} onClick={() => onOpenAgent && onOpenAgent(ag.id)}>
                  <AgentDot agent={ag} size={24}/>
                  <div style={{fontSize:12}}>created by <b>{ag.name}</b></div>
                </div>
                <div className="divider"/>
                <div className="mono-s" style={{marginBottom:8}}>CONNECTED · {connected.length}</div>
                <div className="stack" style={{gap:6}}>
                  {connected.map(c => (
                    <div key={c.id} onClick={()=>setSelected(c.id)} style={{padding:'6px 10px', background:'var(--bg-2)', borderRadius:6, fontSize:12, cursor:'pointer', border:'1px solid var(--border)'}}>
                      <span style={{color: catColor[c.cat], marginRight:6}}>●</span>{c.label}
                    </div>
                  ))}
                </div>
              </div>
            );
          })() : (
            <div className="muted" style={{fontSize:12}}>Click a node in the graph to see details and connections.</div>
          )}

          <div className="divider"/>
          <div className="mono-s" style={{marginBottom:8}}>LEGEND</div>
          <div className="grid" style={{gridTemplateColumns:'1fr 1fr', gap:6}}>
            {Object.entries(catColor).map(([k,c]) => (
              <div key={k} style={{display:'flex', gap:6, alignItems:'center', fontSize:11}}>
                <span style={{width:8, height:8, borderRadius:'50%', background:c}}/>
                <span style={{textTransform:'capitalize'}}>{k}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

/* ===== SKILLS PAGE (all agents) ===== */
const SkillsPage = ({ onOpenAgent }) => {
  return (
    <div>
      <div className="topbar">
        <div>
          <h1>Crew <span className="accent">Skills</span></h1>
          <div className="sub">Aggregated skill matrix across all agents</div>
        </div>
      </div>
      <div className="stack" style={{gap:14}}>
        {AGENTS.map(a => (
          <div key={a.id} className="panel">
            <div style={{display:'flex', gap:14, alignItems:'center', marginBottom: 14}}>
              <AgentDot agent={a} size={44}/>
              <div style={{flex:1}}>
                <div style={{display:'flex', gap:8, alignItems:'baseline'}}>
                  <h3 style={{fontSize:16}}>{a.name}</h3>
                  <span className={`badge ${a.rarity === 'SSR' ? 'gold' : a.rarity === 'SR' ? '' : 'cyan'}`}>{a.rarity}</span>
                  <span className="mono-s">· {a.role}</span>
                </div>
                <div className="mono-s">Lv {a.level} · {a.skills.length} skills</div>
              </div>
              <button className="btn" onClick={()=>onOpenAgent(a.id)} style={{padding:'6px 12px', fontSize:12}}>View detail →</button>
            </div>
            <div className="grid" style={{gridTemplateColumns:'repeat(auto-fill, minmax(200px, 1fr))', gap:8}}>
              {a.skills.map(s => (
                <div key={s.name} style={{padding:'8px 10px', background:'var(--bg-2)', borderRadius:8, border:'1px solid var(--border)'}}>
                  <div style={{display:'flex', justifyContent:'space-between', fontSize:12, marginBottom:5}}>
                    <span style={{fontWeight:500}}>{s.name}</span>
                    <span className="mono" style={{color:'var(--gold)'}}>{s.level}</span>
                  </div>
                  <div style={{display:'flex', gap:2}}>
                    {Array.from({length:10}).map((_,i) => (
                      <div key={i} style={{flex:1, height:3, borderRadius:1.5, background: i < s.level ? a.gradient : 'var(--bg-3)'}}/>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

Object.assign(window, { MemoryPanel, SkillsPage });
