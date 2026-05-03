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

const PERSONA_ELEMENTS = {
  orchestra: '👑',
  astra: '🎓',
  lumen: '✒️',
  vex: '🛡️',
  kai: '⚡',
  mira: '📈',
  echo: '🎨',
  nyx: '🔍',
  orbit: '⚙️',
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
    `Create a full-body staff avatar illustration for "${agent.name}".`,
    `Work role: ${agent.role || 'AI teammate'}. Team category: ${inferCategoryKey(agent)}.`,
    `Profile cues: ${agent.systemPrompt || agent.tagline || 'capable, focused, dependable'}.`,
    'Visual direction: professional digital art style, clean silhouette, expressive face, detailed fabric/materials, natural standing pose, clean studio lighting.',
    'Asset target: transparent-background full-body PNG for a staff roster UI.',
    'Canvas: portrait ratio, head-to-toe full body, feet visible, centered.',
    'Composition: one isolated full-body staff avatar only, alpha/transparent background preferred.',
    'Quality: high detail, clean anatomy, polished 3D-game-key-art feel.',
    'Avoid: watermark, logo, signature, cropped limbs, landscape orientation.',
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
        <span className="agent-element" aria-hidden="true">{PERSONA_ELEMENTS[agent.id] || '✦'}</span>
        <span className="agent-status-pill"><i/> {status.label}</span>
        <span className="agent-rarity">{agent.rarity || agent.provider || 'agent'}</span>
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

const AgentSkillsSection = ({ agent }) => {
  const [catalog, setCatalog] = React.useState([]);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const [open, setOpen] = React.useState(false);

  const installed = Array.isArray(agent?.installedSkills) ? agent.installedSkills : [];

  const refreshCatalog = React.useCallback(async () => {
    try {
      const r = await fetch('/api/agent-skills');
      const j = await r.json();
      setCatalog(Array.isArray(j.skills) ? j.skills : []);
    } catch (e) { setError(e.message || String(e)); }
  }, []);

  React.useEffect(() => { refreshCatalog(); }, [refreshCatalog]);

  if (!agent?.id) {
    return (
      <div className="agent-skills-section" style={{ marginTop: 8, padding: 10, border: '1px dashed var(--border)', borderRadius: 8, color: 'var(--text-muted)', fontSize: 12 }}>
        เลือก agent ก่อน เพื่อจะติดตั้งสกิล
      </div>
    );
  }

  const installSkill = async (skillId) => {
    setBusy(true); setError('');
    try {
      const r = await fetch(`/api/agents/${agent.id}/skills`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skillId }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'install failed');
      await window.fetchCOfficeState?.();
    } catch (e) { setError(e.message || String(e)); }
    finally { setBusy(false); }
  };

  const uninstallSkill = async (skillId) => {
    setBusy(true); setError('');
    try {
      const r = await fetch(`/api/agents/${agent.id}/skills/${encodeURIComponent(skillId)}`, { method: 'DELETE' });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'uninstall failed');
      await window.fetchCOfficeState?.();
    } catch (e) { setError(e.message || String(e)); }
    finally { setBusy(false); }
  };

  const installedDetails = installed.map((id) => catalog.find((s) => s.id === id) || { id, name: id, summary: '(removed from catalog)' });
  const available = catalog.filter((s) => !installed.includes(s.id));

  return (
    <div className="agent-skills-section" style={{ marginTop: 12, padding: 12, border: '2px solid var(--border)', borderRadius: 10, background: 'var(--bg-card-2)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <div>
          <div style={{ font: '800 11px var(--font-mono)', letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--accent-cyan)' }}>AI Skills</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>real capabilities injected into the agent's system prompt</div>
        </div>
        <button type="button" className="btn ghost" style={{ fontSize: 11 }} onClick={() => setOpen((v) => !v)}>
          {open ? 'Hide catalog' : `Browse catalog (${available.length})`}
        </button>
      </div>

      {error && <div style={{ color: 'var(--ux-danger)', fontSize: 12, marginBottom: 8 }}>{error}</div>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {installedDetails.length === 0 && (
          <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '6px 0' }}>ยังไม่มีสกิลติดตั้ง — กด "Browse catalog" เพื่อเลือก</div>
        )}
        {installedDetails.map((s) => (
          <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, padding: '8px 10px', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 8 }}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ font: '700 12px var(--font-body)', color: 'var(--text-primary)' }}>{s.name}</div>
              {s.summary && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{s.summary}</div>}
              {s.category && <span style={{ fontSize: 9, font: '700 9px var(--font-mono)', letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--accent-cyan)', marginRight: 6 }}>{s.category}</span>}
              {Array.isArray(s.tools) && s.tools.length > 0 && s.tools.map((t) => (
                <span key={t} className="ux-tool-badge" data-tool={t} style={{ marginRight: 4 }}>{t}</span>
              ))}
            </div>
            <button type="button" className="btn ghost" disabled={busy} onClick={() => uninstallSkill(s.id)} style={{ fontSize: 11 }}>Uninstall</button>
          </div>
        ))}
      </div>

      {open && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px dashed var(--border)', display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ font: '700 10px var(--font-mono)', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Catalog</div>
          {available.length === 0 && <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>ติดตั้งครบทุกสกิลแล้ว</div>}
          {available.map((s) => (
            <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, padding: '8px 10px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8 }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ font: '700 12px var(--font-body)', color: 'var(--text-primary)' }}>{s.name}{s.builtin && <span style={{ marginLeft: 6, fontSize: 9, font: '700 9px var(--font-mono)', color: 'var(--accent-gold)' }}>BUILTIN</span>}</div>
                {s.summary && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{s.summary}</div>}
                {s.category && <span style={{ fontSize: 9, font: '700 9px var(--font-mono)', letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--accent-cyan)' }}>{s.category}</span>}
              </div>
              <button type="button" className="btn primary" disabled={busy} onClick={() => installSkill(s.id)} style={{ fontSize: 11 }}>Install</button>
            </div>
          ))}
        </div>
      )}
    </div>
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
      <div className="brief-kicker">Dynamic Staff JSON</div>
      <h2>{draft.id ? 'Edit Staff Profile' : 'New Staff Profile'}</h2>

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
      <AgentSkillsSection agent={selected}/>
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

  // Character Builder State
  const [charGender, setCharGender] = React.useState('หญิง');
  const [charStyle, setCharStyle] = React.useState('อนิเมะญี่ปุ่นแฟนตาซี');
  const [charRole, setCharRole] = React.useState('นักเวทย์ (Mage)');
  const [charOutfit, setCharOutfit] = React.useState('ชุดผ้าไหมพริ้วไหวประดับอัญมณี');
  const [charWeapon, setCharWeapon] = React.useState('คทาเวทย์มนต์เรืองแสง');
  const [charColor, setCharColor] = React.useState('สีทองสว่าง (Bright Gold)');

  const CHAR_OPTIONS = {
    gender: ['ชาย (Male)', 'หญิง (Female)', 'Androgynous (ไร้เพศ)', 'หุ่นยนต์/จักรกล', 'สัตว์ป่ากึ่งมนุษย์'],
    style: ['อนิเมะญี่ปุ่นแฟนตาซี', 'แฟนตาซีตะวันตก', 'จอมยุทธ์จีน', 'ไทยประยุกต์แฟนตาซี', 'ไซไฟโลกอนาคต', 'พิกเซลอาร์ต', '3D Render'],
    role: [
      'นักดาบ (Swordsman)', 'อัศวินเกราะหนัก (Knight)', 'นักเวทย์ (Mage)', 'มือสังหาร (Assassin)', 
      'สไนเปอร์ (Sniper)', 'หมอ/นักบุญ (Healer)', 'พ่อค้า (Merchant)', 'วิศวกร (Engineer)',
      'นินจา (Ninja)', 'ซามูไร (Samurai)', 'นักล่า (Hunter)', 'กัปตันเรือ (Captain)'
    ],
    outfit: [
      'ชุดผ้าไหมพริ้วไหวประดับอัญมณี', 'เกราะเหล็กเต็มตัวขัดเงา', 'ชุดหนังรัดรูปสีดำสไตล์สายลับ',
      'เสื้อคลุมยาวขอบทองดูหรูหรา', 'ชุดสตรีทแวร์ล้ำยุคมีไฟนีออน', 'ชุดไทยประยุกต์เครื่องทองจัดเต็ม',
      'ผ้าคลุมขาดๆ ลุคนักเดินทาง', 'ชุดสูททางการมาดเนี้ยบ', 'เกราะเบาประดับขนนก'
    ],
    weapon: [
      'คทาเวทย์มนต์เรืองแสง', 'ดาบใหญ่สองมือ (Greatsword)', 'ปืนคู่สไตล์เลเซอร์',
      'ธนูไม้มงคลประดับมนต์', 'มีดสั้นคู่สีเงิน', 'ขลุ่ยหยกบรรเลงเพลงยุทธ์',
      'โดรนจิ๋วบินรอบตัว', 'โล่ขนาดยักษ์', 'พัดเหล็กประดับลวดลาย', 'ไม่มีอาวุธ (มือเปล่า)'
    ],
    themeColor: [
      'สีทองสว่าง (Bright Gold)', 'สีแดงเพลิง (Crimson Red)', 'สีน้ำเงินเข้ม (Deep Blue)',
      'สีเขียวมรกต (Emerald Green)', 'สีม่วงลึกลับ (Mystic Purple)', 'สีชมพูซากุระ (Sakura Pink)',
      'สีดำรัตติกาล (Obsidian Black)', 'สีเงินโครเมียม (Chrome Silver)', 'สีขาวบริสุทธิ์ (Pure White)'
    ]
  };

  const compilePrompt = () => {
    const styleMap = {
      'อนิเมะญี่ปุ่นแฟนตาซี': 'high-quality JRPG anime style, vibrant colors, detailed cel shading',
      'แฟนตาซีตะวันตก': 'epic western fantasy, semi-realistic, oil painting texture, dramatic lighting',
      'จอมยุทธ์จีน': 'elegant Wuxia style, flowing ink aesthetics, traditional Chinese elements',
      'ไทยประยุกต์แฟนตาซี': 'modern Thai fantasy fusion, intricate golden ornaments, tropical mythical atmosphere',
      'ไซไฟโลกอนาคต': 'cyberpunk sci-fi, neon glows, metallic surfaces, high-tech intricate details',
      'พิกเซลอาร์ต': 'detailed 32-bit pixel art style, retro game aesthetic, sharp colors',
      '3D Render': 'modern 3D game render, Unreal Engine 5 style, octane render, cinematic'
    };

    const promptText = [
      `A highly detailed ${styleMap[charStyle] || charStyle} character concept illustration for "${agent.name}".`,
      `Gender: ${charGender}.`,
      `Role/Profession: ${charRole}.`,
      `Outfit and Appearance: ${charOutfit}.`,
      `Weapon/Equipment: ${charWeapon}.`,
      `Signature theme color: ${charColor}.`,
      `Pose: heroic professional stance, expressive facial features, full body composition, centered portrait.`,
      `Quality: masterwork, crisp lines, vivid accents, game-ready art, 8k resolution.`
    ].join(' ');
    
    setPrompt(promptText);
  };

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

  const applyGeneratedCard = () => patchAgent({ image: agent.generatedImage });
  const applyGeneratedAvatar = () => patchAgent({ avatar: agent.generatedAvatar });
  const restoreDefault = () => patchAgent({ image: defaultImage, avatar: defaultAvatarForAgent(agent) });

  // Builds a Look-Locked prompt with kind-specific cinematography. Both kinds
  // share the same character data (gender/role/outfit/etc.) but differ in
  // staging — card is a dramatic environment shot, avatar is a clean cutout.
  const buildKindPrompt = (kind) => {
    const styleMap = {
      'อนิเมะญี่ปุ่นแฟนตาซี': 'high-quality JRPG anime style, vibrant colors, detailed cel shading',
      'แฟนตาซีตะวันตก': 'epic western fantasy, semi-realistic, oil painting texture, dramatic lighting',
      'จอมยุทธ์จีน': 'elegant Wuxia style, flowing ink aesthetics, traditional Chinese elements',
      'ไทยประยุกต์แฟนตาซี': 'modern Thai fantasy fusion, intricate golden ornaments, tropical mythical atmosphere',
      'ไซไฟโลกอนาคต': 'cyberpunk sci-fi, neon glows, metallic surfaces, high-tech intricate details',
      'พิกเซลอาร์ต': 'detailed 32-bit pixel art style, retro game aesthetic, sharp colors',
      '3D Render': 'modern 3D game render, Unreal Engine 5 style, octane render, cinematic',
    };
    const styleLine = styleMap[charStyle] || charStyle;
    const subject = [
      `Character: "${agent?.name || 'AI Agent'}".`,
      `Style: ${styleLine}.`,
      `Gender: ${charGender}.`,
      `Role: ${charRole}.`,
      `Outfit: ${charOutfit}.`,
      `Weapon/Equipment: ${charWeapon}.`,
      `Theme color: ${charColor}.`,
    ].join(' ');

    if (kind === 'card') {
      return [
        `A cinematic 3D-rendered hero portrait card of "${agent?.name || 'AI Agent'}".`,
        subject,
        '--- LOOK LOCK ---',
        'Composition: dynamic 3/4 hero pose, dramatic perspective, depth of field, subject sharp and background softly blurred.',
        'Environment: themed atmosphere matching the role (battlefield mist / neon city / temple / arcane sigils), rim lighting in the theme color, volumetric light shafts, floating particles or magical sparks for depth.',
        'Lighting: cinematic key + rim light + colored bounce, strong contrast, glowing accents on weapon/equipment.',
        'Camera: portrait 3:4, eye-level slightly low for heroic feel, subtle anamorphic lens flare, shallow depth of field.',
        'Quality: ultra-detailed 4K hero key art, painterly polish, no text, no watermark, no card frame, no UI overlays.',
      ].join('\n');
    }

    // avatar — clean cutout, isolated, transparent-friendly
    return [
      `A clean full-body character avatar of "${agent?.name || 'AI Agent'}".`,
      subject,
      '--- LOOK LOCK ---',
      'Composition: one isolated character, full body, feet visible, centered, neutral standing pose, expressive face.',
      'Background: pure solid white or pure solid gray (transparent-friendly). No scenery, no props in background.',
      'Lighting: even studio lighting, soft shadow only beneath feet, no atmospheric effects.',
      'Camera: portrait 3:4, head-to-toe framing, no lens flare.',
      'Quality: high-detail clean anatomy, polished 3D-game-key-art feel, no watermark, no logo, no signature.',
    ].join('\n');
  };

  const generate = async (kind /* 'card' | 'avatar' */) => {
    if (!agent?.id) return;
    setBusy(true);
    try {
      const composedPrompt = prompt && prompt.includes('--- LOOK LOCK ---')
        ? prompt
        : buildKindPrompt(kind);
      const response = await fetch('/api/images/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: imageProvider,
          mode: 'character',
          agentId: agent.id,
          kind,
          prompt: composedPrompt,
          // gpt-image-2 only accepts 1024x1024 / 1536x1024 / 1024x1536 / auto.
          // Both kinds want portrait framing, so use 1024x1536.
          size: '1024x1536',
          quality: 'high',
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
      <div className="brief-kicker">Avatar Generator</div>
      <div className="character-generator-head">
        <strong>Staff Avatar Cutout</strong>
        <span>{imageProvider === 'codex-image2' ? 'Codex CLI Image · GPT Image 2' : imageProvider === '3.1flashgen' ? '3.1 Flash Gen' : 'Nano Banana 2 · Gemini 3.1 Flash Image Preview'}</span>
      </div>
      <div className="character-compare">
        <div>
          <span>Profile Card (current)</span>
          {agent?.image ? <img src={agent.image} alt={`${agent.name} profile card`}/> : <b>No card</b>}
        </div>
        <div>
          <span>Profile Card (draft)</span>
          {agent?.generatedImage ? <img src={agent.generatedImage} alt={`${agent.name} profile card draft`}/> : <b>No draft</b>}
        </div>
        <div>
          <span>Avatar (current)</span>
          {agent?.avatar && agent.avatar.startsWith('/') ? <img src={agent.avatar} alt={`${agent.name} avatar`}/> : <b>{agent?.avatar || 'No avatar'}</b>}
        </div>
        <div>
          <span>Avatar (draft)</span>
          {agent?.generatedAvatar ? <img src={agent.generatedAvatar} alt={`${agent.name} avatar draft`}/> : <b>No draft</b>}
        </div>
      </div>
      <div className="character-provider-tabs">
        <button className={imageProvider === 'codex-image2' ? 'active' : ''} onClick={() => setImageProvider('codex-image2')}>Codex CLI Image</button>
        <button className={imageProvider === '3.1flashgen' ? 'active' : ''} onClick={() => setImageProvider('3.1flashgen')}>3.1 Flash Gen</button>
        <button className={imageProvider === 'nanobanana-2-pro' ? 'active' : ''} onClick={() => setImageProvider('nanobanana-2-pro')}>Nano Banana 2 Pro</button>
      </div>
      
      <div style={{ background: 'rgba(0, 240, 255, 0.05)', border: '1px solid rgba(0, 240, 255, 0.2)', borderRadius: 8, padding: '12px 16px', marginBottom: 12, marginTop: 12, fontSize: 13, color: 'var(--text-1)' }}>
        <div style={{ fontWeight: 600, color: 'var(--accent-cyan)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 16 }}>✨</span> ระบบปั้นตัวละคร (Pro Character Builder)
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: 10 }}>
            <label className="image-field">
              <span>เพศ:</span>
              <select value={charGender} onChange={e => setCharGender(e.target.value)} style={{padding: 6, borderRadius: 4, background: 'var(--bg-3)', color: 'var(--text)', border: '1px solid var(--border)'}}>
                {CHAR_OPTIONS.gender.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </label>
            <label className="image-field">
              <span>สไตล์ภาพ:</span>
              <select value={charStyle} onChange={e => setCharStyle(e.target.value)} style={{padding: 6, borderRadius: 4, background: 'var(--bg-3)', color: 'var(--text)', border: '1px solid var(--border)'}}>
                {CHAR_OPTIONS.style.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </label>
          </div>
          
          <label className="image-field">
            <span>อาชีพ / บทบาท:</span>
            <select value={charRole} onChange={e => setCharRole(e.target.value)} style={{padding: 6, borderRadius: 4, background: 'var(--bg-3)', color: 'var(--text)', border: '1px solid var(--border)'}}>
              {CHAR_OPTIONS.role.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </label>

          <label className="image-field">
            <span>ชุดและรูปลักษณ์:</span>
            <select value={charOutfit} onChange={e => setCharOutfit(e.target.value)} style={{padding: 6, borderRadius: 4, background: 'var(--bg-3)', color: 'var(--text)', border: '1px solid var(--border)'}}>
              {CHAR_OPTIONS.outfit.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </label>

          <label className="image-field">
            <span>อาวุธและอุปกรณ์:</span>
            <select value={charWeapon} onChange={e => setCharWeapon(e.target.value)} style={{padding: 6, borderRadius: 4, background: 'var(--bg-3)', color: 'var(--text)', border: '1px solid var(--border)'}}>
              {CHAR_OPTIONS.weapon.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </label>

          <label className="image-field">
            <span>โทนสีหลัก (Theme):</span>
            <select value={charColor} onChange={e => setCharColor(e.target.value)} style={{padding: 6, borderRadius: 4, background: 'var(--bg-3)', color: 'var(--text)', border: '1px solid var(--border)'}}>
              {CHAR_OPTIONS.themeColor.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </label>

          <button className="btn gold" style={{ marginTop: 8, height: 40, fontWeight: 700 }} onClick={compilePrompt}>
            อัปเกรดเป็น Pro Prompt และสรุปด้านล่าง 👇
          </button>
        </div>
      </div>

      <textarea 
        value={prompt || preview} 
        onChange={(e) => setPrompt(e.target.value)} 
        rows="7"
        placeholder="พิมพ์รายละเอียดเพิ่มเติมที่ต้องการปรับแต่งที่นี่..."
      />
      <div className="character-actions">
        <button className="btn ghost" disabled={busy || !agent?.generatedImage} onClick={applyGeneratedCard}>Apply as Profile Card</button>
        <button className="btn ghost" disabled={busy || !agent?.generatedAvatar} onClick={applyGeneratedAvatar}>Apply as Avatar</button>
        <button className="btn ghost" disabled={busy || !defaultImage} onClick={restoreDefault}>Restore Default</button>
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginTop:8 }}>
        <button className="btn primary" disabled={busy || !agent?.id} onClick={() => generate('card')} title="Cinematic hero card with depth, environment, rim lighting — for the big roster card.">
          {busy ? '…' : '🎬 Generate Profile Card'}
        </button>
        <button className="btn" disabled={busy || !agent?.id} onClick={() => generate('avatar')} title="Clean transparent cutout — for thumbnails and small avatars.">
          {busy ? '…' : '👤 Generate Avatar Cutout'}
        </button>
      </div>
      {busy && (
        <div style={{ marginTop:10 }}>
          <div style={{ fontSize:11, color:'var(--text-2)', marginBottom:4 }}>กำลังเจนรูป... (Codex CLI ใช้เวลา ~60–90 วินาที, Gemini ~10–20 วินาที)</div>
          <div style={{ height:6, borderRadius:999, background:'var(--bg-2)', overflow:'hidden', position:'relative' }}>
            <div style={{
              position:'absolute', top:0, bottom:0, left:0, right:0,
              background:'linear-gradient(90deg, transparent 0%, var(--accent-cyan) 50%, transparent 100%)',
              backgroundSize:'200% 100%',
              animation:'cofficeProgressShimmer 1.6s linear infinite',
            }}/>
          </div>
        </div>
      )}
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
