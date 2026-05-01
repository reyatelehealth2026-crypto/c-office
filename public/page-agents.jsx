/* ====== SIM OFFICE - dynamic agent workfloor with editable roster ====== */

const CATEGORY_META = {
  growth:      { label: 'Growth',      color: 'var(--accent-magenta)' },
  forge:       { label: 'Forge',       color: 'var(--accent-cyan)' },
  intel:       { label: 'Intel',       color: 'var(--accent-violet)' },
  scriptorium: { label: 'Scriptorium', color: 'var(--accent-gold)' },
  studio:      { label: 'Studio',      color: 'var(--accent-lime)' },
  ops:         { label: 'Ops',         color: 'var(--accent-orange)' },
  general:     { label: 'General',     color: 'var(--text-2)' },
};

const AGENT_STATUS_META = {
  busy:    { label: 'Working', tone: 'busy' },
  active:  { label: 'Online',  tone: 'active' },
  idle:    { label: 'Standby', tone: 'idle' },
  offline: { label: 'Offline', tone: 'offline' },
};

const inferCategoryKey = (agent) => {
  const explicit = (agent.category || '').toLowerCase().trim();
  if (explicit) return explicit;
  const text = `${agent.name || ''} ${agent.role || ''}`.toLowerCase();
  if (/growth|market|sales|commerce|social|seo/.test(text)) return 'growth';
  if (/build|code|engineer|dev|frontend|backend|forge/.test(text)) return 'forge';
  if (/research|intel|analyst|data|insight/.test(text)) return 'intel';
  if (/content|write|scribe|mentor|knowledge|course/.test(text)) return 'scriptorium';
  if (/visual|studio|design|video|game|creative/.test(text)) return 'studio';
  if (/ops|devops|sre|orchestr|project|workflow/.test(text)) return 'ops';
  return 'general';
};

const categoryMeta = (agent) => {
  const key = inferCategoryKey(agent);
  return { key, ...(CATEGORY_META[key] || { label: key || 'General', color: agent.color || 'var(--accent-cyan)' }) };
};

const DEFAULT_AGENT_IMAGES = {
  orchestra: '/images/Orchestra.png',
  astra: '/images/Aira.png',
  lumen: '/images/Luna.png',
  vex: '/images/Vivi.png',
  kai: '/images/Kira.png',
  mira: '/images/Miku.png',
  echo: '/images/Emi.png',
  nyx: '/images/Nana.png',
  orbit: '/images/Ori.png',
};

const DEFAULT_AGENT_AVATARS = {
  orchestra: 'OC',
  astra: 'AI',
  lumen: 'LN',
  vex: 'VV',
  kai: 'KR',
  mira: 'MK',
  echo: 'EM',
  nyx: 'NN',
  orbit: 'OR',
};

const defaultImageForAgent = (agent) => DEFAULT_AGENT_IMAGES[agent?.id] || '';
const defaultAvatarForAgent = (agent) => DEFAULT_AGENT_AVATARS[agent?.id] || agent?.avatarInitials || '';

const statValue = (agent, key) => agent.personality?.[key] ?? 50;

const blankAgentDraft = () => ({
  name: '',
  role: '',
  avatar: '',
  color: '#00f0ff',
  provider: window.PROVIDERS?.default || 'claude',
  systemPrompt: '',
  enabled: true,
  toolsAllowed: '',
  category: 'general',
});

const agentToDraft = (agent) => ({
  id: agent?.id || '',
  name: agent?.name || '',
  role: agent?.role || '',
  avatar: agent?.avatar || agent?.avatarInitials || '',
  color: agent?.color || '#00f0ff',
  provider: agent?.provider || window.PROVIDERS?.default || 'claude',
  systemPrompt: agent?.systemPrompt || '',
  enabled: agent?.enabled !== false,
  toolsAllowed: (agent?.toolsAllowed || []).join(', '),
  category: inferCategoryKey(agent || {}),
});

const draftPayload = (draft) => ({
  name: draft.name,
  role: draft.role,
  avatar: draft.avatar,
  color: draft.color,
  provider: draft.provider,
  systemPrompt: draft.systemPrompt,
  enabled: !!draft.enabled,
  category: draft.category,
  toolsAllowed: String(draft.toolsAllowed || '').split(',').map((tool) => tool.trim()).filter(Boolean),
});

