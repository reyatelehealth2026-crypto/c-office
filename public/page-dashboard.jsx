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
const SendToOrchestra = ({ onStarted }) => {
  const [goal, setGoal] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [authStatus, setAuthStatus] = React.useState(null);
  const [workflows, setWorkflows] = React.useState([]);
  const [workflow, setWorkflow] = React.useState('');
  const [projects, setProjects] = React.useState([]);
  const [projectId, setProjectId] = React.useState('');
  const [provider, setProvider] = React.useState('claude');
  const [showNewProject, setShowNewProject] = React.useState(false);
  const [newProjectName, setNewProjectName] = React.useState('');

  const placeholders = [
    'Summarize TikTok trends for 2026...',
    'Write a marketing article about our product...',
    'Research competitor pricing strategies...',
    'Analyze social media engagement data...',
    'Draft a weekly progress report...',
    'Find market opportunities in Southeast Asia...',
    'Create a content calendar for next month...',
    'Generate user personas from analytics...',
  ];
  const [placeholderIdx, setPlaceholderIdx] = React.useState(0);

  React.useEffect(() => {
    const id = setInterval(() => setPlaceholderIdx(i => (i + 1) % placeholders.length), 3000);
    return () => clearInterval(id);
  }, []);

  React.useEffect(() => {
    fetch('/api/auth/status').then(r => r.json()).then(setAuthStatus).catch(()=>{});
    fetch('/api/workflows').then(r => r.json()).then(j => setWorkflows(j.workflows || [])).catch(()=>{});
    fetch('/api/projects').then(r => r.json()).then(j => setProjects(j.projects || [])).catch(()=>{});
    const refresh = () => {
      if (window.AUTH_STATUS) setAuthStatus(window.AUTH_STATUS);
    };
    window.COfficeBus?.addEventListener('refresh', refresh);
    return () => window.COfficeBus?.removeEventListener('refresh', refresh);
  }, []);

  const submit = async () => {
    if (!goal.trim() || busy) return;
    setBusy(true);
    try {
      const r = await fetch('/api/task', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          goal: goal.trim(),
          workflow: workflow || undefined,
          projectId: projectId || undefined,
          provider: provider || undefined,
        }),
      });
      const j = await r.json();
      if (!r.ok) {
        alert(j.error || 'Failed to start run');
      } else {
        setGoal('');
        if (onStarted) onStarted(j.run_id);
        if (typeof window.openRunWindow === 'function') window.openRunWindow(j.run_id);
      }
    } finally { setBusy(false); }
  };

  const isProviderConnected = (p) => {
    if (!authStatus) return false;
    if (p === 'claude') return !!authStatus.anthropic?.connected;
    if (p === 'gemini') return !!authStatus.google?.connected;
    if (p === 'codex') return !!authStatus.openai?.connected;
    return false;
  };

  return (
    <div className="task-bar task-bar-premium">
      <div className="task-bar-icon">⚡</div>
      <input
        type="text"
        value={goal}
        onChange={e => setGoal(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') submit(); }}
        disabled={busy}
        placeholder={isProviderConnected(provider) ? placeholders[placeholderIdx] : `Connect ${provider} in Settings first`}
      />
      <select
        value={provider}
        onChange={e => setProvider(e.target.value)}
        disabled={busy}
        title="AI Provider for this run"
        style={{
          background: 'var(--bg-2)', color: 'var(--text-1)',
          border: '1px solid var(--border)', borderRadius: 6,
          padding: '6px 8px', fontSize: 12,
          fontFamily: 'var(--font-mono)',
        }}>
        <option value="claude">Claude</option>
        <option value="gemini">Gemini</option>
        <option value="codex">Codex</option>
      </select>
      <select
        value={projectId}
        onChange={e => {
          if (e.target.value === '__new__') { setShowNewProject(true); return; }
          setProjectId(e.target.value);
        }}
        disabled={busy}
        title="Group runs into a project (scopes the skill library)"
        style={{
          background: 'var(--bg-2)', color: 'var(--text-1)',
          border: '1px solid var(--border)', borderRadius: 6,
          padding: '6px 8px', fontSize: 12,
          fontFamily: 'var(--font-mono)',
        }}>
        <option value="">no project</option>
        {projects.map(p => (
          <option key={p.id} value={p.id}>{p.name}</option>
        ))}
        <option value="__new__">+ new project...</option>
      </select>
      {showNewProject && (
        <span style={{display: 'flex', gap: 4}}>
          <input
            type="text"
            value={newProjectName}
            onChange={e => setNewProjectName(e.target.value)}
            placeholder="project name"
            style={{
              background: 'var(--bg-2)', color: 'var(--text-1)',
              border: '1px solid var(--border)', borderRadius: 6,
              padding: '6px 8px', fontSize: 12, width: 140,
            }}/>
          <button className="btn-ghost" style={{fontSize: 11}} onClick={async () => {
            const name = newProjectName.trim();
            if (!name) return;
            try {
              const r = await fetch('/api/projects', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name }),
              });
              const j = await r.json();
              if (r.ok && j.project) {
                setProjects(prev => [j.project, ...prev]);
                setProjectId(j.project.id);
                setNewProjectName('');
                setShowNewProject(false);
              } else {
                alert(j.error || 'Failed to create project');
              }
            } catch (err) { alert(err.message); }
          }}>create</button>
          <button className="btn-ghost" style={{fontSize: 11}} onClick={() => {
            setShowNewProject(false); setNewProjectName('');
          }}>cancel</button>
        </span>
      )}
      {workflows.length > 0 && (
        <select
          value={workflow}
          onChange={e => setWorkflow(e.target.value)}
          disabled={busy}
          title={workflow ? workflows.find(w => w.name === workflow)?.description : 'Auto-plan (LLM decomposes goal)'}
          style={{
            background: 'var(--bg-2)', color: 'var(--text-1)',
            border: '1px solid var(--border)', borderRadius: 6,
            padding: '6px 8px', fontSize: 12,
            fontFamily: 'var(--font-mono)',
          }}>
          <option value="">auto-plan</option>
          {workflows.map(w => (
            <option key={w.name} value={w.name}>{w.name} ({w.steps})</option>
          ))}
        </select>
      )}
      <button className="btn-primary-task"
        onClick={submit} disabled={busy || !goal.trim() || !isProviderConnected(provider)}>
        {busy ? 'Sending...' : 'Send'}
      </button>
    </div>
  );
};

