/* Mission Control Polish — grouped repeated events override. */

const mpTime = (input) => {
  if (!input) return 'unknown';
  const ts = typeof input === 'number' ? input : Date.parse(input);
  if (!Number.isFinite(ts)) return 'recent';
  const d = Math.max(0, Date.now() - ts);
  const s = Math.floor(d / 1000);
  if (s < 10) return 'now';
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
};
const mpTs = (ev) => ev?.ts || ev?.t || ev?.time || ev?.createdAt || ev?.updatedAt || null;
const mpKind = (ev) => String(ev?.event || ev?.type || ev?.hook_event_name || ev?.tool || ev?.kind || 'event');
const mpSource = (ev) => String(ev?.personaId || ev?.agentId || ev?.persona || ev?.agent || ev?.source || 'system');
const mpTitle = (ev) => ev?.summary || ev?.message || ev?.text || ev?.title || ev?.event || ev?.type || ev?.hook_event_name || 'Activity event';
const mpGlyph = (ev) => mpKind(ev).replace(/[^A-Za-z]/g, '').slice(0, 2).toUpperCase() || 'EV';
const mpAgent = (ev) => {
  const src = mpSource(ev);
  return (window.AGENTS || []).find(a => a.id === src || a.name === src || a.avatarInitials === src);
};
const mpKey = (ev) => `${mpSource(ev)}::${mpKind(ev)}::${mpTitle(ev).slice(0,80)}`;
const mpGroupEvents = (events) => {
  const out = [];
  for (const ev of events) {
    const last = out[out.length - 1];
    const k = mpKey(ev);
    if (last && last.key === k) {
      last.events.push(ev);
      last.last = ev;
    } else {
      out.push({ key: k, first: ev, last: ev, events: [ev] });
    }
  }
  return out;
};

const MPInspector = ({ group, onClear }) => {
  const ev = group?.last;
  if (!ev) return <aside className="ux-inspector"><UXEmptyState title="Select an event" body="Click a grouped event to inspect metadata and raw payload." /></aside>;
  const agent = mpAgent(ev);
  const raw = JSON.stringify(group.events.length > 1 ? group.events : ev, null, 2);
  const copyRaw = () => navigator.clipboard?.writeText(raw).catch(() => window.prompt('Copy raw payload', raw));
  return <aside className="ux-inspector"><div className="ux-inspector-head"><div><h3 className="ux-inspector-title">{agent?.name || mpSource(ev)}</h3><div className="ux-inspector-sub">{mpKind(ev)} · {group.events.length} event(s) · {mpTime(mpTs(ev))}</div></div><button className="ux-soft-button" onClick={onClear}>Close</button></div><div className="ux-detail-grid"><div className="ux-detail-cell"><div className="ux-detail-label">source</div><div className="ux-detail-value">{mpSource(ev)}</div></div><div className="ux-detail-cell"><div className="ux-detail-label">kind</div><div className="ux-detail-value">{mpKind(ev)}</div></div><div className="ux-detail-cell"><div className="ux-detail-label">count</div><div className="ux-detail-value">{group.events.length}</div></div><div className="ux-detail-cell"><div className="ux-detail-label">latest</div><div className="ux-detail-value">{mpTs(ev) ? new Date(mpTs(ev)).toLocaleString() : 'unknown'}</div></div></div><div className="ux-section-subtitle">Readable summary</div><div className="ux-detail-cell"><div className="ux-detail-value">{mpTitle(ev)}</div></div><div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap: 8 }}><div className="ux-section-subtitle">Raw payload</div><button className="ux-soft-button" onClick={copyRaw}>Copy JSON</button></div><pre className="ux-raw-box">{raw}</pre></aside>;
};

const MPEventGroupCard = ({ group, selected, onSelect }) => {
  const ev = group.last;
  const agent = mpAgent(ev);
  const count = group.events.length;
  return <button className={'ux-event-card ' + (selected ? 'is-selected' : '')} onClick={onSelect} style={{ textAlign:'left' }}><div className="ux-event-glyph">{agent?.avatarInitials || mpGlyph(ev)}</div><div className="ux-event-main"><div className="ux-event-top"><span className="ux-event-title">{agent?.name || mpSource(ev)}</span><span className="ux-event-source">{mpKind(ev)}</span>{count > 1 && <span className="ux-event-tag">x{count}</span>}</div><div className="ux-event-summary">{mpTitle(ev)}</div><div className="ux-event-tags">{ev.session_id && <span className="ux-event-tag">session</span>}{ev.tool && <span className="ux-event-tag">tool: {String(ev.tool).slice(0,18)}</span>}{ev.status && <span className="ux-event-tag">{ev.status}</span>}</div></div><div className="ux-event-time">{mpTime(mpTs(ev))}</div></button>;
};

