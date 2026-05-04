/* ============================================================
   SIM OFFICE CONTROL — C-Office Workfloor (full redesign)
   Agents shown as employees at desks with live workload / focus /
   energy / queue / current-task ticker. Inspector on the right
   has Profile + Live + free-form Image Lab (no rigid Look Lock).
   Backed by /api/state, /api/agents, /api/images/generate.
   ============================================================ */

const PROVIDER_CHOICES = ['claude', 'codex', 'image'];
const TOOL_CATALOG = ['Read', 'Edit', 'Write', 'Bash', 'Grep', 'Glob', 'WebSearch', 'WebFetch', 'delegate'];

const DEFAULT_AGENT_IMAGES = {
  atlas: '/portraits/atlas.png',  oracle: '/portraits/oracle.png',
  scribe: '/portraits/scribe.png', warden: '/portraits/warden.png',
  vector: '/portraits/vector.png', pulse: '/portraits/pulse.png',
  forge: '/portraits/forge.png',   scout: '/portraits/scout.png',
  relay: '/portraits/relay.png',
};
const DEFAULT_AGENT_AVATARS = {
  atlas: 'AT', oracle: 'OR', scribe: 'SC', warden: 'WD', vector: 'VC',
  pulse: 'PL', forge: 'FG', scout: 'ST', relay: 'RL',
};
const PERSONA_GLYPH = {
  atlas: '👑', oracle: '🔮', scribe: '✒️', warden: '🛡️', vector: '⚡',
  pulse: '📈', forge: '🎨', scout: '🔍', relay: '⚙️',
};

const inferCategoryKey = (agent) => {
  const explicit = (agent?.category || '').toLowerCase().trim();
  if (explicit) return explicit;
  const text = `${agent?.name || ''} ${agent?.role || ''}`.toLowerCase();
  if (/growth|market|sales|commerce|social|seo/.test(text)) return 'growth';
  if (/build|code|engineer|dev|frontend|backend|forge/.test(text)) return 'forge';
  if (/research|intel|analyst|data|insight/.test(text)) return 'intel';
  if (/content|write|scribe|mentor|knowledge|course/.test(text)) return 'scriptorium';
  if (/visual|studio|design|video|game|creative|image/.test(text)) return 'studio';
  if (/ops|devops|sre|orchestr|project|workflow/.test(text)) return 'ops';
  return 'general';
};
const CATEGORY_COLOR = {
  growth: '#ec4899', forge: '#7cd3ff', intel: '#a78bfa',
  scriptorium: '#f5b942', studio: '#84cc16', ops: '#fb923c', general: '#94a3b8',
};
const CATEGORY_LABEL = {
  growth: 'Growth', forge: 'Forge', intel: 'Intel',
  scriptorium: 'Scriptorium', studio: 'Studio', ops: 'Ops', general: 'General',
};

const STATUS_LABEL = { busy: 'Working', active: 'Online', idle: 'Standby', offline: 'Off shift' };
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const hashSeed = (s) => {
  let h = 0; const str = String(s || '');
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
  return Math.abs(h);
};

/* --------- live metric derivation -------------------------- */
function computeMetrics(agent, tasks, now) {
  const queue = (tasks || []).filter((t) => t.personaId === agent.id && t.status === 'running').length;
  const success = clamp(agent?.stats?.success ?? 100, 0, 100);
  const seed = hashSeed(agent.id);
  const wave = Math.sin((now / 4000) + seed * 0.13) * 8;
  let workload = 5;
  if (agent.status === 'busy')   workload = clamp(55 + queue * 12 + wave, 30, 100);
  else if (agent.status === 'active') workload = clamp(25 + queue * 10 + wave, 12, 65);
  else if (agent.status === 'offline') workload = 0;
  const focus = clamp(success - Math.abs(wave) * 0.4, 8, 100);
  let energy;
  if (agent.status === 'busy')   energy = clamp(72 - Math.sin((now / 7000) + seed * 0.21) * 10, 35, 88);
  else if (agent.status === 'active') energy = clamp(86 - Math.sin((now / 9000) + seed * 0.17) * 6, 70, 96);
  else if (agent.status === 'offline') energy = 0;
  else energy = clamp(96 - Math.sin((now / 11000) + seed * 0.09) * 4, 86, 100);
  return { queue, workload: Math.round(workload), focus: Math.round(focus), energy: Math.round(energy) };
}

