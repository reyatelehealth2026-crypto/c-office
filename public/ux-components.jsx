/* C-Office UX Foundation Components
   Phase 1 shared shell primitives. Kept intentionally dependency-free for
   the existing React UMD + Babel Standalone runtime. */

const UX_PAGE_META = {
  dashboard: { title: 'Dashboard', kicker: 'Command Deck', hint: 'System overview and active agents' },
  agents: { title: 'Agents', kicker: 'Roster', hint: 'Persona team and status' },
  notes: { title: 'Notes', kicker: 'Work Inbox', hint: 'Agent chat and note threads' },
  tasks: { title: 'Tasks', kicker: 'Orchestra Runs', hint: 'Workflow execution and traces' },
  images: { title: 'Images', kicker: 'Studio', hint: 'Generation and asset library' },
  skills: { title: 'Playbooks', kicker: 'Skills', hint: 'Learned patterns and SOPs' },
  memory: { title: 'Archive', kicker: 'Memory', hint: 'Graph and system recall' },
  settings: { title: 'Settings', kicker: 'Control Room', hint: 'Connections, hooks, security' },
  guild: { title: 'Guild Hall', kicker: 'Legacy View', hint: 'Adventure dashboard' },
  'agent-detail': { title: 'Agent Detail', kicker: 'Inspector', hint: 'Persona profile and activity' },
  'run-workspace': { title: 'Run Workspace', kicker: 'Live Mission', hint: 'Focused run monitor' },
};

const UXStatusChip = ({ label, state = 'muted', title }) => (
  <span className="ux-status-chip" data-state={state} title={title || label}>{label}</span>
);

const UXEmptyState = ({ title = 'No data yet', body = 'When activity appears, this panel will wake up.' }) => (
  <div className="ux-empty-state"><div><b>{title}</b><span>{body}</span></div></div>
);

const UXErrorState = ({ title = 'Something needs attention', body = 'Check the connection or inspect the raw endpoint.' }) => (
  <div className="ux-error-state"><div><b>{title}</b><span>{body}</span></div></div>
);

const UXSkeleton = ({ height = 16, width = '100%', style = {} }) => (
  <div className="ux-skeleton" style={{ height, width, ...style }} />
);

const UXTopbar = ({ page, onSendGoal }) => {
  const meta = UX_PAGE_META[page] || UX_PAGE_META.dashboard;
  const [goal, setGoal] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const agents = Array.isArray(window.AGENTS) ? window.AGENTS : [];
  const runs = Array.isArray(window.RUNS) ? window.RUNS : [];
  const activeAgents = agents.filter(a => ['busy', 'active'].includes(a.status)).length;
  const busyAgents = agents.filter(a => a.status === 'busy').length;
  const activeRuns = runs.filter(r => r && r.status === 'running').length;
  const auth = window.AUTH_STATUS || {};
  const connectedProviders = ['anthropic', 'google', 'openai', 'replicate', 'codex']
    .filter(k => auth[k]?.connected || auth[k]?.available).length;

  const submit = async () => {
    const text = goal.trim();
    if (!text || busy) return;
    setBusy(true);
    try {
      const r = await fetch('/api/task', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ goal: text }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Failed to start run');
      setGoal('');
      if (onSendGoal) onSendGoal(j.run_id);
      const url = `/run.html?id=${encodeURIComponent(j.run_id)}`;
      const w = window.open(url, `c-office-run-${j.run_id}`, 'popup=yes,width=1180,height=820,menubar=no,toolbar=no,location=no,status=no');
      if (!w || w.closed || typeof w.closed === 'undefined') {
        window.dispatchEvent(new CustomEvent('c-office:navigate', {
          detail: { page: 'run-workspace', runId: j.run_id },
        }));
      }
    } catch (e) {
      alert(e.message || 'Failed to start run');
    } finally {
      setBusy(false);
    }
  };

  return (
    <header className="ux-topbar">
      <div className="ux-topbar-title">
        <div className="ux-kicker">{meta.kicker}</div>
        <div className="ux-page-title">{meta.title}</div>
      </div>
      <div className="ux-command" role="search">
        <input
          value={goal}
          onChange={e => setGoal(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') submit(); }}
          placeholder="Send a mission to Orchestra..."
          disabled={busy}
          aria-label="Send a mission to Orchestra"
        />
        <button onClick={submit} disabled={busy || !goal.trim()}>{busy ? 'Sending' : 'Launch'}</button>
      </div>
      <div className="ux-status-row" aria-label="System status">
        <UXStatusChip label={`${busyAgents} busy`} state={busyAgents ? 'busy' : 'muted'} />
        <UXStatusChip label={`${activeAgents} online`} state={activeAgents ? 'active' : 'muted'} />
        <UXStatusChip label={`${activeRuns} runs`} state={activeRuns ? 'busy' : 'muted'} />
        <UXStatusChip label={`${connectedProviders} providers`} state={connectedProviders ? 'active' : 'danger'} />
      </div>
    </header>
  );
};

Object.assign(window, {
  UX_PAGE_META,
  UXStatusChip,
  UXEmptyState,
  UXErrorState,
  UXSkeleton,
  UXTopbar,
});
