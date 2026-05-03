/* ===== TASKS / OPERATIONS BOARD ===== */
const AgentDot = window.AgentDot;

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
          <h1>Operations <span className="accent">Log</span></h1>
          <div className="sub">{TASKS.length} task runs · {TASKS.filter(t=>t.status==='running').length} active</div>
        </div>
      </div>

      <div style={{display:'flex', gap:6, marginBottom: 16}}>
        {statuses.map(s => (
          <button key={s} onClick={() => setFilter(s)}
            style={{
              padding:'6px 12px', fontSize:11, borderRadius:8,
              border:'1px solid ' + (filter === s ? 'var(--coral)' : 'var(--border)'),
              background: filter === s ? 'rgba(255,107,107,0.12)' : 'var(--panel)',
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
            No operation records yet. Start a run from any active session.
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
  const [testResults, setTestResults] = React.useState({});
  const [testingProvider, setTestingProvider] = React.useState(null);

  const runTest = async (provider) => {
    setTestingProvider(provider);
    setTestResults((s) => ({ ...s, [provider]: { pending: true } }));
    try {
      const r = await fetch(`/api/auth/test/${provider}`, { method: 'POST' });
      const j = await r.json().catch(() => ({ ok: false, error: 'invalid response' }));
      setTestResults((s) => ({ ...s, [provider]: { ...j, ts: Date.now() } }));
    } catch (e) {
      setTestResults((s) => ({ ...s, [provider]: { ok: false, error: e.message, ts: Date.now() } }));
    } finally {
      setTestingProvider(null);
    }
  };

  const TestButton = ({ provider, disabled }) => (
    <button
      disabled={disabled || testingProvider === provider}
      onClick={() => runTest(provider)}
      title="Run a live API probe"
      style={{
        padding: '6px 10px', borderRadius: 6,
        border: '1px solid var(--border)',
        background: 'var(--bg-3)', color: 'var(--text)',
        fontSize: 12, cursor: disabled ? 'not-allowed' : 'pointer',
      }}>
      {testingProvider === provider ? 'testing...' : '🩺 Test'}
    </button>
  );

  const TestResult = ({ provider }) => {
    const r = testResults[provider];
    if (!r) return null;
    if (r.pending) return <span className="mono-s" style={{color:'var(--text-3)'}}>probing…</span>;
    const okColor = r.ok ? 'var(--green)' : 'var(--red)';
    const detail = r.ok
      ? [
          r.latencyMs != null ? `${r.latencyMs}ms` : null,
          r.model ? r.model : null,
          r.modelCount != null ? `${r.modelCount} models` : null,
          r.account ? `acct: ${r.account}` : null,
          r.hint ? r.hint : null,
        ].filter(Boolean).join(' · ')
      : `${r.error || 'failed'}${r.hint ? ' · ' + r.hint : ''}`;
    return (
      <div style={{
        marginTop: 6, padding: '6px 10px', fontSize: 11,
        background: 'var(--bg-3)', borderRadius: 6,
        borderLeft: `3px solid ${okColor}`,
        fontFamily: 'var(--font-mono)', color: r.ok ? 'var(--text-2)' : 'var(--red)',
      }}>
        <b style={{color: okColor}}>{r.ok ? 'OK' : 'FAIL'}</b> · {detail}
      </div>
    );
  };

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
      <button disabled={busy === provider} onClick={() => submitToken(provider)} style={{padding:'6px 12px', borderRadius:6, border:'1px solid var(--border)', background:'var(--coral)', color:'#fff', fontSize:12, cursor: 'pointer'}}>
        Save
      </button>
    </div>
  );

  return (
    <div className="panel" style={{gridColumn:'span 2'}}>
      <div className="panel-head"><h3>Provider Connections</h3>
        <div className="right">OAuth / CLI where supported · paste token elsewhere</div>
      </div>
      <div className="stack" style={{gap:8}}>
        <Row label="Anthropic" state={status?.anthropic} hint="reads ~/.claude/.credentials.json after `claude login`"
          action={<div style={{display:'flex', gap:6}}>
            <TestButton provider="anthropic" disabled={!status?.anthropic?.connected}/>
            {status?.anthropic?.connected
              ? <button disabled={busy==='anthropic'} onClick={()=>disconnect('anthropic')} style={{padding:'6px 12px', borderRadius:6, border:'1px solid var(--border)', background:'var(--bg-3)', color:'var(--text)', fontSize:12, cursor:'pointer'}}>Disconnect</button>
              : <button onClick={connectAnthropic} style={{padding:'6px 14px', borderRadius:6, border:'none', background:'var(--gold)', color:'#000', fontSize:12, fontWeight:600, cursor:'pointer'}}>Connect</button>}
          </div>}/>
        <TestResult provider="anthropic"/>
        {!status?.anthropic?.connected && <TokenField provider="anthropic" placeholder="…or paste sk-ant-… key"/>}

        <Row label="Google (Gemini)" state={status?.google}
          hint={status?.google?.connected ? (status?.google?.mode === 'cli' ? 'connected via local gcloud CLI' : 'ready for Gemini requests') : 'connect OAuth, configure gcloud CLI, or paste Gemini API key'}
          action={<div style={{display:'flex', gap:6}}>
            <TestButton provider="google" disabled={!status?.google?.connected}/>
            {status?.google?.connected && status?.google?.mode !== 'cli'
              ? <button disabled={busy==='google'} onClick={()=>disconnect('google')} style={{padding:'6px 12px', borderRadius:6, border:'1px solid var(--border)', background:'var(--bg-3)', color:'var(--text)', fontSize:12, cursor:'pointer'}}>Disconnect</button>
              : status?.google?.mode === 'cli'
                ? <span className="badge slate">CLI MANAGED</span>
                : <button disabled={!status?.google?.hasClientId} onClick={connectGoogle} style={{padding:'6px 14px', borderRadius:6, border:'none', background: status?.google?.hasClientId ? 'var(--gold)' : 'var(--bg-3)', color:'#000', fontSize:12, fontWeight:600, cursor: status?.google?.hasClientId ? 'pointer' : 'not-allowed'}}>Connect OAuth</button>}
          </div>}/>
        <TestResult provider="google"/>
        
        {(!status?.google?.connected || status?.google?.mode === 'cli') && (
           <div className="mono-s" style={{marginLeft: 12, marginBottom: 8, marginTop: -4, color: 'var(--text-secondary)'}}>
              <b>CLI Setup:</b> Ensure the Google Cloud SDK is installed. Run <span className="mono" style={{color:'var(--gold)'}}>gcloud auth login</span> or <span className="mono" style={{color:'var(--gold)'}}>gcloud auth application-default login</span> in your terminal to automatically authenticate via CLI.
           </div>
        )}

        {!status?.google?.hasClientId && status?.google?.mode !== 'cli' && (
          <div style={{display:'flex', gap:6, marginLeft:12}}>
            <input type="text" placeholder="Google OAuth client_id (Desktop or Web)" value={googleClientId} onChange={e=>setGoogleClientId(e.target.value)}
              style={{padding:'6px 10px', border:'1px solid var(--border)', borderRadius:6, background:'var(--bg-3)', color:'var(--text)', fontSize:12, fontFamily:'var(--font-mono)', flex:1}}/>
            <button disabled={busy==='google' || !googleClientId} onClick={() => submitToken('google', { clientId: googleClientId })} style={{padding:'6px 12px', borderRadius:6, border:'1px solid var(--border)', background:'var(--coral)', color:'#fff', fontSize:12, cursor:'pointer'}}>Save</button>
          </div>
        )}
        {!status?.google?.connected && <TokenField provider="google" placeholder="Gemini API key"/>}

        <Row label="Replicate" state={status?.replicate} hint="paste an r8_… API token"
          action={<div style={{display:'flex', gap:6}}>
            <TestButton provider="replicate" disabled={!status?.replicate?.connected}/>
            {status?.replicate?.connected
              ? <button disabled={busy==='replicate'} onClick={()=>disconnect('replicate')} style={{padding:'6px 12px', borderRadius:6, border:'1px solid var(--border)', background:'var(--bg-3)', color:'var(--text)', fontSize:12, cursor:'pointer'}}>Disconnect</button>
              : <TokenField provider="replicate" placeholder="r8_…"/>}
          </div>}/>
        <TestResult provider="replicate"/>

        <Row label="OpenAI" state={status?.openai} hint="paste an sk-… API key"
          action={<div style={{display:'flex', gap:6}}>
            <TestButton provider="openai" disabled={!status?.openai?.connected}/>
            {status?.openai?.connected
              ? <button disabled={busy==='openai'} onClick={()=>disconnect('openai')} style={{padding:'6px 12px', borderRadius:6, border:'1px solid var(--border)', background:'var(--bg-3)', color:'var(--text)', fontSize:12, cursor:'pointer'}}>Disconnect</button>
              : <TokenField provider="openai" placeholder="sk-…"/>}
          </div>}/>
        <TestResult provider="openai"/>

        <Row label="Codex OAuth" state={status?.codex} hint="ใช้ login ของ Codex จาก ~/.codex/auth.json สำหรับสร้างภาพโดยไม่ต้องใส่ API key"
          action={<div style={{display:'flex', gap:6}}>
            <TestButton provider="codex" disabled={!status?.codex?.connected}/>
            <span className={'badge ' + (status?.codex?.connected ? 'green' : 'slate')}>{status?.codex?.connected ? 'READY' : 'LOGIN CODEX'}</span>
          </div>}/>
        <TestResult provider="codex"/>

        <div className="mono-s" style={{marginTop:6}}>
          Tokens are stored locally encrypted in <span className="mono" style={{color:'var(--gold)'}}>~/.c-office/credentials.json</span>. Never committed.
        </div>
      </div>
    </div>
  );
};

const ThemeEnginePanel = () => {
  window.useCOfficeRefresh?.();
  const state = window.THEME_STATE || { theme: 'game_guild', themes: [] };
  const setTheme = async (theme) => {
    await fetch('/api/theme', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ theme }),
    });
    await window.fetchCOfficeState?.();
  };
  return (
    <div className="panel" style={{gridColumn:'span 2'}}>
      <div className="panel-head"><h3>Workspace Theme</h3><div className="right">office UI presets for different operation modes</div></div>
      <div style={{display:'flex', flexWrap:'wrap', gap:8}}>
        {(state.themes || []).map((theme) => (
          <button key={theme} className={'btn ' + (state.theme === theme ? 'primary' : '')} onClick={() => setTheme(theme)}>
            {theme}
          </button>
        ))}
      </div>
    </div>
  );
};

