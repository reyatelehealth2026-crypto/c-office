/* Dashboard V2 — premium command-center overview.
   This intentionally overrides window.Dashboard after the legacy dashboard file
   loads, so Phase 2 can ship safely without deleting the original surface. */

const uxRelTime = (input) => {
  if (!input) return 'never';
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

const uxNum = (n) => Number(n || 0).toLocaleString();

const uxAgentColor = (agent) => {
  if (!agent) return 'var(--ux-accent-secondary)';
  if (agent.rarity === 'SSR') return 'var(--ux-accent-gold)';
  if (agent.rarity === 'SR') return 'var(--ux-accent-primary)';
  return 'var(--ux-accent-secondary)';
};

const uxStatusState = (status) => {
  if (status === 'busy') return 'busy';
  if (status === 'active') return 'active';
  if (status === 'offline') return 'muted';
  return 'muted';
};

const uxStatusLabel = (status) => {
  if (status === 'busy') return 'working';
  if (status === 'active') return 'online';
  if (status === 'offline') return 'offline';
  return 'idle';
};

const uxEventTitle = (ev) => {
  if (!ev) return 'Unknown event';
  return ev.summary || ev.message || ev.text || ev.title || ev.event || ev.type || ev.hook_event_name || 'Activity event';
};

const uxEventKind = (ev) => {
  const raw = String(ev?.event || ev?.type || ev?.hook_event_name || ev?.tool || 'EV').replace(/[^A-Za-z]/g, '').slice(0, 2);
  return (raw || 'EV').toUpperCase();
};

const uxAgentWork = (agent) => {
  if (window.getAgentCurrentWork) {
    const work = window.getAgentCurrentWork(agent.id);
    if (work?.label) return work.label;
  }
  return agent.currentTask || agent.tagline || 'Ready for dispatch.';
};

const UXMetricCard = ({ label, value, note, color }) => (
  <div className="ux-metric-card ux-card-lift" style={{ '--metric-color': color || 'var(--ux-accent-secondary)' }}>
    <div className="ux-metric-label">{label}</div>
    <div className="ux-metric-value">{value}</div>
    <div className="ux-metric-note">{note}</div>
  </div>
);

const UXAgentCardV2 = ({ agent, onOpenAgent }) => {
  const color = uxAgentColor(agent);
  const work = uxAgentWork(agent);
  return (
    <button
      className="ux-agent-card-v2"
      data-status={agent.status || 'idle'}
      style={{ '--agent-color': color, textAlign: 'left' }}
      onClick={() => onOpenAgent?.(agent.id)}
      aria-label={`Open ${agent.name}`}
    >
      {agent.image ? (
        <img className="ux-agent-avatar" src={agent.image} alt={agent.name}/>
      ) : (
        <div className="ux-agent-avatar ux-agent-fallback" style={{ background: agent.gradient || color }}>{agent.avatarInitials || agent.name?.slice(0,2)}</div>
      )}
      <div className="ux-agent-body">
        <div className="ux-agent-topline">
          <div style={{ minWidth: 0 }}>
            <div className="ux-agent-name">{agent.name}</div>
            <div className="ux-agent-role">{agent.role}</div>
          </div>
          <UXStatusChip label={uxStatusLabel(agent.status)} state={uxStatusState(agent.status)} />
        </div>
        <div className="ux-agent-task">{work}</div>
        <div className="ux-agent-footer">
          <span className="ux-mini-meta">Lv.{agent.level || 1} · {agent.rarity || 'R'}</span>
          <span className="ux-mini-meta">{agent.elementName || 'agent'}</span>
        </div>
      </div>
    </button>
  );
};

const UXProviderReadiness = () => {
  const auth = window.AUTH_STATUS || {};
  const providers = [
    { id: 'anthropic', label: 'Anthropic', hint: 'Orchestra / Claude SDK' },
    { id: 'google', label: 'Google', hint: 'Gemini / Imagen' },
    { id: 'openai', label: 'OpenAI', hint: 'GPT compatible' },
    { id: 'replicate', label: 'Replicate', hint: 'Image fallback' },
  ];
  return (
    <div className="ux-provider-list">
      {providers.map(p => {
        const connected = !!(auth[p.id]?.connected || auth[p.id]?.available);
        return (
          <div className="ux-provider-row" key={p.id}>
            <div>
              <div className="ux-provider-name">{p.label}</div>
              <div className="ux-provider-detail">{p.hint}</div>
            </div>
            <UXStatusChip label={connected ? 'ready' : 'setup'} state={connected ? 'active' : 'danger'} />
          </div>
        );
      })}
    </div>
  );
};

const UXRunList = () => {
  const runs = (window.RUNS || []).slice(0, 4);
  if (!runs.length) {
    return <UXEmptyState title="No active runs" body="Launch a mission and Orchestra will appear here." />;
  }
  return (
    <div className="ux-run-list">
      {runs.map(run => {
        const steps = Array.isArray(run.steps) ? run.steps.length : 0;
        const progress = run.status === 'done' ? 100 : run.status === 'running' ? Math.min(85, 16 + steps * 14) : 24;
        return (
          <div
            key={run.id}
            className="ux-run-row"
            onClick={() => window.dispatchEvent(new CustomEvent('c-office:navigate', { detail: { page: 'run-workspace', runId: run.id } }))}
          >
            <div style={{ display:'flex', justifyContent:'space-between', gap: 10 }}>
              <div style={{ minWidth: 0 }}>
                <div className="ux-run-title">{run.goal || run.title || `Run ${String(run.id || '').slice(-6)}`}</div>
                <div className="ux-run-detail">{run.status || 'running'} · {steps} steps · {uxRelTime(run.updatedAt || run.startedAt || run.createdAt)}</div>
              </div>
              <UXStatusChip label={run.status || 'run'} state={run.status === 'done' ? 'active' : run.status === 'failed' ? 'danger' : 'busy'} />
            </div>
            <div className="ux-run-progress" style={{ '--run-progress': `${progress}%` }}><span /></div>
          </div>
        );
      })}
    </div>
  );
};

const UXLiveFeed = ({ onOpenAgent }) => {
  const activity = (window.ACTIVITY || []).slice(0, 7);
  if (!activity.length) {
    return <UXEmptyState title="No activity yet" body="Install hooks or run a smoke test to wake the feed." />;
  }
  return (
    <div className="ux-feed-list">
      {activity.map((ev, i) => {
        const agentId = ev.personaId || ev.agentId || ev.persona || ev.agent;
        const agent = (window.AGENTS || []).find(a => a.id === agentId || a.name === agentId);
        return (
          <div className="ux-feed-row-v2" key={ev.id || ev.ts || i}>
            <div className="ux-feed-icon">{agent?.avatarInitials || uxEventKind(ev)}</div>
            <div style={{ minWidth: 0 }}>
              <div className="ux-feed-topline">
                <div className="ux-feed-title">{agent?.name || ev.persona || ev.source || 'System'}</div>
                <div className="ux-feed-time">{uxRelTime(ev.ts || ev.t || ev.time)}</div>
              </div>
              <div className="ux-feed-detail">{uxEventTitle(ev)}</div>
              {agent && <button className="ux-soft-button" style={{ minHeight: 26, padding: '5px 9px', marginTop: 8 }} onClick={() => onOpenAgent?.(agent.id)}>Inspect</button>}
            </div>
          </div>
        );
      })}
    </div>
  );
};

const DashboardV2 = ({ onOpenAgent, setLayout }) => {
  window.useCOfficeRefresh?.();
  const agents = window.AGENTS || [];
  const stats = window.STATS || {};
  const runs = window.RUNS || [];
  const sessions = window.STATE_SESSIONS || [];
  const busy = agents.filter(a => a.status === 'busy').length;
  const online = agents.filter(a => ['busy', 'active'].includes(a.status)).length;
  const activeRuns = runs.filter(r => r.status === 'running').length;
  const tokens = stats.tokensToday || stats.tokens || 0;
  const spend = stats.spendToday || stats.spend || 0;

  const openNotes = () => window.dispatchEvent(new CustomEvent('c-office:navigate', { detail: { page: 'notes' } }));
  const openSettings = () => window.dispatchEvent(new CustomEvent('c-office:navigate', { detail: { page: 'settings' } }));
  const openTasks = () => window.dispatchEvent(new CustomEvent('c-office:navigate', { detail: { page: 'tasks' } }));

  return (
    <div className="ux-dashboard">
      <div className="ux-hero-grid">
        <section className="ux-command-hero">
          <div className="ux-hero-kicker">Live Command Center</div>
          <h2>ดูทีมเอเจนต์ทั้งหมดในจอเดียว แล้วสั่งงานได้ทันที</h2>
          <p>
            Dashboard V2 รวมสถานะ agents, provider readiness, active runs และ activity feed ให้เป็นห้องบัญชาการเดียวที่อ่านไวกว่าเดิม.
          </p>
          <div className="ux-hero-actions">
            <button className="ux-hero-button" onClick={openTasks}>Open Runs</button>
            <button className="ux-soft-button" onClick={openNotes}>Open Notes</button>
            <button className="ux-soft-button" onClick={openSettings}>Connections</button>
            {setLayout && <button className="ux-soft-button" onClick={() => setLayout('overview')}>Overview</button>}
          </div>
        </section>

        <section className="ux-system-board">
          <div className="ux-board-head">
            <h3 className="ux-board-title">System pulse</h3>
            <span className="ux-board-meta">{new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
          </div>
          <div className="ux-metric-grid" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
            <UXMetricCard label="Agents online" value={uxNum(online)} note={`${busy} working now`} color="var(--ux-success)" />
            <UXMetricCard label="Active runs" value={uxNum(activeRuns)} note={`${runs.length} recent runs`} color="var(--ux-accent-gold)" />
            <UXMetricCard label="Sessions" value={uxNum(sessions.length)} note="Claude Code hooks" color="var(--ux-accent-secondary)" />
            <UXMetricCard label="Tokens" value={uxNum(tokens)} note={spend ? `$${Number(spend).toFixed(2)} today` : 'today usage'} color="var(--ux-accent-primary)" />
          </div>
        </section>
      </div>

      <section className="ux-section-panel">
        <div className="ux-section-head">
          <div>
            <h3 className="ux-section-title">Agent roster</h3>
            <div className="ux-section-subtitle">9 personas mapped from live agent activity. Click any card to inspect.</div>
          </div>
          <UXStatusChip label={`${agents.length || 0} agents`} state={agents.length ? 'active' : 'muted'} />
        </div>
        {agents.length ? (
          <div className="ux-agent-grid">
            {agents.map(agent => <UXAgentCardV2 key={agent.id} agent={agent} onOpenAgent={onOpenAgent}/>) }
          </div>
        ) : (
          <UXEmptyState title="Agents are loading" body="C-Office is waiting for /api/state or SSE data." />
        )}
      </section>

      <div className="ux-dashboard-main">
        <section className="ux-section-panel">
          <div className="ux-section-head">
            <div>
              <h3 className="ux-section-title">Live activity</h3>
              <div className="ux-section-subtitle">Readable feed from hooks, tools, sessions, and dispatches.</div>
            </div>
            <UXStatusChip label={`${(window.ACTIVITY || []).length} events`} state={(window.ACTIVITY || []).length ? 'active' : 'muted'} />
          </div>
          <UXLiveFeed onOpenAgent={onOpenAgent}/>
        </section>

        <aside className="ux-side-stack">
          <section className="ux-section-panel">
            <div className="ux-section-head">
              <div>
                <h3 className="ux-section-title">Provider readiness</h3>
                <div className="ux-section-subtitle">Connection state for command and generation providers.</div>
              </div>
            </div>
            <UXProviderReadiness/>
          </section>

          <section className="ux-section-panel">
            <div className="ux-section-head">
              <div>
                <h3 className="ux-section-title">Current runs</h3>
                <div className="ux-section-subtitle">Recent Orchestra missions and step progress.</div>
              </div>
            </div>
            <UXRunList/>
          </section>
        </aside>
      </div>

      <div className="ux-dashboard-footer">
        <div className="ux-mini-panel">
          <h3>Hook health</h3>
          <p>{sessions.length ? `${sessions.length} session sources detected.` : 'No sessions yet. Run npm run install-hooks and start Claude Code.'}</p>
        </div>
        <div className="ux-mini-panel">
          <h3>Notes inbox</h3>
          <p>{(window.NOTES || []).length ? `${window.NOTES.length} notes are ready for dispatch.` : 'No notes yet. Capture ideas and route them to an agent.'}</p>
        </div>
        <div className="ux-mini-panel">
          <h3>Next upgrade</h3>
          <p>Mission Control filters and Notes three-panel workspace are the next surfaces after this dashboard pass.</p>
        </div>
      </div>
    </div>
  );
};

window.Dashboard = DashboardV2;
