/* ===== TASKS / MISSION LOG ===== */
const TasksPage = ({ onOpenAgent }) => {
  const [filter, setFilter] = React.useState('ALL');
  const statuses = ['ALL', 'running', 'done', 'failed'];
  const filtered = filter === 'ALL' ? TASKS : TASKS.filter(t => t.status === filter);

  const statusColor = {
    'running': 'var(--cyan)',
    'done':    'var(--green)',
    'failed':  'var(--red)',
  };
  const fmtElapsed = (start, end) => {
    if (!start) return '—';
    const ms = (end || Date.now()) - start;
    const s = Math.max(0, Math.floor(ms/1000));
    if (s < 60) return s + 's';
    const m = Math.floor(s/60);
    if (m < 60) return m + 'm';
    return Math.floor(m/60) + 'h';
  };
  const shortId = (id) => id ? '#' + id.slice(-6) : '—';

  return (
    <div>
      <div className="topbar">
        <div>
          <h1>Mission <span className="accent">Log</span></h1>
          <div className="sub">{TASKS.length} subagent spawns · {TASKS.filter(t=>t.status==='running').length} running</div>
        </div>
      </div>

      <div style={{display:'flex', gap:6, marginBottom: 16}}>
        {statuses.map(s => (
          <button key={s} onClick={() => setFilter(s)}
            style={{
              padding:'6px 12px', fontSize:11, borderRadius:8,
              border:'1px solid ' + (filter === s ? 'var(--purple)' : 'var(--border)'),
              background: filter === s ? 'rgba(157,92,255,0.12)' : 'var(--panel)',
              color: filter === s ? '#fff' : 'var(--text-2)',
              cursor:'pointer',
              fontFamily:'var(--font-mono)', letterSpacing:'0.1em', textTransform:'uppercase',
            }}>
            {s} {s !== 'ALL' && <span style={{opacity:0.5, marginLeft: 4}}>{TASKS.filter(t=>t.status===s).length}</span>}
          </button>
        ))}
      </div>

      <div className="panel" style={{padding: 0, overflow:'hidden'}}>
        <div style={{display:'grid', gridTemplateColumns:'90px 1fr 180px 130px 100px 90px', padding: '12px 18px', borderBottom:'1px solid var(--border)', background: 'var(--bg-2)'}}>
          {['ID','Description','Spawned by','Subagent type','Status','Elapsed'].map(h =>
            <div key={h} className="mono-s" style={{letterSpacing:'0.15em'}}>{h}</div>
          )}
        </div>
        {filtered.length === 0 && (
          <div className="muted" style={{padding:'30px 18px', fontSize:12, textAlign:'center'}}>
            No tasks yet. Spawn a subagent in any Claude Code session.
          </div>
        )}
        {filtered.map((t,i) => {
          const agent = AGENTS.find(a => a.id === t.personaId);
          return (
            <div key={t.id} style={{
              display:'grid', gridTemplateColumns:'90px 1fr 180px 130px 100px 90px',
              padding: '14px 18px', alignItems:'center',
              borderBottom: i < filtered.length-1 ? '1px solid var(--border)' : 'none',
              transition:'background 120ms',
              cursor: 'pointer',
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-2)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              <div className="mono" style={{fontSize:11, color:'var(--text-3)'}}>{shortId(t.id)}</div>
              <div style={{fontSize:13, fontWeight:500, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{t.description || '—'}</div>
              <div className="row" onClick={(e) => {e.stopPropagation(); agent && onOpenAgent(agent.id);}} style={{gap: 8}}>
                <AgentDot agent={agent} size={22}/>
                <span style={{fontSize:12}}>{agent ? agent.name : (t.personaId || '—')}</span>
              </div>
              <div className="mono-s" style={{color:'var(--text-2)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{t.subagent_type || '—'}</div>
              <div style={{display:'flex', alignItems:'center', gap:6}}>
                <span style={{width:6, height:6, borderRadius:'50%', background: statusColor[t.status], boxShadow: `0 0 6px ${statusColor[t.status]}`}}/>
                <span style={{fontSize:11, fontFamily:'var(--font-mono)', letterSpacing:'0.1em', textTransform:'uppercase', color: statusColor[t.status]}}>{t.status}</span>
              </div>
              <div className="mono-s">{fmtElapsed(t.startedAt, t.endedAt)}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

/* ===== CONNECTIONS (OAuth + paste-token credential management) ===== */
const ConnectionsPanel = () => {
  const [status, setStatus] = React.useState(null);
  const [busy, setBusy] = React.useState(null);
  const [tokenInputs, setTokenInputs] = React.useState({});
  const [googleClientId, setGoogleClientId] = React.useState('');

  const refresh = React.useCallback(() => {
    fetch('/api/auth/status').then(r => r.json()).then(setStatus).catch(()=>{});
  }, []);
  React.useEffect(() => {
    refresh();
    const handler = () => refresh();
    window.COfficeBus?.addEventListener('refresh', handler);
    return () => window.COfficeBus?.removeEventListener('refresh', handler);
  }, [refresh]);

  const connectAnthropic = () => { window.location.href = '/auth/anthropic/connect'; };
  const connectGoogle    = () => { window.location.href = '/auth/google/start'; };

  const submitToken = async (provider, extra = {}) => {
    setBusy(provider);
    try {
      const body = { provider, token: tokenInputs[provider] || undefined, ...extra };
      const r = await fetch('/api/auth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        alert(err.error || 'Failed to save token');
      } else {
        setTokenInputs(s => ({ ...s, [provider]: '' }));
        refresh();
      }
    } finally { setBusy(null); }
  };

  const disconnect = async (provider) => {
    setBusy(provider);
    try {
      await fetch('/api/auth/disconnect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider }),
      });
      refresh();
    } finally { setBusy(null); }
  };

  const fmtExpiry = (ts) => {
    if (!ts) return '';
    const d = ts - Date.now();
    if (d <= 0) return 'expired';
    const h = Math.floor(d / 3600_000);
    const m = Math.floor((d % 3600_000) / 60_000);
    return h > 0 ? `expires in ${h}h ${m}m` : `expires in ${m}m`;
  };

  const Row = ({ label, hint, state, action }) => (
    <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', gap:14, padding:'12px 14px', background:'var(--bg-2)', borderRadius:10, border:'1px solid var(--border)'}}>
      <div style={{flex: 1, minWidth: 0}}>
        <div style={{display:'flex', alignItems:'center', gap:10}}>
          <span style={{width:8, height:8, borderRadius:'50%', background: state?.connected ? 'var(--green)' : 'var(--text-3)', boxShadow: state?.connected ? '0 0 6px var(--green)' : 'none'}}/>
          <span style={{fontWeight:600, fontSize:13}}>{label}</span>
          {state?.mode && <span className="badge slate" style={{textTransform:'lowercase'}}>{state.mode}</span>}
        </div>
        <div className="mono-s" style={{marginTop:2}}>{state?.connected ? (fmtExpiry(state.expiresAt) || 'connected') : (hint || 'not connected')}</div>
      </div>
      <div>{action}</div>
    </div>
  );

  const TokenField = ({ provider, placeholder }) => (
    <div style={{display:'flex', gap:6}}>
      <input
        type="password"
        placeholder={placeholder}
        value={tokenInputs[provider] || ''}
        onChange={e => setTokenInputs(s => ({ ...s, [provider]: e.target.value }))}
        style={{padding:'6px 10px', border:'1px solid var(--border)', borderRadius:6, background:'var(--bg-3)', color:'var(--text)', fontSize:12, fontFamily:'var(--font-mono)', width:200}}
      />
      <button disabled={busy === provider} onClick={() => submitToken(provider)} style={{padding:'6px 12px', borderRadius:6, border:'1px solid var(--border)', background:'var(--purple)', color:'#fff', fontSize:12, cursor: 'pointer'}}>
        Save
      </button>
    </div>
  );

  return (
    <div className="panel" style={{gridColumn:'span 2'}}>
      <div className="panel-head"><h3>Connections</h3>
        <div className="right">OAuth where supported · paste token elsewhere</div>
      </div>
      <div className="stack" style={{gap:8}}>
        <Row label="Anthropic" state={status?.anthropic} hint="reads ~/.claude/.credentials.json after `claude login`"
          action={status?.anthropic?.connected
            ? <button disabled={busy==='anthropic'} onClick={()=>disconnect('anthropic')} style={{padding:'6px 12px', borderRadius:6, border:'1px solid var(--border)', background:'var(--bg-3)', color:'var(--text)', fontSize:12, cursor:'pointer'}}>Disconnect</button>
            : <button onClick={connectAnthropic} style={{padding:'6px 14px', borderRadius:6, border:'none', background:'var(--gold)', color:'#000', fontSize:12, fontWeight:600, cursor:'pointer'}}>Connect</button>
          }/>
        {!status?.anthropic?.connected && <TokenField provider="anthropic" placeholder="…or paste sk-ant-… key"/>}

        <Row label="Google (Gemini Imagen)" state={status?.google}
          hint={status?.google?.hasClientId ? 'OAuth client_id set' : 'set client_id below before connecting'}
          action={status?.google?.connected
            ? <button disabled={busy==='google'} onClick={()=>disconnect('google')} style={{padding:'6px 12px', borderRadius:6, border:'1px solid var(--border)', background:'var(--bg-3)', color:'var(--text)', fontSize:12, cursor:'pointer'}}>Disconnect</button>
            : <button disabled={!status?.google?.hasClientId} onClick={connectGoogle} style={{padding:'6px 14px', borderRadius:6, border:'none', background: status?.google?.hasClientId ? 'var(--gold)' : 'var(--bg-3)', color:'#000', fontSize:12, fontWeight:600, cursor: status?.google?.hasClientId ? 'pointer' : 'not-allowed'}}>Connect</button>
          }/>
        {!status?.google?.hasClientId && (
          <div style={{display:'flex', gap:6, marginLeft:12}}>
            <input type="text" placeholder="Google OAuth client_id (Desktop or Web)" value={googleClientId} onChange={e=>setGoogleClientId(e.target.value)}
              style={{padding:'6px 10px', border:'1px solid var(--border)', borderRadius:6, background:'var(--bg-3)', color:'var(--text)', fontSize:12, fontFamily:'var(--font-mono)', flex:1}}/>
            <button disabled={busy==='google' || !googleClientId} onClick={() => submitToken('google', { clientId: googleClientId })} style={{padding:'6px 12px', borderRadius:6, border:'1px solid var(--border)', background:'var(--purple)', color:'#fff', fontSize:12, cursor:'pointer'}}>Save</button>
          </div>
        )}

        <Row label="Replicate" state={status?.replicate} hint="paste an r8_… API token"
          action={status?.replicate?.connected
            ? <button disabled={busy==='replicate'} onClick={()=>disconnect('replicate')} style={{padding:'6px 12px', borderRadius:6, border:'1px solid var(--border)', background:'var(--bg-3)', color:'var(--text)', fontSize:12, cursor:'pointer'}}>Disconnect</button>
            : <TokenField provider="replicate" placeholder="r8_…"/>
          }/>

        <Row label="OpenAI" state={status?.openai} hint="paste an sk-… API key"
          action={status?.openai?.connected
            ? <button disabled={busy==='openai'} onClick={()=>disconnect('openai')} style={{padding:'6px 12px', borderRadius:6, border:'1px solid var(--border)', background:'var(--bg-3)', color:'var(--text)', fontSize:12, cursor:'pointer'}}>Disconnect</button>
            : <TokenField provider="openai" placeholder="sk-…"/>
          }/>

        <div className="mono-s" style={{marginTop:6}}>
          Tokens are stored locally encrypted in <span className="mono" style={{color:'var(--gold)'}}>~/.c-office/credentials.json</span>. Never committed.
        </div>
      </div>
    </div>
  );
};

/* ===== SETTINGS ===== */
const SettingsPage = () => {
  const [settings, setSettings] = React.useState(null);
  React.useEffect(() => {
    fetch('/api/settings').then(r => r.json()).then(setSettings).catch(()=>{});
  }, []);

  const hookEvents = ['SessionStart','SessionEnd','UserPromptSubmit','PreToolUse','PostToolUse','SubagentStart','SubagentStop','Stop'];
  const installed = (ev) => {
    const groups = settings?.hooks?.[ev] || [];
    return groups.some(g => (g.hooks||[]).some(h => typeof h.command === 'string' && h.command.includes('c-office:post-event')));
  };
  const installedCount = settings ? hookEvents.filter(installed).length : 0;
  const liveSessions = STATE_SESSIONS.filter(s => !s.endedAt);

  return (
    <div>
      <div className="topbar">
        <div>
          <h1>Orchestration <span className="accent">Settings</span></h1>
          <div className="sub">Hook status · sessions · pricing</div>
        </div>
      </div>
      <div className="grid" style={{gridTemplateColumns:'1fr 1fr', gap: 18}}>
        <ConnectionsPanel/>
        <div className="panel">
          <div className="panel-head"><h3>Hooks</h3>
            <div className="right">{installedCount}/{hookEvents.length} installed</div>
          </div>
          {!settings && <div className="muted" style={{fontSize:12}}>Loading…</div>}
          {settings && (
            <div className="stack" style={{gap:6}}>
              {hookEvents.map(ev => {
                const ok = installed(ev);
                return (
                  <div key={ev} style={{display:'flex', justifyContent:'space-between', alignItems:'center', padding:'8px 12px', background:'var(--bg-2)', borderRadius: 8, border:'1px solid var(--border)'}}>
                    <span style={{fontSize:12, fontFamily:'var(--font-mono)'}}>{ev}</span>
                    <span className={`badge ${ok ? 'green' : 'slate'}`}>{ok ? 'INSTALLED' : 'OFF'}</span>
                  </div>
                );
              })}
              <div className="divider"/>
              <div className="mono-s">To install: <span className="mono" style={{color:'var(--gold)'}}>npm run install-hooks</span></div>
              <div className="mono-s">To remove: <span className="mono" style={{color:'var(--gold)'}}>npm run uninstall-hooks</span></div>
              <div className="mono-s">Then restart any active <span className="mono">claude</span> session for hooks to take effect.</div>
            </div>
          )}
        </div>

        <div className="panel">
          <div className="panel-head"><h3>Live Sessions</h3>
            <div className="right">{liveSessions.length} active</div>
          </div>
          {liveSessions.length === 0 && <div className="muted" style={{fontSize:12}}>No Claude Code session detected. Run <span className="mono">claude</span> in a terminal.</div>}
          <div className="stack" style={{gap:6}}>
            {liveSessions.map(s => {
              const persona = AGENTS.find(a => a.id === s.personaId);
              return (
                <div key={s.sessionId} style={{display:'flex', gap:10, alignItems:'center', padding:'10px 12px', background:'var(--bg-2)', borderRadius:10, border:'1px solid var(--border)'}}>
                  <AgentDot agent={persona} size={28}/>
                  <div style={{flex:1, minWidth:0}}>
                    <div style={{fontSize:13, fontWeight:500}}>{persona ? persona.name : s.personaId} <span className="mono-s">· PID {s.pid}</span></div>
                    <div className="mono-s" style={{overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{s.cwd || '—'}</div>
                  </div>
                  <span className="badge cyan">{s.kind}</span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="panel" style={{gridColumn:'span 2'}}>
          <div className="panel-head">
            <h3>CLI Providers</h3>
            <div className="right">install one to dispatch real LLM responses</div>
          </div>
          <div className="grid" style={{gridTemplateColumns:'repeat(auto-fill, minmax(220px, 1fr))', gap: 10}}>
            {((window.PROVIDERS?.providers) || []).map(p => (
              <div key={p.name} style={{
                padding: '10px 12px',
                background: 'var(--bg-2)',
                border: '1px solid ' + (p.available ? 'rgba(52,211,153,0.4)' : 'var(--border)'),
                borderRadius: 10,
              }}>
                <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4}}>
                  <span style={{fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 600}}>{p.name}</span>
                  <span className={'badge ' + (p.available ? 'green' : 'slate')} style={{fontSize: 9}}>
                    {p.available ? 'AVAILABLE' : 'NOT INSTALLED'}
                  </span>
                </div>
                <div style={{fontSize: 12, color: 'var(--text-2)', marginBottom: 4}}>{p.display}</div>
                <div className="mono-s" style={{fontSize: 10, lineHeight: 1.4}}>{p.description}</div>
              </div>
            ))}
          </div>
          <div className="divider"/>
          <div className="mono-s" style={{lineHeight: 1.6}}>
            Default → <span className="mono" style={{color: 'var(--gold)'}}>{window.PROVIDERS?.default || 'echo'}</span>
            &nbsp;·&nbsp; Override commands with env vars:
            <span className="mono" style={{marginLeft: 4}}>C_OFFICE_CLAUDE_CMD</span>,
            <span className="mono" style={{marginLeft: 4}}>C_OFFICE_CODEX_CMD</span>,
            <span className="mono" style={{marginLeft: 4}}>C_OFFICE_GPT_CMD</span>
            &nbsp;(use <span className="mono">${'{PROMPT}'}</span> placeholder).
          </div>
        </div>

        <div className="panel" style={{gridColumn:'span 2'}}>
          <div className="panel-head"><h3>Today's Spend</h3></div>
          <div style={{display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap:14}}>
            <div style={{padding:'14px 16px', background:'var(--bg-2)', borderRadius: 10, border:'1px solid var(--border)'}}>
              <div className="mono-s">TOKENS</div>
              <div style={{fontFamily:'var(--font-display)', fontSize:24, fontWeight:700}}>{(STATS.tokensToday || 0).toLocaleString()}</div>
            </div>
            <div style={{padding:'14px 16px', background:'var(--bg-2)', borderRadius: 10, border:'1px solid var(--border)'}}>
              <div className="mono-s">SPEND</div>
              <div style={{fontFamily:'var(--font-display)', fontSize:24, fontWeight:700, color:'var(--gold)'}}>${(STATS.spendToday || 0).toFixed(4)}</div>
            </div>
            <div style={{padding:'14px 16px', background:'var(--bg-2)', borderRadius: 10, border:'1px solid var(--border)'}}>
              <div className="mono-s">AGENTS</div>
              <div style={{fontFamily:'var(--font-display)', fontSize:24, fontWeight:700, color:'var(--green)'}}>{STATS.agentsOnline || 0}</div>
            </div>
            <div style={{padding:'14px 16px', background:'var(--bg-2)', borderRadius: 10, border:'1px solid var(--border)'}}>
              <div className="mono-s">RUNNING TASKS</div>
              <div style={{fontFamily:'var(--font-display)', fontSize:24, fontWeight:700, color:'var(--purple)'}}>{STATS.tasksRunning || 0}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const SettingRow = ({ label, hint, children }) => (
  <div style={{padding:'12px 0', borderBottom:'1px solid var(--border)'}}>
    <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:20}}>
      <div style={{flex:1}}>
        <div style={{fontSize:13, fontWeight:500}}>{label}</div>
        {hint && <div className="mono-s">{hint}</div>}
      </div>
      <div style={{flex:1.2, display:'flex', justifyContent:'flex-end'}}>{children}</div>
    </div>
  </div>
);

const Switch = ({ value, onChange }) => (
  <div onClick={() => onChange(!value)} style={{
    width: 40, height: 22, borderRadius: 11,
    background: value ? 'var(--purple)' : 'var(--bg-3)',
    position: 'relative', cursor:'pointer',
    transition: 'background 200ms',
  }}>
    <div style={{
      width: 16, height: 16, borderRadius: '50%', background:'#fff',
      position:'absolute', top: 3, left: value ? 21 : 3,
      transition:'left 200ms',
      boxShadow:'0 1px 3px rgba(0,0,0,0.3)'
    }}/>
  </div>
);

Object.assign(window, { TasksPage, SettingsPage });
