/* Mission Control V2 — full realtime event inspection.
   Uses existing window.ACTIVITY / AGENTS / RUNS data fed by data.js. */

const mcTime = (input) => {
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

const mcTs = (ev) => ev?.ts || ev?.t || ev?.time || ev?.createdAt || ev?.updatedAt || null;
const mcKind = (ev) => String(ev?.event || ev?.type || ev?.hook_event_name || ev?.tool || ev?.kind || 'event');
const mcSource = (ev) => String(ev?.personaId || ev?.agentId || ev?.persona || ev?.agent || ev?.source || 'system');
const mcTitle = (ev) => ev?.summary || ev?.message || ev?.text || ev?.title || ev?.event || ev?.type || ev?.hook_event_name || 'Activity event';
const mcGlyph = (ev) => mcKind(ev).replace(/[^A-Za-z]/g, '').slice(0, 2).toUpperCase() || 'EV';

const mcFindAgent = (ev) => {
  const source = mcSource(ev);
  return (window.AGENTS || []).find(a => a.id === source || a.name === source || a.avatarInitials === source);
};

const mcEventMatches = (ev, q, kind, persona) => {
  const hay = JSON.stringify(ev || {}).toLowerCase();
  if (q && !hay.includes(q.toLowerCase())) return false;
  if (kind !== 'all' && mcKind(ev).toLowerCase() !== kind.toLowerCase()) return false;
  if (persona !== 'all') {
    const agent = mcFindAgent(ev);
    const src = mcSource(ev);
    if (agent?.id !== persona && src !== persona) return false;
  }
  return true;
};

const MCEventCard = ({ ev, selected, onSelect }) => {
  const agent = mcFindAgent(ev);
  const kind = mcKind(ev);
  const source = agent?.name || mcSource(ev);
  const title = mcTitle(ev);
  const rawSummary = ev?.details || ev?.tool || ev?.session_id || ev?.path || ev?.status || '';
  return (
    <button className={'ux-event-card ' + (selected ? 'is-selected' : '')} onClick={onSelect} style={{ textAlign: 'left' }}>
      <div className="ux-event-glyph">{agent?.avatarInitials || mcGlyph(ev)}</div>
      <div className="ux-event-main">
        <div className="ux-event-top">
          <span className="ux-event-title">{source}</span>
          <span className="ux-event-source">{kind}</span>
        </div>
        <div className="ux-event-summary">{title}</div>
        <div className="ux-event-tags">
          {ev?.session_id && <span className="ux-event-tag">session</span>}
          {ev?.tool && <span className="ux-event-tag" data-tool={String(ev.tool).slice(0, 18)}>{String(ev.tool).slice(0, 18)}</span>}
          {ev?.status && <span className="ux-event-tag">{ev.status}</span>}
          {rawSummary && !ev?.tool && !ev?.status && <span className="ux-event-tag">detail</span>}
        </div>
      </div>
      <div className="ux-event-time">{mcTime(mcTs(ev))}</div>
    </button>
  );
};

const MCInspector = ({ ev, onClear }) => {
  if (!ev) {
    return (
      <aside className="ux-inspector">
        <UXEmptyState title="Select an event" body="Click any feed item to inspect metadata and raw payload." />
      </aside>
    );
  }
  const agent = mcFindAgent(ev);
  const raw = JSON.stringify(ev, null, 2);
  const copyRaw = () => navigator.clipboard?.writeText(raw).catch(() => window.prompt('Copy raw payload', raw));
  return (
    <aside className="ux-inspector">
      <div className="ux-inspector-head">
        <div>
          <h3 className="ux-inspector-title">{agent?.name || mcSource(ev)}</h3>
          <div className="ux-inspector-sub">{mcKind(ev)} · {mcTime(mcTs(ev))}</div>
        </div>
        <button className="ux-soft-button" onClick={onClear}>Close</button>
      </div>

      <div className="ux-detail-grid">
        <div className="ux-detail-cell"><div className="ux-detail-label">source</div><div className="ux-detail-value">{mcSource(ev)}</div></div>
        <div className="ux-detail-cell"><div className="ux-detail-label">kind</div><div className="ux-detail-value">{mcKind(ev)}</div></div>
        <div className="ux-detail-cell"><div className="ux-detail-label">session</div><div className="ux-detail-value">{ev.session_id || ev.sessionId || 'none'}</div></div>
        <div className="ux-detail-cell"><div className="ux-detail-label">time</div><div className="ux-detail-value">{mcTs(ev) ? new Date(mcTs(ev)).toLocaleString() : 'unknown'}</div></div>
      </div>

      <div className="ux-section-subtitle">Readable summary</div>
      <div className="ux-detail-cell"><div className="ux-detail-value">{mcTitle(ev)}</div></div>

      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap: 8 }}>
        <div className="ux-section-subtitle">Raw payload</div>
        <button className="ux-soft-button" onClick={copyRaw}>Copy JSON</button>
      </div>
      <pre className="ux-raw-box">{raw}</pre>
    </aside>
  );
};