/* --------- desk tile --------------------------------------- */
const DeskTile = ({ agent, tasks, now, selected, onSelect, onOpen }) => {
  const cat = inferCategoryKey(agent);
  const color = CATEGORY_COLOR[cat] || agent.color || '#7cd3ff';
  const m = computeMetrics(agent, tasks, now);
  const portrait = agent.image || DEFAULT_AGENT_IMAGES[agent.id];
  const initials = agent.avatarInitials || DEFAULT_AGENT_AVATARS[agent.id] || (agent.name || '??').slice(0, 2).toUpperCase();
  const ticker = (agent.currentTask && agent.currentTask !== '— idle' && agent.currentTask !== 'awaiting work')
    ? agent.currentTask
    : (agent.tagline || agent.role || 'รอรับงานใหม่');
  const isLive = agent.status === 'busy' || agent.status === 'active';

  return (
    <button
      type="button"
      className={`wf-desk status-${agent.status || 'idle'} ${agent.status === 'busy' ? 'is-busy' : ''} ${selected ? 'is-selected' : ''}`}
      style={{ '--cat-color': color }}
      onClick={() => onSelect(agent.id)}
      onDoubleClick={() => onOpen && onOpen(agent.id)}
      title={agent.tagline || agent.role || agent.name}
    >
      {agent.deletable === false && <span className="wf-lock" title="Locked — orchestrator">🔒</span>}
      <div className="wf-desk-head">
        <span className={`wf-status-dot ${agent.status || 'idle'}`}><i/>{STATUS_LABEL[agent.status] || 'Standby'}</span>
        <span className="wf-rarity-pill">{(agent.provider || 'claude').toUpperCase()}</span>
      </div>

      <div className="wf-desk-stage">
        <div className="wf-meter-legend"><span>W</span><span>F</span><span>E</span></div>
        <div className="wf-portrait">
          {portrait ? <img src={portrait} alt={agent.name}/> : <span>{initials}</span>}
        </div>
        <div className="wf-monitor"/>
        <div className="wf-mug"/>
        <div className="wf-meters">
          <div className="wf-meter" data-kind="W" title={`Workload ${m.workload}%`}><i style={{ height: `${m.workload}%` }}/></div>
          <div className="wf-meter" data-kind="F" title={`Focus ${m.focus}%`}><i style={{ height: `${m.focus}%` }}/></div>
          <div className="wf-meter" data-kind="E" title={`Energy ${m.energy}%`}><i style={{ height: `${m.energy}%` }}/></div>
        </div>
      </div>

      <div className="wf-desk-foot">
        <div className="wf-desk-name">
          <strong>{(agent.name || agent.id || 'Untitled').toString().trim() || 'Untitled'}</strong>
          <em>{agent.role || CATEGORY_LABEL[cat] || 'Staff'} {PERSONA_GLYPH[agent.id] || ''}</em>
        </div>
        <div className="wf-queue-row">
          <span className={`wf-queue-chip ${m.queue ? '' : 'empty'}`}>Q · {m.queue}</span>
          <span className={`wf-queue-chip ${m.queue ? '' : 'empty'}`}>Lv {agent.level || 1}</span>
        </div>
        <div className={`wf-ticker ${isLive ? 'is-live' : ''}`} title={ticker}>{ticker}</div>
      </div>
    </button>
  );
};

