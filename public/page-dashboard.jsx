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

      {/* OFFICE FLOOR — every agent at a glance */}
      <div style={{marginBottom: 18}}>
        <OfficeFloor onOpenAgent={onOpenAgent}/>
      </div>

      <div style={{marginBottom: 18}}>
        <CommandCenter onOpenAgent={onOpenAgent}/>
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
        <h3>Agent Command Center</h3>
        <div className="right">notes → agent → cli</div>
      </div>
      <div className="cmd-grid">
        <div className="cmd-compose">
          <div className="mono-s">MISSION NOTE</div>
          <textarea
            className="cmd-textarea"
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            placeholder="จดสิ่งที่อยากให้เอเจนท์ทำ เช่น ขยาย Adventure, ตรวจ bug, เขียน feature..."
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

Object.assign(window, { Dashboard, OfficeFloor, CommandCenter });