// StepCard: A standalone component for each agent's turn
const StepCard = ({ card, active, copiedKey, copy }) => {
  const agent = (window.AGENTS || []).find((a) => a.id === card.plan.persona);
  const status = !card.step ? 'pending'
    : card.step.result?.ok ? 'done'
    : card.step.result ? 'failed' : 'running';
  
  const statusColor = {
    pending: 'var(--text-4)',
    running: 'var(--gold)',
    done: 'var(--green)',
    failed: 'var(--red)',
  }[status];

  const output = card.step?.result?.text || card.step?.result?.error || '';
  const image = card.step?.result?.image;

  // Helper to extract [📸 ...] tags and return clean text + tags
  const parseOutput = (str) => {
    const tags = [];
    const clean = str.replace(/\[📸\s*([^\]]+)\]/g, (match, p1) => {
      tags.push(p1.trim());
      return '';
    });
    return { clean: clean.trim(), tags };
  };

  const { clean, tags } = parseOutput(output);

  return (
    <div className={`step-card ${active ? 'is-active' : ''}`} style={{
      border: active ? '2px solid var(--gold)' : '1px solid var(--border)',
      borderRadius: 12,
      background: 'var(--bg-2)',
      boxShadow: active ? '0 0 20px rgba(255, 191, 0, 0.2)' : '0 4px 12px rgba(0,0,0,0.1)',
      overflow: 'hidden',
      transition: 'all 0.3s ease',
      transform: active ? 'scale(1.02)' : 'none',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '12px 16px',
        background: active ? 'rgba(255,191,0,0.05)' : 'rgba(255,255,255,0.03)',
        borderBottom: '1px solid var(--border)',
      }}>
        <AgentDot agent={agent} size={36}/>
        <div style={{flex: 1}}>
          <div style={{fontSize: 14, fontWeight: 700, display:'flex', alignItems:'center', gap:8}}>
            {agent?.name || card.plan.persona}
            <span style={{fontSize: 10, padding: '2px 6px', borderRadius: 4, background: statusColor, color: 'var(--bg-0)', textTransform: 'uppercase', fontWeight: 600}}>
              {status}
            </span>
            {active && <span className="pulse-text" style={{color: 'var(--gold)', fontSize: 10, fontWeight: 700}}>ACTIVE TURN ◀</span>}
          </div>
          <div style={{fontSize: 11, color: 'var(--text-3)', marginTop: 2}}>
             {card.plan.instruction}
          </div>
        </div>
      </div>
      <div style={{padding: 16, background: active ? 'var(--bg-2)' : 'var(--bg-1)'}}>
        {card.step ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* Actual Generated Image Box */}
            {image && (
              <div style={{
                background: 'var(--bg-0)', border: '1px solid var(--border)',
                borderRadius: 12, padding: 8, textAlign: 'center'
              }}>
                <img src={image.url} alt="Generated" style={{ maxWidth: '100%', borderRadius: 8, display:'block', margin: '0 auto', maxHeight: 500 }} />
                <div style={{ fontSize: 10, color: 'var(--text-4)', marginTop: 8, fontFamily: 'var(--font-mono)' }}>
                  {image.model} via {image.provider}
                </div>
              </div>
            )}

            {/* Text Content */}
            {clean && (
              <div style={{
                fontSize: 14, lineHeight: 1.6,
                color: status === 'failed' ? 'var(--red)' : 'var(--text-1)',
                whiteSpace: 'pre-wrap',
              }}>
                 {clean}
              </div>
            )}

            {/* Visual Prompt Suggestions (Tags) */}
            {tags.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
                {tags.map((tag, i) => (
                  <div key={i} style={{ 
                    background: 'rgba(0, 240, 255, 0.05)', border: '1px solid rgba(0, 240, 255, 0.15)',
                    borderRadius: 8, padding: '10px 14px', fontSize: 12, color: 'var(--accent-cyan)'
                  }}>
                    <div style={{ fontWeight: 600, fontSize: 10, textTransform: 'uppercase', marginBottom: 4, opacity: 0.8 }}>🎨 Visual Prompt Suggestion</div>
                    {tag}
                  </div>
                ))}
              </div>
            )}

            {!output && !image && (
              <div style={{padding: 20, textAlign:'center'}}>
                <div className="loader-dots"><span>Agent is working</span></div>
              </div>
            )}
          </div>
        ) : (
          <div style={{color: 'var(--text-4)', fontStyle: 'italic', fontSize: 13, textAlign: 'center', padding: '10px 0'}}>
            Waiting for previous tasks...
          </div>
        )}
      </div>
      {card.step && output && (
        <div style={{padding: '8px 16px', background: 'var(--bg-2)', borderTop: '1px solid var(--border)', display:'flex', justifyContent:'flex-end'}}>
          <button className="btn-ghost" style={{fontSize: 11}} onClick={() => copy(output, `step-${card.idx}`)}>
            {copiedKey === `step-${card.idx}` ? '✓ Copied' : '📋 Copy All'}
          </button>
        </div>
      )}
    </div>
  );
};