const MissionControlPage = ({ onOpenAgent }) => {
  window.useCOfficeRefresh?.();
  const [query, setQuery] = React.useState('');
  const [kind, setKind] = React.useState('all');
  const [persona, setPersona] = React.useState('all');
  const [paused, setPaused] = React.useState(false);
  const [frozen, setFrozen] = React.useState(null);
  const [selected, setSelected] = React.useState(null);

  const liveEvents = window.ACTIVITY || [];
  React.useEffect(() => {
    if (paused && frozen == null) setFrozen(liveEvents.slice());
    if (!paused && frozen != null) setFrozen(null);
  }, [paused, liveEvents.length]);

  const events = paused ? (frozen || liveEvents) : liveEvents;
  const kinds = ['all', ...Array.from(new Set(events.map(mcKind))).slice(0, 16)];
  const agents = window.AGENTS || [];
  const filtered = events.filter(ev => mcEventMatches(ev, query, kind, persona));
  const sessions = new Set(events.map(ev => ev.session_id || ev.sessionId).filter(Boolean)).size;
  const tools = events.filter(ev => ev.tool || /tool/i.test(mcKind(ev))).length;

  return (
    <div className="ux-mission">
      <section className="ux-mission-toolbar">
        <input className="ux-filter-input" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search events, tools, session ids, payload text..." />
        <select className="ux-filter-select" value={persona} onChange={e => setPersona(e.target.value)}>
          <option value="all">All personas</option>
          {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <button className={paused ? 'ux-hero-button' : 'ux-soft-button'} onClick={() => setPaused(p => !p)}>{paused ? 'Resume' : 'Pause visual'}</button>
        <div className="ux-filter-pills">
          {kinds.map(k => <button key={k} className={'ux-filter-pill ' + (kind === k ? 'is-active' : '')} onClick={() => setKind(k)}>{k}</button>)}
        </div>
      </section>

      <section className="ux-section-panel">
        <div className="ux-section-head">
          <div>
            <h3 className="ux-section-title">Realtime feed</h3>
            <div className="ux-section-subtitle">{paused ? 'Visual stream paused. New SSE data is still collected globally.' : 'Live from hooks, sessions, dispatches, runs, and tools.'}</div>
          </div>
          <UXStatusChip label={`${filtered.length} shown`} state={filtered.length ? 'active' : 'muted'} />
        </div>

        <div className="ux-mission-summary">
          <UXMetricCard label="Events" value={filtered.length} note={`${events.length} total`} color="var(--ux-accent-secondary)" />
          <UXMetricCard label="Sessions" value={sessions} note="unique ids" color="var(--ux-success)" />
          <UXMetricCard label="Tools" value={tools} note="tool activity" color="var(--ux-accent-gold)" />
          <UXMetricCard label="Mode" value={paused ? 'Paused' : 'Live'} note="visual stream" color={paused ? 'var(--ux-warning)' : 'var(--ux-success)'} />
        </div>

        {filtered.length ? (
          <div className="ux-mission-feed">
            {filtered.map((ev, idx) => (
              <MCEventCard
                key={ev.id || ev.ts || ev.t || idx}
                ev={ev}
                selected={selected === ev}
                onSelect={() => setSelected(ev)}
              />
            ))}
          </div>
        ) : (
          <UXEmptyState title="No matching events" body="Clear filters or wait for new activity to arrive." />
        )}
      </section>

      <MCInspector ev={selected} onClear={() => setSelected(null)} />
    </div>
  );
};

window.MissionControlPage = MissionControlPage;
