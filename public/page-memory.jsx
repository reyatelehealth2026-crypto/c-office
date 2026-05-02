/* ===== MEMORY GRAPH PAGE ===== */
const AgentDot = window.AgentDot;

const catColor = {
  project: '#fbbf24', topic: '#FF6B6B', fact: '#4ECDC4',
  design: '#f472b6', pref: '#34d399', idea: '#fb923c',
  insight: '#60a5fa', intel: '#ef4444', rule: '#94a3b8', persona: '#c084fc',
};

const MemoryPanel = ({ agent, onOpenAgent, compact }) => {
  const [selected, setSelected] = React.useState(null);
  const agents = Array.isArray(AGENTS) ? AGENTS : [];
  const allNodes = Array.isArray(MEMORY_NODES) ? MEMORY_NODES : [];
  const allEdges = Array.isArray(MEMORY_EDGES) ? MEMORY_EDGES : [];
  const nodes = agent ? allNodes.filter((n) => n.agent === agent.id) : allNodes;
  const nodeIds = new Set(nodes.map((n) => n.id));
  const edges = allEdges.filter(([a, b]) => nodeIds.has(a) && nodeIds.has(b));
  const W = 100, H = 100;

  const [agentFilter, setAgentFilter] = React.useState('ALL');
  const filteredNodes = agentFilter === 'ALL' ? nodes : nodes.filter((n) => n.agent === agentFilter);
  const filteredIds = new Set(filteredNodes.map((n) => n.id));
  const filteredEdges = edges.filter(([a, b]) => filteredIds.has(a) && filteredIds.has(b));

  return (
    <div className={compact ? '' : 'stack'} style={{ gap: 14 }}>
      {!compact && (
        <div className="topbar">
          <div>
            <h1>Knowledge <span className="accent">Archive</span></h1>
            <div className="sub">{allNodes.length} records • {allEdges.length} links • shared across staff</div>
          </div>
          <div className="topbar-actions">
            <select
              value={agentFilter}
              onChange={(e) => setAgentFilter(e.target.value)}
              style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 10, padding: '8px 12px', color: 'var(--text)', fontFamily: 'var(--font-body)', fontSize: 13 }}
            >
              <option value="ALL">All agents</option>
              {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
        </div>
      )}

      <div className="grid" style={{ gridTemplateColumns: compact ? '1fr' : '1fr 300px', gap: 14 }}>
        <div className="panel" style={{ padding: 0, overflow: 'hidden', minHeight: 500, background: 'radial-gradient(circle at 50% 50%, rgba(255,107,107,0.08), transparent 70%), var(--panel)' }}>
          <div style={{ position: 'absolute', top: 14, left: 14, zIndex: 2 }}>
            <div className="mono-s" style={{ letterSpacing: '0.2em' }}>ARCHIVE RECORDS</div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700 }}>{filteredNodes.length} <span style={{ color: 'var(--text-3)', fontSize: 12, fontWeight: 400 }}>nodes</span></div>
          </div>

          <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={compact ? 400 : 560} style={{ display: 'block' }} preserveAspectRatio="xMidYMid meet">
            <defs>
              <radialGradient id="glow" cx="50%" cy="50%">
                <stop offset="0%" stopColor="#fff" stopOpacity="0.8" />
                <stop offset="100%" stopColor="#fff" stopOpacity="0" />
              </radialGradient>
            </defs>
            {filteredEdges.map(([a, b], i) => {
              const A = nodes.find((n) => n.id === a);
              const B = nodes.find((n) => n.id === b);
              if (!A || !B) return null;
              const active = selected && (selected === a || selected === b);
              return (
                <line
                  key={i}
                  x1={A.x}
                  y1={A.y}
                  x2={B.x}
                  y2={B.y}
                  stroke={active ? '#fbbf24' : 'rgba(255,107,107,0.35)'}
                  strokeWidth={active ? 0.35 : 0.2}
                />
              );
            })}
            {filteredNodes.map((n) => {
              const col = catColor[n.cat] || '#FF6B6B';
              const r = n.size / 4;
              const active = selected === n.id;
              return (
                <g key={n.id} style={{ cursor: 'pointer' }} onClick={() => setSelected(n.id)}>
                  <circle cx={n.x} cy={n.y} r={r * 1.8} fill={col} opacity={active ? 0.3 : 0.12} />
                  <circle cx={n.x} cy={n.y} r={r} fill={col} stroke="#fff" strokeWidth={active ? 0.4 : 0.2} strokeOpacity="0.5" />
                  <text x={n.x} y={n.y + r + 1.8} textAnchor="middle" style={{ fontFamily: 'var(--font-body)', fontSize: 1.8, fill: active ? '#fff' : 'var(--text-2)', pointerEvents: 'none' }}>
                    {n.label}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>

        <div className="panel">
          <div className="panel-head"><h3>Record Details</h3></div>
          {selected ? (() => {
            const n = allNodes.find((x) => x.id === selected);
            if (!n) return <div className="muted" style={{ fontSize: 12 }}>Selected node was not found.</div>;
            const ag = agents.find((a) => a.id === n.agent);
            const connected = allEdges
              .filter(([a, b]) => a === n.id || b === n.id)
              .map(([a, b]) => allNodes.find((x) => x.id === (a === n.id ? b : a)))
              .filter(Boolean);

            return (
              <div>
                <span className="badge" style={{ background: `${catColor[n.cat]}22`, color: catColor[n.cat], borderColor: `${catColor[n.cat]}55` }}>{n.cat}</span>
                <div style={{ fontSize: 18, fontWeight: 600, margin: '10px 0 6px' }}>{n.label}</div>
                <div className="row" style={{ gap: 8, marginBottom: 14 }} onClick={() => ag && onOpenAgent && onOpenAgent(ag.id)}>
                  <AgentDot agent={ag || { name: 'Unknown', avatar: '', color: '#64748b' }} size={24} />
                  <div style={{ fontSize: 12 }}>created by <b>{ag?.name || 'Unknown'}</b></div>
                </div>
                <div className="divider" />
                <div className="mono-s" style={{ marginBottom: 8 }}>CONNECTED • {connected.length}</div>
                <div className="stack" style={{ gap: 6 }}>
                  {connected.map((c) => (
                    <div key={c.id} onClick={() => setSelected(c.id)} style={{ padding: '6px 10px', background: 'var(--bg-2)', borderRadius: 6, fontSize: 12, cursor: 'pointer', border: '1px solid var(--border)' }}>
                      <span style={{ color: catColor[c.cat], marginRight: 6 }}>•</span>{c.label}
                    </div>
                  ))}
                </div>
              </div>
            );
          })() : (
            <div className="muted" style={{ fontSize: 12 }}>Click a node in the graph to see details and connections.</div>
          )}

          <div className="divider" />
          <div className="mono-s" style={{ marginBottom: 8 }}>LEGEND</div>
          <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            {Object.entries(catColor).map(([k, c]) => (
              <div key={k} style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 11 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: c }} />
                <span style={{ textTransform: 'capitalize' }}>{k}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

function fmtSkillWhen(ts) {
  if (ts == null || ts === '') return '—';
  const n = Number(ts);
  const d = Number.isFinite(n) ? new Date(n) : new Date(String(ts));
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString();
}

function buildLearnedSkillCopy(skill) {
  const lines = [`Goal: ${skill.goal || skill.id || '(no goal)'}`];
  const steps = Array.isArray(skill.steps) ? skill.steps : [];
  if (steps.length) {
    lines.push('', 'Steps:');
    steps.forEach((st, i) => lines.push(`${i + 1}. ${typeof st === 'string' ? st : JSON.stringify(st)}`));
  }
  if (skill.preview && String(skill.preview).trim()) {
    lines.push('', 'Notes:', String(skill.preview).trim());
  }
  return lines.join('\n');
}

/* ===== SKILLS PAGE — learned playbooks + per-agent SOP matrix ===== */
const SkillsPage = ({ onOpenAgent }) => {
  window.useCOfficeRefresh();
  const agents = Array.isArray(window.AGENTS) ? window.AGENTS : [];
  const [learned, setLearned] = React.useState([]);
  const [loadErr, setLoadErr] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [query, setQuery] = React.useState('');
  const [expanded, setExpanded] = React.useState({});

  const loadLearned = React.useCallback(async () => {
    setLoading(true);
    setLoadErr(null);
    try {
      const r = await fetch('/api/skills');
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Failed to load skills');
      setLearned(Array.isArray(j.skills) ? j.skills : []);
    } catch (e) {
      setLoadErr(e.message || String(e));
      setLearned([]);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { loadLearned(); }, [loadLearned]);
  React.useEffect(() => {
    const onRefresh = () => loadLearned();
    window.COfficeBus?.addEventListener('refresh', onRefresh);
    return () => window.COfficeBus?.removeEventListener('refresh', onRefresh);
  }, [loadLearned]);

  const q = query.trim().toLowerCase();
  const filteredLearned = learned.filter((s) => {
    if (!q) return true;
    const blob = [s.goal, s.id, ...(s.tags || []), JSON.stringify(s.steps || [])].join(' ').toLowerCase();
    return blob.includes(q);
  });

  const sendToOrchestra = (skill) => {
    const g = String(skill.goal || '').trim();
    if (g) sessionStorage.setItem('c-office-orchestra-draft', g);
    window.dispatchEvent(new CustomEvent('c-office:navigate', { detail: { page: 'dashboard' } }));
    queueMicrotask(() => window.dispatchEvent(new CustomEvent('c-office:orchestra-goal', { detail: { goal: g } })));
  };

  const copyText = async (text, okMsg) => {
    try {
      await navigator.clipboard.writeText(text);
      if (okMsg) alert(okMsg);
    } catch {
      window.prompt('Copy', text);
    }
  };

  return (
    <div>
      <div className="topbar">
        <div>
          <h1>SOP <span className="accent">Library</span></h1>
          <div className="sub">Learned playbooks from past runs · agent mastery matrix</div>
        </div>
        <div className="topbar-actions" style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            type="search"
            placeholder="Filter learned skills…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{
              background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 8,
              padding: '8px 12px', color: 'var(--text)', fontSize: 13, minWidth: 200,
            }}
          />
          <button type="button" className="btn ghost" style={{ fontSize: 12 }} onClick={loadLearned} disabled={loading}>
            {loading ? '…' : 'Refresh'}
          </button>
        </div>
      </div>

      <div className="panel" style={{ marginBottom: 14 }}>
        <div className="panel-head">
          <h3>Learned playbooks</h3>
          <div className="right mono-s">{filteredLearned.length}{learned.length !== filteredLearned.length ? ` / ${learned.length}` : ''} · ~/.c-office/skills</div>
        </div>
        {loadErr && (
          <div style={{ padding: '12px 16px', color: 'var(--red)', fontSize: 13 }}>{loadErr}</div>
        )}
        {!loadErr && loading && learned.length === 0 && (
          <div className="muted" style={{ padding: '24px 16px', fontSize: 13 }}>Loading…</div>
        )}
        {!loadErr && !loading && learned.length === 0 && (
          <div className="muted" style={{ padding: '24px 16px', fontSize: 13, lineHeight: 1.5 }}>
            No learned skills yet. They appear after multi-step Orchestra runs finish successfully (saved automatically).
          </div>
        )}
        <div className="stack" style={{ gap: 12, padding: '0 16px 16px' }}>
          {filteredLearned.map((s) => {
            const open = !!expanded[s.id];
            return (
              <div
                key={s.id}
                style={{
                  border: '1px solid var(--border)',
                  borderRadius: 10,
                  background: 'var(--bg-2)',
                  overflow: 'hidden',
                }}
              >
                <div style={{ padding: '12px 14px', display: 'flex', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4, color: 'var(--text-1)' }}>
                      {(s.goal || s.id || 'Untitled').slice(0, 200)}{(s.goal || '').length > 200 ? '…' : ''}
                    </div>
                    <div className="mono-s" style={{ color: 'var(--text-3)', fontSize: 11 }}>
                      {s.id} · {fmtSkillWhen(s.createdAt)}
                      {Number(s.tokens) > 0 && ` · ${Number(s.tokens).toLocaleString()} tok`}
                      {Number(s.revisions) > 0 && ` · rev ${s.revisions}`}
                    </div>
                    {(s.tags || []).length > 0 && (
                      <div style={{ marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {(s.tags || []).map((t) => (
                          <span key={t} className="chip" style={{ fontSize: 10 }}>{t}</span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                    <button type="button" className="btn gold" style={{ fontSize: 12, padding: '6px 12px' }} onClick={() => sendToOrchestra(s)}>
                      Send to Orchestra
                    </button>
                    <button type="button" className="btn" style={{ fontSize: 12, padding: '6px 12px' }} onClick={() => copyText(String(s.goal || '').trim(), null)}>
                      Copy goal
                    </button>
                    <button type="button" className="btn ghost" style={{ fontSize: 12, padding: '6px 12px' }} onClick={() => copyText(buildLearnedSkillCopy(s), null)}>
                      Copy full
                    </button>
                    <button type="button" className="btn-ghost" style={{ fontSize: 11 }} onClick={() => setExpanded((ex) => ({ ...ex, [s.id]: !open }))}>
                      {open ? 'Hide detail' : 'Detail'}
                    </button>
                  </div>
                </div>
                {open && (
                  <div style={{ borderTop: '1px solid var(--border)', padding: '12px 14px', background: 'var(--bg-1)' }}>
                    {Array.isArray(s.steps) && s.steps.length > 0 && (
                      <div style={{ marginBottom: 10 }}>
                        <div className="mono-s" style={{ marginBottom: 6 }}>Steps</div>
                        <ol style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: 'var(--text-2)' }}>
                          {s.steps.map((st, i) => (
                            <li key={i} style={{ marginBottom: 4 }}>{typeof st === 'string' ? st : JSON.stringify(st)}</li>
                          ))}
                        </ol>
                      </div>
                    )}
                    {s.preview && (
                      <div>
                        <div className="mono-s" style={{ marginBottom: 6 }}>Body preview</div>
                        <pre style={{
                          margin: 0, whiteSpace: 'pre-wrap', fontSize: 12, color: 'var(--text-2)',
                          maxHeight: 220, overflow: 'auto', fontFamily: 'var(--font-mono)',
                        }}>{s.preview}{String(s.preview).length >= 1200 ? '…' : ''}</pre>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="mono-s" style={{ margin: '0 0 10px', fontSize: 11, color: 'var(--text-3)', letterSpacing: '0.08em' }}>CHARACTER SOP MATRIX</div>
      <div className="stack" style={{ gap: 14 }}>
        {agents.map((a) => {
          const skills = Array.isArray(a.skills) ? a.skills : [];
          return (
            <div key={a.id} className="panel">
              <div style={{ display: 'flex', gap: 14, alignItems: 'center', marginBottom: 14 }}>
                <AgentDot agent={a} size={44} />
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
                    <h3 style={{ fontSize: 16 }}>{a.name}</h3>
                    <span className={`badge ${a.rarity === 'SSR' ? 'gold' : a.rarity === 'SR' ? '' : 'cyan'}`}>{a.rarity}</span>
                    <span className="mono-s">• {a.role}</span>
                  </div>
                  <div className="mono-s">Lv {a.level} • {skills.length} playbook bars</div>
                </div>
                <button className="btn" onClick={() => onOpenAgent(a.id)} style={{ padding: '6px 12px', fontSize: 12 }}>View detail →</button>
              </div>
              <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8 }}>
                {skills.map((sk) => (
                  <div key={sk.name} style={{ padding: '8px 10px', background: 'var(--bg-2)', borderRadius: 8, border: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 5 }}>
                      <span style={{ fontWeight: 500 }}>{sk.name}</span>
                      <span className="mono" style={{ color: 'var(--gold)' }}>{sk.level}</span>
                    </div>
                    <div style={{ display: 'flex', gap: 2 }}>
                      {Array.from({ length: 10 }).map((_, i) => (
                        <div key={i} style={{ flex: 1, height: 3, borderRadius: 1.5, background: i < sk.level ? a.gradient : 'var(--bg-3)' }} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

Object.assign(window, { MemoryPanel, SkillsPage });
