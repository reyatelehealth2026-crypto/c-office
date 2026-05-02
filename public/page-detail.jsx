/* ===== AGENT DETAIL PAGE — Chat-Style Interface ===== */
const AgentDetail = ({ agent, onBack, onOpenAgent }) => {
  const [tab, setTab] = React.useState('chat');
  const [chatInput, setChatInput] = React.useState('');
  const [chatMessages, setChatMessages] = React.useState([]);
  const [busy, setBusy] = React.useState(false);
  if (!agent) return null;
  const traits = Array.isArray(agent.traits) ? agent.traits : [];
  const stats = agent.stats || { tasks: 0, success: 0, uptime: '-', tokens: 0 };
  const personality = (agent.personality && typeof agent.personality === 'object') ? agent.personality : {};
  const skills = Array.isArray(agent.skills) ? agent.skills : [];

  const tabs = [
    { id: 'chat',         label: 'Desk Chat' },
    { id: 'personality',  label: 'Profile' },
    { id: 'skills',       label: 'Skills' },
    { id: 'history',      label: 'History' },
  ];

  // Quick action buttons based on staff role
  const quickActions = React.useMemo(() => {
    const id = agent.id;
    const actions = [];
    if (id === 'nana' || id === 'mira') {
      actions.push({ label: 'Content Queue', prompt: 'Review today\'s content queue and propose priorities' });
      actions.push({ label: 'Analytics', prompt: 'Analyze this week\'s performance and suggest adjustments' });
      actions.push({ label: 'Campaign Brief', prompt: 'Draft a campaign brief with owner, timeline, and KPI targets' });
    } else if (id === 'emi' || id === 'vex' || id === 'kai') {
      actions.push({ label: 'Bug Report', prompt: 'Investigate and fix the reported bug' });
      actions.push({ label: 'Implementation', prompt: 'Implement the requested feature with a clear rollout plan' });
      actions.push({ label: 'Tests', prompt: 'Write tests for the specified module' });
    } else if (id === 'luna' || id === 'lumen' || id === 'astra') {
      actions.push({ label: 'Draft Memo', prompt: 'Draft a clear internal memo on the specified topic' });
      actions.push({ label: 'Summary', prompt: 'Summarize the provided document' });
      actions.push({ label: 'Email', prompt: 'Write a professional email' });
    } else if (id === 'nyx') {
      actions.push({ label: 'Research', prompt: 'Research the specified topic' });
      actions.push({ label: 'Analysis', prompt: 'Analyze the provided data' });
    } else if (id === 'echo') {
      actions.push({ label: 'Design', prompt: 'Create a design concept' });
      actions.push({ label: 'Visual', prompt: 'Generate a visual asset' });
    } else if (id === 'orchestra') {
      actions.push({ label: 'Orchestrate', prompt: 'Break down this work order and delegate to specialist agents' });
      actions.push({ label: 'Status', prompt: 'Summarize current status of all active tasks' });
    } else {
      actions.push({ label: 'Work Order', prompt: 'Help me complete this work order' });
    }
    return actions;
  }, [agent.id]);

  const sendChat = (text) => {
    const msg = text || chatInput.trim();
    if (!msg || busy) return;
    setBusy(true);
    const userMsg = { id: Date.now(), role: 'user', content: msg, ts: Date.now() };
    setChatMessages(prev => [...prev, userMsg]);
    setChatInput('');

    // Real dispatch flows through the Notes page; this surface only echoes
    // the user message locally. Use the Notes page (or the dashboard's
    // Send-to-Orchestra) to drive an agent run.
    setBusy(false);
  };

  return (
    <div>
      {/* Back button */}
      <div style={{marginBottom: 14, display:'flex', alignItems:'center', gap:10}}>
        <button className="btn ghost" onClick={onBack} style={{padding:'6px 10px'}}>← Back</button>
        <span className="mono-s">/ agents / {agent.id}</span>
      </div>

      <div className="grid" style={{gridTemplateColumns: '300px 1fr', gap: 20}}>
        {/* LEFT: Agent Info Sidebar */}
        <div className="stack" style={{gap: 14}}>
          {/* Agent header card */}
          <div className="panel" style={{padding: 20, textAlign: 'center'}}>
            <div style={{
              width: 72, height: 72, borderRadius: 14, overflow: 'hidden',
              background: agent.gradient || 'var(--bg-3)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 12px',
              boxShadow: '0 8px 24px -8px rgba(0,0,0,0.4)',
            }}>
              {agent.image
                ? <img src={agent.image} alt={agent.name} style={{width:'100%',height:'100%',objectFit:'cover',objectPosition:'center top'}}/>
                : <span style={{fontFamily:'var(--font-display)', fontWeight:700, fontSize:28, color:'rgba(255,255,255,0.9)'}}>{agent.avatarInitials}</span>
              }
            </div>
            <h2 style={{fontSize: 20, marginBottom: 4}}>{agent.name}</h2>
            <div className="mono-s" style={{color:'var(--coral)', letterSpacing:'0.12em', marginBottom: 8}}>{agent.role}</div>
            <div style={{fontSize: 12, color: 'var(--text-2)', lineHeight: 1.5, marginBottom: 12}}>{agent.tagline}</div>
            <div style={{display:'flex', gap:4, flexWrap:'wrap', justifyContent:'center'}}>
              {traits.map(t => <span key={t} className="badge" style={{fontSize:9}}>{t}</span>)}
            </div>
          </div>

          {/* Quick stats */}
          <div className="panel">
            <div className="panel-head"><h3>Performance</h3><div className="right">lifetime</div></div>
            <div className="grid" style={{gridTemplateColumns:'1fr 1fr', gap:8}}>
              <PerfStat label="Tasks" value={stats.tasks}/>
              <PerfStat label="Success" value={stats.success + '%'}/>
              <PerfStat label="Uptime" value={stats.uptime}/>
              <PerfStat label="Tokens" value={stats.tokens}/>
            </div>
          </div>

          {/* Current assignment */}
          <div className="panel">
            <div className="panel-head"><h3>Current Assignment</h3><div className="right">{agent.status}</div></div>
            <div style={{fontSize:12, lineHeight:1.5}}>{agent.currentTask || 'No active assignment'}</div>
          </div>
        </div>

        {/* RIGHT: Tabbed content area */}
        <div>
          {/* Tab bar */}
          <div style={{
            display:'flex', gap:4, background:'var(--panel)', border:'1px solid var(--border)',
            borderRadius: 10, padding: 3, marginBottom: 16, width:'fit-content',
          }}>
            {tabs.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                style={{
                  padding:'7px 14px', fontSize:12, borderRadius:7, border:'none', cursor:'pointer',
                  fontFamily:'var(--font-mono)', letterSpacing:'0.08em', textTransform:'uppercase',
                  background: tab === t.id ? 'linear-gradient(135deg, var(--coral), var(--coral-2))' : 'transparent',
                  color: tab === t.id ? '#fff' : 'var(--text-3)',
                  transition: 'all 120ms',
                }}>{t.label}</button>
            ))}
          </div>

          {/* Chat tab */}
          {tab === 'chat' && (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              height: 'calc(100vh - 220px)',
              background: 'var(--panel)',
              border: '1px solid var(--border)',
              borderRadius: 14,
              overflow: 'hidden',
            }}>
              {/* Quick actions */}
              <div style={{
                padding: '12px 16px',
                borderBottom: '1px solid var(--border)',
                display: 'flex',
                gap: 8,
                flexWrap: 'wrap',
              }}>
                {quickActions.map((action, i) => (
                  <button key={i} className="btn" onClick={() => sendChat(action.prompt)}
                    style={{fontSize: 11, padding: '5px 10px'}}>
                    {action.label}
                  </button>
                ))}
              </div>

              {/* Chat messages area */}
              <div style={{
                flex: 1,
                overflow: 'auto',
                padding: '16px',
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
              }}>
                {chatMessages.length === 0 && (
                  <div className="muted" style={{textAlign:'center', padding:'40px 20px', fontSize:13}}>
                    Send a message or use a quick action above to start a desk run with {agent.name}
                  </div>
                )}
                {chatMessages.map((m, i) => (
                  <div key={m.id || i} style={{
                    display: 'flex',
                    gap: 10,
                    alignItems: 'flex-start',
                    flexDirection: m.role === 'user' ? 'row-reverse' : 'row',
                  }}>
                    {m.role === 'user' ? (
                      <div style={{
                        width: 28, height: 28, borderRadius: 8,
                        background: 'linear-gradient(135deg, var(--coral), var(--orange))',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 12, color: '#fff',
                        flexShrink: 0,
                      }}>P</div>
                    ) : (
                      <AgentDot agent={agent} size={28}/>
                    )}
                    <div style={{
                      maxWidth: '70%',
                      padding: '10px 14px',
                      borderRadius: 12,
                      background: m.role === 'user'
                        ? 'linear-gradient(135deg, rgba(255,107,107,0.15), rgba(238,90,36,0.08))'
                        : 'var(--bg-2)',
                      border: `1px solid ${m.role === 'user' ? 'rgba(255,107,107,0.25)' : 'var(--border)'}`,
                      fontSize: 13,
                      lineHeight: 1.5,
                      color: 'var(--text)',
                    }}>
                      {m.content}
                    </div>
                  </div>
                ))}
              </div>

              {/* Chat input */}
              <div style={{
                padding: '12px 16px',
                borderTop: '1px solid var(--border)',
                display: 'flex',
                gap: 10,
              }}>
                <input
                  value={chatInput}
                  onChange={e => setChatInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat(); } }}
                  placeholder={`Send work request to ${agent.name}...`}
                  style={{
                    flex: 1,
                    padding: '10px 14px',
                    border: '1px solid var(--border)',
                    borderRadius: 10,
                    background: 'var(--bg-2)',
                    color: 'var(--text)',
                    fontSize: 13,
                    outline: 'none',
                    fontFamily: 'var(--font-body)',
                  }}
                />
                <button className="btn primary" onClick={() => sendChat()} disabled={!chatInput.trim() || busy}>
                  Send
                </button>
              </div>
            </div>
          )}

          {tab === 'personality' && <PersonalityPanel agent={agent} personality={personality}/>}
          {tab === 'skills' && <SkillsPanel agent={agent} skills={skills}/>}
          {tab === 'history' && <HistoryPanel agent={agent}/>}
        </div>
      </div>
    </div>
  );
};

