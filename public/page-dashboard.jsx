/* ===== DASHBOARD PAGE — Warm Professional AI Agent Hub ===== */
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

const CLI_PROVIDERS = [
  { id: 'claude', label: 'Claude Code', command: 'claude', hint: 'Claude Code CLI session' },
  { id: 'codex', label: 'Codex CLI', command: 'codex', hint: 'OpenAI Codex compatible CLI' },
  { id: 'gpt', label: 'GPT CLI', command: 'gpt', hint: 'Generic GPT terminal CLI' },
];

function shellQuote(s) {
  return "'" + String(s || '').replace(/'/g, "'\\''") + "'";
}

function providerCommand(provider, agent, prompt) {
  const p = CLI_PROVIDERS.find(x => x.id === provider) || CLI_PROVIDERS[0];
  const personaLine = agent ? `Act as ${agent.name}, ${agent.role}. ` : '';
  const body = `${personaLine}${prompt || 'Describe the mission here.'}`.trim();
  if (p.id === 'claude') return `${p.command} ${shellQuote(body)}`;
  if (p.id === 'codex') return `${p.command} exec ${shellQuote(body)}`;
  return `${p.command} ${shellQuote(body)}`;
}

async function writeClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (e) {
    window.prompt('Copy command', text);
    return false;
  }
}

/* Server-side multi-agent run */
const SendToOrchestra = () => {
  const [goal, setGoal] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [authStatus, setAuthStatus] = React.useState(null);
  const [runs, setRuns] = React.useState(window.RUNS || []);

  React.useEffect(() => {
    fetch('/api/auth/status').then(r => r.json()).then(setAuthStatus).catch(()=>{});
    fetch('/api/tasks').then(r => r.json()).then(j => setRuns(j.runs || [])).catch(()=>{});
    const refresh = () => {
      setRuns(window.RUNS || []);
      if (window.AUTH_STATUS) setAuthStatus(window.AUTH_STATUS);
    };
    window.COfficeBus?.addEventListener('refresh', refresh);
    return () => window.COfficeBus?.removeEventListener('refresh', refresh);
  }, []);

  const connected = !!authStatus?.anthropic?.connected;

  const submit = async () => {
    if (!goal.trim() || busy) return;
    setBusy(true);
    try {
      const r = await fetch('/api/task', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ goal: goal.trim() }),
      });
      const j = await r.json();
      if (!r.ok) {
        alert(j.error || 'Failed to start run');
      } else {
        setGoal('');
        setRuns(prev => [{ id: j.run_id, goal: goal.trim(), status: 'running', steps: [], startedAt: Date.now() }, ...prev]);
      }
    } finally { setBusy(false); }
  };

  const liveRun = runs.find(r => r.status === 'running') || runs[0];

  return (
    <div className="task-bar">
      <div className="task-bar-icon">⚡</div>
      <input
        type="text"
        value={goal}
        onChange={e => setGoal(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') submit(); }}
        disabled={!connected || busy}
        placeholder={connected ? 'สั่งงานเอเจนท์... เช่น Research 2026 AI trends and draft a post' : 'Connect Anthropic in Settings first'}
      />
      <button className="btn-primary-task"
        onClick={submit} disabled={!connected || busy || !goal.trim()}>
        {busy ? 'Sending...' : 'Send'}
      </button>
      {liveRun && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '6px 12px',
          background: 'var(--bg-2)',
          borderRadius: 8,
          border: '1px solid var(--border)',
          fontSize: 11,
          fontFamily: 'var(--font-mono)',
          color: 'var(--text-2)',
          maxWidth: 300,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          <span style={{color: liveRun.status === 'running' ? 'var(--gold)' : 'var(--green)'}}>●</span>
          {liveRun.goal?.slice(0, 40)}...
        </div>
      )}
    </div>
  );
};