/* ===== USER PROFILE ===== */
// Markdown-based "who I am" the user maintains once. Server appends it to
// every persona system prompt so agents know the operator without being told
// inside each task. Persisted at ~/.c-office/user-profile.md.
const UserProfilePanel = () => {
  const [text, setText] = React.useState('');
  const [loaded, setLoaded] = React.useState(false);
  const [path, setPath] = React.useState('');
  const [tpl, setTpl] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [status, setStatus] = React.useState('');
  const [bytes, setBytes] = React.useState(0);

  const refresh = React.useCallback(() => {
    fetch('/api/user-profile')
      .then((r) => r.json())
      .then((j) => {
        if (!j || j.ok === false) return;
        setText(j.text || '');
        setPath(j.path || '');
        setTpl(j.defaultTemplate || '');
        setBytes(j.bytes || 0);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  React.useEffect(() => { refresh(); }, [refresh]);

  const save = async () => {
    setBusy(true);
    setStatus('');
    try {
      const r = await fetch('/api/user-profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      const j = await r.json();
      if (!r.ok || j.ok === false) throw new Error(j.error || `HTTP ${r.status}`);
      setBytes(j.bytes || 0);
      setStatus('บันทึกแล้ว · เอเจนต์ทุกตัวจะใช้โปรไฟล์นี้ในรันถัดไป');
      setTimeout(() => setStatus(''), 4000);
    } catch (e) {
      setStatus('บันทึกไม่สำเร็จ: ' + (e.message || e));
    } finally {
      setBusy(false);
    }
  };

  const loadTemplate = () => {
    if (text.trim() && !window.confirm('เขียนทับด้วยเทมเพลตเริ่มต้น?')) return;
    setText(tpl);
  };

  return (
    <div className="panel" style={{ gridColumn: 'span 2' }}>
      <div className="panel-head">
        <h3>User Profile (agent context)</h3>
        <div className="right mono-s">{loaded ? `${bytes} bytes` : 'loading…'}</div>
      </div>
      <div className="mono-s" style={{ marginBottom: 8, lineHeight: 1.6 }}>
        เขียน Markdown บอกว่าคุณเป็นใคร ทำธุรกิจอะไร กลุ่มเป้าหมาย โทน คำที่ห้ามใช้ ฯลฯ —
        เซิร์ฟเวอร์จะแนบเข้า system prompt ของทุกเอเจนต์อัตโนมัติ จึงไม่ต้องบอกซ้ำในทุกคำสั่ง
        {path && <> · file: <span className="mono" style={{ color: 'var(--gold)' }}>{path}</span></>}
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        spellCheck={false}
        placeholder={tpl || '# About me\n- Name:\n- Role / business:\n'}
        style={{
          width: '100%', minHeight: 240, padding: 12,
          background: 'var(--bg-2)', color: 'var(--text-1)',
          border: '1px solid var(--border)', borderRadius: 8,
          fontFamily: 'var(--font-mono)', fontSize: 12, lineHeight: 1.55,
          resize: 'vertical',
        }}
      />
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 10 }}>
        <button className="btn primary" disabled={busy || !loaded} onClick={save}>
          {busy ? 'กำลังบันทึก…' : 'บันทึกโปรไฟล์'}
        </button>
        <button className="btn-ghost" disabled={busy} onClick={loadTemplate} style={{ fontSize: 12 }}>
          ใส่เทมเพลต
        </button>
        <button className="btn-ghost" disabled={busy} onClick={refresh} style={{ fontSize: 12 }}>
          โหลดใหม่
        </button>
        {status && <span className="mono-s" style={{ marginLeft: 'auto', color: 'var(--green)' }}>{status}</span>}
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
          <h1>Control Room <span className="accent">Settings</span></h1>
          <div className="sub">Hook status · sessions · provider ops</div>
        </div>
      </div>
      <div className="grid" style={{gridTemplateColumns:'1fr 1fr', gap: 18}}>
        <ThemeEnginePanel/>
        <ConnectionsPanel/>
        <UserProfilePanel/>
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
            <h3>Provider Runtimes</h3>
            <div className="right">install one to dispatch real model responses</div>
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
            Default → <span className="mono" style={{color: 'var(--gold)'}}>{window.PROVIDERS?.default || 'claude'}</span>
            &nbsp;·&nbsp; Override commands with env vars:
            <span className="mono" style={{marginLeft: 4}}>C_OFFICE_CLAUDE_CMD</span>,
            <span className="mono" style={{marginLeft: 4}}>C_OFFICE_CODEX_CMD</span>
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
              <div style={{fontFamily:'var(--font-display)', fontSize:24, fontWeight:700, color:'var(--coral)'}}>{STATS.tasksRunning || 0}</div>
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
    background: value ? 'var(--coral)' : 'var(--bg-3)',
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

const DynamicTasksPage = ({ onOpenAgent }) => {
  window.useCOfficeRefresh?.();
  const board = window.TASK_BOARD || { statuses: ['backlog', 'running', 'review', 'done'], columns: {}, tasks: [] };
  const [draft, setDraft] = React.useState({ title: '', agentId: (window.AGENTS || [])[0]?.id || '', provider: window.PROVIDERS?.default || 'claude' });
  const [busy, setBusy] = React.useState(false);
  const [runCancelBusy, setRunCancelBusy] = React.useState({});

  const activeOrchestraRuns = (window.RUNS || []).filter(
    (r) => r && (r.status === 'running' || r.status === 'awaiting-approval'),
  );

  const cancelOrchestraRun = async (run) => {
    const id = run?.id;
    if (!id || runCancelBusy[id] || run.cancelRequested) return;
    if (!window.confirm('ยกเลิกรัน Atlas นี้หรือไม่?\nขั้นที่กำลังทำอยู่จะเล่นจบก่อน แล้วจะหยุดไม่ทำขั้นถัดไป')) return;
    setRunCancelBusy((b) => ({ ...b, [id]: true }));
    try {
      await fetch(`/api/task/${id}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'user-cancelled' }),
      });
    } finally {
      setTimeout(() => setRunCancelBusy((b) => { const n = { ...b }; delete n[id]; return n; }), 1000);
    }
  };

  const create = async () => {
    if (!draft.title.trim()) return;
    setBusy(true);
    try {
      await fetch('/api/task-board', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      });
      setDraft((current) => ({ ...current, title: '' }));
      await window.fetchCOfficeState?.();
    } finally {
      setBusy(false);
    }
  };

  const move = async (task, status) => {
    if (String(task.id || '').startsWith('live:')) return;
    await fetch(`/api/task-board/${task.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, runStatus: status === 'running' ? 'running' : status }),
    });
    await window.fetchCOfficeState?.();
  };

  const labels = { backlog: 'Backlog', running: 'Running', review: 'Review', done: 'Done' };
  const tones = { backlog: 'var(--text-3)', running: 'var(--cyan)', review: 'var(--gold)', done: 'var(--green)' };

  return (
    <div>
      <div className="topbar">
        <div>
          <h1>Operations <span className="accent">Board</span></h1>
          <div className="sub">{(Array.isArray(board.tasks) ? board.tasks.length : 0)} work cards · {(window.TASKS || []).filter(t=>t.status==='running').length} CLI tasks active</div>
        </div>
      </div>

      {activeOrchestraRuns.length > 0 && (
        <div className="panel" style={{ marginBottom: 14, padding: '12px 16px' }}>
          <div className="panel-head" style={{ marginBottom: 10 }}>
            <h3>Orchestrator runs</h3>
            <div className="right mono-s">ส่งจาก Dashboard · ยกเลิก = หยุดหลังขั้นปัจจุบัน</div>
          </div>
          <div className="stack" style={{ gap: 10 }}>
            {activeOrchestraRuns.map((r) => (
              <div
                key={r.id}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
                  padding: '10px 12px', background: 'var(--bg-2)', borderRadius: 8, border: '1px solid var(--border)',
                }}
              >
                <span style={{ color: r.status === 'awaiting-approval' ? 'var(--cyan)' : 'var(--gold)' }}>●</span>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{(r.goal || r.id || '').slice(0, 120)}{(r.goal || '').length > 120 ? '…' : ''}</div>
                  <div className="mono-s" style={{ fontSize: 11, color: 'var(--text-3)' }}>
                    {r.id} · {r.phase || r.status}
                    {r.cancelRequested ? ' · คำขอยกเลิกแล้ว' : ''}
                  </div>
                </div>
                <button
                  type="button"
                  className="btn-ghost"
                  disabled={!!runCancelBusy[r.id] || r.cancelRequested}
                  style={{ fontSize: 12, color: 'var(--red)' }}
                  onClick={() => cancelOrchestraRun(r)}
                >
                  {r.cancelRequested ? 'กำลังยกเลิก…' : runCancelBusy[r.id] ? '…' : 'ยกเลิกรัน'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="task-board-compose">
        <input value={draft.title} onChange={(e)=>setDraft({...draft, title:e.target.value})} placeholder="Create work card"/>
        <select value={draft.agentId} onChange={(e)=>setDraft({...draft, agentId:e.target.value})}>
          {(window.AGENTS || []).map((agent) => <option key={agent.id} value={agent.id}>{agent.name}</option>)}
        </select>
        <select value={draft.provider} onChange={(e)=>setDraft({...draft, provider:e.target.value})}>
          {((window.PROVIDERS?.providers || []).map((p)=>p.name).concat([draft.provider])).filter(Boolean).filter((v,i,a)=>a.indexOf(v)===i).map((provider) => (
            <option key={provider} value={provider}>{provider}</option>
          ))}
        </select>
        <button className="btn primary" disabled={busy} onClick={create}>Add</button>
      </div>

      <div className="task-board-grid">
        {(board.statuses || ['backlog', 'running', 'review', 'done']).map((status) => (
          <section className="task-board-column" key={status} style={{ '--status-color': tones[status] || 'var(--cyan)' }}>
            <div className="task-board-head">
              <span>{labels[status] || status}</span>
              <b>{(board.columns?.[status] || []).length}</b>
            </div>
            <div className="task-board-stack">
              {(board.columns?.[status] || []).map((task) => {
                const agent = (window.AGENTS || []).find((a) => a.id === task.agentId || a.id === task.personaId);
                const live = String(task.id || '').startsWith('live:');
                return (
                  <article className="task-board-card" key={task.id}>
                    <div className="task-board-card-head">
                      <strong>{task.title || task.description || 'Untitled task'}</strong>
                      <span>{task.runStatus || status}</span>
                    </div>
                    <p>{task.description || (live ? 'Live operation from runtime events' : 'Manual operations card')}</p>
                    {live && (
                      <p className="mono-s" style={{ fontSize: 10, color: 'var(--text-4)', marginTop: 4 }}>
                        งานย่อยจาก Claude Code session — ควบคุมได้ที่เทอร์มินัล ไม่ใช่ปุ่มยกเลิกที่นี่
                      </p>
                    )}
                    <div className="row" style={{gap: 8}}>
                      <AgentDot agent={agent} size={24}/>
                      <button className="task-agent-link" onClick={() => agent && onOpenAgent(agent.id)}>{agent?.name || task.agentId || 'Unassigned'}</button>
                    </div>
                    <div className="task-board-events">
                      {(Array.isArray(task.events) ? task.events : []).slice(-3).map((event) => (
                        <span key={event.id}>{event.text}</span>
                      ))}
                    </div>
                    {!live && (
                      <div className="task-board-actions">
                        {['backlog', 'running', 'review', 'done'].filter((s) => s !== status).map((s) => (
                          <button key={s} onClick={() => move(task, s)}>{labels[s]}</button>
                        ))}
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
};

Object.assign(window, { TasksPage: DynamicTasksPage, SettingsPage });