const TeamTimeline = ({ forceRunId }) => {
  const [runs, setRuns] = React.useState(window.RUNS || []);
  const [scratchOpen, setScratchOpen] = React.useState(false);
  const [copiedKey, setCopiedKey] = React.useState(null);
  const [cancelling, setCancelling] = React.useState(false);
  const [chatBackText, setChatBackText] = React.useState('');
  const [chatting, setChatting] = React.useState(false);

  React.useEffect(() => {
    const refresh = () => setRuns(window.RUNS || []);
    window.COfficeBus?.addEventListener('refresh', refresh);
    return () => window.COfficeBus?.removeEventListener('refresh', refresh);
  }, []);

  const run = forceRunId ? runs.find(r => r.id === forceRunId) : (runs.find(r => r.status === 'running') || runs[0]);

  const copy = async (text, key) => {
    try { await navigator.clipboard.writeText(text); }
    catch { window.prompt('Copy', text); }
    setCopiedKey(key);
    setTimeout(() => setCopiedKey((k) => (k === key ? null : k)), 1400);
  };

  const cancelRun = async () => {
    if (!run || cancelling) return;
    if (!window.confirm('Cancel this run? In-flight steps finish; remaining steps are skipped.')) return;
    setCancelling(true);
    try {
      await fetch(`/api/task/${run.id}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'user-cancelled' }),
      });
    } finally {
      setTimeout(() => setCancelling(false), 1500);
    }
  };

  const openInNotes = () => {
    if (!run) return;
    window.dispatchEvent(new CustomEvent('c-office:navigate', {
      detail: { page: 'notes', preset: { title: run.goal, body: run.final || '' } },
    }));
  };

  const sendChatBack = async () => {
    if (!run || !chatBackText.trim()) return;
    setChatting(true);
    try {
      const res = await fetch(`/api/task/${run.id}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: chatBackText.trim() }),
      });
      if (!res.ok) {
        const j = await res.json();
        alert(j.error || 'Failed to send chat');
      } else {
        setChatBackText('');
      }
    } catch (e) { alert(e.message); }
    finally { setChatting(false); }
  };

  if (!run) return null;

  const isLive = run.status === 'running' || run.status === 'awaiting-approval';
  const isClarifying = run.phase === 'clarify';

  const phaseLabel = {
    plan: 'Boss Review',
    clarify: 'Clarification Needed',
    execute: 'Production',
    critique: 'Quality Audit',
    verify: 'Verification',
    done: 'Finished',
  }[run.phase || 'execute'] || (isLive ? 'Working' : 'Done');

  const phaseColor = run.status === 'failed' ? 'var(--red)' : run.status === 'done' ? 'var(--green)' : 'var(--gold)';

  const plan = Array.isArray(run.plan) ? run.plan : [];
  const scratch = Array.isArray(run.scratchpad) ? run.scratchpad : [];

  const sevColor = (sev) => {
    const s = String(sev || 'none').toLowerCase();
    if (s === 'critical') return 'var(--red)';
    if (s === 'high') return '#e85d04';
    if (s === 'med') return 'var(--gold)';
    if (s === 'low') return 'var(--text-3)';
    return 'var(--green)';
  };
  
  const bossAnalysis = [...scratch].reverse().find(s => s.kind === 'analysis')?.text;

  // Build per-persona step cards: align plan entries with executed steps.
  const cards = plan.map((p, i) => {
    const matched = (run.steps || []).find((s) => s.persona === p.persona && s.instruction === p.instruction);
    return { idx: i, plan: p, step: matched };
  });

  const activeStepIdx = cards.findIndex(c => !c.step || !c.step.result?.ok);

  return (
    <div className="panel" style={{ marginBottom: 14, padding: 0, border: '1px solid var(--border)', background: 'var(--bg-1)' }}>
      {/* Header bar */}
      <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', background: 'linear-gradient(180deg, var(--bg-1), var(--bg-0))' }}>
        <div style={{display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap'}}>
          <div style={{flex: 1, minWidth: 240}}>
            <div style={{display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6, flexWrap: 'wrap'}}>
              <span style={{color: phaseColor, fontSize: 14}}>{isLive ? '●' : run.status === 'failed' ? '✕' : '✓'}</span>
              <h3 style={{margin: 0, fontSize: 14}}>{phaseLabel}</h3>
              {run.revisions > 0 && <span className="chip" style={{fontSize: 10}}>rev {run.revisions}</span>}
            </div>
            <div style={{fontSize: 13, color: 'var(--text-1)', fontWeight: 600}}>{run.goal}</div>
          </div>
          <div style={{display:'flex', gap:6}}>
            {isLive && (
              <button onClick={cancelRun} disabled={cancelling || run.cancelRequested} style={{ fontSize: 11, padding: '6px 12px', border: '1px solid var(--red)', borderRadius: 6, background: 'transparent', color: 'var(--red)', cursor: (cancelling || run.cancelRequested) ? 'not-allowed' : 'pointer' }}>
                {run.cancelRequested ? 'cancelling…' : '⏹ Cancel'}
              </button>
            )}
            <a href={`/api/task/${run.id}/trace`} target="_blank" rel="noreferrer" className="btn-ghost" style={{fontSize: 11, padding: '6px 10px', textDecoration:'none'}}>↗ Trace</a>
          </div>
        </div>
      </div>

      <div style={{padding: 16, display: 'flex', flexDirection: 'column', gap: 16}}>
        {/* BossDesk Card (Initial Analysis) */}
        {bossAnalysis && (
          <div style={{
            background: isClarifying ? 'rgba(255, 60, 0, 0.05)' : 'rgba(0, 240, 255, 0.05)',
            border: `1px solid ${isClarifying ? 'var(--red)' : 'var(--accent-cyan)'}`,
            borderRadius: 12, padding: 16, boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
          }}>
            <div style={{fontWeight: 700, fontSize: 14, color: isClarifying ? 'var(--red)' : 'var(--accent-cyan)', marginBottom: 8, display:'flex', alignItems:'center', gap:8}}>
              <span>{isClarifying ? '❓' : '👔'}</span> {isClarifying ? 'Boss needs clarification' : 'Boss Analysis'}
            </div>
            <div style={{fontSize: 14, lineHeight: 1.6, color: 'var(--text-1)'}}>
              {bossAnalysis}
            </div>
          </div>
        )}

        {/* Turn Cards */}
        {cards.map((card, i) => (
          <StepCard 
            key={i} 
            card={card} 
            active={isLive && !isClarifying && i === activeStepIdx}
            copiedKey={copiedKey}
            copy={copy}
          />
        ))}

        {/* Final deliverable + actions */}
        {run.final && (
          <div style={{ padding: 14, background: 'var(--bg-2)', borderRadius: 12, borderLeft: '4px solid var(--green)' }}>
            <div style={{display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10}}>
              <b style={{fontSize: 14}}>✦ Final deliverable</b>
            </div>
            <pre style={{ margin: 0, padding: 12, background: 'var(--bg-0)', borderRadius: 6, fontSize: 13, lineHeight: 1.6, maxHeight: 480, overflowY: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: 'var(--text-1)', fontFamily: 'inherit' }}>{run.final}</pre>
            <div style={{display: 'flex', gap: 8, marginTop: 10}}>
              <button className="btn-ghost" style={{fontSize: 12}} onClick={() => copy(run.final, 'final')}>📋 Copy</button>
              <button className="btn-ghost" style={{fontSize: 12}} onClick={openInNotes}>✎ Open in Notes</button>
            </div>
          </div>
        )}

        {/* Chat Back / Interaction Box */}
        <div style={{ marginTop: 8, padding: 16, background: 'var(--bg-2)', borderRadius: 12, border: isClarifying ? '2px solid var(--gold)' : '1px dashed var(--border)' }}>
          <div style={{fontWeight: 600, fontSize: 13, marginBottom: 12, color: 'var(--accent-cyan)'}}>
            {isClarifying ? '👉 ตอบกลับคำถามของหัวหน้า:' : '💬 คุยต่อ/สั่งงานเพิ่ม:'}
          </div>
          <div style={{display:'flex', gap:10}}>
            <textarea 
              value={chatBackText}
              onChange={e => setChatBackText(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChatBack(); } }}
              placeholder={isClarifying ? "พิมพ์คำตอบของคุณที่นี่..." : "ต้องการให้แก้ไขหรือทำอะไรต่อ..."}
              disabled={chatting}
              style={{ flex: 1, height: 70, padding: 12, borderRadius: 8, background: 'var(--bg-0)', color: 'var(--text-1)', border: '1px solid var(--border)', fontSize: 13, resize: 'none' }}
            />
            <button className="btn gold" onClick={sendChatBack} disabled={chatting || !chatBackText.trim()} style={{width: 80, fontWeight: 700}}>ส่ง</button>
          </div>
        </div>
      </div>
    </div>
  );
};

