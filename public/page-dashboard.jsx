/* ===== DASHBOARD PAGE ===== */
function relTime(input) {
  if (input == null) return '';
  if (typeof input === 'string') return input;
  const dt = Date.now() - input;
  if (dt < 0) return 'now';
  const s = Math.floor(dt/1000);
  if (s < 60)   return s + 's';
  const m = Math.floor(s/60);
  if (m < 60)   return m + 'm';
  const h = Math.floor(m/60);
  if (h < 24)   return h + 'h';
  return Math.floor(h/24) + 'd';
}

const Dashboard = ({ layout, setLayout, onOpenAgent }) => {
  // live numbers come from the SSE-fed STATS object
  const totalTokens = (window.STATS?.tokensToday || 0);
  const totalCost   = (window.STATS?.spendToday || 0).toFixed(2);
  const activeTasks = (window.STATS?.tasksRunning || 0);
  const agentsOnline = (window.STATS?.agentsOnline || 0);

  // sparklines: derive a synthetic ramp from recent activity (purely cosmetic)
  const recent = ACTIVITY.slice(0, 28);
  const sparkTokens  = recent.map(r => (r?.tokens || 50)).reverse();
  const sparkSuccess = recent.map(r => r?.status === 'ok' ? 80 : 30).reverse();
  while (sparkTokens.length < 28)  sparkTokens.unshift(40);
  while (sparkSuccess.length < 28) sparkSuccess.unshift(70);

  return (
    <div>
      <div className="topbar">
        <div>
          <h1>Mission <span className="accent">Control</span></h1>
          <div className="sub">Live · {agentsOnline} online · {activeTasks} active tasks · {STATE_SESSIONS.filter(s=>!s.endedAt).length} sessions</div>
        </div>
        <div className="topbar-actions">
          <div style={{display:'flex', gap:4, background:'var(--panel)', border:'1px solid var(--border)', borderRadius: 10, padding: 3}}>
            {['overview', 'focus', 'compact'].map(l => (
              <button key={l} onClick={() => setLayout(l)}
                style={{
                  padding:'6px 12px', fontSize:11, borderRadius:7, border:'none', cursor:'pointer',
                  fontFamily:'var(--font-mono)', letterSpacing:'0.12em', textTransform:'uppercase',
                  background: layout === l ? 'linear-gradient(135deg, var(--purple), #7c3aed)' : 'transparent',
                  color: layout === l ? '#fff' : 'var(--text-3)'
                }}>{l}</button>
            ))}
          </div>
          <span className="chip"><span className="dot"/> Live</span>
        </div>
      </div>

      {/* COMMAND BAR — quick dispatch */}
      <div style={{marginBottom: 18}}>
        <CommandBar onOpenAgent={onOpenAgent}/>
      </div>

      {/* OFFICE FLOOR — every agent at a glance */}
      <div style={{marginBottom: 18}}>
        <OfficeFloor onOpenAgent={onOpenAgent}/>
      </div>

      <div className="grid" style={{gridTemplateColumns: layout === 'focus' ? '1fr 320px' : layout === 'compact' ? '1fr 1fr 1fr' : '2fr 1fr'}}>
        {/* LIVE FEED */}
        <div className="panel" style={layout === 'compact' ? {gridColumn: 'span 2'} : {}}>
          <div className="panel-head">
            <h3>Live Activity</h3>
            <div className="right"><span className="chip" style={{padding:'3px 8px', fontSize:10}}><span className="dot"/> real-time</span></div>
          </div>
          <div style={{display:'flex', flexDirection:'column', gap: 2, maxHeight: 460, overflowY:'auto'}}>
            {(() => {
              const visible = ACTIVITY.filter(r => {
                // drop noise — the "used" row already shows what happened
                if (r.verb === 'turn-end') return false;
                if (r.verb === 'spoke' && !(r.text || '').trim()) return false;
                // successful tool results with no meaningful text are redundant
                // with the preceding "used" row (Read/Edit/Write/etc.)
                if (r.verb === 'result' && r.status !== 'err' && !(r.text || '').trim()) return false;
                return true;
              });
              if (visible.length === 0) {
                return (
                  <div className="muted" style={{padding:'30px 12px', fontSize:12, textAlign:'center'}}>
                    Waiting for activity… run <code>claude</code> in any terminal.
                  </div>
                );
              }
              return visible.map((row, i) => {
              const personaId = row.personaId || row.agent;
              const agent = AGENTS.find(a => a.id === personaId);
              const statusColor = row.status === 'ok' ? 'var(--green)' : row.status === 'warn' ? 'var(--gold)' : 'var(--red)';
              const tokens = row.tokens ?? ((row.usage?.input_tokens||0)+(row.usage?.output_tokens||0));
              return (
                <div key={row.id || i} className="feed-row" onClick={() => agent && onOpenAgent(agent.id)}>
                  <div className="mono-s" style={{width: 56, color:'var(--text-4)'}}>{relTime(row.ts || row.t)}</div>
                  <AgentDot agent={agent} size={28}/>
                  <div style={{flex:1, minWidth:0}}>
                    <div style={{display:'flex', gap:6, alignItems:'baseline', flexWrap:'wrap'}}>
                      <b style={{fontSize:13}}>{agent ? agent.name : (personaId || '—')}</b>
                      <span style={{color:'var(--text-3)', fontSize:12}}>{row.verb}{row.toolName ? ` · ${row.toolName}`:''}</span>
                    </div>
                    <div style={{fontSize:12, color:'var(--text-2)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{row.text}</div>
                  </div>
                  <div style={{display:'flex', alignItems:'center', gap:8}}>
                    {tokens > 0 && <span className="mono-s" style={{color:'var(--text-3)'}}>{tokens.toLocaleString()} tok</span>}
                    <span style={{width:6, height:6, borderRadius:'50%', background: statusColor, boxShadow:`0 0 8px ${statusColor}`}}/>
                  </div>
                </div>
              );
              });
            })()}
          </div>
        </div>

        {/* ACTIVE AGENTS RAIL */}
        <div className="panel">
          <div className="panel-head">
            <h3>Active Squad</h3>
            <div className="right">{AGENTS.filter(a=>a.status==='active'||a.status==='busy').length} on mission</div>
          </div>
          <div style={{display:'flex', flexDirection:'column', gap:10}}>
            {AGENTS.filter(a => a.status === 'active' || a.status === 'busy').slice(0,5).map(a => (
              <div key={a.id} onClick={() => onOpenAgent(a.id)} style={{
                display:'flex', gap:12, padding: '10px 12px',
                background:'var(--bg-2)', borderRadius: 10,
                border:'1px solid var(--border)',
                cursor:'pointer', transition:'all 120ms',
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--border-2)'; e.currentTarget.style.background = 'var(--bg-3)'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'var(--bg-2)'; }}
              >
                <AgentDot agent={a} size={40}/>
                <div style={{flex:1, minWidth:0}}>
                  <div style={{display:'flex', gap:6, alignItems:'center', marginBottom: 2}}>
                    <b style={{fontSize:13}}>{a.name}</b>
                    <span className={`badge ${a.rarity === 'SSR' ? 'gold' : a.rarity === 'SR' ? '' : 'cyan'}`} style={{fontSize:9, padding:'1px 5px'}}>{a.rarity}</span>
                    <span style={{marginLeft:'auto', fontSize: 10, color: a.status==='busy'?'var(--gold)':'var(--green)', fontFamily:'var(--font-mono)', textTransform:'uppercase', letterSpacing:'0.12em'}}>
                      {a.status}
                    </span>
                  </div>
                  <div style={{fontSize:11, color:'var(--text-3)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>
                    {a.currentTask}
                  </div>
                  <div style={{height: 3, background:'var(--bg-0)', borderRadius:2, marginTop: 6, overflow:'hidden'}}>
                    <div style={{height:'100%', background: a.gradient, width: (a.status === 'busy' ? 80 : 45) + '%', transition: 'width 600ms ease'}}/>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {layout !== 'focus' && (
          <div className="panel" style={{gridColumn: layout === 'compact' ? 'span 3' : 'span 2'}}>
            <div className="panel-head">
              <h3>Agent Collaboration</h3>
              <div className="right">last 1h</div>
            </div>
            <CollabGraph onOpenAgent={onOpenAgent}/>
          </div>
        )}
      </div>
    </div>
  );
};

const KPI = ({ label, value, delta, spark, color }) => (
  <div className="panel" style={{padding: 16}}>
    <div className="mono-s" style={{marginBottom: 6}}>{label}</div>
    <div style={{display:'flex', alignItems:'baseline', gap:8, justifyContent:'space-between'}}>
      <div style={{fontFamily:'var(--font-display)', fontSize: 26, fontWeight: 700}}>{value}</div>
      <div style={{fontFamily:'var(--font-mono)', fontSize:11, color:'var(--text-3)'}}>{delta}</div>
    </div>
    <div style={{marginTop: 8}}><Sparkline data={spark} color={color} h={28}/></div>
  </div>
);

/* simple force-less collab graph */
const CollabGraph = ({ onOpenAgent }) => {
  const radius = 140;
  const center = { x: 260, y: 160 };
  const positions = AGENTS.map((a, i) => {
    const ang = (i / AGENTS.length) * Math.PI * 2 - Math.PI/2;
    return { ...a, x: center.x + Math.cos(ang)*radius, y: center.y + Math.sin(ang)*radius };
  });
  // edges from real session→subagent spawn relationships in last 1h
  const edges = (window.STATE_EDGES && window.STATE_EDGES.length > 0)
    ? window.STATE_EDGES
    : [];
  return (
    <svg viewBox="0 0 520 320" width="100%" height="340" style={{display:'block'}}>
      <defs>
        <linearGradient id="edge" x1="0" x2="1"><stop offset="0" stopColor="#9d5cff" stopOpacity="0.6"/><stop offset="1" stopColor="#22d3ee" stopOpacity="0.3"/></linearGradient>
      </defs>
      {edges.map(([a,b],i) => {
        const A = positions.find(p => p.id === a), B = positions.find(p => p.id === b);
        if (!A || !B) return null;
        return <line key={i} x1={A.x} y1={A.y} x2={B.x} y2={B.y} stroke="url(#edge)" strokeWidth="1.5" opacity="0.6"/>;
      })}
      {positions.map(p => (
        <g key={p.id} style={{cursor:'pointer'}} onClick={() => onOpenAgent(p.id)}>
          <circle cx={p.x} cy={p.y} r="22" fill={p.rarity==='SSR'?'#fbbf24':p.rarity==='SR'?'#9d5cff':'#22d3ee'} opacity="0.15"/>
          <circle cx={p.x} cy={p.y} r="18" fill="var(--bg-2)" stroke={p.rarity==='SSR'?'#fbbf24':p.rarity==='SR'?'#9d5cff':'#22d3ee'} strokeWidth="1.5"/>
          <text x={p.x} y={p.y} textAnchor="middle" dominantBaseline="central" style={{fontFamily:'var(--font-display)', fontSize: 11, fontWeight:700, fill:'#fff'}}>{p.avatarInitials}</text>
          <text x={p.x} y={p.y+34} textAnchor="middle" style={{fontFamily:'var(--font-mono)', fontSize: 9, letterSpacing:'0.1em', fill: 'var(--text-3)', textTransform:'uppercase'}}>{p.name}</text>
        </g>
      ))}
    </svg>
  );
};

/* ===== OFFICE FLOOR — every agent, compact, with live "working" animation ===== */
const OfficeFloor = ({ onOpenAgent }) => {
  const statusRank = { busy: 0, active: 1, idle: 2, offline: 3 };
  const rarityRank = { SSR: 0, SR: 1, R: 2, N: 3 };

  const sorted = React.useMemo(() => {
    return [...AGENTS].sort((a, b) => {
      const sa = statusRank[a.status] ?? 9;
      const sb = statusRank[b.status] ?? 9;
      if (sa !== sb) return sa - sb;
      const ra = rarityRank[a.rarity] ?? 9;
      const rb = rarityRank[b.rarity] ?? 9;
      if (ra !== rb) return ra - rb;
      return (a.name || '').localeCompare(b.name || '');
    });
  }, [AGENTS]);

  const working = AGENTS.filter(a => a.status === 'busy' || a.status === 'active').length;

  return (
    <div className="panel">
      <div className="panel-head">
        <h3>The <span className="accent">Office</span>
          <span style={{color:'var(--text-3)', fontWeight:400, fontSize:12, marginLeft:8, fontFamily:'var(--font-mono)', letterSpacing:'0.12em'}}>
            · {AGENTS.length} AGENTS
          </span>
        </h3>
        <div className="right">
          <span className="chip" style={{padding:'3px 8px', fontSize:10}}>
            <span className="dot"/> {working} working
          </span>
        </div>
      </div>

      <div className="office-floor">
        {sorted.map(a => {
          const state =
            a.status === 'busy'    ? 'busy'    :
            a.status === 'offline' ? 'offline' :
            a.status === 'idle'    ? 'idle'    :
            'active';
          const label =
            state === 'busy'    ? 'BUSY'    :
            state === 'offline' ? 'OFFLINE' :
            state === 'idle'    ? 'IDLE'    :
            'ONLINE';
          const tip = a.currentTask
            ? `${a.name} — ${a.currentTask}`
            : a.name;

          return (
            <div
              key={a.id}
              className={`office-card state-${state} rarity-${a.rarity}`}
              style={{ '--art-gradient': a.gradient }}
              onClick={() => onOpenAgent(a.id)}
              title={tip}
            >
              <div className="of-art">
                {a.image
                  ? <img src={a.image} alt={a.name}/>
                  : <div className="of-initials">{a.avatarInitials}</div>}
              </div>
              <div className="of-busy-dots"><span/><span/><span/></div>
              <div className="of-name">{a.name}</div>
              <div className="of-status">
                <span className="of-status-dot"/>
                <span>{label}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

/* ===== COMMAND BAR — quick dispatch from Dashboard ===== */
const CommandBar = ({ onOpenAgent }) => {
  const agents    = window.AGENTS    || [];
  const providers = (window.PROVIDERS?.providers) || [];
  const def       = window.PROVIDERS?.default || 'echo';

  const [text, setText] = React.useState('');
  const [agentId, setAgentId] = React.useState(() => agents[0]?.id || 'orchestra');
  const [provider, setProvider] = React.useState(def);
  const [busy, setBusy] = React.useState(false);
  const [lastResult, setLastResult] = React.useState(null);

  React.useEffect(() => {
    if (!agents.find(a => a.id === agentId) && agents[0]) setAgentId(agents[0].id);
  }, [agents.length]);

  React.useEffect(() => { if (def && !provider) setProvider(def); }, [def]);

  function dispatch() {
    if (!text.trim() || busy) return;
    setBusy(true);
    setLastResult({ ok: true, provider, output: 'Scene launched — see the dialogue overlay.' });
    // openScene will create the note + dispatch + render JRPG-style scene.
    // It runs async; we don't await so the UI feels instant.
    window.openScene({
      message: text,
      agentId,
      provider,
      title: text.slice(0, 60),
      body: text,
      tag: 'task',
    });
    setText('');
    setBusy(false);
  }

  const agent = agents.find(a => a.id === agentId);

  return (
    <div className="panel">
      <div className="panel-head">
        <h3>Command <span className="accent">Bar</span></h3>
        <div className="right">say what you want — pick an agent — run a CLI</div>
      </div>
      <div className="command-bar">
        <input
          className="note-input command-bar-input"
          placeholder="What do you want done? (e.g. 'summarize today's incidents')"
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey || !e.shiftKey)) {
              if (!e.shiftKey) { e.preventDefault(); dispatch(); }
            }
          }}
        />
        <AgentPicker agents={agents} value={agentId} onChange={setAgentId}/>
        <select className="provider-select" value={provider} onChange={e => setProvider(e.target.value)}>
          {providers.map(p => (
            <option key={p.name} value={p.name} disabled={!p.available}>
              {p.display} {p.available ? '' : '(not installed)'}
            </option>
          ))}
        </select>
        <button className="btn primary" disabled={busy || !text.trim()} onClick={dispatch}>
          {busy ? 'Running…' : '▶ Dispatch'}
        </button>
      </div>
      {lastResult && (
        <div style={{marginTop: 12, padding: 10, borderRadius: 8, background: 'var(--bg-2)', border: '1px solid var(--border)'}}>
          <div className="mono-s" style={{marginBottom: 4}}>
            {lastResult.ok ? '✓ ' : '✗ '} {lastResult.provider} → {agent?.name || agentId}
            {lastResult.noteId && (
              <span style={{marginLeft: 8}}>
                · stored as <a href="#" onClick={(e) => { e.preventDefault(); }} className="mono-s" style={{color: 'var(--cyan)'}}>note</a>
              </span>
            )}
          </div>
          <div style={{fontSize: 12, fontFamily: 'var(--font-mono)', whiteSpace: 'pre-wrap', color: 'var(--text-2)'}}>
            {lastResult.output || '(no output)'}
          </div>
        </div>
      )}
    </div>
  );
};

Object.assign(window, { Dashboard, OfficeFloor, CommandBar });