const Dashboard = ({ layout, setLayout, onOpenAgent }) => {
  const totalTokens = (window.STATS?.tokensToday || 0);
  const totalCost   = (window.STATS?.spendToday || 0).toFixed(2);
  const activeTasks = (window.STATS?.tasksRunning || 0);
  const agentsOnline = (window.STATS?.agentsOnline || 0);

  return (
    <div>
      <div className="topbar">
        <div>
          <h1>Mission <span className="accent">Control</span></h1>
          <div className="sub">Live · {agentsOnline} online · {activeTasks} active tasks · {STATE_SESSIONS.filter(s=>!s.endedAt).length} sessions</div>
        </div>
        <div className="topbar-actions">
          <span className="chip"><span className="dot"/> Live</span>
        </div>
      </div>

      {/* QUICK TASK BAR */}
      <SendToOrchestra/>

      {/* STATS STRIP */}
      <div className="stats-strip">
        <div className="stat-card">
          <div className="stat-icon tokens">🔥</div>
          <div>
            <div className="stat-value">{totalTokens.toLocaleString()}</div>
            <div className="stat-label">Tokens today</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon tasks">📋</div>
          <div>
            <div className="stat-value">{activeTasks}</div>
            <div className="stat-label">Running tasks</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon agents">👥</div>
          <div>
            <div className="stat-value">{agentsOnline}</div>
            <div className="stat-label">Agents online</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon spend">💰</div>
          <div>
            <div className="stat-value">${totalCost}</div>
            <div className="stat-label">Spend today</div>
          </div>
        </div>
      </div>

      {/* AGENT WORKSPACE */}
      <div style={{marginBottom: 18}}>
        <AgentWorkspace onOpenAgent={onOpenAgent}/>
      </div>

      <div className="grid" style={{gridTemplateColumns: '2fr 1fr'}}>
        {/* LIVE FEED */}
        <div className="panel">
          <div className="panel-head">
            <h3>Live Activity</h3>
            <div className="right"><span className="chip" style={{padding:'3px 8px', fontSize:10}}><span className="dot"/> real-time</span></div>
          </div>
          <div style={{display:'flex', flexDirection:'column', gap: 2, maxHeight: 460, overflowY:'auto'}}>
            {(() => {
              const visible = ACTIVITY.filter(r => {
                if (r.verb === 'turn-end') return false;
                if (r.verb === 'spoke' && !(r.text || '').trim()) return false;
                if (r.verb === 'result' && r.status !== 'err' && !(r.text || '').trim()) return false;
                return true;
              });
              if (visible.length === 0) {
                return (
                  <div className="muted" style={{padding:'30px 12px', fontSize:12, textAlign:'center'}}>
                    Waiting for activity... run <code>claude</code> in any terminal.
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

        {/* ACTIVE AGENTS */}
        <div className="panel">
          <div className="panel-head">
            <h3>Active Agents</h3>
            <div className="right">{AGENTS.filter(a=>a.status==='active'||a.status==='busy').length} online</div>
          </div>
          <div style={{display:'flex', flexDirection:'column', gap:8}}>
            {AGENTS.filter(a => a.status === 'active' || a.status === 'busy').slice(0,6).map(a => (
              <AgentCard key={a.id} agent={a} compact onClick={() => onOpenAgent(a.id)}/>
            ))}
            {AGENTS.filter(a => a.status === 'active' || a.status === 'busy').length === 0 && (
              <div className="muted" style={{fontSize:12, padding:'20px 4px', textAlign:'center'}}>
                No active agents right now
              </div>
            )}
          </div>
        </div>

        {/* COLLABORATION GRAPH */}
        <div className="panel" style={{gridColumn: 'span 2'}}>
          <div className="panel-head">
            <h3>Agent Collaboration</h3>
            <div className="right">last 1h</div>
          </div>
          <CollabGraph onOpenAgent={onOpenAgent}/>
        </div>
      </div>
    </div>
  );
};

/* ===== AGENT WORKSPACE — renamed OfficeFloor ===== */
const AgentWorkspace = ({ onOpenAgent }) => {
  const statusRank = { busy: 0, active: 1, idle: 2, offline: 3 };

  const sorted = React.useMemo(() => {
    return [...AGENTS].sort((a, b) => {
      const sa = statusRank[a.status] ?? 9;
      const sb = statusRank[b.status] ?? 9;
      if (sa !== sb) return sa - sb;
      return (a.name || '').localeCompare(b.name || '');
    });
  }, [AGENTS]);

  const working = AGENTS.filter(a => a.status === 'busy' || a.status === 'active').length;

  return (
    <div className="panel">
      <div className="panel-head">
        <h3>Agent <span className="accent">Workspace</span>
          <span style={{color:'var(--text-3)', fontWeight:400, fontSize:11, marginLeft:8, fontFamily:'var(--font-mono)', letterSpacing:'0.1em'}}>
            · {AGENTS.length} AGENTS
          </span>
        </h3>
        <div className="right">
          <span className="chip" style={{padding:'3px 8px', fontSize:10}}>
            <span className="dot"/> {working} working
          </span>
        </div>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
        gap: 10,
      }}>
        {sorted.map(a => {
          const state =
            a.status === 'busy'    ? 'busy'    :
            a.status === 'offline' ? 'offline' :
            a.status === 'idle'    ? 'idle'    :
            'active';
          const label =
            state === 'busy'    ? 'Working'  :
            state === 'offline' ? 'Offline'  :
            state === 'idle'    ? 'Idle'     :
            'Online';
          const statusColor = state === 'busy' ? 'var(--gold)' : state === 'active' ? 'var(--green)' : 'var(--text-4)';

          return (
            <div
              key={a.id}
              onClick={() => onOpenAgent(a.id)}
              title={a.currentTask ? `${a.name} — ${a.currentTask}` : a.name}
              style={{
                position: 'relative',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                padding: '14px 8px 10px',
                borderRadius: 10,
                border: `1px solid ${state === 'active' ? 'rgba(46,204,113,0.3)' : state === 'busy' ? 'rgba(240,180,41,0.3)' : 'var(--border)'}`,
                background: 'var(--bg-2)',
                cursor: 'pointer',
                transition: 'all 160ms ease',
                opacity: state === 'offline' ? 0.4 : 1,
              }}
              onMouseEnter={e => {
                e.currentTarget.style.borderColor = 'var(--border-2)';
                e.currentTarget.style.transform = 'translateY(-2px)';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.borderColor = state === 'active' ? 'rgba(46,204,113,0.3)' : state === 'busy' ? 'rgba(240,180,41,0.3)' : 'var(--border)';
                e.currentTarget.style.transform = 'translateY(0)';
              }}
            >
              <div style={{
                width: 44, height: 44, borderRadius: 10, overflow: 'hidden',
                background: a.gradient || 'var(--bg-3)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                marginBottom: 8,
                boxShadow: state === 'busy' ? '0 0 12px rgba(240,180,41,0.3)' : state === 'active' ? '0 0 10px rgba(46,204,113,0.2)' : 'none',
              }}>
                {a.image
                  ? <img src={a.image} alt={a.name} style={{width:'100%',height:'100%',objectFit:'cover',objectPosition:'center top'}}/>
                  : <span style={{fontFamily:'var(--font-display)', fontWeight:700, fontSize:16, color:'rgba(255,255,255,0.9)'}}>{a.avatarInitials}</span>
                }
              </div>
              <div style={{fontSize:11, fontWeight:600, textAlign:'center', lineHeight:1.2, marginBottom:4}}>{a.name}</div>
              <div style={{display:'flex', alignItems:'center', gap:4}}>
                <span style={{width:5, height:5, borderRadius:'50%', background: statusColor, boxShadow: state === 'busy' || state === 'active' ? `0 0 6px ${statusColor}` : 'none'}}/>
                <span style={{fontSize:9, fontFamily:'var(--font-mono)', letterSpacing:'0.1em', textTransform:'uppercase', color: statusColor}}>{label}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

/* simple force-less collab graph */
const CollabGraph = ({ onOpenAgent }) => {
  const radius = 140;
  const center = { x: 260, y: 160 };
  const positions = AGENTS.map((a, i) => {
    const ang = (i / AGENTS.length) * Math.PI * 2 - Math.PI/2;
    return { ...a, x: center.x + Math.cos(ang)*radius, y: center.y + Math.sin(ang)*radius };
  });
  const edges = (window.STATE_EDGES && window.STATE_EDGES.length > 0)
    ? window.STATE_EDGES
    : [];
  return (
    <svg viewBox="0 0 520 320" width="100%" height="340" style={{display:'block'}}>
      <defs>
        <linearGradient id="edge" x1="0" x2="1"><stop offset="0" stopColor="#FF6B6B" stopOpacity="0.5"/><stop offset="1" stopColor="#4ECDC4" stopOpacity="0.25"/></linearGradient>
      </defs>
      {edges.map(([a,b],i) => {
        const A = positions.find(p => p.id === a), B = positions.find(p => p.id === b);
        if (!A || !B) return null;
        return <line key={i} x1={A.x} y1={A.y} x2={B.x} y2={B.y} stroke="url(#edge)" strokeWidth="1.5" opacity="0.6"/>;
      })}
      {positions.map(p => (
        <g key={p.id} style={{cursor:'pointer'}} onClick={() => onOpenAgent(p.id)}>
          <circle cx={p.x} cy={p.y} r="22" fill="#FF6B6B" opacity="0.1"/>
          <circle cx={p.x} cy={p.y} r="18" fill="var(--bg-2)" stroke="#4ECDC4" strokeWidth="1.5"/>
          <text x={p.x} y={p.y} textAnchor="middle" dominantBaseline="central" style={{fontFamily:'var(--font-display)', fontSize: 11, fontWeight:700, fill:'#fff'}}>{p.avatarInitials}</text>
          <text x={p.x} y={p.y+34} textAnchor="middle" style={{fontFamily:'var(--font-mono)', fontSize: 9, letterSpacing:'0.1em', fill: 'var(--text-3)', textTransform:'uppercase'}}>{p.name}</text>
        </g>
      ))}
    </svg>
  );
};

/* Keep CommandCenter and KPI for legacy compatibility */
const CommandCenter = ({ onOpenAgent }) => {
  window.useCOfficeRefresh();
  const [prompt, setPrompt] = React.useState('');
  const [provider, setProvider] = React.useState('claude');
  const [personaId, setPersonaId] = React.useState('orchestra');
  const [selectedId, setSelectedId] = React.useState(null);
  const [chatText, setChatText] = React.useState('');
  const [copied, setCopied] = React.useState('');

  const dispatches = window.DISPATCHES || [];
  const selected = dispatches.find(d => d.id === selectedId) || dispatches[0] || null;
  const activeAgent = AGENTS.find(a => a.id === (selected?.personaId || personaId)) || AGENTS[0];
  const draftAgent = AGENTS.find(a => a.id === personaId) || AGENTS[0];
  const draftCommand = providerCommand(provider, draftAgent, prompt);
  const selectedCommand = selected ? providerCommand(selected.provider, activeAgent, selected.prompt) : '';

  React.useEffect(() => {
    if (!selectedId && dispatches[0]) setSelectedId(dispatches[0].id);
  }, [dispatches.length, selectedId]);

  const submitDispatch = async () => {
    const body = prompt.trim();
    if (!body) return;
    const res = await fetch('/api/dispatches', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ prompt: body, provider, personaId, status: 'queued' }),
    });
    const created = await res.json();
    setPrompt('');
    if (created?.id) setSelectedId(created.id);
  };

  const updateSelected = async (patch) => {
    if (!selected) return;
    await fetch(`/api/dispatches/${selected.id}`, {
      method: 'PATCH',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(patch),
    });
  };

  const sendChat = async () => {
    if (!selected || !chatText.trim()) return;
    const messages = [
      ...(selected.messages || []),
      { role: 'pilot', text: chatText.trim(), ts: Date.now() },
    ];
    setChatText('');
    window.COfficeApplyDispatch?.({ ...selected, messages, status: 'chatting', updatedAt: Date.now() });
    await updateSelected({ messages, status: 'chatting' });
  };

  const copyCommand = async (cmd, key) => {
    await writeClipboard(cmd);
    setCopied(key);
    setTimeout(() => setCopied(''), 1200);
  };

  return (
    <div className="panel command-center">
      <div className="panel-head">
        <h3>Command Center</h3>
        <div className="right">notes → agent → cli</div>
      </div>
      <div className="cmd-grid">
        <div className="cmd-compose">
          <div className="mono-s">MISSION NOTE</div>
          <textarea
            className="cmd-textarea"
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            placeholder="จดสิ่งที่อยากให้เอเจนท์ทำ..."
          />
          <div className="cmd-controls">
            <select className="cmd-select" value={personaId} onChange={e => setPersonaId(e.target.value)}>
              {AGENTS.map(a => <option key={a.id} value={a.id}>{a.name} · {a.role}</option>)}
            </select>
            <select className="cmd-select" value={provider} onChange={e => setProvider(e.target.value)}>
              {CLI_PROVIDERS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
          </div>
          <div className="cmd-preview">
            <span>{draftCommand}</span>
            <button className="btn ghost" onClick={() => copyCommand(draftCommand, 'draft')} disabled={!prompt.trim()}>
              {copied === 'draft' ? 'Copied' : 'Copy'}
            </button>
          </div>
          <button className="btn primary" onClick={submitDispatch} disabled={!prompt.trim()}>Queue Mission</button>
        </div>

        <div className="cmd-notes">
          <div className="mono-s">CLICK A NOTE TO TALK</div>
          <div className="cmd-note-list">
            {dispatches.length === 0 && (
              <div className="muted" style={{fontSize:12, padding:'18px 0'}}>No mission notes yet.</div>
            )}
            {dispatches.slice(0, 8).map(d => {
              const ag = AGENTS.find(a => a.id === d.personaId);
              return (
                <div key={d.id} className={'cmd-note ' + (selected?.id === d.id ? 'is-selected' : '')} onClick={() => setSelectedId(d.id)}>
                  <AgentDot agent={ag} size={30}/>
                  <div style={{flex:1, minWidth:0}}>
                    <div className="cmd-note-title">{d.title}</div>
                    <div className="mono-s">{d.provider} · {d.status} · {relTime(d.updatedAt)}</div>
                  </div>
                  <span className="badge cyan">{(d.messages || []).length}</span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="cmd-chat">
          <div className="cmd-chat-head">
            <div>
              <div className="mono-s">SELECTED AGENT</div>
              <div className="row" style={{gap:8, marginTop:6, cursor:'pointer'}} onClick={() => activeAgent && onOpenAgent(activeAgent.id)}>
                <AgentDot agent={activeAgent} size={28}/>
                <b>{activeAgent?.name || '—'}</b>
              </div>
            </div>
            {selected && <button className="btn gold" onClick={() => updateSelected({status: 'done'})}>Mark Done</button>}
          </div>
          {selected ? (
            <>
              <div className="cmd-messages">
                <div className="cmd-message cmd-message-mission">
                  <strong>Mission</strong>
                  <span>{selected.prompt}</span>
                  <em>{relTime(selected.createdAt)}</em>
                </div>
                {(selected.messages || []).length === 0 && <div className="muted" style={{fontSize:12}}>Start a short handoff chat for this note.</div>}
                {(selected.messages || []).map((m, i) => (
                  <div key={i} className="cmd-message">
                    <strong>{m.role || 'pilot'}</strong>
                    <span>{m.text}</span>
                    <em>{relTime(m.ts)}</em>
                  </div>
                ))}
              </div>
              <div className="cmd-preview">
                <span>{selectedCommand}</span>
                <button className="btn ghost" onClick={() => copyCommand(selectedCommand, selected.id)}>
                  {copied === selected.id ? 'Copied' : 'Copy'}
                </button>
              </div>
              <div className="cmd-chat-input">
                <input value={chatText} onChange={e => setChatText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') sendChat(); }} placeholder="คุยต่อกับเอเจนท์จากโน้ตนี้..." />
                <button className="btn" onClick={sendChat}>Send</button>
              </div>
            </>
          ) : (
            <div className="muted" style={{fontSize:12}}>Create or select a note to start.</div>
          )}
        </div>
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

Object.assign(window, { Dashboard, AgentWorkspace, CommandCenter, OfficeFloor: AgentWorkspace });