const PerfStat = ({ label, value }) => (
  <div style={{padding:'8px 10px', background:'var(--bg-2)', borderRadius: 8, border:'1px solid var(--border)'}}>
    <div className="mono-s" style={{marginBottom:2}}>{label}</div>
    <div style={{fontFamily:'var(--font-display)', fontSize: 16, fontWeight:700}}>{value}</div>
  </div>
);

const PersonalityPanel = ({ agent, personality }) => (
  <div className="grid" style={{gridTemplateColumns:'1fr 1fr', gap: 16}}>
    <div className="panel">
      <div className="panel-head"><h3>Personality Matrix</h3><div className="right">radar</div></div>
      <div style={{display:'flex', justifyContent:'center'}}>
        <Radar data={personality} size={300} color="var(--coral)"/>
      </div>
    </div>
    <div className="stack">
      <div className="panel">
        <div className="panel-head"><h3>Trait Breakdown</h3></div>
        {Object.entries(personality).map(([k,v]) => (
          <div key={k} style={{marginBottom: 10}}>
            <div style={{display:'flex', justifyContent:'space-between', marginBottom: 4}}>
              <span style={{fontSize:12, textTransform:'capitalize'}}>{k}</span>
              <span className="mono-s">{v}/100</span>
            </div>
            <div style={{height: 5, background:'var(--bg-2)', borderRadius:3, overflow:'hidden'}}>
              <div style={{height:'100%', width: v + '%', background: 'linear-gradient(90deg, var(--coral), var(--orange))', borderRadius:3}}/>
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

const SkillsPanel = ({ agent, skills }) => {
  const cats = [...new Set(skills.map(s => s.cat))];
  return (
    <div className="stack" style={{gap:14}}>
      {cats.map(c => (
        <div key={c} className="panel">
          <div className="panel-head"><h3>{c}</h3><div className="right">{skills.filter(s=>s.cat===c).length} skills</div></div>
          <div className="grid" style={{gridTemplateColumns:'repeat(auto-fill, minmax(220px, 1fr))', gap:8}}>
            {skills.filter(s => s.cat === c).map(s => (
              <div key={s.name} style={{padding:10, background:'var(--bg-2)', borderRadius:8, border:'1px solid var(--border)'}}>
                <div style={{display:'flex', justifyContent:'space-between', alignItems:'baseline', marginBottom: 6}}>
                  <div style={{fontSize:12, fontWeight:600}}>{s.name}</div>
                  <div className="mono" style={{fontSize:11, color:'var(--coral)'}}>Lv {s.level}</div>
                </div>
                <div style={{display:'flex', gap:2}}>
                  {Array.from({length:10}).map((_,i) => (
                    <div key={i} style={{
                      flex:1, height:3, borderRadius:2,
                      background: i < s.level ? 'linear-gradient(90deg, var(--coral), var(--orange))' : 'var(--bg-3)'
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
    if (!ts) return '-';
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
      <div className="panel-head"><h3>Activity History</h3><div className="right">{loading ? 'loading...' : `${items.length} events`}</div></div>
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
