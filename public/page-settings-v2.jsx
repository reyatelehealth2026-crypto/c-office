/* Settings / Connections V2 — trust-focused control room override. */

const SX_PROVIDERS = [
  { id: 'anthropic', name: 'Anthropic', desc: 'Claude / Atlas SDK connection', color: 'var(--ux-accent-gold)', tokenHint: 'sk-ant-…' },
  { id: 'google', name: 'Google Gemini', desc: 'Gemini / image generation / OAuth or API key', color: 'var(--ux-success)', tokenHint: 'Gemini API key' },
  { id: 'openai', name: 'OpenAI', desc: 'GPT-compatible provider runtime', color: 'var(--ux-accent-secondary)', tokenHint: 'sk-…' },
  { id: 'replicate', name: 'Replicate', desc: 'Image/model fallback provider', color: 'var(--ux-accent-pink)', tokenHint: 'r8_…' },
  { id: 'codex', name: 'Codex OAuth', desc: 'Local Codex auth for image/tool workflows', color: 'var(--ux-accent-primary)', tokenHint: '' },
];

const SX_HOOK_EVENTS = ['SessionStart','SessionEnd','UserPromptSubmit','PreToolUse','PostToolUse','SubagentStart','SubagentStop','Stop'];

const sxConnected = (status, id) => !!(status?.[id]?.connected || status?.[id]?.available);
const sxMode = (status, id) => status?.[id]?.mode || (sxConnected(status, id) ? 'connected' : 'not connected');
const sxInstalledHook = (settings, ev) => {
  const groups = settings?.hooks?.[ev] || [];
  return groups.some(g => (g.hooks || []).some(h => typeof h.command === 'string' && h.command.includes('c-office:post-event')));
};

const SXProviderCard = ({ p, status, busy, token, setToken, onSave, onDisconnect, onTest, test }) => {
  const connected = sxConnected(status, p.id);
  return (
    <div className="ux-provider-card-v2" style={{ '--provider-color': p.color }}>
      <div className="ux-provider-card-top">
        <div>
          <div className="ux-provider-card-name">{p.name}</div>
          <div className="ux-provider-card-desc">{p.desc}</div>
          <div className="ux-provider-card-desc">Mode: {sxMode(status, p.id)}</div>
        </div>
        <UXStatusChip label={connected ? 'ready' : 'setup'} state={connected ? 'active' : 'danger'} />
      </div>
      <div className="ux-provider-card-actions">
        <button className="ux-soft-button" disabled={!connected || busy} onClick={() => onTest(p.id)}>{test?.pending ? 'Testing…' : 'Test'}</button>
        {connected && p.id !== 'codex' ? <button className="ux-soft-button" disabled={busy} onClick={() => onDisconnect(p.id)}>Disconnect</button> : null}
        {p.id === 'anthropic' && !connected ? <a className="ux-hero-button" href="/auth/anthropic/connect">Connect</a> : null}
        {p.id === 'google' && !connected && status?.google?.hasClientId ? <a className="ux-hero-button" href="/auth/google/start">OAuth</a> : null}
      </div>
      {!connected && p.tokenHint && (
        <div className="ux-token-row">
          <input type="password" placeholder={p.tokenHint} value={token || ''} onChange={e => setToken(p.id, e.target.value)} />
          <button className="ux-button-primary" disabled={busy || !(token || '').trim()} onClick={() => onSave(p.id)}>Save</button>
        </div>
      )}
      {test && !test.pending && (
        <div className="ux-trust-row" data-severity={test.ok ? 'ok' : 'warn'}>
          <div><div className="ux-runtime-name">{test.ok ? 'Probe OK' : 'Probe failed'}</div><div className="ux-runtime-detail">{test.error || test.hint || test.model || test.latencyMs || 'checked'}</div></div>
          <UXStatusChip label={test.ok ? 'ok' : 'fail'} state={test.ok ? 'active' : 'danger'} />
        </div>
      )}
    </div>
  );
};