const characterPromptPreview = (agent) => {
  if (!agent) return '';
  return [
    `Create a full-body game character concept illustration for "${agent.name}".`,
    `Role/class fantasy: ${agent.role || 'AI teammate'}. Team category: ${inferCategoryKey(agent)}. Signature accent color: ${agent.color || '#00f0ff'}.`,
    `Character personality and visual cues: ${agent.systemPrompt || agent.tagline || 'capable, focused, dependable'}.`,
    'Visual direction: general MMORPG guild party style, premium fantasy adventure game, heroic but practical outfit, readable silhouette, expressive face, detailed costume materials, natural pose, game lobby lighting.',
    'Asset target: transparent-background character cutout PNG for an in-game HUD roster, not an illustration card and not an environment scene.',
    'Canvas: portrait 9:16 or 2:3 ratio, head-to-toe full body, feet visible, centered on the vertical axis, 8-12% empty margin around the silhouette.',
    'If a reference image is supplied, preserve the same character identity, body proportion, full-body framing, costume direction, and roster-friendly silhouette while improving quality.',
    'Composition: one isolated full-body character only, alpha/transparent background preferred, no room, no landscape, no scenery, no pedestal baked into the image.',
    'Avoid: trading card layout, card frame, stats box, text labels, watermark, logo, signature, cropped head or feet, duplicate limbs, landscape 16:9 image.',
  ].join('\n');
};

const AgentModelUnit = ({ agent, selected, onSelect, onOpenAgent }) => {
  const category = categoryMeta(agent);
  const status = AGENT_STATUS_META[agent.status] || AGENT_STATUS_META.idle;
  const load = Math.max(8, Math.min(100, Math.round((statValue(agent, 'speed') + statValue(agent, 'autonomy')) / 2)));
  const focus = Math.max(8, Math.min(100, Math.round((statValue(agent, 'precision') + statValue(agent, 'collab')) / 2)));
  const energy = Math.max(8, Math.min(100, Math.round((statValue(agent, 'empathy') + statValue(agent, 'creativity')) / 2)));

  return (
    <button
      className={`agent-model-unit status-${status.tone} rarity-${agent.rarity || 'R'} ${selected ? 'is-selected' : ''}`}
      style={{ '--agent-gradient': agent.gradient, '--cat-color': category.color }}
      onClick={() => onSelect(agent.id)}
      onDoubleClick={() => onOpenAgent(agent.id)}
      title={agent.currentTask || agent.tagline || agent.role}
    >
      <div className="agent-station-hud">
        <span className="agent-status-pill"><i/> {status.label}</span>
        <span className="agent-rarity">{agent.provider || 'agent'}</span>
      </div>

      <div className="agent-model-stage">
        <div className="agent-workstation">
          <span className="workstation-monitor"/>
          <span className="workstation-keyboard"/>
          <span className="workstation-chair"/>
        </div>
        <div className="agent-back-screen screen-left">
          <b>Queue</b>
          <span>{agent.currentTask ? '1 task active' : 'clear desk'}</span>
        </div>
        <div className="agent-back-screen screen-right">
          <b>{category.label}</b>
          <span>{agent.enabled === false ? 'OFF SHIFT' : 'ON SHIFT'}</span>
        </div>
        <div className="agent-light-column"/>
        <div className="agent-model-portrait">
          {agent.image
            ? <img src={agent.image} alt={agent.name}/>
            : <span>{agent.avatarInitials || agent.avatar || 'AG'}</span>}
        </div>
        <div className="agent-holo-ring"/>
        <div className="agent-desk">
          <span className="desk-light"/>
          <span className="desk-console"/>
        </div>
      </div>

      <div className="agent-unit-footer">
        <div>
          <strong>{agent.name}</strong>
          <span>{agent.role || category.label}</span>
        </div>
        <div className="agent-meter-row">
          <span style={{ width: `${load}%` }} title="Workload"/>
          <span style={{ width: `${focus}%` }} title="Focus"/>
          <span style={{ width: `${energy}%` }} title="Energy"/>
        </div>
      </div>
    </button>
  );
};

