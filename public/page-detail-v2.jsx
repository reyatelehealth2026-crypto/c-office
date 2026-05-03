/* Agent Detail / Persona Inspector V2 — compact safe override. */

const axColor = (agent) => agent?.rarity === 'SSR' ? 'var(--ux-accent-gold)' : agent?.rarity === 'SR' ? 'var(--ux-accent-primary)' : 'var(--ux-accent-secondary)';
const axFmt = (ts) => {
  if (!ts) return 'unknown';
  const d = Math.max(0, Date.now() - ts);
  const m = Math.floor(d / 60000);
  if (m < 1) return 'now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
};

const axQuick = (agent) => {
  if (agent?.id === 'atlas') return ['Break down this work order and delegate it.', 'Summarize active work and blockers.', 'Create an execution plan.'];
  if (['warden','vector'].includes(agent?.id)) return ['Investigate and fix this bug.', 'Implement this feature safely.', 'Review this code or plan.'];
  if (agent?.id === 'forge') return ['Create a premium design concept.', 'Write a detailed visual asset brief.', 'Polish this UI or brand direction.'];
  return ['Help complete this work order.', 'Summarize this context.', 'Draft a clean usable output.'];
};

const AgentDetailV2 = ({ agent, onBack }) => {
  const [tab, setTab] = React.useState('chat');
  const [input, setInput] = React.useState('');
  const [messages, setMessages] = React.useState([]);
  const [busy, setBusy] = React.useState(false);
  const [runs, setRuns] = React.useState([]);
  if (!agent) return null;

  const refreshRuns = React.useCallback(() => {
    fetch(`/api/agents/${agent.id}/runs?limit=50`).then(r => r.json()).then(j => setRuns(j.runs || [])).catch(() => setRuns([]));
  }, [agent.id]);
  React.useEffect(() => { refreshRuns(); }, [refreshRuns]);

  const send = async (txt) => {
    const msg = txt || input.trim();
    if (!msg || busy) return;
    const id = Date.now();
    const pid = id + 1;
    setBusy(true);
    setInput('');
    setMessages(x => [...x, { id, role:'user', text: msg }, { id: pid, role:'agent', text:'Atlas is starting…', pending:true }]);
    const update = (patch) => setMessages(x => x.map(m => m.id === pid ? { ...m, ...patch } : m));
    try {
      const goal = `Desk Chat for ${agent.name}:\n\n${msg}`;
      const r = await fetch('/api/task', { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ goal }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.run_id) throw new Error(j.error || 'Failed to start run');
      update({ runId: j.run_id, text:`Atlas is running… (${j.run_id})` });
      let final = '';
      let err = '';
      const stop = Date.now() + 600000;
      while (Date.now() < stop) {
        await new Promise(res => setTimeout(res, 1500));
        const rr = await fetch(`/api/task/${j.run_id}`);
        if (!rr.ok) continue;
        const run = await rr.json();
        if (run.phase) update({ text:`Atlas: ${run.phase}… (${j.run_id})` });
        if (['done','failed','cancelled'].includes(run.status)) { final = run.final || ''; err = run.error || ''; break; }
      }
      update({ pending:false, text: final || err || 'Run finished without a final message.' });
      refreshRuns();
    } catch (e) {
      update({ pending:false, error:true, text:'Error: ' + (e.message || e) });
    } finally { setBusy(false); }
  };

  const stats = agent.stats || {};
  const skills = Array.isArray(agent.skills) ? agent.skills : [];
  const personality = agent.personality && typeof agent.personality === 'object' ? agent.personality : {};
  const tabs = ['chat','profile','skills','history'];

  return (
    <div className="ux-agent-detail" style={{ '--agent-color': axColor(agent) }}>
      <div className="ux-agent-backbar"><button className="ux-soft-button" onClick={onBack}>Back</button><span className="ux-mini-meta">agents / {agent.id}</span></div>
      <aside className="ux-agent-rail">
        <section className="ux-agent-hero-card"><div className="ux-agent-big-avatar">{agent.image ? <img src={agent.image} alt={agent.name}/> : <div className="ux-agent-big-fallback" style={{ background: agent.gradient || axColor(agent) }}>{agent.avatarInitials || agent.name?.slice(0,2)}</div>}</div><h2 className="ux-agent-hero-name">{agent.name}</h2><div className="ux-agent-hero-role">{agent.role}</div><div className="ux-agent-hero-tagline">{agent.tagline}</div><div className="ux-agent-traits">{(agent.traits || []).map(t => <span className="ux-event-tag" key={t}>{t}</span>)}</div></section>
        <section className="ux-agent-panel"><div className="ux-agent-panel-head"><h3 className="ux-agent-panel-title">Performance</h3><UXStatusChip label="lifetime" state="muted" /></div><div className="ux-agent-panel-body"><div className="ux-agent-stat-grid"><div className="ux-agent-stat"><b>{stats.tasks || 0}</b><span>tasks</span></div><div className="ux-agent-stat"><b>{stats.success || 0}%</b><span>success</span></div><div className="ux-agent-stat"><b>{stats.uptime || '-'}</b><span>uptime</span></div><div className="ux-agent-stat"><b>{stats.tokens || 0}</b><span>tokens</span></div></div></div></section>
        <section className="ux-agent-panel"><div className="ux-agent-panel-head"><h3 className="ux-agent-panel-title">Current work</h3><UXStatusChip label={agent.status || 'idle'} state={agent.status === 'busy' ? 'busy' : agent.status === 'active' ? 'active' : 'muted'} /></div><div className="ux-agent-panel-body"><div className="ux-agent-assignment">{agent.currentTask || 'No active assignment.'}</div></div></section>
      </aside>
      <main className="ux-agent-workspace"><div className="ux-agent-tabs">{tabs.map(t => <button key={t} className={'ux-agent-tab ' + (tab === t ? 'is-active' : '')} onClick={() => setTab(t)}>{t}</button>)}</div>
        {tab === 'chat' && <section className="ux-agent-chat"><div className="ux-quick-actions">{axQuick(agent).map((q,i) => <button className="ux-soft-button" key={i} onClick={() => send(q)}>{q.split(' ').slice(0,3).join(' ')}</button>)}</div><div className="ux-chat-stream">{messages.length ? messages.map(m => <div key={m.id} className={'ux-chat-row ' + (m.role === 'user' ? 'user' : 'agent')}><div className={m.role === 'user' ? 'ux-user-avatar' : ''}>{m.role === 'user' ? 'U' : <AgentDot agent={agent} size={32}/>}</div><div className={'ux-chat-bubble ' + (m.error ? 'error' : '')}>{m.text}{m.runId && <div style={{ marginTop: 8 }}><a className="ux-mini-meta" href={`/run.html?id=${m.runId}`} target="_blank" rel="noreferrer">open run detail</a></div>}</div></div>) : <UXEmptyState title={`Talk to ${agent.name}`} body="Use a quick action or send a custom desk run." />}</div><div className="ux-chat-input-row"><input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') send(); }} placeholder={`Send work request to ${agent.name}...`} /><button className="ux-hero-button" disabled={busy || !input.trim()} onClick={() => send()}>{busy ? 'Running' : 'Send'}</button></div></section>}
        {tab === 'profile' && <section className="ux-agent-panel"><div className="ux-agent-panel-head"><h3 className="ux-agent-panel-title">Persona profile</h3><UXStatusChip label={agent.rarity || 'R'} state="active" /></div><div className="ux-agent-panel-body"><div className="ux-project-detail-grid">{Object.entries(personality).map(([k,v]) => <div className="ux-project-detail-cell" key={k}><label>{k}</label><b>{v}/100</b></div>)}</div><div className="ux-agent-assignment" style={{ marginTop: 14 }}>{agent.tagline || 'No profile tagline.'}</div></div></section>}
        {tab === 'skills' && <section className="ux-agent-panel"><div className="ux-agent-panel-head"><h3 className="ux-agent-panel-title">Skill matrix</h3><UXStatusChip label={`${skills.length} skills`} state={skills.length ? 'active' : 'muted'} /></div><div className="ux-agent-panel-body"><div className="ux-skill-grid">{skills.length ? skills.map(s => <div className="ux-skill-card-v2" key={s.name}><div className="ux-skill-name-row"><b>{s.name}</b><span className="ux-mini-meta">Lv {s.level || 1}</span></div><div className="ux-skill-bars">{Array.from({length:10}).map((_,i) => <span key={i} className={i < (s.level || 1) ? 'is-on' : ''}/>)}</div></div>) : <UXEmptyState title="No skills listed" body="Skill metadata will appear once configured." />}</div></div></section>}
        {tab === 'history' && <section className="ux-agent-panel"><div className="ux-agent-panel-head"><h3 className="ux-agent-panel-title">Work history</h3><button className="ux-soft-button" onClick={refreshRuns}>Refresh</button></div><div className="ux-agent-panel-body"><div className="ux-history-list">{runs.length ? runs.map(r => <a className="ux-history-item" key={r.id} href={`/run.html?id=${r.id}`} target="_blank" rel="noreferrer"><span className="ux-history-dot"/><div><div className="ux-history-title">{r.goal || '(no goal)'}</div><div className="ux-history-meta">{r.status} · {r.stepCount || 0} steps · {axFmt(r.startedAt)}</div></div><span className="ux-mini-meta">open</span></a>) : <UXEmptyState title="No runs yet" body={`Run work through ${agent.name} to build history.`}/>}</div></div></section>}
      </main>
    </div>
  );
};

window.AgentDetail = AgentDetailV2;