const SettingsPageV2 = () => {
  window.useCOfficeRefresh?.();
  const [auth, setAuth] = React.useState(null);
  const [settings, setSettings] = React.useState(null);
  const [profile, setProfile] = React.useState({ text: '', defaultTemplate: '', bytes: 0, path: '' });
  const [tokens, setTokens] = React.useState({});
  const [busy, setBusy] = React.useState(null);
  const [tests, setTests] = React.useState({});
  const [profileStatus, setProfileStatus] = React.useState('');

  const refresh = React.useCallback(() => {
    fetch('/api/auth/status').then(r => r.json()).then(setAuth).catch(() => {});
    fetch('/api/settings').then(r => r.json()).then(setSettings).catch(() => {});
    fetch('/api/user-profile').then(r => r.json()).then(j => setProfile({ text: j.text || '', defaultTemplate: j.defaultTemplate || '', bytes: j.bytes || 0, path: j.path || '' })).catch(() => {});
  }, []);
  React.useEffect(() => { refresh(); }, [refresh]);

  const setToken = (id, value) => setTokens(s => ({ ...s, [id]: value }));
  const saveToken = async (provider) => {
    setBusy(provider);
    try {
      const r = await fetch('/api/auth/token', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ provider, token: tokens[provider] }) });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'save failed');
      setTokens(s => ({ ...s, [provider]: '' }));
      refresh();
    } catch (e) { alert(e.message || e); }
    finally { setBusy(null); }
  };
  const disconnect = async (provider) => {
    setBusy(provider);
    try { await fetch('/api/auth/disconnect', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ provider }) }); refresh(); }
    finally { setBusy(null); }
  };
  const testProvider = async (provider) => {
    setTests(s => ({ ...s, [provider]: { pending: true } }));
    try {
      const r = await fetch(`/api/auth/test/${provider}`, { method: 'POST' });
      const j = await r.json().catch(() => ({ ok: false, error: 'invalid response' }));
      setTests(s => ({ ...s, [provider]: j }));
    } catch (e) { setTests(s => ({ ...s, [provider]: { ok: false, error: e.message } })); }
  };
  const saveProfile = async () => {
    setProfileStatus('Saving…');
    try {
      const r = await fetch('/api/user-profile', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: profile.text }) });
      const j = await r.json();
      if (!r.ok || j.ok === false) throw new Error(j.error || 'save failed');
      setProfileStatus('Saved. New agent runs will include this profile.');
      setTimeout(() => setProfileStatus(''), 3500);
    } catch (e) { setProfileStatus(`Failed: ${e.message || e}`); }
  };

  const hookInstalled = SX_HOOK_EVENTS.filter(ev => sxInstalledHook(settings, ev)).length;
  const liveSessions = (window.STATE_SESSIONS || []).filter(s => !s.endedAt);
  const runtimes = window.PROVIDERS?.providers || [];
  const providerReady = SX_PROVIDERS.filter(p => sxConnected(auth, p.id)).length;
  const exposed = location.hostname !== '127.0.0.1' && location.hostname !== 'localhost';

  return (
    <div className="ux-settings">
      <section className="ux-settings-hero">
        <div>
          <div className="ux-hero-kicker">Control Room</div>
          <h2>ตั้งค่าระบบให้พร้อมรบแบบไม่หลงในถ้ำ config</h2>
          <p>Connections, hooks, sessions, credentials และ trust signals รวมไว้ในหน้าเดียว อ่านง่ายกว่าเดิมและยังใช้ backend contract เดิมทั้งหมด.</p>
        </div>
        <div style={{ display:'flex', gap: 8, flexWrap:'wrap', justifyContent:'flex-end' }}>
          <UXStatusChip label={`${providerReady} providers`} state={providerReady ? 'active' : 'danger'} />
          <UXStatusChip label={`${hookInstalled}/${SX_HOOK_EVENTS.length} hooks`} state={hookInstalled === SX_HOOK_EVENTS.length ? 'active' : 'busy'} />
          <button className="ux-soft-button" onClick={refresh}>Refresh</button>
        </div>
      </section>

      <main className="ux-settings-panel">
        <div className="ux-settings-head"><div className="ux-settings-title-row"><h3 className="ux-settings-title">Provider connections</h3><UXStatusChip label="encrypted local" state="active" /></div><div className="ux-settings-subtitle">Tokens are stored locally in encrypted `~/.c-office/credentials.json`. Test only probes connected providers.</div></div>
        <div className="ux-settings-body"><div className="ux-provider-grid-v2">{SX_PROVIDERS.map(p => <SXProviderCard key={p.id} p={p} status={auth || {}} busy={busy === p.id} token={tokens[p.id]} setToken={setToken} onSave={saveToken} onDisconnect={disconnect} onTest={testProvider} test={tests[p.id]} />)}</div></div>
      </main>

      <aside className="ux-settings-side">
        <section className="ux-settings-panel"><div className="ux-settings-head"><h3 className="ux-settings-title">Trust & access</h3><div className="ux-settings-subtitle">Local-first safety signals.</div></div><div className="ux-settings-body ux-trust-stack">
          <div className="ux-trust-row" data-severity={exposed ? 'warn' : 'ok'}><div><div className="ux-runtime-name">Host</div><div className="ux-trust-detail">{location.host} {exposed ? 'appears externally reachable' : 'local browser host'}</div></div><UXStatusChip label={exposed ? 'check token' : 'local'} state={exposed ? 'busy' : 'active'} /></div>
          <div className="ux-trust-row" data-severity="ok"><div><div className="ux-runtime-name">Credential store</div><div className="ux-trust-detail">Encrypted local file under ~/.c-office/credentials.json. Never commit it.</div></div><UXStatusChip label="local" state="active" /></div>
          <div className="ux-trust-row" data-severity={hookInstalled === SX_HOOK_EVENTS.length ? 'ok' : 'warn'}><div><div className="ux-runtime-name">Claude hooks</div><div className="ux-trust-detail">Run npm run install-hooks, then restart Claude sessions.</div></div><UXStatusChip label={`${hookInstalled}/${SX_HOOK_EVENTS.length}`} state={hookInstalled === SX_HOOK_EVENTS.length ? 'active' : 'busy'} /></div>
        </div></section>

        <section className="ux-settings-panel"><div className="ux-settings-head"><h3 className="ux-settings-title">Live sessions</h3><div className="ux-settings-subtitle">Detected Claude Code sources.</div></div><div className="ux-settings-body ux-session-list">{liveSessions.length ? liveSessions.map(s => <div className="ux-session-row" key={s.sessionId}><div><div className="ux-session-name">{s.personaId || 'session'} · PID {s.pid}</div><div className="ux-session-detail">{s.cwd || 'no cwd'}</div></div><UXStatusChip label={s.kind || 'live'} state="active" /></div>) : <UXEmptyState title="No live sessions" body="Start Claude Code after installing hooks." />}</div></section>
      </aside>

      <section className="ux-settings-panel"><div className="ux-settings-head"><div className="ux-settings-title-row"><h3 className="ux-settings-title">Hook diagnostics</h3><UXStatusChip label={`${hookInstalled} installed`} state={hookInstalled ? 'active' : 'danger'} /></div><div className="ux-settings-subtitle">Checks ~/.claude/settings.json via /api/settings.</div></div><div className="ux-settings-body ux-hook-list">{SX_HOOK_EVENTS.map(ev => { const ok = sxInstalledHook(settings, ev); return <div className="ux-hook-row" key={ev}><div><div className="ux-hook-name">{ev}</div><div className="ux-hook-detail">{ok ? 'C-Office hook command detected' : 'Missing or disabled'}</div></div><UXStatusChip label={ok ? 'installed' : 'off'} state={ok ? 'active' : 'muted'} /></div>; })}</div></section>

      <section className="ux-settings-panel"><div className="ux-settings-head"><h3 className="ux-settings-title">Provider runtimes</h3><div className="ux-settings-subtitle">CLI availability for dispatch providers.</div></div><div className="ux-settings-body ux-runtime-list">{runtimes.length ? runtimes.map(p => <div className="ux-runtime-row" key={p.name}><div><div className="ux-runtime-name">{p.name}</div><div className="ux-runtime-detail">{p.display || p.description}</div></div><UXStatusChip label={p.available ? 'available' : 'missing'} state={p.available ? 'active' : 'danger'} /></div>) : <UXEmptyState title="No runtime catalog" body="Provider metadata has not loaded yet." />}</div></section>

      <section className="ux-settings-panel" style={{ gridColumn:'1 / -1' }}><div className="ux-settings-head"><div className="ux-settings-title-row"><h3 className="ux-settings-title">User profile for agents</h3><UXStatusChip label={`${profile.bytes || 0} bytes`} state={profile.text ? 'active' : 'muted'} /></div><div className="ux-settings-subtitle">This Markdown is appended to persona system prompts in future runs.</div></div><div className="ux-settings-body"><textarea className="ux-profile-textarea" value={profile.text || ''} onChange={e => setProfile({ ...profile, text: e.target.value })} placeholder={profile.defaultTemplate || '# About me'} spellCheck={false} /><div className="ux-profile-actions"><button className="ux-hero-button" onClick={saveProfile}>Save profile</button><button className="ux-soft-button" onClick={() => setProfile({ ...profile, text: profile.defaultTemplate || '' })}>Use template</button><button className="ux-soft-button" onClick={refresh}>Reload</button>{profileStatus && <span className="ux-section-subtitle">{profileStatus}</span>}</div></div></section>
    </div>
  );
};

window.SettingsPage = SettingsPageV2;
