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
  const [workflows, setWorkflows] = React.useState([]);
  const [workflow, setWorkflow] = React.useState('');
  const [projects, setProjects] = React.useState([]);
  const [projectId, setProjectId] = React.useState('');
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
    fetch('/api/tasks').then(r => r.json()).then(j => setRuns(j.runs || [])).catch(()=>{});
    fetch('/api/workflows').then(r => r.json()).then(j => setWorkflows(j.workflows || [])).catch(()=>{});
    fetch('/api/projects').then(r => r.json()).then(j => setProjects(j.projects || [])).catch(()=>{});
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
        body: JSON.stringify({
          goal: goal.trim(),
          workflow: workflow || undefined,
          projectId: projectId || undefined,
        }),
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
    <div className="task-bar task-bar-premium">
      <div className="task-bar-icon">⚡</div>
      <input
        type="text"
        value={goal}
        onChange={e => setGoal(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') submit(); }}
        disabled={!connected || busy}
        placeholder={connected ? placeholders[placeholderIdx] : 'Connect Anthropic in Settings first'}
      />
      <select
        value={projectId}
        onChange={e => {
          if (e.target.value === '__new__') { setShowNewProject(true); return; }
          setProjectId(e.target.value);
        }}
        disabled={!connected || busy}
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
          disabled={!connected || busy}
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

/* Multi-agent run timeline — plan / scratchpad / critique / verify */
const PHASES = ['plan', 'execute', 'critique', 'verify', 'done'];

const TeamTimeline = () => {
  const [runs, setRuns] = React.useState(window.RUNS || []);
  const [expanded, setExpanded] = React.useState(true);
  const [openStep, setOpenStep] = React.useState(null);

  React.useEffect(() => {
    const refresh = () => setRuns(window.RUNS || []);
    window.COfficeBus?.addEventListener('refresh', refresh);
    return () => window.COfficeBus?.removeEventListener('refresh', refresh);
  }, []);

  const run = runs.find(r => r.status === 'running') || runs[0];
  if (!run) return null;

  const phaseLabel = {
    plan: 'Planning',
    execute: 'Executing',
    critique: 'Reviewing',
    done: 'Done',
  }[run.phase || 'execute'] || (run.status === 'running' ? 'Working' : 'Done');

  const phaseColor = run.status === 'failed'
    ? 'var(--red)'
    : run.phase === 'done' || run.status === 'done'
      ? 'var(--green)'
      : 'var(--gold)';

  const plan = Array.isArray(run.plan) ? run.plan : [];
  const scratch = Array.isArray(run.scratchpad) ? run.scratchpad.slice(-12) : [];
  const critique = run.critique || null;

  const sevColor = (sev) => {
    if (sev === 'critical') return 'var(--red)';
    if (sev === 'high') return 'var(--gold)';
    if (sev === 'none') return 'var(--green)';
    return 'var(--text-3)';
  };

  return (
    <div className="panel" style={{marginBottom: 14, padding: 14}}>
      <div className="panel-head" style={{marginBottom: 10}}>
        <h3 style={{display: 'flex', gap: 8, alignItems: 'center'}}>
          <span style={{color: phaseColor, fontSize: 14}}>●</span>
          Agent Team · {phaseLabel}
          {run.workflow && (
            <span className="chip" style={{
              fontSize: 10, padding: '2px 6px',
              background: 'var(--bg-2)', fontFamily: 'var(--font-mono)',
            }}>{run.workflow}</span>
          )}
          {run.projectId && (
            <span className="chip" style={{
              fontSize: 10, padding: '2px 6px',
              background: 'var(--gold)', color: 'var(--bg-0)',
            }}>📁 {run.projectId.replace(/^proj_/, '').slice(0, 24)}</span>
          )}
          {run.revisions > 0 && (
            <span className="chip" style={{fontSize: 10, padding: '2px 6px'}}>rev {run.revisions}</span>
          )}
        </h3>
        <div className="right" style={{display: 'flex', gap: 8, alignItems: 'center'}}>
          <span className="mono-s" style={{color: 'var(--text-3)'}}>{run.summary || ''}</span>
          <button className="btn-ghost" style={{fontSize: 11}} onClick={() => setExpanded(e => !e)}>
            {expanded ? 'Collapse' : 'Expand'}
          </button>
        </div>
      </div>

      <div style={{fontSize: 12, color: 'var(--text-2)', marginBottom: 8}}>
        <b style={{color: 'var(--text-1)'}}>Goal:</b> {run.goal}
      </div>

      {/* Phase pills */}
      <div style={{display: 'flex', gap: 4, marginBottom: 10, flexWrap: 'wrap'}}>
        {PHASES.map((p, i) => {
          const reached = PHASES.indexOf(run.phase || 'plan') >= i;
          const isCurrent = run.phase === p;
          return (
            <span key={p} style={{
              fontSize: 10,
              padding: '3px 9px',
              borderRadius: 12,
              fontFamily: 'var(--font-mono)',
              background: isCurrent ? phaseColor : reached ? 'var(--bg-2)' : 'transparent',
              color: isCurrent ? 'var(--bg-0)' : reached ? 'var(--text-1)' : 'var(--text-3)',
              border: `1px solid ${reached ? 'var(--border)' : 'var(--bg-2)'}`,
              fontWeight: isCurrent ? 600 : 400,
            }}>{p}</span>
          );
        })}
        {run.phaseCosts && Object.keys(run.phaseCosts).length > 0 && (
          <span className="mono-s" style={{
            marginLeft: 'auto',
            fontSize: 10,
            color: 'var(--text-3)',
          }}>
            {Object.entries(run.phaseCosts).map(([ph, c]) =>
              `${ph}: ${c.tokens.toLocaleString()}t / $${c.usd.toFixed(3)}`
            ).join(' · ')}
          </span>
        )}
      </div>

      {/* Recalled skills strip */}
      {Array.isArray(run.skillsRecalled) && run.skillsRecalled.length > 0 && (
        <div style={{
          display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10,
          padding: '6px 8px', background: 'var(--bg-2)', borderRadius: 6,
          fontSize: 11,
        }}>
          <span className="mono-s" style={{color: 'var(--text-3)'}}>↺ recalled:</span>
          {run.skillsRecalled.map((s, i) => (
            <span key={i} title={s.goal} style={{
              padding: '1px 8px', background: 'var(--bg-0)',
              borderRadius: 10, color: 'var(--text-2)',
              border: '1px solid var(--border)',
            }}>{s.id.replace(/^skill_/, '').slice(0, 32)}</span>
          ))}
        </div>
      )}

      {expanded && (
        <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14}}>
          {/* Plan column */}
          <div>
            <div className="mono-s" style={{color: 'var(--text-3)', marginBottom: 6}}>PLAN</div>
            {plan.length === 0 ? (
              <div className="muted" style={{fontSize: 12}}>Awaiting plan...</div>
            ) : (
              <ol style={{margin: 0, paddingLeft: 18, fontSize: 12, lineHeight: 1.6}}>
                {plan.map((step, i) => {
                  const agent = (window.AGENTS || []).find(a => a.id === step.persona);
                  const matchedStep = (run.steps || []).find(s => s.persona === step.persona);
                  const done = matchedStep?.result?.ok;
                  const open = openStep === i;
                  return (
                    <li key={i} style={{color: done ? 'var(--text-2)' : 'var(--text-1)', opacity: done ? 0.7 : 1}}>
                      <span
                        onClick={() => matchedStep && setOpenStep(open ? null : i)}
                        style={{cursor: matchedStep ? 'pointer' : 'default'}}>
                        <b>[{agent?.name || step.persona}]</b> {step.instruction}
                        {step.depends_on != null && (
                          <span style={{color: 'var(--text-3)'}}> ← step {step.depends_on}</span>
                        )}
                        {done && <span style={{color: 'var(--green)', marginLeft: 6}}>✓</span>}
                        {matchedStep && (
                          <span style={{color: 'var(--text-3)', marginLeft: 6, fontSize: 10}}>
                            {open ? '▾' : '▸'}
                          </span>
                        )}
                      </span>
                      {open && matchedStep && (
                        <pre style={{
                          marginTop: 4,
                          padding: 8,
                          background: 'var(--bg-2)',
                          borderRadius: 4,
                          fontSize: 11,
                          maxHeight: 200,
                          overflowY: 'auto',
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-word',
                          color: 'var(--text-2)',
                        }}>
                          {matchedStep.result?.text || matchedStep.result?.error || '(no output)'}
                        </pre>
                      )}
                    </li>
                  );
                })}
              </ol>
            )}
          </div>

          {/* Scratchpad column */}
          <div>
            <div className="mono-s" style={{color: 'var(--text-3)', marginBottom: 6}}>
              SHARED SCRATCHPAD ({(run.scratchpad || []).length})
            </div>
            {scratch.length === 0 ? (
              <div className="muted" style={{fontSize: 12}}>No notes yet.</div>
            ) : (
              <div style={{display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 240, overflowY: 'auto'}}>
                {scratch.map((entry, i) => {
                  const kindColor = entry.kind === 'critique' ? 'var(--red)'
                    : entry.kind === 'plan' ? 'var(--gold)'
                    : entry.kind === 'finding' ? 'var(--green)'
                    : entry.kind === 'error' ? 'var(--red)'
                    : 'var(--text-3)';
                  return (
                    <div key={i} style={{
                      fontSize: 11,
                      padding: '4px 8px',
                      background: 'var(--bg-2)',
                      borderRadius: 4,
                      borderLeft: `2px solid ${kindColor}`,
                    }}>
                      <div style={{display: 'flex', gap: 6, alignItems: 'baseline'}}>
                        <b style={{color: 'var(--text-1)'}}>{entry.personaName}</b>
                        <span className="mono-s" style={{color: kindColor, fontSize: 10}}>{entry.kind}</span>
                      </div>
                      <div style={{color: 'var(--text-2)', whiteSpace: 'pre-wrap', wordBreak: 'break-word'}}>
                        {entry.text}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {expanded && critique && (
        <div style={{
          marginTop: 12,
          padding: 10,
          background: 'var(--bg-2)',
          borderRadius: 6,
          borderLeft: `3px solid ${sevColor(critique.severity)}`,
        }}>
          <div style={{display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4}}>
            <b style={{fontSize: 12}}>Vivi's review</b>
            <span className="chip" style={{
              fontSize: 10, padding: '1px 6px',
              background: sevColor(critique.severity),
              color: 'var(--bg-0)',
            }}>{critique.severity}</span>
          </div>
          <div style={{fontSize: 12, color: 'var(--text-2)', whiteSpace: 'pre-wrap'}}>
            {critique.text}
          </div>
        </div>
      )}

      {expanded && run.verification && (
        <div style={{
          marginTop: 12,
          padding: 10,
          background: 'var(--bg-2)',
          borderRadius: 6,
          borderLeft: `3px solid ${run.verification.passed ? 'var(--green)' : 'var(--red)'}`,
        }}>
          <div style={{display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4}}>
            <b style={{fontSize: 12}}>Goal verification</b>
            <span className="chip" style={{
              fontSize: 10, padding: '1px 6px',
              background: run.verification.passed ? 'var(--green)' : 'var(--red)',
              color: 'var(--bg-0)',
            }}>{run.verification.passed ? 'PASS' : 'FAIL'}</span>
          </div>
          <div style={{fontSize: 12, color: 'var(--text-2)'}}>{run.verification.text}</div>
        </div>
      )}

      {expanded && (
        <div style={{marginTop: 8, fontSize: 10, color: 'var(--text-3)', textAlign: 'right'}}>
          <a href={`/api/task/${run.id}/trace`} target="_blank" rel="noreferrer"
             style={{color: 'var(--text-3)', textDecoration: 'none', fontFamily: 'var(--font-mono)'}}>
            ↗ download trace.md
          </a>
        </div>
      )}

      {expanded && run.final && (
        <div style={{
          marginTop: 12,
          padding: 10,
          background: 'var(--bg-2)',
          borderRadius: 6,
          borderLeft: '3px solid var(--green)',
        }}>
          <div style={{fontSize: 12, marginBottom: 4}}>
            <b>Final deliverable</b>
          </div>
          <div style={{fontSize: 12, color: 'var(--text-1)', whiteSpace: 'pre-wrap'}}>
            {run.final}
          </div>
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
          <h1>Sim Office <span className="accent">Workfloor</span></h1>
          <div className="sub">Office floor · {agentsOnline} online · {activeTasks} active desks · {STATE_SESSIONS.filter(s=>!s.endedAt).length} sessions</div>
        </div>
        <div className="topbar-actions">
          <span className="chip"><span className="dot"/> Live</span>
        </div>
      </div>

      {/* QUICK TASK BAR */}
      <SendToOrchestra/>

      {/* AGENT TEAM TIMELINE — plan / scratchpad / critique */}
      <TeamTimeline/>

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

      <div className="grid dashboard-grid">
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
        <div className="panel dashboard-grid-wide">
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

/* ===== SIM OFFICE FLOOR — dashboard workstation view ===== */
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
    <div className="agent-office-page dashboard-office-floor">
      <div className="agent-office-hero dashboard-office-hero">
        <div>
          <div className="mono-s">SIM OFFICE CONTROL</div>
          <h2>C-Office <span className="accent">Workfloor</span></h2>
          <p>ห้องทำงานรวมของทีม AI: แต่ละ agent มีโต๊ะ จอ คิวงาน สถานะ online/working และ workload ที่เปลี่ยนตามงานจริง</p>
        </div>
        <div className="agent-office-stats">
          <span><b>{AGENTS.length}</b> staff</span>
          <span><b>{working}</b> active desks</span>
          <span><b>{AGENTS.filter(a => a.status === 'idle').length}</b> standby</span>
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
            · {AGENTS.length} DESKS
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
