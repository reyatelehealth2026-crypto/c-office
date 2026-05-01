/* ===== GUILD HALL — Adventurer's Guild × Command Deck home page =================
   Replaces the legacy Dashboard as the default 'dashboard' route.
   Reads window globals (AGENTS, NOTES, INVENTORY, SHOP_CATALOG, STATS) populated
   by data.js via SSE. Reuses .office-card states from cards.css for live status,
   .note-status from notes.css for quest pills, and window.openScene() to launch
   the existing JRPG dialogue overlay on quest sortie.
   =============================================================================== */

// ── Status label maps (Thai) ─────────────────────────────────────────────────
const QUEST_STATUS_LABEL_TH = {
  idea:     'ไอเดีย',
  queued:   'คิว',
  running:  'กำลังทำ',
  done:     'เสร็จ',
  archived: 'เก็บ',
};

function questStatusOf(note) {
  return note?.questState?.status || note?.status || 'idea';
}

function isOpenQuest(note) {
  const s = questStatusOf(note);
  return s !== 'done' && s !== 'archived';
}

// ── 2-letter skill code (e.g. "Double Edge" → "DE") ──────────────────────────
function skillInitials(name) {
  const words = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '·';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

// ── SkillSlots — small chip stack overlaid on a roster card ──────────────────
const SkillSlots = ({ personaId }) => {
  const inv = window.INVENTORY || {};
  const owned = (inv.skills && inv.skills[personaId]) || [];
  const catalog = (window.SHOP_CATALOG && window.SHOP_CATALOG.skills) || [];
  // Always render 3 slots — fill with chips, leave empty placeholder dot
  const slots = [0, 1, 2].map((i) => owned[i] || null);
  return (
    <div className="skill-slots">
      {slots.map((skillId, i) => {
        if (!skillId) return <span key={i} className="skill-chip tier-empty" title="ช่องว่าง">·</span>;
        const skill = catalog.find((s) => s.id === skillId);
        const tier = skill?.tier || 'common';
        const tierClass = tier === 'rare' ? 'tier-rare' : tier === 'epic' ? 'tier-epic' : '';
        const code = skill ? skillInitials(skill.name) : '··';
        const tip = skill ? `${skill.name} — ${skill.desc}` : skillId;
        return (
          <span key={i} className={`skill-chip ${tierClass}`.trim()} title={tip}>{code}</span>
        );
      })}
    </div>
  );
};

// ── RosterCard — extends .office-card with state animations ──────────────────
const RosterCard = ({ agent, onClick }) => {
  const status = agent.status || 'idle';
  const state =
    status === 'busy'    ? 'busy'    :
    status === 'offline' ? 'offline' :
    status === 'idle'    ? 'idle'    :
    'active';
  const label =
    state === 'busy'    ? 'ทำงาน' :
    state === 'offline' ? 'ออฟไลน์' :
    state === 'idle'    ? 'พัก' :
    'พร้อม';
  const tip = agent.currentTask
    ? `${agent.name} — ${agent.currentTask}`
    : `${agent.name} (Lv.${agent.level || 1})`;
  return (
    <div
      className={`roster-card office-card state-${state} rarity-${agent.rarity || 'R'}`}
      style={{ '--art-gradient': agent.gradient }}
      onClick={() => onClick && onClick(agent.id)}
      title={tip}
    >
      <div className="of-art">
        {agent.image
          ? <img src={agent.image} alt={agent.name}/>
          : <div className="of-initials">{agent.avatarInitials}</div>}
      </div>
      <SkillSlots personaId={agent.id}/>
      <div className="of-busy-dots"><span/><span/><span/></div>
      <div className="of-name">{agent.name} · Lv.{agent.level || 1}</div>
      <div className="of-status">
        <span className="of-status-dot"/>
        <span>{label}</span>
      </div>
    </div>
  );
};

// ── QuestCard — scroll-shaped objective wrapping note data ───────────────────
const QuestCard = ({ note, onSortie, onPick, onAfterAction }) => {
  const status = questStatusOf(note);
  const statusLabel = QUEST_STATUS_LABEL_TH[status] || status;
  const agents = window.AGENTS || [];
  const personaId = note.selectedAgent || note.persona || 'orchestra';
  const agent = agents.find((a) => a.id === personaId);
  const provider = note.provider || 'codex';
  const isRunning = status === 'running';
  const isDone = status === 'done' || status === 'archived';
  const cls = `quest-scroll ${isRunning ? 'is-running' : ''} ${isDone ? 'is-done' : ''}`.trim();
  return (
    <div className={cls} onClick={() => onPick && onPick(note.id)}>
      <div className="quest-scroll-body">
        <div className="quest-scroll-row">
          <span className={`note-status status-${status}`} style={{ padding: '2px 6px', borderRadius: 4 }}>
            {statusLabel}
          </span>
          {agent && <span style={{ color: 'var(--text-3)' }}>· assigned: {agent.name}</span>}
          <span style={{ color: 'var(--text-4)' }}>· {provider}</span>
        </div>
        <div className="quest-scroll-title">{note.title || 'Untitled task'}</div>
        {(note.body || note.description) && (
          <div className="quest-scroll-desc">{note.body || note.description}</div>
        )}
      </div>
      <div className="quest-scroll-actions" onClick={(e) => e.stopPropagation()}>
        <button
          className="guild-cta compact"
          disabled={isDone}
          onClick={() => onSortie && onSortie(note)}
        >
          ▶ Run
        </button>
        {(note.runHistory || note.dispatches || []).length > 0 && (
          <button
            className="btn ghost"
            style={{ padding: '4px 10px', fontSize: 11 }}
            onClick={() => onAfterAction && onAfterAction(note.id)}
          >
            📄 Report
          </button>
        )}
      </div>
    </div>
  );
};

// ── AfterActionPanel — inline result viewer for a note ───────────────────────
function fmtClock(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

const AfterActionPanel = ({ note, onClose }) => {
  if (!note) return null;
  const history = note.runHistory || note.dispatches || [];
  const Icons = window.GuildIcons || {};
  const Banner = Icons.Banner || (() => <span>⚑</span>);
  return (
    <div className="aar-panel">
      <div className="aar-head">
        <span style={{ color: 'var(--gold)' }}><Banner size={18}/></span>
        <div className="aar-head-title">Report · {note.title}</div>
        <button
          className="btn ghost"
          style={{ marginLeft: 'auto', padding: '4px 10px', fontSize: 11 }}
          onClick={() => onClose && onClose()}
        >
          ปิด
        </button>
      </div>
      {history.length === 0 && (
        <div className="aar-empty">— No run history yet —</div>
      )}
      {history.slice(0, 12).map((row, i) => {
        const status = row.status || row.state || '—';
        const cls =
          status === 'done' || status === 'ok'   ? 'ok'  :
          status === 'failed' || status === 'err' ? 'err' :
          status === 'running' ? 'run' : '';
        return (
          <div key={row.id || i} className="aar-row">
            <span className="aar-when">{fmtClock(row.startedAt || row.ts || row.createdAt)}</span>
            <span className="aar-msg">{row.provider || row.mode || row.tool || ''} {row.text || row.note || row.message || ''}</span>
            <span className={`aar-status ${cls}`}>{status}</span>
          </div>
        );
      })}
    </div>
  );
};

// ── GuildHall — main page ────────────────────────────────────────────────────
const GuildHall = ({ onOpenAgent }) => {
  window.useCOfficeRefresh();
  const [aarNoteId, setAarNoteId] = React.useState(null);
  const [activeNoteId, setActiveNoteId] = React.useState(null);

  const agents = window.AGENTS || [];
  const notes = window.NOTES || [];
  const inventory = window.INVENTORY || { gold: 0, skills: {}, items: {}, ownedAgents: ['orchestra'] };
  const stats = window.STATS || { agentsOnline: 0 };

  const openQuests = notes.filter(isOpenQuest);
  const liveAgents = agents.filter((a) => a.status === 'busy' || a.status === 'active');
  const aarNote = aarNoteId ? notes.find((n) => n.id === aarNoteId) : null;

  const launchSortie = (note) => {
    if (!window.openScene) return;
    const personaId = note.selectedAgent || note.persona || 'orchestra';
    const result = window.openScene({
      noteId: note.id,
      agentId: personaId,
      message: note.body || note.description || note.title,
      provider: note.provider || 'codex',
      title: note.title,
      body: note.body || note.description,
      tag: 'quest',
    });
    if (result && typeof result.catch === 'function') result.catch(() => {});
  };

  const Icons = window.GuildIcons || {};
  const Sigil = Icons.Sigil || (() => <span>⚜</span>);
  const Scroll = Icons.Scroll || (() => <span>📜</span>);
  const Crossed = Icons.CrossedSwords || (() => <span>⚔</span>);

  return (
    <div className="guild-hall">
      {/* ─── Hero ─── */}
      <div className="guild-hero">
        <div className="guild-hero-crest">
          <Sigil size={36} color="var(--gold)"/>
        </div>
        <div className="guild-hero-meta">
          <h1 className="guild-hero-name">Command<span className="accent">Center</span></h1>
          <div className="guild-hero-sub">
            {agents.length} agents · {stats.agentsOnline || liveAgents.length} online · {openQuests.length} open tasks
          </div>
        </div>
        <div className="guild-hero-stats">
          <span className="guild-gold-pip">
            <span style={{ fontSize: 16 }}>⛁</span>
            <span className="num">{(inventory.gold || 0).toLocaleString()}</span>
            <span style={{ fontSize: 11, fontWeight: 500, opacity: 0.8 }}>Credits</span>
          </span>
          <span className="chip">
            <span className="dot"/> live
          </span>
        </div>
      </div>

      {/* ─── Quest Board ─── */}
      <div className="guild-section-head">
        <span className="glyph"><Scroll size={20}/></span>
        <h2>Open Tasks</h2>
        <span className="right-meta">{openQuests.length} open · {notes.length} total</span>
      </div>
      <div className="quest-board">
        {openQuests.length === 0 && (
          <div className="quest-board-empty">
            No open tasks right now — create a new note to get started
          </div>
        )}
        {openQuests.slice(0, 6).map((note) => (
          <QuestCard
            key={note.id}
            note={note}
            onSortie={launchSortie}
            onPick={setActiveNoteId}
            onAfterAction={setAarNoteId}
          />
        ))}
      </div>

      {/* ─── After-Action (inline, lazy) ─── */}
      {aarNote && <AfterActionPanel note={aarNote} onClose={() => setAarNoteId(null)}/>}

      {/* ─── Roster ─── */}
      <div className="guild-section-head">
        <span className="glyph"><Crossed size={20}/></span>
        <h2>Team</h2>
        <span className="right-meta">
          {liveAgents.length} working · {agents.filter((a) => a.status === "active" || a.status === "idle").length} ready
        </span>
      </div>
      <div className="roster-grid">
        {agents.map((a) => (
          <RosterCard key={a.id} agent={a} onClick={onOpenAgent}/>
        ))}
      </div>
    </div>
  );
};

Object.assign(window, { GuildHall, QuestCard, RosterCard, SkillSlots, AfterActionPanel });