const MissionControlPagePolished = ({ onOpenAgent }) => {
  window.useCOfficeRefresh?.();
  const [query, setQuery] = React.useState('');
  const [kind, setKind] = React.useState('all');
  const [persona, setPersona] = React.useState('all');
  const [paused, setPaused] = React.useState(false);
  const [frozen, setFrozen] = React.useState(null);
  const [selected, setSelected] = React.useState(null);
  const [grouped, setGrouped] = React.useState(true);
  const live = window.ACTIVITY || [];
  React.useEffect(() => { if (paused && frozen == null) setFrozen(live.slice()); if (!paused && frozen != null) setFrozen(null); }, [paused, live.length]);
  const events = paused ? (frozen || live) : live;
  const match = (ev) => {
    const hay = JSON.stringify(ev || {}).toLowerCase();
    if (query && !hay.includes(query.toLowerCase())) return false;
    if (kind !== 'all' && mpKind(ev).toLowerCase() !== kind.toLowerCase()) return false;
    if (persona !== 'all') { const a = mpAgent(ev); const src = mpSource(ev); if (a?.id !== persona && src !== persona) return false; }
    return true;
  };
  const filtered = events.filter(match);
  const groups = grouped ? mpGroupEvents(filtered) : filtered.map(ev => ({ key: `${mpKey(ev)}::${mpTs(ev)}`, first: ev, last: ev, events:[ev] }));
  const kinds = ['all', ...Array.from(new Set(events.map(mpKind))).slice(0, 18)];
  const agents = window.AGENTS || [];
  const sessions = new Set(filtered.map(ev => ev.session_id || ev.sessionId).filter(Boolean)).size;
  const tools = filtered.filter(ev => ev.tool || /tool/i.test(mpKind(ev))).length;
  return <div className="ux-mission"><section className="ux-mission-toolbar"><input className="ux-filter-input" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search events, tools, session ids, payload text..."/><select className="ux-filter-select" value={persona} onChange={e => setPersona(e.target.value)}><option value="all">All personas</option>{agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select><button className={paused ? 'ux-hero-button' : 'ux-soft-button'} onClick={() => setPaused(p => !p)}>{paused ? 'Resume' : 'Pause visual'}</button><div className="ux-filter-pills"><button className={'ux-filter-pill ' + (grouped ? 'is-active' : '')} onClick={() => setGrouped(g => !g)}>{grouped ? 'grouped on' : 'grouped off'}</button>{kinds.map(k => <button key={k} className={'ux-filter-pill ' + (kind === k ? 'is-active' : '')} onClick={() => setKind(k)}>{k}</button>)}</div></section><section className="ux-section-panel"><div className="ux-section-head"><div><h3 className="ux-section-title">Realtime feed</h3><div className="ux-section-subtitle">{grouped ? 'Repeated adjacent events are grouped to reduce feed noise.' : 'Showing every event individually.'}</div></div><UXStatusChip label={`${groups.length} rows`} state={groups.length ? 'active' : 'muted'} /></div><div className="ux-mission-summary"><UXMetricCard label="Events" value={filtered.length} note={`${events.length} total`} color="var(--ux-accent-secondary)"/><UXMetricCard label="Groups" value={groups.length} note="visible rows" color="var(--ux-accent-primary)"/><UXMetricCard label="Sessions" value={sessions} note="unique ids" color="var(--ux-success)"/><UXMetricCard label="Tools" value={tools} note="tool activity" color="var(--ux-accent-gold)"/></div>{groups.length ? <div className="ux-mission-feed">{groups.map(g => <MPEventGroupCard key={g.key + String(mpTs(g.last))} group={g} selected={selected === g} onSelect={() => setSelected(g)} />)}</div> : <UXEmptyState title="No matching events" body="Clear filters or wait for new activity to arrive." />}</section><MPInspector group={selected} onClear={() => setSelected(null)} /></div>;
};

window.MissionControlPage = MissionControlPagePolished;
