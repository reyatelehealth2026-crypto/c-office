/* Tasks / Runs V2 — workflow timeline override.
   Combines Orchestra RUNS and Task tool TASKS into one operational surface. */

const taskTime = (input) => {
  if (!input) return 'unknown';
  const ts = typeof input === 'number' ? input : Date.parse(input);
  if (!Number.isFinite(ts)) return 'recent';
  const diff = Math.max(0, Date.now() - ts);
  const s = Math.floor(diff / 1000);
  if (s < 10) return 'now';
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
};

const taskElapsed = (start, end) => {
  if (!start) return '—';
  const a = typeof start === 'number' ? start : Date.parse(start);
  const b = end ? (typeof end === 'number' ? end : Date.parse(end)) : Date.now();
  if (!Number.isFinite(a) || !Number.isFinite(b)) return '—';
  const s = Math.max(0, Math.floor((b - a) / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h`;
};

const normalizeRunItem = (item, type) => {
  if (type === 'run') {
    const steps = Array.isArray(item.steps) ? item.steps : [];
    const startedAt = item.startedAt || item.createdAt || item.ts;
    const endedAt = item.endedAt || item.completedAt || item.updatedAt;
    const progress = item.status === 'done' ? 100 : item.status === 'failed' ? 100 : item.status === 'running' ? Math.min(88, 18 + steps.length * 12) : 20;
    return {
      raw: item,
      type,
      id: item.id || item.run_id,
      title: item.goal || item.title || `Run ${String(item.id || '').slice(-6)}`,
      description: item.final || item.error || item.phase || 'Orchestra workflow run',
      status: item.status || 'running',
      owner: item.personaId || item.agentId || 'orchestra',
      subagent: 'orchestra',
      startedAt,
      endedAt,
      updatedAt: item.updatedAt || endedAt || startedAt,
      steps,
      progress,
      result: item.final || item.result || '',
      error: item.error || '',
    };
  }
  const startedAt = item.startedAt || item.createdAt || item.ts;
  const endedAt = item.endedAt || item.completedAt || item.updatedAt;
  return {
    raw: item,
    type,
    id: item.id,
    title: item.description || item.prompt || item.subagent_type || `Task ${String(item.id || '').slice(-6)}`,
    description: item.output || item.error || item.description || 'Task tool operation record',
    status: item.status || 'running',
    owner: item.personaId || item.agentId || item.agent || 'system',
    subagent: item.subagent_type || item.tool || 'task',
    startedAt,
    endedAt,
    updatedAt: item.updatedAt || endedAt || startedAt,
    steps: [],
    progress: item.status === 'done' ? 100 : item.status === 'failed' ? 100 : 32,
    result: item.output || item.result || '',
    error: item.error || '',
  };
};

const statusState = (status) => {
  if (status === 'done' || status === 'complete' || status === 'completed') return 'active';
  if (status === 'failed' || status === 'error') return 'danger';
  if (status === 'running' || status === 'queued') return 'busy';
  return 'muted';
};

const TaskCardV2 = ({ item, selected, onSelect, onOpenAgent }) => {
  const agent = (window.AGENTS || []).find(a => a.id === item.owner);
  const onCardKey = (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect?.(); }
  };
  const openAgent = (e) => {
    e.stopPropagation();
    e.preventDefault();
    onOpenAgent?.(agent?.id);
  };
  const onAgentKey = (e) => {
    if (e.key === 'Enter' || e.key === ' ') openAgent(e);
  };
  return (
    <div role="button" tabIndex={0} className={'ux-task-card-v2 ' + (selected ? 'is-selected' : '')} onClick={onSelect} onKeyDown={onCardKey}>
      <div className="ux-task-glyph">{item.type === 'run' ? 'RN' : 'TK'}</div>
      <div className="ux-task-main">
        <div className="ux-task-title">{item.title}</div>
        <div className="ux-task-desc">{item.description || 'No summary yet.'}</div>
        <div className="ux-task-meta">
          <UXStatusChip label={item.status} state={statusState(item.status)} />
          <span className="ux-event-tag">{item.type}</span>
          <span className="ux-event-tag">{item.subagent}</span>
          {agent && <span role="button" tabIndex={0} className="ux-soft-button" style={{ minHeight: 24, padding: '4px 8px' }} onClick={openAgent} onKeyDown={onAgentKey}>{agent.name}</span>}
        </div>
      </div>
      <div className="ux-task-right">
        <div className="ux-task-time">{taskTime(item.updatedAt || item.startedAt)}</div>
        <div className="ux-task-progress" style={{ '--task-progress': `${item.progress || 10}%` }}><span /></div>
        <div className="ux-note-mini">{taskElapsed(item.startedAt, item.endedAt)}</div>
      </div>
    </div>
  );
};

const RunTimeline = ({ item }) => {
  const steps = item.steps && item.steps.length ? item.steps : [];
  const fallback = [
    { title: 'Created', body: item.title },
    item.status === 'running' ? { title: 'Running', body: item.description || 'Workflow is still in progress.' } : null,
    item.result ? { title: 'Result', body: item.result } : null,
    item.error ? { title: 'Error', body: item.error } : null,
  ].filter(Boolean);
  const list = steps.length ? steps.map((s, i) => ({
    title: s.title || s.phase || s.type || `Step ${i + 1}`,
    body: s.summary || s.content || s.text || s.message || s.output || JSON.stringify(s, null, 2),
  })) : fallback;

  return (
    <div className="ux-timeline">
      {list.map((s, i) => (
        <div className="ux-step" key={i}>
          <div className="ux-step-dot">{i + 1}</div>
          <div className="ux-step-card">
            <div className="ux-step-title">{s.title}</div>
            <div className="ux-step-body">{String(s.body || '').slice(0, 1400)}</div>
          </div>
        </div>
      ))}
    </div>
  );
};

const RunInspector = ({ item, onClear }) => {
  if (!item) {
    return (
      <aside className="ux-run-inspector">
        <UXEmptyState title="Select a workflow" body="Pick a run or task to inspect timeline, result, and raw metadata." />
      </aside>
    );
  }
  const raw = JSON.stringify(item.raw, null, 2);
  const copy = () => navigator.clipboard?.writeText(raw).catch(() => window.prompt('Copy raw payload', raw));
  const copyResult = () => navigator.clipboard?.writeText(item.result || item.error || item.description || '').catch(() => {});
  return (
    <aside className="ux-run-inspector">
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
        <div>
          <h3 className="ux-run-title">{item.title}</h3>
          <div className="ux-run-sub">{item.type} · {item.id ? `#${String(item.id).slice(-8)}` : 'no id'}</div>
        </div>
        <button className="ux-soft-button" onClick={onClear}>Close</button>
      </div>

      <div className="ux-run-actions">
        <UXStatusChip label={item.status} state={statusState(item.status)} />
        <button className="ux-soft-button" onClick={copyResult}>Copy result</button>
        <button className="ux-soft-button" onClick={copy}>Copy JSON</button>
        {item.type === 'run' && item.id && <a className="ux-soft-button" href={`/run.html?id=${encodeURIComponent(item.id)}`} target="_blank" rel="noreferrer">Open run</a>}
      </div>

      <div className="ux-run-detail-grid">
        <div className="ux-run-cell"><label>owner</label><b>{item.owner}</b></div>
        <div className="ux-run-cell"><label>subagent</label><b>{item.subagent}</b></div>
        <div className="ux-run-cell"><label>elapsed</label><b>{taskElapsed(item.startedAt, item.endedAt)}</b></div>
        <div className="ux-run-cell"><label>updated</label><b>{taskTime(item.updatedAt || item.startedAt)}</b></div>
      </div>

      <div className="ux-section-subtitle">Timeline</div>
      <RunTimeline item={item}/>

      {(item.result || item.error) && (
        <>
          <div className="ux-section-subtitle">{item.error ? 'Error' : 'Result'}</div>
          <pre className="ux-result-box">{item.error || item.result}</pre>
        </>
      )}

      <div className="ux-section-subtitle">Raw payload</div>
      <pre className="ux-result-box">{raw}</pre>
    </aside>
  );
};

const TasksPageV2 = ({ onOpenAgent }) => {
  window.useCOfficeRefresh?.();
  const [query, setQuery] = React.useState('');
  const [status, setStatus] = React.useState('all');
  const [kind, setKind] = React.useState('all');
  const [selectedId, setSelectedId] = React.useState(null);

  const runItems = (window.RUNS || []).map(r => normalizeRunItem(r, 'run'));
  const taskItems = (window.TASKS || []).map(t => normalizeRunItem(t, 'task'));
  const all = [...runItems, ...taskItems].sort((a, b) => (b.updatedAt || b.startedAt || 0) - (a.updatedAt || a.startedAt || 0));
  const filtered = all.filter(item => {
    const hay = `${item.title} ${item.description} ${item.status} ${item.owner} ${item.subagent}`.toLowerCase();
    if (query && !hay.includes(query.toLowerCase())) return false;
    if (status !== 'all' && item.status !== status) return false;
    if (kind !== 'all' && item.type !== kind) return false;
    return true;
  });
  const selected = all.find(i => i.id === selectedId) || filtered[0] || all[0] || null;
  const statuses = ['all', ...Array.from(new Set(all.map(i => i.status).filter(Boolean)))];
  const active = all.filter(i => ['running', 'queued'].includes(i.status)).length;
  const done = all.filter(i => ['done', 'complete', 'completed'].includes(i.status)).length;
  const failed = all.filter(i => ['failed', 'error'].includes(i.status)).length;

  return (
    <div className="ux-tasks">
      <section className="ux-tasks-toolbar">
        <input className="ux-task-search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search runs, task descriptions, agents, subagent types..." />
        <select className="ux-task-select" value={kind} onChange={e => setKind(e.target.value)}>
          <option value="all">All types</option>
          <option value="run">Runs</option>
          <option value="task">Tasks</option>
        </select>
        <select className="ux-task-select" value={status} onChange={e => setStatus(e.target.value)}>
          {statuses.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </section>

      <div className="ux-tasks-summary">
        <UXMetricCard label="Workflows" value={all.length} note="runs + tasks" color="var(--ux-accent-pink)" />
        <UXMetricCard label="Active" value={active} note="running or queued" color="var(--ux-accent-gold)" />
        <UXMetricCard label="Done" value={done} note="completed" color="var(--ux-success)" />
        <UXMetricCard label="Failed" value={failed} note="needs attention" color="var(--ux-danger)" />
      </div>

      <section className="ux-section-panel">
        <div className="ux-section-head">
          <div>
            <h3 className="ux-section-title">Workflow queue</h3>
            <div className="ux-section-subtitle">Orchestra runs and Task tool records in one operational list.</div>
          </div>
          <UXStatusChip label={`${filtered.length} shown`} state={filtered.length ? 'active' : 'muted'} />
        </div>
        {filtered.length ? (
          <div className="ux-task-list">
            {filtered.map(item => (
              <TaskCardV2 key={`${item.type}-${item.id || item.title}`} item={item} selected={selected?.id === item.id && selected?.type === item.type} onSelect={() => setSelectedId(item.id)} onOpenAgent={onOpenAgent}/>
            ))}
          </div>
        ) : (
          <UXEmptyState title="No matching workflows" body="Start an Orchestra mission or clear filters to see task records." />
        )}
      </section>

      <RunInspector item={selected} onClear={() => setSelectedId(null)} />
    </div>
  );
};

window.TasksPage = TasksPageV2;
