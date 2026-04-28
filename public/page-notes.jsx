/* ===== NOTES PAGE — capture ideas, pick agent, chat or dispatch ===== */

const NoteTagPalette = ['idea', 'task', 'bug', 'research', 'design', 'ops'];

const NotesPage = ({ onOpenAgent, presetAgentId }) => {
  window.useCOfficeRefresh();
  const notes = window.NOTES || [];
  const agents = window.AGENTS || [];
  const providers = (window.PROVIDERS?.providers) || [];
  const defaultProvider = window.PROVIDERS?.default || 'echo';

  const [activeId, setActiveId] = React.useState(null);
  const [composerOpen, setComposerOpen] = React.useState(false);
  const [draft, setDraft] = React.useState({ title: '', body: '', tag: 'idea', agentId: presetAgentId || 'orchestra' });

  // Auto-select first note when list arrives
  React.useEffect(() => {
    if (!activeId && notes.length > 0) setActiveId(notes[0].id);
  }, [notes.length]);

  const active = notes.find(n => n.id === activeId);

  const refresh = () => window.refreshNotes && window.refreshNotes();

  async function createDraft() {
    if (!draft.title.trim() && !draft.body.trim()) return;
    const r = await fetch('/api/notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(draft),
    });
    const note = await r.json();
    setDraft({ title: '', body: '', tag: 'idea', agentId: presetAgentId || 'orchestra' });
    setComposerOpen(false);
    setActiveId(note.id);
    refresh();
  }

  async function patchActive(patch) {
    if (!active) return;
    await fetch(`/api/notes/${active.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    refresh();
  }

  async function removeActive() {
    if (!active) return;
    if (!confirm(`Delete note "${active.title}"?`)) return;
    await fetch(`/api/notes/${active.id}`, { method: 'DELETE' });
    setActiveId(null);
    refresh();
  }

  return (
    <div>
      <div className="topbar">
        <div>
          <h1>ศูนย์ <span className="accent">สั่งงาน</span></h1>
          <div className="sub">จดโน้ต · เลือกเอเจนท์ · คุยก่อน · เข้า Scene เพื่อรันงาน</div>
        </div>
        <div className="topbar-actions">
          <span className="chip"><span className="dot"/> {notes.length} โน้ต</span>
          <button className="btn primary" onClick={() => setComposerOpen(o => !o)}>
            {composerOpen ? '× ยกเลิก' : '＋ โน้ตใหม่'}
          </button>
        </div>
      </div>

      {composerOpen && (
        <div className="panel" style={{marginBottom: 18}}>
          <div className="panel-head">
            <h3>จดสิ่งที่อยากทำ</h3>
            <div className="right">บันทึกไว้ แล้วเลือกเอเจนท์ภายหลังได้</div>
          </div>
          <div className="stack" style={{gap: 10}}>
            <input
              className="note-input"
              placeholder="หัวข้อสั้นๆ"
              value={draft.title}
              onChange={e => setDraft({...draft, title: e.target.value})}
              autoFocus
            />
            <textarea
              className="note-input"
              rows={4}
              placeholder="รายละเอียด บริบท หรือคำสั่งเต็มที่อยากให้เอเจนท์ทำ..."
              value={draft.body}
              onChange={e => setDraft({...draft, body: e.target.value})}
            />
            <div className="row" style={{gap: 12, flexWrap: 'wrap'}}>
              <div style={{display:'flex', gap: 6, flexWrap:'wrap'}}>
                {NoteTagPalette.map(t => (
                  <span
                    key={t}
                    onClick={() => setDraft({...draft, tag: t})}
                    className={'badge ' + (draft.tag === t ? 'gold' : 'slate')}
                    style={{cursor:'pointer', userSelect:'none'}}
                  >{t}</span>
                ))}
              </div>
              <div style={{flex: 1}}/>
              <AgentPicker
                agents={agents}
                value={draft.agentId}
                onChange={(id) => setDraft({...draft, agentId: id})}
              />
              <button className="btn primary" onClick={createDraft}>บันทึกโน้ต</button>
            </div>
          </div>
        </div>
      )}

      <div className="notes-shell">
        <div className="notes-list panel">
          <div className="panel-head">
            <h3>กล่องงาน</h3>
            <div className="right">{notes.length}</div>
          </div>
          {notes.length === 0 && (
            <div className="muted" style={{fontSize: 12, padding: '20px 4px', textAlign:'center'}}>
              ยังไม่มีโน้ต กด <b>＋ โน้ตใหม่</b> เพื่อเริ่มจดงานแรก
            </div>
          )}
          {notes.map(n => {
            const agent = agents.find(a => a.id === n.agentId);
            const isActive = n.id === activeId;
            const lastMsg = n.messages && n.messages[n.messages.length - 1];
            return (
              <div
                key={n.id}
                className={'note-row ' + (isActive ? 'is-active' : '')}
                onClick={() => setActiveId(n.id)}
              >
                <div className="note-row-head">
                  <span className="note-row-title">{n.title}</span>
                  <span className={'note-status status-' + n.status}>{n.status}</span>
                </div>
                <div className="note-row-meta">
                  {agent && (
                    <span className="row" style={{gap: 6}}>
                      <AgentDot agent={agent} size={18}/>
                      <span>{agent.name}</span>
                    </span>
                  )}
                  {n.tag && <span className="badge slate" style={{fontSize: 9}}>{n.tag}</span>}
                  <span className="mono-s" style={{marginLeft: 'auto'}}>
                    {n.messages?.length || 0} msg
                  </span>
                </div>
                {lastMsg && (
                  <div className="note-row-preview">
                    {lastMsg.role === 'user' ? '› ' : '◆ '}
                    {lastMsg.content.slice(0, 80)}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="notes-detail">
          {active ? (
            <NoteDetail
              note={active}
              agents={agents}
              providers={providers}
              defaultProvider={defaultProvider}
              onChange={refresh}
              onPatch={patchActive}
              onDelete={removeActive}
              onOpenAgent={onOpenAgent}
            />
          ) : (
            <div className="panel" style={{padding: 60, textAlign: 'center'}}>
              <div className="muted">เลือกโน้ตจากกล่องงาน หรือสร้างโน้ตใหม่เพื่อเริ่มสั่งงาน</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const AgentPicker = ({ agents, value, onChange }) => {
  const [open, setOpen] = React.useState(false);
  const [pos, setPos] = React.useState({ top: 0, left: 0, width: 280 });
  const buttonRef = React.useRef(null);
  const menuRef   = React.useRef(null);

  // Compute menu position from button rect — using position: fixed lets the
  // dropdown escape any ancestor panel with overflow: hidden.
  const measure = React.useCallback(() => {
    const el = buttonRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const width = 280;
    const left = Math.min(window.innerWidth - width - 8, r.left);
    const top  = r.bottom + 4;
    setPos({ top, left: Math.max(8, left), width });
  }, []);

  React.useEffect(() => {
    if (!open) return;
    measure();
    const close = (e) => {
      if (buttonRef.current?.contains(e.target)) return;
      if (menuRef.current?.contains(e.target))   return;
      setOpen(false);
    };
    const onScroll = () => measure();
    document.addEventListener('mousedown', close);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    return () => {
      document.removeEventListener('mousedown', close);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
    };
  }, [open, measure]);

  const selected = agents.find(a => a.id === value);
  return (
    <div className="agent-picker">
      <button
        ref={buttonRef}
        className="btn"
        onClick={() => setOpen(o => !o)}
        style={{display: 'inline-flex', alignItems: 'center', gap: 8}}
      >
        {selected ? <AgentDot agent={selected} size={20}/> : <span className="mono-s">no agent</span>}
        <span>{selected ? selected.name : 'เลือกเอเจนท์'}</span>
        <span className="mono-s">▾</span>
      </button>
      {open && (
        <div
          ref={menuRef}
          className="agent-picker-menu panel"
          style={{ top: pos.top, left: pos.left, width: pos.width }}
        >
          {agents.map(a => (
            <div key={a.id} className="agent-picker-row" onClick={() => { onChange(a.id); setOpen(false); }}>
              <AgentDot agent={a} size={26}/>
              <div style={{flex: 1, minWidth: 0}}>
                <div style={{fontSize: 12, fontWeight: 600}}>{a.name}</div>
                <div className="mono-s" style={{overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}}>{a.role}</div>
              </div>
              <span className={'badge ' + (a.status === 'busy' ? 'gold' : a.status === 'active' ? 'green' : 'slate')} style={{fontSize: 9}}>
                {a.status}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const NoteDetail = ({ note, agents, providers, defaultProvider, onChange, onPatch, onDelete, onOpenAgent }) => {
  const agent = agents.find(a => a.id === note.agentId);
  const [draft, setDraft] = React.useState('');
  const [provider, setProvider] = React.useState(defaultProvider);
  const [busy, setBusy] = React.useState(false);
  const [editing, setEditing] = React.useState(false);
  const [editDraft, setEditDraft] = React.useState({ title: note.title, body: note.body });

  React.useEffect(() => { setEditDraft({ title: note.title, body: note.body }); setEditing(false); }, [note.id]);

  const messagesEnd = React.useRef(null);
  React.useEffect(() => {
    messagesEnd.current?.scrollIntoView({ behavior: 'smooth' });
  }, [note.messages?.length]);

  function dispatch(autoMessage) {
    if (busy) return;
    setBusy(true);
    const message = autoMessage !== undefined ? autoMessage : draft.trim();
    window.openScene({
      noteId: note.id,
      agentId: note.agentId || 'orchestra',
      provider,
      message,
    });
    setDraft('');
    setBusy(false);
    onChange?.();
  }

  async function saveEdit() {
    await onPatch({ title: editDraft.title.trim() || 'Untitled note', body: editDraft.body });
    setEditing(false);
  }

  return (
    <div className="panel note-detail-panel">
      <div className="note-detail-head">
        {editing ? (
          <div className="stack" style={{gap: 8, flex: 1}}>
            <input
              className="note-input"
              value={editDraft.title}
              onChange={e => setEditDraft({...editDraft, title: e.target.value})}
            />
            <textarea
              className="note-input"
              rows={4}
              value={editDraft.body}
              onChange={e => setEditDraft({...editDraft, body: e.target.value})}
            />
            <div className="row" style={{gap: 8}}>
              <button className="btn primary" onClick={saveEdit}>บันทึก</button>
              <button className="btn ghost" onClick={() => setEditing(false)}>ยกเลิก</button>
            </div>
          </div>
        ) : (
          <div style={{flex: 1, minWidth: 0}}>
            <h2 style={{fontSize: 22, marginBottom: 4}}>{note.title}</h2>
            {note.body && <div className="note-body">{note.body}</div>}
            <div className="row" style={{gap: 6, flexWrap: 'wrap', marginTop: 8}}>
              {note.tag && <span className="badge gold" style={{fontSize: 10}}>{note.tag}</span>}
              <span className={'note-status status-' + note.status}>{note.status}</span>
              <span className="mono-s">created {fmtDate(note.createdAt)}</span>
            </div>
          </div>
        )}
        <div className="row" style={{gap: 6, flexShrink: 0}}>
          {!editing && <button className="btn ghost" onClick={() => setEditing(true)}>✎ แก้ไข</button>}
          <button className="btn ghost" onClick={onDelete} style={{color: 'var(--red)'}}>ลบ</button>
        </div>
      </div>

      <div className="divider"/>

      <div className="row" style={{gap: 10, flexWrap: 'wrap', marginBottom: 10}}>
        <span className="mono-s">มอบหมาย →</span>
        <AgentPicker
          agents={agents}
          value={note.agentId || 'orchestra'}
          onChange={(id) => onPatch({ agentId: id })}
        />
        {agent && (
          <button className="btn ghost" onClick={() => onOpenAgent && onOpenAgent(agent.id)} style={{fontSize: 11}}>
            ดูโปรไฟล์ →
          </button>
        )}
        <div style={{flex: 1}}/>
        <span className="mono-s">ตัวรัน →</span>
        <select className="provider-select" value={provider} onChange={e => setProvider(e.target.value)}>
          {providers.map(p => (
            <option key={p.name} value={p.name} disabled={!p.available}>
              {p.display} {p.available ? '' : '(not installed)'}
            </option>
          ))}
        </select>
      </div>

      <div className="note-chat">
        {(note.messages || []).length === 0 && (
          <div className="muted" style={{fontSize: 12, padding: '20px 0', textAlign: 'center'}}>
            ยังไม่มีบทสนทนา คุยกับ {agent?.name || 'เอเจนท์'} ก่อน หรือกด <b>เข้า Scene</b> เพื่อส่งโน้ตนี้ทันที
          </div>
        )}
        {(note.messages || []).map((m, i) => {
          const who = m.role === 'agent' ? (agents.find(a => a.id === m.agentId) || agent) : null;
          return (
            <div key={i} className={'note-msg note-msg-' + m.role}>
              {m.role === 'agent' ? (
                <AgentDot agent={who} size={28}/>
              ) : (
                <div className="note-msg-pilot">P</div>
              )}
              <div className="note-msg-bubble">
                <div className="note-msg-meta">
                  <b>{m.role === 'user' ? 'คุณ' : (who?.name || m.role)}</b>
                  {m.provider && <span className="mono-s">via {m.provider}</span>}
                  <span className="mono-s" style={{marginLeft: 'auto'}}>{fmtDate(m.ts)}</span>
                </div>
                <div className="note-msg-content">{m.content}</div>
              </div>
            </div>
          );
        })}
        <div ref={messagesEnd}/>
      </div>

      <div className="note-composer">
        <textarea
          className="note-input"
          rows={3}
          placeholder={`คุยกับ ${agent?.name || 'เอเจนท์'}...`}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              dispatch();
            }
          }}
        />
        <div className="row" style={{gap: 8, marginTop: 8, justifyContent: 'flex-end'}}>
          <span className="mono-s" style={{marginRight: 'auto'}}>
            Ctrl/⌘+Enter เพื่อส่ง · ใช้ <b>{provider}</b>
          </span>
          <button className="btn ghost" disabled={busy} onClick={() => dispatch('')}>
            เข้า Scene จากโน้ต
          </button>
          <button className="btn primary" disabled={busy || !draft.trim()} onClick={() => dispatch()}>
            {busy ? 'กำลังรัน...' : 'คุยแล้วรัน'}
          </button>
        </div>
      </div>
    </div>
  );
};

function fmtDate(ts) {
  if (!ts) return '';
  const dt = Date.now() - ts;
  if (dt < 60_000) return 'just now';
  if (dt < 3_600_000) return Math.floor(dt / 60_000) + 'm ago';
  if (dt < 86_400_000) return Math.floor(dt / 3_600_000) + 'h ago';
  return new Date(ts).toLocaleDateString();
}

Object.assign(window, { NotesPage, AgentPicker, NoteDetail });