const Dashboard = ({ layout, setLayout, onOpenAgent }) => {
  const agents = Array.isArray(window.AGENTS) ? window.AGENTS : [];
  const runs = Array.isArray(window.RUNS) ? window.RUNS : [];
  const [selectedRunId, setSelectedRunId] = React.useState(null);
  
  const activity = Array.isArray(window.ACTIVITY) ? window.ACTIVITY : [];
  const sessions = Array.isArray(window.STATE_SESSIONS) ? window.STATE_SESSIONS : [];
  const tasks = Array.isArray(window.TASKS) ? window.TASKS : [];
  const dispatches = Array.isArray(window.DISPATCHES) ? window.DISPATCHES : [];
  const stats = window.STATS || {};
  const totalTokens = stats.tokensToday || 0;
  const totalCost = (stats.spendToday || 0).toFixed(2);
  const activeTasks = stats.tasksRunning || 0;
  const agentsOnline = stats.agentsOnline || 0;
  const providerStatus = window.AUTH_STATUS || {};
  const providers = [{ key: 'anthropic', label: 'Anthropic' }, { key: 'openai', label: 'OpenAI' }, { key: 'google', label: 'Google' }];
  const recentRuns = runs.slice(0, 10);
  const timeline = activity.slice(-8).reverse();
  const runningNow = runs.filter(r => r?.status === 'running').length;
  const pendingTasks = tasks.filter(t => t?.status !== 'done' && t?.status !== 'completed').length;

  return (
    <div>
      <div className="topbar">
        <div>
          <h1>Sim Office <span className="accent">Operations Workfloor</span></h1>
          <div className="mono-s">Office floor control tower</div>
          <div className="sub">Control tower · {agentsOnline} online · {runningNow} live runs · {sessions.filter(s => !s?.endedAt).length} active sessions</div>
        </div>
        <div className="topbar-actions"><span className="chip"><span className="dot"/> Live</span></div>
      </div>
      <SendToOrchestra onStarted={(id) => setSelectedRunId(id)}/>
      
      <div className="grid dashboard-grid" style={{marginBottom: 14}}>
        <div className="panel"><div className="panel-head"><h3>Gateway & Provider Health</h3></div>{providers.map(p => <div key={p.key} className="feed-row" style={{cursor:'default'}}><div style={{width:8,height:8,borderRadius:'50%',background:providerStatus?.[p.key]?.connected ? 'var(--green)' : 'var(--red)'}}/><div style={{fontSize:12}}><b>{p.label}</b> <span className="mono-s" style={{color:'var(--text-3)'}}>{providerStatus?.[p.key]?.connected ? 'connected' : 'disconnected'}</span></div></div>)}</div>
        <div className="panel"><div className="panel-head"><h3>Model / Session / Task Summary</h3></div><div className="mono-s">{agents.length} agents · {sessions.length} sessions · {pendingTasks} open tasks · {dispatches.length} dispatches</div></div>
      </div>

      <TeamTimeline forceRunId={selectedRunId}/>

      <div className="stats-strip">
        <div className="stat-card"><div className="stat-icon tokens">🔥</div><div><div className="stat-value">{totalTokens.toLocaleString()}</div><div className="stat-label">Tokens today</div></div></div>
        <div className="stat-card"><div className="stat-icon tasks">📋</div><div><div className="stat-value">{activeTasks}</div><div className="stat-label">Running tasks</div></div></div>
        <div className="stat-card"><div className="stat-icon agents">👥</div><div><div className="stat-value">{agentsOnline}</div><div className="stat-label">Agents online</div></div></div>
        <div className="stat-card"><div className="stat-icon spend">💰</div><div><div className="stat-value">${totalCost}</div><div className="stat-label">Spend today</div></div></div>
      </div>
      <div style={{marginBottom: 18}}><AgentWorkspace onOpenAgent={onOpenAgent}/></div>
      <div className="grid dashboard-grid">
        <div className="panel">
          <div className="panel-head"><h3>Recent Run History</h3><div className="right">Click to view context</div></div>
          {recentRuns.length === 0 ? <div className="muted" style={{fontSize:12}}>No runs yet.</div> : recentRuns.map((r, i) => (
            <div key={r?.id || i} 
              className={'feed-row ' + (selectedRunId === r?.id ? 'is-selected' : '')} 
              onClick={() => setSelectedRunId(r?.id)}
              style={{cursor:'pointer', borderLeft: selectedRunId === r?.id ? '4px solid var(--gold)' : 'none', background: selectedRunId === r?.id ? 'rgba(255,191,0,0.05)' : 'transparent'}}>
              <div className="mono-s" style={{width:56, color:'var(--text-4)'}}>{relTime(r?.startedAt || r?.createdAt)}</div>
              <div style={{flex:1, minWidth:0}}>
                <b style={{fontSize:12}}>{(r?.goal || 'Untitled run').slice(0, 64)}</b>
                <div className="mono-s" style={{color: r?.status === 'failed' ? 'var(--red)' : 'var(--text-3)'}}>{r?.phase || r?.status || 'queued'}</div>
              </div>
            </div>
          ))}
        </div>
        <div className="panel">
          <div className="panel-head"><h3>Live Activity</h3><div className="right"><span className="chip" style={{padding:'3px 8px', fontSize:10}}><span className="dot"/> real-time</span></div></div>
          <div style={{display:'flex', flexDirection:'column', gap:2, maxHeight:460, overflowY:'auto'}}>
            {(() => {
              const visible = activity.filter(r => !(r.verb === 'turn-end' || (r.verb === 'spoke' && !(r.text || '').trim()) || (r.verb === 'result' && r.status !== 'err' && !(r.text || '').trim())));
              if (visible.length === 0) return <div className="muted" style={{padding:'30px 12px', fontSize:12, textAlign:'center'}}>Waiting for activity...</div>;
              return visible.map((row, i) => {
                const personaId = row.personaId || row.agent;
                const agent = agents.find(a => a.id === personaId);
                const statusColor = row.status === 'ok' ? 'var(--green)' : row.status === 'warn' ? 'var(--gold)' : 'var(--red)';
                const tokens = row.tokens ?? ((row.usage?.input_tokens||0)+(row.usage?.output_tokens||0));
                return <div key={row.id || i} className="feed-row" onClick={() => agent && onOpenAgent(agent.id)}><div className="mono-s" style={{width:56, color:'var(--text-4)'}}>{relTime(row.ts || row.t)}</div><AgentDot agent={agent} size={28}/><div style={{flex:1, minWidth:0}}><div style={{display:'flex', gap:6, alignItems:'baseline', flexWrap:'wrap'}}><b style={{fontSize:13}}>{agent ? agent.name : (personaId || '—')}</b><span style={{color:'var(--text-3)', fontSize:12}}>{row.verb}{row.toolName ? ` · ${row.toolName}` : ''}</span></div><div style={{fontSize:12, color:'var(--text-2)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{row.text}</div></div><div style={{display:'flex', alignItems:'center', gap:8}}>{tokens > 0 && <span className="mono-s" style={{color:'var(--text-3)'}}>{tokens.toLocaleString()} tok</span>}<span style={{width:6, height:6, borderRadius:'50%', background: statusColor, boxShadow:`0 0 8px ${statusColor}`}}/></div></div>;
              });
            })()}
          </div>
        </div>
        <div className="panel dashboard-grid-wide"><div className="panel-head"><h3>Agent Collaboration</h3><div className="right">last 1h</div></div><CollabGraph onOpenAgent={onOpenAgent}/></div>
      </div>
    </div>
  );
};

/* ===== SIM OFFICE FLOOR — dashboard workstation view ===== */
const AgentWorkspace = ({ onOpenAgent }) => {
  const agents = Array.isArray(window.AGENTS) ? window.AGENTS : [];
  const statusRank = { busy: 0, active: 1, idle: 2, offline: 3 };

  const sorted = React.useMemo(() => {
    return [...agents].sort((a, b) => {
      const sa = statusRank[a.status] ?? 9;
      const sb = statusRank[b.status] ?? 9;
      if (sa !== sb) return sa - sb;
      return (a.name || '').localeCompare(b.name || '');
    });
  }, [agents]);

  const working = agents.filter(a => a.status === 'busy' || a.status === 'active').length;

  return (
    <div className="agent-office-page dashboard-office-floor">
      <div className="agent-office-hero dashboard-office-hero">
        <div>
          <div className="mono-s">SIM OFFICE CONTROL</div>
          <h2>C-Office <span className="accent">Workfloor</span></h2>
          <p>ห้องทำงานรวมของทีม AI: แต่ละ agent มีโต๊ะ จอ คิวงาน สถานะ online/working และ workload ที่เปลี่ยนตามงานจริง</p>
        </div>
        <div className="agent-office-stats">
          <span><b>{agents.length}</b> staff</span>
          <span><b>{working}</b> active desks</span>
          <span><b>{agents.filter(a => a.status === 'idle').length}</b> standby</span>
        </div>
      </div>

      <section className="agent-party-stage dashboard-office-stage">
        <div className="office-room-backdrop">
          <span className="room-window"/>
          <span className="room-light one"/>
          <span className="room-light two"/>
          <span className="office-wall-board"/>
          <span className="office-coffee-bar"/>
          <span className="room-floor-grid"/>
        </div>
      <div className="panel-head">
        <h3>Office Floor
          <span style={{color:'var(--text-3)', fontWeight:400, fontSize:11, marginLeft:8, fontFamily:'var(--font-mono)', letterSpacing:'0.1em'}}>
            · {agents.length} DESKS
          </span>
        </h3>
        <div className="right">
          <span className="chip" style={{padding:'3px 8px', fontSize:10}}>
            <span className="dot"/> {working} working
          </span>
        </div>
      </div>

        <div className="agent-party-lineup dashboard-office-lineup">
          {sorted.map(a => (
            <AgentModelUnit
              key={a.id}
              agent={a}
              selected={a.status === 'busy' || a.status === 'active'}
              onSelect={() => onOpenAgent(a.id)}
              onOpenAgent={onOpenAgent}
            />
          ))}
        </div>
      </section>
    </div>
  );
};

/* simple force-less collab graph */
const CollabGraph = ({ onOpenAgent }) => {
  const agents = Array.isArray(window.AGENTS) ? window.AGENTS : [];
  const radius = 140;
  const center = { x: 260, y: 160 };
  const positions = agents.map((a, i) => {
    const ang = (i / Math.max(agents.length, 1)) * Math.PI * 2 - Math.PI/2;
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