const AgentEditorPanel = ({ selected, onOpenAgent }) => {
  const [draft, setDraft] = React.useState(() => agentToDraft(selected));
  const [busy, setBusy] = React.useState(false);
  const providers = window.PROVIDERS?.providers || [];

  React.useEffect(() => setDraft(agentToDraft(selected)), [selected?.id]);
  const set = (key, value) => setDraft((current) => ({ ...current, [key]: value }));

  const save = async () => {
    if (!draft.name.trim() || !draft.role.trim()) return alert('name and role required');
    setBusy(true);
    try {
      const method = draft.id ? 'PATCH' : 'POST';
      const url = draft.id ? `/api/agents/${draft.id}` : '/api/agents';
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draftPayload(draft)),
      });
      if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || 'save failed');
      await window.fetchCOfficeState?.();
    } catch (error) {
      alert(error.message || String(error));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!draft.id) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/agents/${draft.id}`, { method: 'DELETE' });
      if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || 'delete failed');
      setDraft(blankAgentDraft());
      await window.fetchCOfficeState?.();
    } catch (error) {
      alert(error.message || String(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <aside className="agent-brief-panel agent-editor-panel" style={{ '--cat-color': draft.color || 'var(--accent-cyan)' }}>
      <div className="brief-kicker">Dynamic Agent JSON</div>
      <h2>{draft.id ? 'Edit Agent' : 'New Agent'}</h2>

      <label>Name<input value={draft.name} onChange={(e) => set('name', e.target.value)} placeholder="Agent name"/></label>
      <label>Role<input value={draft.role} onChange={(e) => set('role', e.target.value)} placeholder="Role / responsibility"/></label>
      <div className="agent-editor-row">
        <label>Avatar<input value={draft.avatar} onChange={(e) => set('avatar', e.target.value)} placeholder="AB or /image.png"/></label>
        <label>Color<input type="color" value={draft.color} onChange={(e) => set('color', e.target.value)}/></label>
      </div>
      <div className="agent-editor-row">
        <label>Provider
          <select value={draft.provider} onChange={(e) => set('provider', e.target.value)}>
            {[draft.provider, ...providers.map((provider) => provider.name)].filter(Boolean).filter((value, index, list) => list.indexOf(value) === index).map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
        </label>
        <label>Category<input value={draft.category} onChange={(e) => set('category', e.target.value)} placeholder="ops"/></label>
      </div>
      <label>Tools allowed<input value={draft.toolsAllowed} onChange={(e) => set('toolsAllowed', e.target.value)} placeholder="Read, Write, Task"/></label>
      <label>System prompt<textarea value={draft.systemPrompt} onChange={(e) => set('systemPrompt', e.target.value)} rows="5"/></label>
      <label className="agent-toggle"><input type="checkbox" checked={draft.enabled} onChange={(e) => set('enabled', e.target.checked)}/> Enabled</label>

      <div className="agent-editor-actions">
        <button className="btn" disabled={busy} onClick={() => setDraft(blankAgentDraft())}>New</button>
        <button className="btn primary" disabled={busy} onClick={save}>Save</button>
        {draft.id && <button className="btn ghost" disabled={busy} onClick={remove}>Delete</button>}
      </div>
      <CharacterImagePanel agent={selected}/>
      {selected && <button className="btn gold" onClick={() => onOpenAgent(selected.id)}>Open Profile</button>}
    </aside>
  );
};

const CharacterImagePanel = ({ agent }) => {
  const [prompt, setPrompt] = React.useState('');
  const [imageProvider, setImageProvider] = React.useState('codex-image2');
  const [busy, setBusy] = React.useState(false);
  const preview = characterPromptPreview(agent);
  const defaultImage = defaultImageForAgent(agent);

  React.useEffect(() => setPrompt(''), [agent?.id]);

  const patchAgent = async (patch) => {
    if (!agent?.id) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/agents/${agent.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json.error || 'agent update failed');
      await window.fetchCOfficeState?.();
    } catch (error) {
      alert(error.message || String(error));
    } finally {
      setBusy(false);
    }
  };

  const applyGenerated = () => patchAgent({ image: agent.generatedImage, avatar: agent.generatedImage });
  const restoreDefault = () => patchAgent({ image: defaultImage, avatar: defaultAvatarForAgent(agent) });

  const generate = async () => {
    if (!agent?.id) return;
    setBusy(true);
    try {
      const response = await fetch('/api/images/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: imageProvider,
          mode: 'character',
          agentId: agent.id,
          prompt,
        }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json.error || 'image generation failed');
      await window.fetchCOfficeState?.();
    } catch (error) {
      alert(error.message || String(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="character-image-panel">
      <div className="brief-kicker">Character Generator</div>
      <div className="character-generator-head">
        <strong>Character Cutout</strong>
        <span>{imageProvider === 'codex-image2' ? 'Codex Image Edit' : imageProvider === '3.1flashgen' ? '3.1 Flash Gen' : 'Gemini 3 Pro Image'}</span>
      </div>
      <div className="character-compare">
        <div>
          <span>Current Image</span>
          {agent?.image ? <img src={agent.image} alt={`${agent.name} current`}/> : <b>No image</b>}
        </div>
        <div>
          <span>Generated Draft</span>
          {agent?.generatedImage ? <img src={agent.generatedImage} alt={`${agent.name} generated draft`}/> : <b>No draft</b>}
        </div>
      </div>
      <div className="character-provider-tabs">
        <button className={imageProvider === 'codex-image2' ? 'active' : ''} onClick={() => setImageProvider('codex-image2')}>Codex Image2</button>
        <button className={imageProvider === '3.1flashgen' ? 'active' : ''} onClick={() => setImageProvider('3.1flashgen')}>3.1 Flash Gen</button>
        <button className={imageProvider === 'nanobanana-2-pro' ? 'active' : ''} onClick={() => setImageProvider('nanobanana-2-pro')}>Nano Banana 2 Pro</button>
      </div>
      <textarea value={prompt || preview} onChange={(e) => setPrompt(e.target.value)} rows="7"/>
      <div className="character-actions">
        <button className="btn ghost" disabled={busy || !agent?.generatedImage} onClick={applyGenerated}>Apply Generated</button>
        <button className="btn ghost" disabled={busy || !defaultImage} onClick={restoreDefault}>Restore Default</button>
      </div>
      <button className="btn primary" disabled={busy || !agent?.id} onClick={generate}>
        {busy ? 'Generating...' : 'Generate Transparent Cutout'}
      </button>
    </div>
  );
};

const AgentsPage = ({ onOpenAgent, setPage }) => {
  window.useCOfficeRefresh?.();
  const agents = window.AGENTS || [];
  const [filter, setFilter] = React.useState('ALL');
  const [selectedId, setSelectedId] = React.useState(() => agents[0]?.id || '');

  React.useEffect(() => {
    if (!agents.find((agent) => agent.id === selectedId) && agents[0]) setSelectedId(agents[0].id);
  }, [agents.length, selectedId]);

  const categories = ['ALL', ...Array.from(new Set(agents.map(inferCategoryKey)))];
  const filtered = filter === 'ALL' ? agents : agents.filter((agent) => inferCategoryKey(agent) === filter);
  const selected = agents.find((agent) => agent.id === selectedId) || filtered[0] || agents[0] || null;
  const working = agents.filter((agent) => agent.status === 'busy').length;
  const online = agents.filter((agent) => agent.status === 'active' || agent.status === 'busy').length;

  return (
    <div className="agent-office-page">
      <div className="agent-office-hero">
        <div>
          <div className="mono-s">SIM OFFICE CONTROL</div>
          <h1>C-Office <span className="accent">Workfloor</span></h1>
          <p>มุมมองแบบเกมบริหารออฟฟิศ เห็น agent เป็นพนักงานประจำโต๊ะ ดู workload, focus, energy, queue และสถานะงานสดแบบ dynamic</p>
        </div>
        <div className="agent-office-stats">
          <span><b>{agents.length}</b> staff</span>
          <span><b>{online}</b> on shift</span>
          <span><b>{working}</b> busy desks</span>
        </div>
      </div>

      <div className="agent-office-toolbar">
        <div className="agent-filter-tabs">
          {categories.map((categoryKey) => {
            const meta = CATEGORY_META[categoryKey] || { label: categoryKey === 'ALL' ? 'All' : categoryKey, color: 'var(--accent-cyan)' };
            const count = categoryKey === 'ALL' ? agents.length : agents.filter((agent) => inferCategoryKey(agent) === categoryKey).length;
            return (
              <button
                key={categoryKey}
                className={filter === categoryKey ? 'active' : ''}
                style={{ '--tab-color': meta.color }}
                onClick={() => setFilter(categoryKey)}
              >
                <span>{meta.label}</span>
                <b>{count}</b>
              </button>
            );
          })}
        </div>
        <button className="btn gold" onClick={() => setPage && setPage('tasks')}>Task Board</button>
      </div>

      <div className="agent-office-layout">
        <section className="agent-party-stage">
          <div className="office-room-backdrop">
            <span className="room-window"/>
            <span className="room-light one"/>
            <span className="room-light two"/>
            <span className="office-wall-board"/>
            <span className="office-coffee-bar"/>
            <span className="room-floor-grid"/>
          </div>
          <div className="agent-party-lineup">
            {filtered.map((agent) => (
              <AgentModelUnit
                key={agent.id}
                agent={agent}
                selected={selected?.id === agent.id}
                onSelect={setSelectedId}
                onOpenAgent={onOpenAgent}
              />
            ))}
          </div>
        </section>
        <AgentEditorPanel selected={selected} onOpenAgent={onOpenAgent}/>
      </div>
    </div>
  );
};

Object.assign(window, { AgentsPage, AgentModelUnit, AgentEditorPanel });