/* --------- inspector: profile / live / image lab ----------- */
const InspectorProfile = ({ draft, set, toggleTool, onSave, onDelete, busy, isLocked }) => (
  <>
    <div className="wf-fld"><span>Name</span><input value={draft.name} onChange={(e) => set('name', e.target.value)} placeholder="Agent name"/></div>
    <div className="wf-fld"><span>Role</span><input value={draft.role} onChange={(e) => set('role', e.target.value)} placeholder="Role / responsibility"/></div>
    <div className="wf-fld"><span>Tagline</span><textarea rows="2" value={draft.tagline} onChange={(e) => set('tagline', e.target.value)} placeholder="คำโปรย persona"/></div>
    <div className="wf-fld-row">
      <div className="wf-fld"><span>Provider</span>
        <select value={draft.provider} onChange={(e) => set('provider', e.target.value)}>
          {PROVIDER_CHOICES.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
      </div>
      <div className="wf-fld"><span>Theme color</span><input type="color" value={draft.color} onChange={(e) => set('color', e.target.value)}/></div>
    </div>
    <div className="wf-fld">
      <span>Tools allowed</span>
      <div className="wf-chip-row">
        {TOOL_CATALOG.map((t) => (
          <button type="button" key={t} className={`wf-chip ${(draft.toolsAllowed||[]).includes(t) ? 'is-on' : ''}`} onClick={() => toggleTool(t)}>{t}</button>
        ))}
      </div>
    </div>
    <div className="wf-fld">
      <span>System prompt</span>
      <textarea rows="8" value={draft.systemPrompt} onChange={(e) => set('systemPrompt', e.target.value)} style={{ fontFamily: 'var(--font-mono, ui-monospace, monospace)', fontSize: 12 }}/>
    </div>
    <div className="wf-fld-row">
      <button type="button" className="wf-btn primary" disabled={busy} onClick={onSave}>{busy ? '…' : (draft.id ? 'Save' : 'Create persona')}</button>
      {draft.id && (
        <button type="button" className="wf-btn ghost" disabled={busy || isLocked} onClick={onDelete} title={isLocked ? 'Locked' : 'Delete'}>{isLocked ? '🔒 Locked' : 'Delete'}</button>
      )}
    </div>
  </>
);

const InspectorLive = ({ agent, tasks, events, now }) => {
  const m = computeMetrics(agent, tasks, now);
  const myTasks = (tasks || []).filter((t) => t.personaId === agent.id).slice(0, 6);
  const myEvents = (events || []).filter((e) => e.personaId === agent.id).slice(0, 8);
  return (
    <>
      <div className="wf-live-stats">
        <div className="wf-live-stat"><b>{m.workload}%</b><span>workload</span></div>
        <div className="wf-live-stat"><b>{m.focus}%</b><span>focus</span></div>
        <div className="wf-live-stat"><b>{m.energy}%</b><span>energy</span></div>
        <div className="wf-live-stat"><b>{m.queue}</b><span>queue</span></div>
        <div className="wf-live-stat"><b>Lv {agent.level || 1}</b><span>{(agent.progress || 0)}% xp</span></div>
        <div className="wf-live-stat"><b>{agent?.stats?.tokens || 0}</b><span>tokens</span></div>
      </div>
      <div className="wf-fld"><span>Active queue</span>
        <div className="wf-feed">
          {myTasks.length === 0 && <div className="wf-feed-row"><time>—</time><span>คิวว่าง</span></div>}
          {myTasks.map((t) => (
            <div key={t.id} className="wf-feed-row">
              <time>{t.status}</time>
              <span>{t.description || t.subagent_type || t.id}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="wf-fld"><span>Recent events</span>
        <div className="wf-feed">
          {myEvents.length === 0 && <div className="wf-feed-row"><time>—</time><span>ยังไม่มีกิจกรรม</span></div>}
          {myEvents.map((e) => (
            <div key={e.id || `${e.kind}:${e.ts}`} className="wf-feed-row">
              <time>{new Date(e.ts || Date.now()).toLocaleTimeString().slice(0, 5)}</time>
              <span>{e.kind || e.tool || e.type || 'event'} · {e.summary || e.tool_name || ''}</span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
};

/* --------- free-form image lab (NO rigid Look Lock UI) ------ */
const STYLE_HINTS = [
  { id: 'photoreal',   label: 'Photoreal',    text: 'photorealistic, studio lighting, sharp focus, 8k' },
  { id: 'cinematic',   label: 'Cinematic',    text: 'cinematic key art, dramatic lighting, depth of field, 4k' },
  { id: 'anime',       label: 'Anime / JRPG', text: 'high-quality anime/JRPG splash art, vibrant cel shading' },
  { id: 'manga',       label: 'Manga',        text: 'black & white manga ink, screentone shading, dynamic lines' },
  { id: '3d',          label: '3D Render',    text: 'Unreal Engine 5 render, octane, subsurface scattering' },
  { id: 'pixel',       label: 'Pixel art',    text: '32-bit pixel art, retro game palette, clean dithering' },
  { id: 'oil',         label: 'Oil painting', text: 'oil painting, visible brushwork, classical composition' },
  { id: 'watercolor',  label: 'Watercolor',   text: 'soft watercolor wash, paper texture, gentle edges' },
  { id: 'concept',     label: 'Concept art',  text: 'concept art, painterly polish, narrative atmosphere' },
  { id: 'flat',        label: 'Flat vector',  text: 'flat vector illustration, clean shapes, limited palette' },
];
const ASPECTS = [
  { id: '3:4',  label: 'Portrait',  size: '1024x1536' },
  { id: '1:1',  label: 'Square',    size: '1024x1024' },
  { id: '4:3',  label: 'Standard',  size: '1024x1024' },
  { id: '16:9', label: 'Wide',      size: '1536x1024' },
  { id: '9:16', label: 'Tall',      size: '1024x1536' },
];

const InspectorImageLab = ({ agent, onPatch }) => {
  const [provider, setProvider] = React.useState('codex-image2');
  const [prompt, setPrompt] = React.useState('');
  const [negative, setNegative] = React.useState('text, watermark, logo, signature');
  const [aspect, setAspect] = React.useState('3:4');
  const [hints, setHints] = React.useState([]);
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState('');

  const toggleHint = (id) => setHints((s) => s.includes(id) ? s.filter((x) => x !== id) : [...s, id]);
  const aspectMeta = ASPECTS.find((a) => a.id === aspect) || ASPECTS[0];

  const compose = () => {
    const styleLine = hints.map((id) => STYLE_HINTS.find((h) => h.id === id)?.text).filter(Boolean).join(', ');
    return [
      '--- LOOK LOCK ---',
      `Subject: "${agent?.name || 'AI Agent'}", role: ${agent?.role || 'AI teammate'}.`,
      prompt.trim() || `Free portrait of ${agent?.name || 'agent'}; expressive, characterful.`,
      styleLine ? `Style hints: ${styleLine}.` : '',
      negative.trim() ? `Avoid: ${negative.trim()}.` : '',
    ].filter(Boolean).join('\n');
  };

  const generate = async (kind) => {
    if (!agent?.id) return;
    setBusy(true); setErr('');
    try {
      const r = await fetch('/api/images/generate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider, mode: 'character', agentId: agent.id, kind,
          prompt: compose(), size: aspectMeta.size, quality: 'high',
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'image generation failed');
      await window.fetchCOfficeState?.();
    } catch (e) { setErr(e.message || String(e)); }
    finally { setBusy(false); }
  };

  const apply = (key) => {
    if (!agent?.id) return;
    const patch = key === 'card' ? { image: agent.generatedImage } : { avatar: agent.generatedAvatar };
    if (!patch.image && !patch.avatar) return;
    onPatch && onPatch(patch);
  };
  const restore = () => onPatch && onPatch({ image: DEFAULT_AGENT_IMAGES[agent.id] || '', avatar: DEFAULT_AGENT_AVATARS[agent.id] || '' });

  return (
    <div className="wf-imglab">
      <div className="wf-imglab-hint">เขียน prompt อะไรก็ได้ — ไม่มีฟอร์มล็อก สไตล์ด้านล่างเป็นแค่ตัวเสริม กดเพื่อแปะข้อความลง prompt</div>

      <div className="wf-imglab-tabs">
        {['codex-image2', '3.1flashgen', 'nanobanana-2-pro'].map((p) => (
          <button key={p} type="button" className={provider === p ? 'is-on' : ''} onClick={() => setProvider(p)}>{p}</button>
        ))}
      </div>

      <div className="wf-imglab-compare">
        <div data-label="Card · current">{agent?.image ? <img src={agent.image} alt=""/> : 'no card'}</div>
        <div data-label="Card · draft">{agent?.generatedImage ? <img src={agent.generatedImage} alt=""/> : 'no draft'}</div>
        <div data-label="Avatar · current">{agent?.avatar?.startsWith?.('/') ? <img src={agent.avatar} alt=""/> : (agent?.avatar || 'no avatar')}</div>
        <div data-label="Avatar · draft">{agent?.generatedAvatar ? <img src={agent.generatedAvatar} alt=""/> : 'no draft'}</div>
      </div>

      <div className="wf-fld">
        <span>Prompt (free)</span>
        <textarea rows="6" value={prompt} onChange={(e) => setPrompt(e.target.value)}
          placeholder="พิมพ์อะไรก็ได้ที่อยากให้รูปออกมาเป็น — outfit, mood, scene, pose, ฯลฯ"/>
      </div>
      <div className="wf-fld">
        <span>Style hints (optional)</span>
        <div className="wf-chip-row">
          {STYLE_HINTS.map((h) => (
            <button type="button" key={h.id} className={`wf-chip ${hints.includes(h.id) ? 'is-on' : ''}`} onClick={() => toggleHint(h.id)}>{h.label}</button>
          ))}
        </div>
      </div>
      <div className="wf-fld-row">
        <div className="wf-fld"><span>Aspect</span>
          <select value={aspect} onChange={(e) => setAspect(e.target.value)}>
            {ASPECTS.map((a) => <option key={a.id} value={a.id}>{a.id} · {a.label}</option>)}
          </select>
        </div>
        <div className="wf-fld"><span>Negative</span><input value={negative} onChange={(e) => setNegative(e.target.value)}/></div>
      </div>

      <div className="wf-imglab-actions">
        <button type="button" className="wf-btn primary" disabled={busy || !agent?.id} onClick={() => generate('card')}>{busy ? '…' : '🎬 Generate card'}</button>
        <button type="button" className="wf-btn" disabled={busy || !agent?.id} onClick={() => generate('avatar')}>{busy ? '…' : '👤 Generate avatar'}</button>
      </div>
      <div className="wf-imglab-actions">
        <button type="button" className="wf-btn ghost" disabled={busy || !agent?.generatedImage}  onClick={() => apply('card')}>Apply card</button>
        <button type="button" className="wf-btn ghost" disabled={busy || !agent?.generatedAvatar} onClick={() => apply('avatar')}>Apply avatar</button>
      </div>
      <button type="button" className="wf-btn ghost" disabled={busy} onClick={restore}>↺ Restore default portrait</button>
      {busy && <div className="wf-imglab-progress"/>}
      {err && <div className="wf-imglab-hint" style={{ background: '#fef2f2', borderColor: '#fecaca', color: '#b91c1c' }}>{err}</div>}
    </div>
  );
};

/* --------- inspector wrapper -------------------------------- */
const blankDraft = () => ({
  name: '', role: '', tagline: '', avatar: '', color: '#7cd3ff',
  // honor the user's configured default provider; fall back to claude
  provider: window.PROVIDERS?.default || 'claude',
  systemPrompt: '', enabled: true, toolsAllowed: [],
  category: 'general', deletable: true,
});
const draftFrom = (a) => a ? ({
  id: a.id || '', name: a.name || '', role: a.role || '', tagline: a.tagline || '',
  avatar: a.avatar || a.avatarInitials || '', color: a.color || '#7cd3ff',
  provider: PROVIDER_CHOICES.includes(a.provider) ? a.provider : 'claude',
  systemPrompt: a.systemPrompt || '', enabled: a.enabled !== false,
  toolsAllowed: Array.isArray(a.toolsAllowed) ? [...a.toolsAllowed] : [],
  category: inferCategoryKey(a), deletable: a.deletable !== false,
}) : blankDraft();
const draftPayload = (d) => ({
  name: d.name, role: d.role, tagline: d.tagline, avatar: d.avatar, color: d.color,
  provider: d.provider, systemPrompt: d.systemPrompt, enabled: !!d.enabled,
  category: d.category,
  toolsAllowed: Array.isArray(d.toolsAllowed) ? d.toolsAllowed.map((t) => String(t).trim()).filter(Boolean) : [],
});

const Inspector = ({ agent, tasks, events, now, onOpen }) => {
  const [tab, setTab] = React.useState('profile');
  const [draft, setDraft] = React.useState(() => draftFrom(agent));
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => { setDraft(draftFrom(agent)); }, [agent?.id]);

  const set = (key, value) => setDraft((d) => ({ ...d, [key]: value }));
  const toggleTool = (tool) => setDraft((d) => {
    const list = Array.isArray(d.toolsAllowed) ? d.toolsAllowed : [];
    return { ...d, toolsAllowed: list.includes(tool) ? list.filter((t) => t !== tool) : [...list, tool] };
  });

  const isLocked = draft.deletable === false;
  const color = CATEGORY_COLOR[inferCategoryKey(agent)] || agent?.color || '#7cd3ff';
  const portrait = agent?.image || DEFAULT_AGENT_IMAGES[agent?.id];
  const initials = agent?.avatarInitials || DEFAULT_AGENT_AVATARS[agent?.id] || (agent?.name || '??').slice(0, 2).toUpperCase();

  const save = async () => {
    if (!draft.name?.trim() || !draft.role?.trim()) return alert('ต้องกรอก name และ role');
    setBusy(true);
    try {
      const method = draft.id ? 'PATCH' : 'POST';
      const url = draft.id ? `/api/agents/${draft.id}` : '/api/agents';
      const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(draftPayload(draft)) });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'save failed');
      await window.fetchCOfficeState?.();
    } catch (e) { alert(e.message || String(e)); }
    finally { setBusy(false); }
  };
  const remove = async () => {
    if (!draft.id || isLocked) return;
    if (!confirm(`ลบ persona "${draft.name}"?`)) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/agents/${draft.id}`, { method: 'DELETE' });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'delete failed');
      setDraft(blankDraft());
      await window.fetchCOfficeState?.();
    } catch (e) { alert(e.message || String(e)); }
    finally { setBusy(false); }
  };
  const patch = async (body) => {
    if (!agent?.id) return;
    try {
      const r = await fetch(`/api/agents/${agent.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'patch failed');
      await window.fetchCOfficeState?.();
    } catch (e) { alert(e.message || String(e)); }
  };

  return (
    <aside className="wf-inspector" style={{ '--insp-color': color }}>
      <div className="wf-insp-head">
        <div className="wf-insp-portrait">{portrait ? <img src={portrait} alt={agent?.name}/> : <span>{initials}</span>}</div>
        <div className="wf-insp-name">
          <h2>{agent?.name || 'New persona'}</h2>
          <span>{agent?.role || 'unassigned'} · {STATUS_LABEL[agent?.status] || 'standby'}</span>
        </div>
        {agent?.id && <button type="button" className="wf-btn gold" onClick={() => onOpen && onOpen(agent.id)}>Open profile</button>}
      </div>
      <div className="wf-insp-tabs">
        <button className={tab === 'profile' ? 'is-active' : ''} onClick={() => setTab('profile')}>Profile</button>
        <button className={tab === 'live'    ? 'is-active' : ''} onClick={() => setTab('live')}>Live</button>
        <button className={tab === 'image'   ? 'is-active' : ''} onClick={() => setTab('image')}>Image lab</button>
      </div>
      <div className="wf-insp-body">
        {tab === 'profile' && <InspectorProfile draft={draft} set={set} toggleTool={toggleTool} onSave={save} onDelete={remove} busy={busy} isLocked={isLocked}/>}
        {tab === 'live' && agent && <InspectorLive agent={agent} tasks={tasks} events={events} now={now}/>}
        {tab === 'image' && agent && <InspectorImageLab agent={agent} onPatch={patch}/>}
        {!agent && <div className="wf-imglab-hint">เลือก agent จากออฟฟิศซ้ายมือ หรือสร้างใหม่จากแท็บ Profile</div>}
      </div>
    </aside>
  );
};

/* --------- main page ---------------------------------------- */
const AgentsPage = ({ onOpenAgent, setPage }) => {
  window.useCOfficeRefresh?.();
  const agents = window.AGENTS || [];
  const tasks = window.TASKS || [];
  const events = window.ACTIVITY || [];

  const [filter, setFilter] = React.useState('ALL');
  const [selectedId, setSelectedId] = React.useState(() => agents[0]?.id || '');
  const [now, setNow] = React.useState(() => Date.now());

  React.useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1500);
    return () => clearInterval(id);
  }, []);
  React.useEffect(() => {
    if (!agents.find((a) => a.id === selectedId) && agents[0]) setSelectedId(agents[0].id);
  }, [agents.length, selectedId]);

  const cats = ['ALL', ...Array.from(new Set(agents.map(inferCategoryKey)))];
  const filtered = filter === 'ALL' ? agents : agents.filter((a) => inferCategoryKey(a) === filter);
  const selected = agents.find((a) => a.id === selectedId) || filtered[0] || agents[0] || null;

  const onShift = agents.filter((a) => a.status === 'busy' || a.status === 'active').length;
  const busy    = agents.filter((a) => a.status === 'busy').length;
  const totalQueue = (tasks || []).filter((t) => t.status === 'running').length;
  const totalTokens = agents.reduce((sum, a) => {
    const v = String(a.stats?.tokens || '0');
    const num = v.endsWith('k') ? parseFloat(v) * 1000 : parseFloat(v);
    return sum + (Number.isFinite(num) ? num : 0);
  }, 0);

  const newDraftMode = () => { setSelectedId(''); };

  const news = events.slice(0, 12).map((e) => ({
    id: e.id || `${e.kind}:${e.ts}`,
    text: `${e.personaId || '—'} · ${e.kind || e.type || 'event'} · ${e.summary || e.tool_name || ''}`,
  }));

  return (
    <div className="wf-page">
      {/* HUD */}
      <header className="wf-hud">
        <div className="wf-hud-title">
          <span className="kicker">Sim Office Control</span>
          <h1>C-Office <em>Workfloor</em></h1>
        </div>
        <div className="wf-hud-stats">
          <div className="wf-hud-chip"><b>{agents.length}</b><span>staff</span></div>
          <div className="wf-hud-chip"><b>{onShift}</b><span>on shift</span></div>
          <div className="wf-hud-chip"><b>{busy}</b><span>working</span></div>
          <div className="wf-hud-chip"><b>{totalQueue}</b><span>queue</span></div>
          <div className="wf-hud-chip"><b>{totalTokens > 1000 ? `${(totalTokens/1000).toFixed(1)}k` : totalTokens}</b><span>tokens today</span></div>
        </div>
      </header>

      {/* Toolbar */}
      <div className="wf-toolbar">
        <div className="wf-tabs">
          {cats.map((k) => {
            const label = k === 'ALL' ? 'All' : (CATEGORY_LABEL[k] || k);
            const count = k === 'ALL' ? agents.length : agents.filter((a) => inferCategoryKey(a) === k).length;
            return (
              <button key={k} className={filter === k ? 'is-active' : ''} style={{ '--tab-color': CATEGORY_COLOR[k] || '#15233a' }} onClick={() => setFilter(k)}>
                <span>{label}</span><b>{count}</b>
              </button>
            );
          })}
        </div>
        <div className="wf-toolbar-actions">
          <button type="button" className="wf-btn" onClick={newDraftMode}>+ Hire new staff</button>
          <button type="button" className="wf-btn gold" onClick={() => setPage && setPage('tasks')}>Task board</button>
        </div>
      </div>

      {/* Floor + Inspector */}
      <div className="wf-grid">
        <section className="wf-floor">
          <div className="wf-desk-grid">
            {filtered.map((a) => (
              <DeskTile
                key={a.id}
                agent={a}
                tasks={tasks}
                now={now}
                selected={selected?.id === a.id}
                onSelect={setSelectedId}
                onOpen={onOpenAgent}
              />
            ))}
            <button type="button" className="wf-desk is-new" onClick={newDraftMode}>
              <span><b>+</b>New desk<br/><em style={{ font: '600 10px var(--font-mono, monospace)', letterSpacing: '0.10em', textTransform: 'uppercase', color: '#94a3b8' }}>hire persona</em></span>
            </button>
          </div>
        </section>
        <Inspector agent={selected} tasks={tasks} events={events} now={now} onOpen={onOpenAgent}/>
      </div>

      {/* Live news ticker */}
      <footer className="wf-news">
        <span className="wf-news-label">LIVE</span>
        <div className="wf-news-track">
          {news.length === 0 && <span>idle floor — รอกิจกรรมจาก agent…</span>}
          {news.map((n) => <span key={n.id}><b>›</b>{n.text}</span>)}
        </div>
      </footer>
    </div>
  );
};

Object.assign(window, { AgentsPage, DeskTile, Inspector });
