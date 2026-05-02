/* Notes Workspace V2 — three-panel override.
   Reuses legacy AgentPicker and NoteDetail so existing dispatch / Orchestra /
   image-generation behavior remains intact. */

const uxNoteFmt = (ts) => {
  if (!ts) return 'unknown';
  const diff = Math.max(0, Date.now() - ts);
  if (diff < 60_000) return 'now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h`;
  return `${Math.floor(diff / 86_400_000)}d`;
};

const uxNoteStatusLabel = (s) => ({
  idea: 'idea', queued: 'queued', running: 'running', done: 'done', archived: 'archived',
}[s] || s || 'idea');

const UXNoteCard = ({ note, active, agent, onClick }) => {
  const messages = Array.isArray(note.messages) ? note.messages : [];
  const lastMsg = messages[messages.length - 1];
  return (
    <button className={'ux-note-card ' + (active ? 'is-active' : '')} onClick={onClick}>
      <div className="ux-note-card-title">{note.title || 'Untitled note'}</div>
      <div className="ux-note-card-body">{lastMsg?.content || note.body || 'No body yet.'}</div>
      <div className="ux-note-card-meta">
        {agent && <AgentDot agent={agent} size={18}/>} 
        <UXStatusChip label={uxNoteStatusLabel(note.status)} state={note.status === 'done' ? 'active' : note.status === 'running' ? 'busy' : 'muted'} />
        {note.tag && <span className="ux-event-tag">{note.tag}</span>}
        <span className="ux-note-mini" style={{ marginLeft: 'auto' }}>{messages.length} msg</span>
      </div>
    </button>
  );
};

const UXNotesContext = ({ note, agent, providers, onOpenAgent }) => {
  const messages = Array.isArray(note?.messages) ? note.messages : [];
  const availableProviders = providers.filter(p => p.available).length;
  const agentStatus = agent?.status || 'idle';
  return (
    <aside className="ux-notes-panel ux-notes-context">
      <div className="ux-context-card">
        <h4>Assigned agent</h4>
        {agent ? (
          <div className="ux-agent-context">
            <AgentDot agent={agent} size={48}/>
            <div>
              <div className="ux-agent-context-name">{agent.name}</div>
              <div className="ux-agent-context-role">{agent.role}</div>
              <div style={{ marginTop: 8 }}><UXStatusChip label={agentStatus} state={agentStatus === 'busy' ? 'busy' : agentStatus === 'active' ? 'active' : 'muted'} /></div>
            </div>
          </div>
        ) : (
          <p>No agent assigned yet.</p>
        )}
      </div>

      <div className="ux-context-card">
        <h4>Note pulse</h4>
        <div className="ux-note-stat-grid">
          <div className="ux-note-stat"><b>{messages.length}</b><span>messages</span></div>
          <div className="ux-note-stat"><b>{note?.tag || 'none'}</b><span>tag</span></div>
          <div className="ux-note-stat"><b>{uxNoteFmt(note?.updatedAt || note?.createdAt)}</b><span>updated</span></div>
          <div className="ux-note-stat"><b>{note?.status || 'idea'}</b><span>status</span></div>
        </div>
      </div>

      <div className="ux-context-card">
        <h4>Providers</h4>
        <div className="ux-provider-stack">
          {providers.slice(0, 5).map(p => (
            <div className="ux-provider-mini" key={p.name}>
              <div><b>{p.display || p.name}</b><br/><span>{p.name}</span></div>
              <UXStatusChip label={p.available ? 'ready' : 'missing'} state={p.available ? 'active' : 'danger'} />
            </div>
          ))}
          {!providers.length && <p>No provider catalog loaded yet.</p>}
        </div>
      </div>

      <div className="ux-context-card">
        <h4>Quick actions</h4>
        <div className="ux-context-actions">
          {agent && <button className="ux-soft-button" onClick={() => onOpenAgent?.(agent.id)}>Inspect agent</button>}
          <button className="ux-soft-button" onClick={() => window.dispatchEvent(new CustomEvent('c-office:navigate', { detail: { page: 'mission-control' } }))}>Open Mission Control</button>
          <button className="ux-soft-button" onClick={() => window.dispatchEvent(new CustomEvent('c-office:navigate', { detail: { page: 'settings' } }))}>Provider settings</button>
        </div>
        <p style={{ marginTop: 10 }}>{availableProviders} provider(s) appear available for dispatch.</p>
      </div>
    </aside>
  );
};

const NotesPageV2 = ({ onOpenAgent, presetAgentId }) => {
  window.useCOfficeRefresh?.();
  const notes = window.NOTES || [];
  const agents = window.AGENTS || [];
  const providers = window.PROVIDERS?.providers || [];
  const defaultProvider = window.PROVIDERS?.default || 'claude';
  const [activeId, setActiveId] = React.useState(null);
  const [query, setQuery] = React.useState('');
  const [tag, setTag] = React.useState('all');
  const [composerOpen, setComposerOpen] = React.useState(false);
  const [draft, setDraft] = React.useState({ title: '', body: '', tag: 'idea', agentId: presetAgentId || 'orchestra' });

  React.useEffect(() => {
    if (!activeId && notes.length > 0) setActiveId(notes[0].id);
  }, [notes.length, activeId]);

  const tags = ['all', ...Array.from(new Set(notes.map(n => n.tag).filter(Boolean)))];
  const filtered = notes.filter(n => {
    const hay = `${n.title || ''} ${n.body || ''} ${(n.messages || []).map(m => m.content).join(' ')}`.toLowerCase();
    if (query && !hay.includes(query.toLowerCase())) return false;
    if (tag !== 'all' && n.tag !== tag) return false;
    return true;
  });
  const active = notes.find(n => n.id === activeId) || filtered[0] || notes[0] || null;
  const activeAgent = active ? agents.find(a => a.id === active.agentId) : null;
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
    <div className="ux-notes">
      <aside className="ux-notes-panel ux-notes-list-panel">
        <div className="ux-notes-head">
          <div className="ux-notes-title-row">
            <h3 className="ux-notes-title">Work inbox</h3>
            <UXStatusChip label={`${notes.length} notes`} state={notes.length ? 'active' : 'muted'} />
          </div>
          <div className="ux-notes-subtitle">Capture work, assign a persona, then dispatch through provider or Orchestra.</div>
          <input className="ux-notes-search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search notes and messages..." />
          <div className="ux-note-tags">
            {tags.map(t => <button key={t} className={'ux-note-tag ' + (tag === t ? 'is-active' : '')} onClick={() => setTag(t)}>{t}</button>)}
          </div>
        </div>

        <div className="ux-notes-scroll">
          {filtered.length ? filtered.map(n => {
            const agent = agents.find(a => a.id === n.agentId);
            return <UXNoteCard key={n.id} note={n} agent={agent} active={active?.id === n.id} onClick={() => setActiveId(n.id)} />;
          }) : <UXEmptyState title="No matching notes" body="Try clearing search or create a new note." />}
        </div>

        <div className="ux-note-compose">
          <button className="ux-hero-button" style={{ width: '100%', marginBottom: composerOpen ? 10 : 0 }} onClick={() => setComposerOpen(o => !o)}>{composerOpen ? 'Close composer' : 'New note'}</button>
          {composerOpen && (
            <div className="ux-compose-form">
              <input placeholder="Short title" value={draft.title} onChange={e => setDraft({ ...draft, title: e.target.value })}/>
              <textarea placeholder="Context, instruction, or raw idea..." value={draft.body} onChange={e => setDraft({ ...draft, body: e.target.value })}/>
              <select value={draft.tag} onChange={e => setDraft({ ...draft, tag: e.target.value })}>
                {['idea', 'task', 'bug', 'research', 'design', 'ops'].map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              <select value={draft.agentId} onChange={e => setDraft({ ...draft, agentId: e.target.value })}>
                {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
              <button className="ux-button-primary" onClick={createDraft}>Save note</button>
            </div>
          )}
        </div>
      </aside>

      <main className="ux-notes-center">
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
          <UXEmptyState title="Select or create a note" body="Notes become dispatchable work orders once assigned to an agent." />
        )}
      </main>

      <UXNotesContext note={active} agent={activeAgent} providers={providers} onOpenAgent={onOpenAgent} />
    </div>
  );
};

window.NotesPage = NotesPageV2;
