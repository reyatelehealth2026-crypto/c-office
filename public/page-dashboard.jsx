/* ===== DASHBOARD PAGE — Warm Professional AI Agent Hub ===== */
function relTime(input) {
  if (input == null) return '';
  if (typeof input === 'string') return input;
  const dt = Date.now() - input;
  if (dt < 0) return 'now';
  const s = Math.floor(dt/1000);
  if (s < 60)   return s + 's';
  const m = Math.floor(s/60);
  if (m < 60)   return m + 'm';
  const h = Math.floor(m/60);
  if (h < 24)   return h + 'h';
  return Math.floor(h/24) + 'd';
}

const CLI_PROVIDERS = [
  { id: 'claude', label: 'Claude Code', command: 'claude', hint: 'Claude Code CLI session' },
  { id: 'codex', label: 'Codex CLI', command: 'codex', hint: 'OpenAI Codex compatible CLI' },
  { id: 'gpt', label: 'GPT CLI', command: 'gpt', hint: 'Generic GPT terminal CLI' },
];

function shellQuote(s) {
  return "'" + String(s || '').replace(/'/g, "'\\''") + "'";
}

function providerCommand(provider, agent, prompt) {
  const p = CLI_PROVIDERS.find(x => x.id === provider) || CLI_PROVIDERS[0];
  const personaLine = agent ? `Act as ${agent.name}, ${agent.role}. ` : '';
  const body = `${personaLine}${prompt || 'Describe the mission here.'}`.trim();
  if (p.id === 'claude') return `${p.command} ${shellQuote(body)}`;
  if (p.id === 'codex') return `${p.command} exec ${shellQuote(body)}`;
  return `${p.command} ${shellQuote(body)}`;
}

async function writeClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (e) {
    window.prompt('Copy command', text);
    return false;
  }
}

/* Server-side multi-agent run */
// Categorize a finished run's steps into three buckets so the user can
// instantly find what's actionable. We classify by persona role + whether
// the step produced an image. Tags can be overridden per agent later.
// Tiny defensive markdown→HTML for deliverable content. Handles the
// subset that actually appears in agent output: headings, bold, italics,
// blockquotes, lists, tables, code, links, hr, paragraphs. Escapes raw
// HTML first so injected `<script>` / event handlers can't execute.
const escHtml = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const renderInline = (s) => escHtml(s)
  .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
  .replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>')
  .replace(/`([^`]+)`/g, '<code>$1</code>')
  .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>');

const renderMarkdown = (md) => {
  // LLM output sometimes arrives as one giant line with `### ` / `## ` /
  // `1. ` / `*` / `>` markers floating mid-text. Reading flow needs those
  // markers to start their own line. We inject newlines BEFORE recognized
  // structural tokens so the line-based parser below sees real structure
  // even when the source had collapsed whitespace.
  const normalised = String(md || '')
    .replace(/\r\n/g, '\n')
    .replace(/(?<=\S)\s*(#{1,6}\s)/g, '\n\n$1')
    .replace(/(?<=\S)\s+(\d+\.\s)(?=\S)/g, '\n$1')
    .replace(/\s+(\*\s)(?=\S)/g, '\n$1')
    .replace(/\s+(-\s)(?=\S)/g, '\n$1')
    .replace(/(?<=\S)\s*(\|\s*[A-Za-zก-๙])/g, (m, p1) => m.startsWith('|') ? m : '\n' + p1.trim())
    .replace(/\n{3,}/g, '\n\n');
  const lines = normalised.split('\n');
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    // Horizontal rule
    if (/^\s*---\s*$/.test(line) || /^\s*\*\*\*\s*$/.test(line)) { out.push('<hr/>'); i++; continue; }
    // ATX heading
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) { out.push(`<h${Math.min(h[1].length, 4)}>${renderInline(h[2])}</h${Math.min(h[1].length, 4)}>`); i++; continue; }
    // Table — collect lines that contain a pipe
    if (/\|/.test(line) && i + 1 < lines.length && /^[\s|:\-]+$/.test(lines[i + 1])) {
      const headerCells = line.split('|').map(c => c.trim()).filter((_, idx, arr) => idx > 0 || arr[0] !== '');
      const cleanHeader = line.split('|').slice(line.startsWith('|') ? 1 : 0, line.endsWith('|') ? -1 : undefined).map(c => c.trim());
      i += 2;
      const rows = [];
      while (i < lines.length && /\|/.test(lines[i])) {
        const cells = lines[i].split('|').slice(lines[i].startsWith('|') ? 1 : 0, lines[i].endsWith('|') ? -1 : undefined).map(c => c.trim());
        rows.push(cells);
        i++;
      }
      out.push('<table><thead><tr>' + cleanHeader.map(c => `<th>${renderInline(c)}</th>`).join('') + '</tr></thead><tbody>' +
        rows.map(r => '<tr>' + r.map(c => `<td>${renderInline(c)}</td>`).join('') + '</tr>').join('') +
        '</tbody></table>');
      continue;
    }
    // Blockquote
    if (/^\s*>\s?/.test(line)) {
      const buf = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
        buf.push(lines[i].replace(/^\s*>\s?/, ''));
        i++;
      }
      out.push('<blockquote>' + renderMarkdown(buf.join('\n')) + '</blockquote>');
      continue;
    }
    // Unordered list
    if (/^\s*[-*]\s+/.test(line)) {
      const buf = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        buf.push(lines[i].replace(/^\s*[-*]\s+/, ''));
        i++;
      }
      out.push('<ul>' + buf.map(item => `<li>${renderInline(item)}</li>`).join('') + '</ul>');
      continue;
    }
    // Ordered list
    if (/^\s*\d+\.\s+/.test(line)) {
      const buf = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        buf.push(lines[i].replace(/^\s*\d+\.\s+/, ''));
        i++;
      }
      out.push('<ol>' + buf.map(item => `<li>${renderInline(item)}</li>`).join('') + '</ol>');
      continue;
    }
    // Blank line
    if (!line.trim()) { i++; continue; }
    // Paragraph — collect contiguous non-blank lines that aren't structural
    const buf = [line];
    i++;
    while (i < lines.length && lines[i].trim() && !/^(#{1,6}\s|\s*[-*]\s+|\s*\d+\.\s+|\s*>\s?|\s*---\s*$)/.test(lines[i]) && !(/\|/.test(lines[i]) && i + 1 < lines.length && /^[\s|:\-]+$/.test(lines[i + 1]))) {
      buf.push(lines[i]);
      i++;
    }
    // Preserve in-paragraph line breaks the way social posts read — each
    // source line becomes its own visual line via <br>. This is the
    // "Facebook spacing" the user is asking for.
    out.push('<p>' + buf.map(renderInline).join('<br/>') + '</p>');
  }
  return out.join('\n');
};

const POST_PERSONAS = new Set(['lumen', 'mira']);
const RESEARCH_PERSONAS = new Set(['nyx', 'vex', 'astra', 'kai', 'orbit']);

const categorizeRunSteps = (run) => {
  const steps = Array.isArray(run?.steps) ? run.steps : [];
  const images = [];
  const posts = [];
  const research = [];
  for (const step of steps) {
    if (!step.result?.ok && !step.result?.image && !step.result?.images?.length) continue;
    const persona = step.persona || step.subagent_type || '';
    const text = step.result?.text || '';
    // Prefer the explicit images[] array if present (multi-image echo step),
    // fall back to the single image{} shape, then to URL-scrape from text.
    const arr = Array.isArray(step.result?.images) ? step.result.images : null;
    if (arr && arr.length > 0) {
      arr.forEach((im) => images.push({ persona, url: im.url, model: im.model || im.provider, text }));
      continue;
    }
    const imageUrl = step.result?.image?.url
      || (text.match(/\/generated\/[^\s)]+\.png/) || [])[0]
      || null;
    if (persona === 'echo' || imageUrl) {
      images.push({ persona, url: imageUrl, text, model: step.result?.image?.model });
    } else if (POST_PERSONAS.has(persona)) {
      posts.push({ persona, text });
    } else {
      research.push({ persona, text });
    }
  }
  return { images, posts, research };
};

const FinalDeliverable = ({ run, copy, copiedKey, openInNotes }) => {
  const { images, posts, research } = categorizeRunSteps(run);
  const [showResearch, setShowResearch] = React.useState(false);
  const personaName = (id) => (window.AGENTS || []).find(a => a.id === id)?.name || id;

  const empty = posts.length === 0 && images.length === 0 && research.length === 0;
  if (empty) {
    return (
      <div className="dlv-shell">
        <div className="dlv-piece-body" style={{ maxHeight: 480 }} dangerouslySetInnerHTML={{ __html: renderMarkdown(run.final) }}/>
      </div>
    );
  }

  return (
    <div className="dlv-shell">
      {/* Top ribbon: at-a-glance summary */}
      <div className="dlv-meta">
        <div className="dlv-meta-kicker">Deliverable · Run {String(run.id || '').slice(-6)}</div>
        <div className="dlv-meta-counts">
          {posts.length > 0    && <span>POSTS<b>{posts.length}</b></span>}
          {images.length > 0   && <span>IMAGES<b>{images.length}</b></span>}
          {research.length > 0 && <span>NOTES<b>{research.length}</b></span>}
        </div>
      </div>

      {/* Hero: ready-to-post content */}
      {posts.length > 0 && (
        <article className="dlv-card is-post">
          <div className="dlv-stamp">READY TO POST</div>
          <div className="dlv-card-head">
            <span className="dlv-icon">📝</span>
            <h4>คอนเทนต์พร้อมใช้</h4>
            <span className="dlv-count">{posts.length} {posts.length === 1 ? 'piece' : 'pieces'}</span>
            <span className="dlv-spacer"/>
          </div>
          {posts.map((p, i) => (
            <div className="dlv-piece" key={i}>
              <div className="dlv-piece-head">
                <span className="dlv-attrib">โดย <b>{personaName(p.persona)}</b></span>
                <button
                  className={'dlv-copy' + (copiedKey === `post-${i}` ? ' is-copied' : '')}
                  onClick={() => copy(p.text, `post-${i}`)}>
                  {copiedKey === `post-${i}` ? '✓ Copied' : 'Copy text'}
                </button>
              </div>
              <div className="dlv-piece-body" dangerouslySetInnerHTML={{ __html: renderMarkdown(p.text) }}/>
            </div>
          ))}
        </article>
      )}

      {/* Images gallery */}
      {images.length > 0 && (
        <article className="dlv-card is-image">
          <div className="dlv-card-head">
            <span className="dlv-icon">🖼️</span>
            <h4>ภาพประกอบ</h4>
            <span className="dlv-count">{images.length} visual</span>
            <span className="dlv-spacer"/>
          </div>
          <div className="dlv-image-grid">
            {images.map((img, i) => (
              <div className="dlv-image-tile" key={i}>
                {img.url ? (
                  <a href={img.url} target="_blank" rel="noreferrer">
                    <img src={img.url} alt={img.text}/>
                  </a>
                ) : (
                  <div className="dlv-image-tile-empty">Image generation failed</div>
                )}
                <div className="dlv-image-tile-foot">
                  <span>{img.model || img.persona}</span>
                  {img.url && (
                    <button
                      className={'dlv-copy' + (copiedKey === `img-${i}` ? ' is-copied' : '')}
                      onClick={() => copy(window.location.origin + img.url, `img-${i}`)}>
                      {copiedKey === `img-${i}` ? '✓' : 'URL'}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </article>
      )}

      {/* Research — collapsible */}
      {research.length > 0 && (
        <article className="dlv-card is-research">
          <div className="dlv-card-head">
            <span className="dlv-icon">🧠</span>
            <h4>ความคิดและข้อมูล AI</h4>
            <span className="dlv-count">{research.length} note{research.length === 1 ? '' : 's'}</span>
            <span className="dlv-spacer"/>
            <button className="dlv-research-toggle" onClick={() => setShowResearch(s => !s)}>
              {showResearch ? '▲ Collapse' : '▼ Expand'}
            </button>
          </div>
          {showResearch && research.map((r, i) => (
            <div className="dlv-piece" key={i}>
              <div className="dlv-piece-head">
                <span className="dlv-attrib">โดย <b>{personaName(r.persona)}</b></span>
                <button
                  className={'dlv-copy' + (copiedKey === `research-${i}` ? ' is-copied' : '')}
                  onClick={() => copy(r.text, `research-${i}`)}>
                  {copiedKey === `research-${i}` ? '✓ Copied' : 'Copy'}
                </button>
              </div>
              <div className="dlv-piece-body" style={{ maxHeight: 260 }} dangerouslySetInnerHTML={{ __html: renderMarkdown(r.text) }}/>
            </div>
          ))}
        </article>
      )}

      {/* Footer actions */}
      <div className="dlv-actions">
        <button className="dlv-action-btn is-primary" onClick={() => copy(run.final, 'final-all')}>
          {copiedKey === 'final-all' ? '✓ Copied' : '📋 Copy all'}
        </button>
        <button className="dlv-action-btn" onClick={openInNotes}>✎ Open in Notes</button>
        <a className="dlv-action-btn" href={`/api/task/${run.id}/trace`} target="_blank" rel="noreferrer">↗ Raw trace</a>
      </div>
    </div>
  );
};

// Modal editor for custom workflow plans. Each plan is a named ordered list
// of {persona, instruction} steps. Built-in plans are read-only. Saved plans
// land in `.claude/workflows/<slug>.json` via POST /api/workflows.
const PlanEditor = ({ workflows, onClose, onSaved }) => {
  const agents = (window.AGENTS || []).filter(a => a.id !== 'orchestra');
  const personaIds = agents.length ? agents.map(a => a.id) : ['nyx','lumen','mira','vex','kai','echo','astra','orbit'];
  const blank = () => ({ name: '', description: '', plan: [{ persona: personaIds[0], instruction: '', depends_on: null }] });
  const [draft, setDraft] = React.useState(blank);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');

  const editExisting = (wf) => {
    if (wf.builtIn) {
      // Clone built-in into a draft so the user can fork it.
      setDraft({ name: `${wf.name}-copy`, description: wf.description || '', plan: wf.plan.map(s => ({ ...s })) });
    } else {
      setDraft({ name: wf.name, description: wf.description || '', plan: wf.plan.map(s => ({ ...s })) });
    }
    setError('');
  };
  const setStep = (idx, patch) => setDraft(d => ({ ...d, plan: d.plan.map((s, i) => i === idx ? { ...s, ...patch } : s) }));
  const addStep = () => setDraft(d => ({ ...d, plan: [...d.plan, { persona: personaIds[0], instruction: '', depends_on: d.plan.length - 1 }] }));
  const removeStep = (idx) => setDraft(d => ({ ...d, plan: d.plan.length > 1 ? d.plan.filter((_, i) => i !== idx) : d.plan }));

  const save = async () => {
    setBusy(true); setError('');
    try {
      const r = await fetch('/api/workflows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'save failed');
      onSaved?.();
      setDraft(blank());
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };

  const remove = async (name) => {
    if (!window.confirm(`Delete plan "${name}"?`)) return;
    setBusy(true); setError('');
    try {
      const r = await fetch(`/api/workflows/${encodeURIComponent(name)}`, { method: 'DELETE' });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'delete failed');
      onSaved?.();
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };

  return (
    <div onClick={onClose} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.7)', zIndex:9999, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
      <div onClick={e => e.stopPropagation()} style={{ background:'var(--bg-1)', border:'1px solid var(--border)', borderRadius:12, width:'min(900px, 95vw)', maxHeight:'90vh', overflow:'auto', padding:20 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', marginBottom:14 }}>
          <h2 style={{ margin:0, fontSize:18 }}>Workflow Plans</h2>
          <button className="btn-ghost" onClick={onClose}>✕</button>
        </div>

        <div style={{ display:'grid', gridTemplateColumns:'1fr 2fr', gap:16 }}>
          {/* Left: list of existing workflows */}
          <div>
            <div style={{ fontSize:11, color:'var(--text-2)', marginBottom:8, textTransform:'uppercase', letterSpacing:0.5 }}>Existing Plans</div>
            <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
              {workflows.map(wf => (
                <div key={wf.name} style={{ display:'flex', alignItems:'center', gap:6, padding:'6px 8px', background:'var(--bg-2)', borderRadius:6 }}>
                  <button className="btn-ghost" style={{ fontSize:11, flex:1, textAlign:'left' }} onClick={() => editExisting(wf)} title={wf.description}>
                    {wf.builtIn ? '🔒' : '✏️'} {wf.name} <span style={{color:'var(--text-3)'}}>({wf.steps})</span>
                  </button>
                  {!wf.builtIn && (
                    <button className="btn-ghost" style={{ fontSize:10, color:'var(--red)' }} onClick={() => remove(wf.name)}>del</button>
                  )}
                </div>
              ))}
            </div>
            <button className="btn-ghost" style={{ fontSize:11, marginTop:10, width:'100%' }} onClick={() => setDraft(blank())}>＋ New Plan</button>
          </div>

          {/* Right: editor */}
          <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
            <label style={{ fontSize:11 }}>Plan name (slug)
              <input value={draft.name} onChange={e => setDraft(d => ({ ...d, name: e.target.value }))} placeholder="weekly-report" style={{ width:'100%', padding:'6px 8px', background:'var(--bg-2)', border:'1px solid var(--border)', borderRadius:6, color:'var(--text-1)' }}/>
            </label>
            <label style={{ fontSize:11 }}>Description
              <input value={draft.description} onChange={e => setDraft(d => ({ ...d, description: e.target.value }))} placeholder="What does this plan do?" style={{ width:'100%', padding:'6px 8px', background:'var(--bg-2)', border:'1px solid var(--border)', borderRadius:6, color:'var(--text-1)' }}/>
            </label>

            <div style={{ fontSize:11, color:'var(--text-2)', marginTop:6, textTransform:'uppercase', letterSpacing:0.5 }}>Steps</div>
            {draft.plan.map((step, i) => (
              <div key={i} style={{ background:'var(--bg-2)', borderRadius:6, padding:10, display:'flex', flexDirection:'column', gap:6 }}>
                <div style={{ display:'flex', gap:6, alignItems:'center' }}>
                  <span style={{ fontSize:10, color:'var(--text-3)', minWidth:20 }}>#{i + 1}</span>
                  <select value={step.persona} onChange={e => setStep(i, { persona: e.target.value })} style={{ flex:1, padding:'4px 6px', background:'var(--bg-1)', border:'1px solid var(--border)', borderRadius:4, color:'var(--text-1)', fontSize:12 }}>
                    {personaIds.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                  <select value={step.depends_on === null ? '' : String(step.depends_on)} onChange={e => setStep(i, { depends_on: e.target.value === '' ? null : Number(e.target.value) })} style={{ width:120, padding:'4px 6px', background:'var(--bg-1)', border:'1px solid var(--border)', borderRadius:4, color:'var(--text-1)', fontSize:11 }} title="Step this one depends on (for output context)">
                    <option value="">no dep</option>
                    {draft.plan.map((_, j) => j !== i ? <option key={j} value={j}>after #{j + 1}</option> : null)}
                  </select>
                  {draft.plan.length > 1 && (
                    <button className="btn-ghost" style={{ fontSize:10, color:'var(--red)' }} onClick={() => removeStep(i)}>✕</button>
                  )}
                </div>
                <textarea value={step.instruction} onChange={e => setStep(i, { instruction: e.target.value })} placeholder="What should this persona do?" rows={2} style={{ width:'100%', padding:'6px 8px', background:'var(--bg-1)', border:'1px solid var(--border)', borderRadius:4, color:'var(--text-1)', fontSize:12, resize:'vertical' }}/>
              </div>
            ))}
            <button className="btn-ghost" style={{ fontSize:11, alignSelf:'flex-start' }} onClick={addStep}>＋ Add Step</button>

            {error && <div style={{ color:'var(--red)', fontSize:12, padding:8, background:'rgba(255,0,0,0.05)', borderRadius:4 }}>{error}</div>}

            <div style={{ display:'flex', gap:8, marginTop:6 }}>
              <button className="btn-primary-task" disabled={busy || !draft.name.trim()} onClick={save}>{busy ? 'Saving…' : 'Save Plan'}</button>
              <button className="btn-ghost" onClick={() => setDraft(blank())}>Reset</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const SendToOrchestra = ({ onStarted }) => {
  const [goal, setGoal] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [authStatus, setAuthStatus] = React.useState(null);
  const [workflows, setWorkflows] = React.useState([]);
  const [workflow, setWorkflow] = React.useState('');
  const [projects, setProjects] = React.useState([]);
  const [projectId, setProjectId] = React.useState('');
  const [provider, setProvider] = React.useState('claude');
  const [showNewProject, setShowNewProject] = React.useState(false);
  const [newProjectName, setNewProjectName] = React.useState('');
  const [showPlanEditor, setShowPlanEditor] = React.useState(false);
  const refreshWorkflows = () => fetch('/api/workflows').then(r => r.json()).then(j => setWorkflows(j.workflows || [])).catch(()=>{});

  const placeholders = [
    'Summarize TikTok trends for 2026...',
    'Write a marketing article about our product...',
    'Research competitor pricing strategies...',
    'Analyze social media engagement data...',
    'Draft a weekly progress report...',
    'Find market opportunities in Southeast Asia...',
    'Create a content calendar for next month...',
    'Generate user personas from analytics...',
  ];
  const [placeholderIdx, setPlaceholderIdx] = React.useState(0);

  React.useEffect(() => {
    const id = setInterval(() => setPlaceholderIdx(i => (i + 1) % placeholders.length), 3000);
    return () => clearInterval(id);
  }, []);

  React.useEffect(() => {
    fetch('/api/auth/status').then(r => r.json()).then(setAuthStatus).catch(()=>{});
    fetch('/api/workflows').then(r => r.json()).then(j => setWorkflows(j.workflows || [])).catch(()=>{});
    fetch('/api/projects').then(r => r.json()).then(j => setProjects(j.projects || [])).catch(()=>{});
    const refresh = () => {
      if (window.AUTH_STATUS) setAuthStatus(window.AUTH_STATUS);
    };
    window.COfficeBus?.addEventListener('refresh', refresh);
    return () => window.COfficeBus?.removeEventListener('refresh', refresh);
  }, []);

  const submit = async () => {
    if (!goal.trim() || busy) return;
    setBusy(true);
    try {
      const r = await fetch('/api/task', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          goal: goal.trim(),
          workflow: workflow || undefined,
          projectId: projectId || undefined,
          provider: provider || undefined,
        }),
      });
      const j = await r.json();
      if (!r.ok) {
        alert(j.error || 'Failed to start run');
      } else {
        setGoal('');
        if (onStarted) onStarted(j.run_id);
        // Pop a real OS-level browser window for the run so the user can
        // monitor the briefing room independently of the main dashboard.
        // Falls back to in-app navigation if the popup is blocked.
        const url = `/run.html?id=${encodeURIComponent(j.run_id)}`;
        const features = `popup=yes,width=${Math.min(1280, screen.availWidth - 80)},height=${Math.min(900, screen.availHeight - 80)},menubar=no,toolbar=no,location=no,status=no`;
        const w = window.open(url, `c-office-run-${j.run_id}`, features);
        if (!w || w.closed || typeof w.closed === 'undefined') {
          // popup blocker tripped — fall back to internal page
          window.dispatchEvent(new CustomEvent('c-office:navigate', {
            detail: { page: 'run-workspace', runId: j.run_id },
          }));
        }
      }
    } finally { setBusy(false); }
  };

  const isProviderConnected = (p) => {
    if (!authStatus) return false;
    if (p === 'claude') return !!authStatus.anthropic?.connected;
    if (p === 'gemini') return !!authStatus.google?.connected;
    if (p === 'codex') return !!authStatus.codex?.connected;
    return false;
  };

  return (
    <div className="task-bar task-bar-premium">
      <div className="task-bar-icon">⚡</div>
      <input
        type="text"
        value={goal}
        onChange={e => setGoal(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') submit(); }}
        disabled={busy}
        placeholder={isProviderConnected(provider) ? placeholders[placeholderIdx] : `Connect ${provider} in Settings first`}
      />
      <select
        value={provider}
        onChange={e => setProvider(e.target.value)}
        disabled={busy}
        title="AI Provider for this run"
        style={{
          background: 'var(--bg-2)', color: 'var(--text-1)',
          border: '1px solid var(--border)', borderRadius: 6,
          padding: '6px 8px', fontSize: 12,
          fontFamily: 'var(--font-mono)',
        }}>
        <option value="claude">Claude</option>
        <option value="gemini">Gemini</option>
        <option value="codex">Codex</option>
      </select>
      <select
        value={projectId}
        onChange={e => {
          if (e.target.value === '__new__') { setShowNewProject(true); return; }
          setProjectId(e.target.value);
        }}
        disabled={busy}
        title="Group runs into a project (scopes the skill library)"
        style={{
          background: 'var(--bg-2)', color: 'var(--text-1)',
          border: '1px solid var(--border)', borderRadius: 6,
          padding: '6px 8px', fontSize: 12,
          fontFamily: 'var(--font-mono)',
        }}>
        <option value="">no project</option>
        {projects.map(p => (
          <option key={p.id} value={p.id}>{p.name}</option>
        ))}
        <option value="__new__">+ new project...</option>
      </select>
      {showNewProject && (
        <span style={{display: 'flex', gap: 4}}>
          <input
            type="text"
            value={newProjectName}
            onChange={e => setNewProjectName(e.target.value)}
            placeholder="project name"
            style={{
              background: 'var(--bg-2)', color: 'var(--text-1)',
              border: '1px solid var(--border)', borderRadius: 6,
              padding: '6px 8px', fontSize: 12, width: 140,
            }}/>
          <button className="btn-ghost" style={{fontSize: 11}} onClick={async () => {
            const name = newProjectName.trim();
            if (!name) return;
            try {
              const r = await fetch('/api/projects', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name }),
              });
              const j = await r.json();
              if (r.ok && j.project) {
                setProjects(prev => [j.project, ...prev]);
                setProjectId(j.project.id);
                setNewProjectName('');
                setShowNewProject(false);
              } else {
                alert(j.error || 'Failed to create project');
              }
            } catch (err) { alert(err.message); }
          }}>create</button>
          <button className="btn-ghost" style={{fontSize: 11}} onClick={() => {
            setShowNewProject(false); setNewProjectName('');
          }}>cancel</button>
        </span>
      )}
      {workflows.length > 0 && (
        <select
          value={workflow}
          onChange={e => setWorkflow(e.target.value)}
          disabled={busy}
          title={workflow ? workflows.find(w => w.name === workflow)?.description : 'Auto-plan (LLM decomposes goal)'}
          style={{
            background: 'var(--bg-2)', color: 'var(--text-1)',
            border: '1px solid var(--border)', borderRadius: 6,
            padding: '6px 8px', fontSize: 12,
            fontFamily: 'var(--font-mono)',
          }}>
          <option value="">auto-plan</option>
          {workflows.map(w => (
            <option key={w.name} value={w.name}>{w.builtIn ? '🔒' : '✏️'} {w.name} ({w.steps})</option>
          ))}
        </select>
      )}
      <button className="btn-ghost" style={{ fontSize: 11, padding: '6px 10px' }} onClick={() => setShowPlanEditor(true)} title="Create or edit a custom plan">⚙ Plans</button>
      {showPlanEditor && (
        <PlanEditor
          workflows={workflows}
          onClose={() => setShowPlanEditor(false)}
          onSaved={() => { refreshWorkflows(); }}
        />
      )}
      <button className="btn-primary-task"
        onClick={submit} disabled={busy || !goal.trim() || !isProviderConnected(provider)}>
        {busy ? 'Sending...' : 'Send'}
      </button>
    </div>
  );
};

// StepCard: A standalone component for each agent's turn
const StepCard = ({ card, active, copiedKey, copy }) => {
  const agent = (window.AGENTS || []).find((a) => a.id === card.plan.persona);
  const status = !card.step ? 'pending'
    : card.step.result?.ok ? 'done'
    : card.step.result ? 'failed' : 'running';
  
  const statusColor = {
    pending: 'var(--text-4)',
    running: 'var(--gold)',
    done: 'var(--green)',
    failed: 'var(--red)',
  }[status];

  const output = card.step?.result?.text || card.step?.result?.error || '';
  const image = card.step?.result?.image;

  // Helper to extract [📸 ...] tags and return clean text + tags
  const parseOutput = (str) => {
    const tags = [];
    const clean = str.replace(/\[📸\s*([^\]]+)\]/g, (match, p1) => {
      tags.push(p1.trim());
      return '';
    });
    return { clean: clean.trim(), tags };
  };

  const { clean, tags } = parseOutput(output);

  return (
    <div className={`step-card ${active ? 'is-active' : ''}`} style={{
      border: active ? '2px solid var(--gold)' : '1px solid var(--border)',
      borderRadius: 12,
      background: 'var(--bg-2)',
      boxShadow: active ? '0 0 20px rgba(255, 191, 0, 0.2)' : '0 4px 12px rgba(0,0,0,0.1)',
      overflow: 'hidden',
      transition: 'all 0.3s ease',
      transform: active ? 'scale(1.02)' : 'none',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '12px 16px',
        background: active ? 'rgba(255,191,0,0.05)' : 'rgba(255,255,255,0.03)',
        borderBottom: '1px solid var(--border)',
      }}>
        <AgentDot agent={agent} size={36}/>
        <div style={{flex: 1}}>
          <div style={{fontSize: 14, fontWeight: 700, display:'flex', alignItems:'center', gap:8}}>
            {agent?.name || card.plan.persona}
            <span style={{fontSize: 10, padding: '2px 6px', borderRadius: 4, background: statusColor, color: 'var(--bg-0)', textTransform: 'uppercase', fontWeight: 600}}>
              {status}
            </span>
            {active && <span className="pulse-text" style={{color: 'var(--gold)', fontSize: 10, fontWeight: 700}}>ACTIVE TURN ◀</span>}
          </div>
          {/* Step instruction intentionally hidden — it duplicates the goal
              and clutters the deck. Users see the result; they don't need
              to re-read the assignment text on every card. */}
        </div>
      </div>
      <div style={{padding: 16, background: active ? 'var(--bg-2)' : 'var(--bg-1)'}}>
        {card.step ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* Actual Generated Image Box */}
            {image && (
              <div style={{
                background: 'var(--bg-0)', border: '1px solid var(--border)',
                borderRadius: 12, padding: 8, textAlign: 'center'
              }}>
                <img src={image.url} alt="Generated" style={{ maxWidth: '100%', borderRadius: 8, display:'block', margin: '0 auto', maxHeight: 500 }} />
                <div style={{ fontSize: 10, color: 'var(--text-4)', marginTop: 8, fontFamily: 'var(--font-mono)' }}>
                  {image.model} via {image.provider}
                </div>
              </div>
            )}

            {/* Text Content */}
            {clean && (
              <div style={{
                fontSize: 14, lineHeight: 1.6,
                color: status === 'failed' ? 'var(--red)' : 'var(--text-1)',
                whiteSpace: 'pre-wrap',
              }}>
                 {clean}
              </div>
            )}

            {/* Visual Prompt Suggestions (Tags) */}
            {tags.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
                {tags.map((tag, i) => (
                  <div key={i} style={{ 
                    background: 'rgba(0, 240, 255, 0.05)', border: '1px solid rgba(0, 240, 255, 0.15)',
                    borderRadius: 8, padding: '10px 14px', fontSize: 12, color: 'var(--accent-cyan)'
                  }}>
                    <div style={{ fontWeight: 600, fontSize: 10, textTransform: 'uppercase', marginBottom: 4, opacity: 0.8 }}>🎨 Visual Prompt Suggestion</div>
                    {tag}
                  </div>
                ))}
              </div>
            )}

            {!output && !image && (
              <div style={{padding: 20, textAlign:'center'}}>
                <div className="loader-dots"><span>Agent is working</span></div>
              </div>
            )}
          </div>
        ) : (
          <div style={{color: 'var(--text-4)', fontStyle: 'italic', fontSize: 13, textAlign: 'center', padding: '10px 0'}}>
            Waiting for previous tasks...
          </div>
        )}
      </div>
      {card.step && output && (
        <div style={{padding: '8px 16px', background: 'var(--bg-2)', borderTop: '1px solid var(--border)', display:'flex', justifyContent:'flex-end'}}>
          <button className="btn-ghost" style={{fontSize: 11}} onClick={() => copy(output, `step-${card.idx}`)}>
            {copiedKey === `step-${card.idx}` ? '✓ Copied' : '📋 Copy All'}
          </button>
        </div>
      )}
    </div>
  );
};

const TeamTimeline = ({ forceRunId }) => {
  const [runs, setRuns] = React.useState(window.RUNS || []);
  const [scratchOpen, setScratchOpen] = React.useState(false);
  const [copiedKey, setCopiedKey] = React.useState(null);
  const [cancelling, setCancelling] = React.useState(false);
  const [chatBackText, setChatBackText] = React.useState('');
  const [chatting, setChatting] = React.useState(false);

  React.useEffect(() => {
    const refresh = () => setRuns(window.RUNS || []);
    window.COfficeBus?.addEventListener('refresh', refresh);
    return () => window.COfficeBus?.removeEventListener('refresh', refresh);
  }, []);

  const run = forceRunId ? runs.find(r => r.id === forceRunId) : (runs.find(r => r.status === 'running') || runs[0]);

  const copy = async (text, key) => {
    try { await navigator.clipboard.writeText(text); }
    catch { window.prompt('Copy', text); }
    setCopiedKey(key);
    setTimeout(() => setCopiedKey((k) => (k === key ? null : k)), 1400);
  };

  const cancelRun = async () => {
    if (!run || cancelling) return;
    if (!window.confirm('Cancel this run? In-flight steps finish; remaining steps are skipped.')) return;
    setCancelling(true);
    try {
      await fetch(`/api/task/${run.id}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'user-cancelled' }),
      });
    } finally {
      setTimeout(() => setCancelling(false), 1500);
    }
  };

  const openInNotes = () => {
    if (!run) return;
    window.dispatchEvent(new CustomEvent('c-office:navigate', {
      detail: { page: 'notes', preset: { title: run.goal, body: run.final || '' } },
    }));
  };

  const sendChatBack = async () => {
    if (!run || !chatBackText.trim()) return;
    setChatting(true);
    try {
      const res = await fetch(`/api/task/${run.id}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: chatBackText.trim() }),
      });
      if (!res.ok) {
        const j = await res.json();
        alert(j.error || 'Failed to send chat');
      } else {
        setChatBackText('');
      }
    } catch (e) { alert(e.message); }
    finally { setChatting(false); }
  };

  if (!run) return null;

  const isLive = run.status === 'running' || run.status === 'awaiting-approval';
  const isClarifying = run.phase === 'clarify';

  const phaseLabel = {
    plan: 'Boss Review',
    clarify: 'Clarification Needed',
    execute: 'Production',
    critique: 'Quality Audit',
    verify: 'Verification',
    done: 'Finished',
  }[run.phase || 'execute'] || (isLive ? 'Working' : 'Done');

  const phaseColor = run.status === 'failed' ? 'var(--red)' : run.status === 'done' ? 'var(--green)' : 'var(--gold)';

  const plan = Array.isArray(run.plan) ? run.plan : [];
  const scratch = Array.isArray(run.scratchpad) ? run.scratchpad : [];

  const sevColor = (sev) => {
    const s = String(sev || 'none').toLowerCase();
    if (s === 'critical') return 'var(--red)';
    if (s === 'high') return '#e85d04';
    if (s === 'med') return 'var(--gold)';
    if (s === 'low') return 'var(--text-3)';
    return 'var(--green)';
  };
  
  const bossAnalysis = [...scratch].reverse().find(s => s.kind === 'analysis')?.text;

  // Build per-persona step cards: align plan entries with executed steps.
  // Match by index — plan and steps are pushed in the same order in both
  // the static-plan path (executeRun iterates plan in order) and team-flow
  // (planLive.push happens immediately before executeStep). Matching by
  // instruction string is fragile because setRunPlan truncates to 320 chars
  // while stepRun truncates to 220, so long Orchestra-authored instructions
  // never compare equal and every card stays "pending".
  const stepsArr = Array.isArray(run.steps) ? run.steps : [];
  const cards = plan.map((p, i) => {
    const candidate = stepsArr[i];
    let matched = candidate && candidate.persona === p.persona ? candidate : null;
    if (!matched) {
      // Fallback: same persona at any later index (handles rare reordering).
      matched = stepsArr.find((s, j) => j >= i && s.persona === p.persona) || null;
    }
    return { idx: i, plan: p, step: matched };
  });

  const activeStepIdx = cards.findIndex(c => !c.step || !c.step.result?.ok);

  return (
    <div className="panel" style={{ marginBottom: 14, padding: 0, border: '1px solid var(--border)', background: 'var(--bg-1)' }}>
      {/* Header bar */}
      <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', background: 'linear-gradient(180deg, var(--bg-1), var(--bg-0))' }}>
        <div style={{display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap'}}>
          <div style={{flex: 1, minWidth: 240}}>
            <div style={{display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6, flexWrap: 'wrap'}}>
              <span style={{color: phaseColor, fontSize: 14}}>{isLive ? '●' : run.status === 'failed' ? '✕' : '✓'}</span>
              <h3 style={{margin: 0, fontSize: 14}}>{phaseLabel}</h3>
              {run.revisions > 0 && <span className="chip" style={{fontSize: 10}}>rev {run.revisions}</span>}
            </div>
            <div style={{fontSize: 13, color: 'var(--text-1)', fontWeight: 600}}>{run.goal}</div>
          </div>
          <div style={{display:'flex', gap:6}}>
            {isLive && (
              <button onClick={cancelRun} disabled={cancelling || run.cancelRequested} style={{ fontSize: 11, padding: '6px 12px', border: '1px solid var(--red)', borderRadius: 6, background: 'transparent', color: 'var(--red)', cursor: (cancelling || run.cancelRequested) ? 'not-allowed' : 'pointer' }}>
                {run.cancelRequested ? 'cancelling…' : '⏹ Cancel'}
              </button>
            )}
            <a href={`/api/task/${run.id}/trace`} target="_blank" rel="noreferrer" className="btn-ghost" style={{fontSize: 11, padding: '6px 10px', textDecoration:'none'}}>↗ Trace</a>
          </div>
        </div>
        {/* Aggregate progress bar — phase + step counter */}
        {(() => {
          const p = run.progress || {};
          const percent = typeof p.percent === 'number' ? p.percent : (run.status === 'done' ? 100 : 0);
          const label = p.label || run.phase || run.status || '';
          const barColor = run.status === 'failed' ? 'var(--red)' : run.status === 'done' ? 'var(--green)' : 'var(--accent-cyan)';
          return (
            <div style={{ marginTop: 10 }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', fontSize: 11, color: 'var(--text-2)', marginBottom: 4 }}>
                <span>{label}</span>
                <span style={{ fontVariantNumeric:'tabular-nums', color: barColor }}>{percent}%</span>
              </div>
              <div style={{ height: 6, borderRadius: 999, background: 'var(--bg-2)', overflow: 'hidden', position: 'relative' }}>
                <div style={{
                  width: `${percent}%`,
                  height: '100%',
                  background: `linear-gradient(90deg, ${barColor}, ${barColor}aa)`,
                  transition: 'width 0.4s ease',
                  boxShadow: isLive ? `0 0 8px ${barColor}` : 'none',
                }}/>
                {isLive && percent < 100 && (
                  <div style={{
                    position:'absolute', top:0, bottom:0, left:0, right:0,
                    background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.18) 50%, transparent 100%)',
                    backgroundSize: '200% 100%',
                    animation: 'cofficeProgressShimmer 1.6s linear infinite',
                  }}/>
                )}
              </div>
            </div>
          );
        })()}
      </div>

      <div style={{padding: 16, display: 'flex', flexDirection: 'column', gap: 16}}>
        {/* BossDesk Card (Initial Analysis) */}
        {bossAnalysis && (
          <div style={{
            background: isClarifying ? 'rgba(255, 60, 0, 0.05)' : 'rgba(0, 240, 255, 0.05)',
            border: `1px solid ${isClarifying ? 'var(--red)' : 'var(--accent-cyan)'}`,
            borderRadius: 12, padding: 16, boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
          }}>
            <div style={{fontWeight: 700, fontSize: 14, color: isClarifying ? 'var(--red)' : 'var(--accent-cyan)', marginBottom: 8, display:'flex', alignItems:'center', gap:8}}>
              <span>{isClarifying ? '❓' : '👔'}</span> {isClarifying ? 'Boss needs clarification' : 'Boss Analysis'}
            </div>
            <div style={{fontSize: 14, lineHeight: 1.6, color: 'var(--text-1)'}}>
              {bossAnalysis}
            </div>
          </div>
        )}

        {/* Turn Cards — full live view while run is in flight; collapsed
            once the run is done (the Final Deliverable card below already
            presents the same content in editorial form). */}
        {(isLive || !run.final) && cards.map((card, i) => (
          <StepCard
            key={i}
            card={card}
            active={isLive && !isClarifying && i === activeStepIdx}
            copiedKey={copiedKey}
            copy={copy}
          />
        ))}
        {!isLive && run.final && cards.length > 0 && (
          <details style={{ background: 'var(--bg-2)', borderRadius: 10, padding: '8px 14px', border: '1px dashed var(--border)' }}>
            <summary style={{ cursor: 'pointer', fontSize: 11, fontFamily: 'var(--font-mono)', letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--text-3)' }}>
              ▸ Step-by-step view ({cards.length})
            </summary>
            <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
              {cards.map((card, i) => (
                <StepCard
                  key={i}
                  card={card}
                  active={false}
                  copiedKey={copiedKey}
                  copy={copy}
                />
              ))}
            </div>
          </details>
        )}

        {/* Final deliverable — categorized into Post-ready / Images / Research */}
        {run.final && (
          <FinalDeliverable run={run} copy={copy} copiedKey={copiedKey} openInNotes={openInNotes}/>
        )}

        {/* Chat Back / Interaction Box */}
        <div style={{ marginTop: 8, padding: 16, background: 'var(--bg-2)', borderRadius: 12, border: isClarifying ? '2px solid var(--gold)' : '1px dashed var(--border)' }}>
          <div style={{fontWeight: 600, fontSize: 13, marginBottom: 12, color: 'var(--accent-cyan)'}}>
            {isClarifying ? '👉 ตอบกลับคำถามของหัวหน้า:' : '💬 คุยต่อ/สั่งงานเพิ่ม:'}
          </div>
          <div style={{display:'flex', gap:10}}>
            <textarea 
              value={chatBackText}
              onChange={e => setChatBackText(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChatBack(); } }}
              placeholder={isClarifying ? "พิมพ์คำตอบของคุณที่นี่..." : "ต้องการให้แก้ไขหรือทำอะไรต่อ..."}
              disabled={chatting}
              style={{ flex: 1, height: 70, padding: 12, borderRadius: 8, background: 'var(--bg-0)', color: 'var(--text-1)', border: '1px solid var(--border)', fontSize: 13, resize: 'none' }}
            />
            <button className="btn gold" onClick={sendChatBack} disabled={chatting || !chatBackText.trim()} style={{width: 80, fontWeight: 700}}>ส่ง</button>
          </div>
        </div>
      </div>
    </div>
  );
};

const Dashboard = ({ layout, setLayout, onOpenAgent }) => {
  const agents = Array.isArray(window.AGENTS) ? window.AGENTS : [];
  const runs = Array.isArray(window.RUNS) ? window.RUNS : [];
  const [selectedRunId, setSelectedRunId] = React.useState(null);
  
  const activity = Array.isArray(window.ACTIVITY) ? window.ACTIVITY : [];
  const sessions = Array.isArray(window.STATE_SESSIONS) ? window.STATE_SESSIONS : [];
  const tasks = Array.isArray(window.TASKS) ? window.TASKS : [];
  const dispatches = Array.isArray(window.DISPATCHES) ? window.DISPATCHES : [];
  const stats = window.STATS || {};
  const totalTokens = stats.tokensToday || 0;
  const totalCost = (stats.spendToday || 0).toFixed(2);
  const activeTasks = stats.tasksRunning || 0;
  const agentsOnline = stats.agentsOnline || 0;
  const providerStatus = window.AUTH_STATUS || {};
  const providers = [
    { key: 'anthropic', label: 'Anthropic' },
    { key: 'codex', label: 'Codex CLI' },
    { key: 'google', label: 'Google' },
    // OpenAI Images row hidden by request — image generation is routed
    // through Codex CLI / Gemini in this build, so the bare OpenAI key
    // status was just noise on the dashboard.
  ];
  const recentRuns = runs.slice(0, 10);
  const timeline = activity.slice(-8).reverse();
  const runningNow = runs.filter(r => r?.status === 'running').length;
  const pendingTasks = tasks.filter(t => t?.status !== 'done' && t?.status !== 'completed').length;

  return (
    <div>
      <div className="topbar">
        <div>
          <h1>Sim Office <span className="accent">Operations Workfloor</span></h1>
          <div className="mono-s">Office floor control tower</div>
          <div className="sub">Control tower · {agentsOnline} online · {runningNow} live runs · {sessions.filter(s => !s?.endedAt).length} active sessions</div>
        </div>
        <div className="topbar-actions"><span className="chip"><span className="dot"/> Live</span></div>
      </div>
      <SendToOrchestra onStarted={(id) => setSelectedRunId(id)}/>
      
      <div className="grid dashboard-grid" style={{marginBottom: 14}}>
        <div className="panel"><div className="panel-head"><h3>Gateway & Provider Health</h3></div>{providers.map(p => <div key={p.key} className="feed-row" style={{cursor:'default'}}><div style={{width:8,height:8,borderRadius:'50%',background:providerStatus?.[p.key]?.connected ? 'var(--green)' : 'var(--red)'}}/><div style={{fontSize:12}}><b>{p.label}</b> <span className="mono-s" style={{color:'var(--text-3)'}}>{providerStatus?.[p.key]?.connected ? (providerStatus?.[p.key]?.mode || 'connected') : 'disconnected'}</span></div></div>)}</div>
        <div className="panel"><div className="panel-head"><h3>Model / Session / Task Summary</h3></div><div className="mono-s">{agents.length} agents · {sessions.length} sessions · {pendingTasks} open tasks · {dispatches.length} dispatches</div></div>
      </div>

      <TeamTimeline forceRunId={selectedRunId}/>

      <div className="stats-strip">
        <div className="stat-card"><div className="stat-icon tokens">🔥</div><div><div className="stat-value">{totalTokens.toLocaleString()}</div><div className="stat-label">Tokens today</div></div></div>
        <div className="stat-card"><div className="stat-icon tasks">📋</div><div><div className="stat-value">{activeTasks}</div><div className="stat-label">Running tasks</div></div></div>
        <div className="stat-card"><div className="stat-icon agents">👥</div><div><div className="stat-value">{agentsOnline}</div><div className="stat-label">Agents online</div></div></div>
        <div className="stat-card"><div className="stat-icon spend">💰</div><div><div className="stat-value">${totalCost}</div><div className="stat-label">Spend today</div></div></div>
      </div>
      <div style={{marginBottom: 18}}><AgentWorkspace onOpenAgent={onOpenAgent}/></div>
      <div className="grid dashboard-grid">
        <div className="panel">
          <div className="panel-head"><h3>Recent Run History</h3><div className="right">Click to view context</div></div>
          {recentRuns.length === 0 ? <div className="muted" style={{fontSize:12}}>No runs yet.</div> : recentRuns.map((r, i) => (
            <div key={r?.id || i}
              className={'feed-row ' + (selectedRunId === r?.id ? 'is-selected' : '')}
              onClick={() => setSelectedRunId(r?.id)}
              style={{cursor:'pointer', borderLeft: selectedRunId === r?.id ? '4px solid var(--gold)' : 'none', background: selectedRunId === r?.id ? 'rgba(255,191,0,0.05)' : 'transparent'}}>
              <div className="mono-s" style={{width:56, color:'var(--text-4)'}}>{relTime(r?.startedAt || r?.createdAt)}</div>
              <div style={{flex:1, minWidth:0}}>
                <b style={{fontSize:12}}>{(r?.goal || 'Untitled run').slice(0, 64)}</b>
                <div className="mono-s" style={{color: r?.status === 'failed' ? 'var(--red)' : 'var(--text-3)'}}>{r?.phase || r?.status || 'queued'}</div>
              </div>
              <button
                title="Open in new window"
                className="btn-ghost"
                style={{ fontSize: 11, padding: '4px 8px' }}
                onClick={(e) => {
                  e.stopPropagation();
                  if (!r?.id) return;
                  const url = `/run.html?id=${encodeURIComponent(r.id)}`;
                  const features = `popup=yes,width=${Math.min(1280, screen.availWidth - 80)},height=${Math.min(900, screen.availHeight - 80)}`;
                  window.open(url, `c-office-run-${r.id}`, features);
                }}>↗</button>
            </div>
          ))}
        </div>
        <div className="panel">
          <div className="panel-head"><h3>Live Activity</h3><div className="right"><span className="chip" style={{padding:'3px 8px', fontSize:10}}><span className="dot"/> real-time</span></div></div>
          <div style={{display:'flex', flexDirection:'column', gap:2, maxHeight:460, overflowY:'auto'}}>
            {(() => {
              const visible = activity.filter(r => !(r.verb === 'turn-end' || (r.verb === 'spoke' && !(r.text || '').trim()) || (r.verb === 'result' && r.status !== 'err' && !(r.text || '').trim())));
              if (visible.length === 0) return <div className="muted" style={{padding:'30px 12px', fontSize:12, textAlign:'center'}}>Waiting for activity...</div>;
              return visible.map((row, i) => {
                const personaId = row.personaId || row.agent;
                const agent = agents.find(a => a.id === personaId);
                const statusColor = row.status === 'ok' ? 'var(--green)' : row.status === 'warn' ? 'var(--gold)' : 'var(--red)';
                const tokens = row.tokens ?? ((row.usage?.input_tokens||0)+(row.usage?.output_tokens||0));
                return <div key={row.id || i} className="feed-row" onClick={() => agent && onOpenAgent(agent.id)}><div className="mono-s" style={{width:56, color:'var(--text-4)'}}>{relTime(row.ts || row.t)}</div><AgentDot agent={agent} size={28}/><div style={{flex:1, minWidth:0}}><div style={{display:'flex', gap:6, alignItems:'baseline', flexWrap:'wrap'}}><b style={{fontSize:13}}>{agent ? agent.name : (personaId || '—')}</b><span style={{color:'var(--text-3)', fontSize:12}}>{row.verb}{row.toolName ? ` · ${row.toolName}` : ''}</span></div><div style={{fontSize:12, color:'var(--text-2)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{row.text}</div></div><div style={{display:'flex', alignItems:'center', gap:8}}>{tokens > 0 && <span className="mono-s" style={{color:'var(--text-3)'}}>{tokens.toLocaleString()} tok</span>}<span style={{width:6, height:6, borderRadius:'50%', background: statusColor, boxShadow:`0 0 8px ${statusColor}`}}/></div></div>;
              });
            })()}
          </div>
        </div>
        <div className="panel dashboard-grid-wide"><div className="panel-head"><h3>Agent Collaboration</h3><div className="right">last 1h</div></div><CollabGraph onOpenAgent={onOpenAgent}/></div>
      </div>
    </div>
  );
};

/* ===== SIM OFFICE FLOOR — dashboard workstation view ===== */
const AgentWorkspace = ({ onOpenAgent }) => {
  const agents = Array.isArray(window.AGENTS) ? window.AGENTS : [];
  const statusRank = { busy: 0, active: 1, idle: 2, offline: 3 };

  const sorted = React.useMemo(() => {
    return [...agents].sort((a, b) => {
      const sa = statusRank[a.status] ?? 9;
      const sb = statusRank[b.status] ?? 9;
      if (sa !== sb) return sa - sb;
      return (a.name || '').localeCompare(b.name || '');
    });
  }, [agents]);

  const working = agents.filter(a => a.status === 'busy' || a.status === 'active').length;

  return (
    <div className="agent-office-page dashboard-office-floor">
      <div className="agent-office-hero dashboard-office-hero">
        <div>
          <div className="mono-s">SIM OFFICE CONTROL</div>
          <h2>C-Office <span className="accent">Workfloor</span></h2>
          <p>ห้องทำงานรวมของทีม AI: แต่ละ agent มีโต๊ะ จอ คิวงาน สถานะ online/working และ workload ที่เปลี่ยนตามงานจริง</p>
        </div>
        <div className="agent-office-stats">
          <span><b>{agents.length}</b> staff</span>
          <span><b>{working}</b> active desks</span>
          <span><b>{agents.filter(a => a.status === 'idle').length}</b> standby</span>
        </div>
      </div>

      <section className="agent-party-stage dashboard-office-stage">
        <div className="office-room-backdrop">
          <span className="room-window"/>
          <span className="room-light one"/>
          <span className="room-light two"/>
          <span className="office-wall-board"/>
          <span className="office-coffee-bar"/>
          <span className="room-floor-grid"/>
        </div>
      <div className="panel-head">
        <h3>Office Floor
          <span style={{color:'var(--text-3)', fontWeight:400, fontSize:11, marginLeft:8, fontFamily:'var(--font-mono)', letterSpacing:'0.1em'}}>
            · {agents.length} DESKS
          </span>
        </h3>
        <div className="right">
          <span className="chip" style={{padding:'3px 8px', fontSize:10}}>
            <span className="dot"/> {working} working
          </span>
        </div>
      </div>

        <div className="agent-party-lineup dashboard-office-lineup">
          {sorted.map(a => (
            <AgentModelUnit
              key={a.id}
              agent={a}
              selected={a.status === 'busy' || a.status === 'active'}
              onSelect={() => onOpenAgent(a.id)}
              onOpenAgent={onOpenAgent}
            />
          ))}
        </div>
      </section>
    </div>
  );
};

/* simple force-less collab graph */
const CollabGraph = ({ onOpenAgent }) => {
  const agents = Array.isArray(window.AGENTS) ? window.AGENTS : [];
  const radius = 140;
  const center = { x: 260, y: 160 };
  const positions = agents.map((a, i) => {
    const ang = (i / Math.max(agents.length, 1)) * Math.PI * 2 - Math.PI/2;
    return { ...a, x: center.x + Math.cos(ang)*radius, y: center.y + Math.sin(ang)*radius };
  });
  const edges = (window.STATE_EDGES && window.STATE_EDGES.length > 0)
    ? window.STATE_EDGES
    : [];
  return (
    <svg viewBox="0 0 520 320" width="100%" height="340" style={{display:'block'}}>
      <defs>
        <linearGradient id="edge" x1="0" x2="1"><stop offset="0" stopColor="#FF6B6B" stopOpacity="0.5"/><stop offset="1" stopColor="#4ECDC4" stopOpacity="0.25"/></linearGradient>
      </defs>
      {edges.map(([a,b],i) => {
        const A = positions.find(p => p.id === a), B = positions.find(p => p.id === b);
        if (!A || !B) return null;
        return <line key={i} x1={A.x} y1={A.y} x2={B.x} y2={B.y} stroke="url(#edge)" strokeWidth="1.5" opacity="0.6"/>;
      })}
      {positions.map(p => (
        <g key={p.id} style={{cursor:'pointer'}} onClick={() => onOpenAgent(p.id)}>
          <circle cx={p.x} cy={p.y} r="22" fill="#FF6B6B" opacity="0.1"/>
          <circle cx={p.x} cy={p.y} r="18" fill="var(--bg-2)" stroke="#4ECDC4" strokeWidth="1.5"/>
          <text x={p.x} y={p.y} textAnchor="middle" dominantBaseline="central" style={{fontFamily:'var(--font-display)', fontSize: 11, fontWeight:700, fill:'#fff'}}>{p.avatarInitials}</text>
          <text x={p.x} y={p.y+34} textAnchor="middle" style={{fontFamily:'var(--font-mono)', fontSize: 9, letterSpacing:'0.1em', fill: 'var(--text-3)', textTransform:'uppercase'}}>{p.name}</text>
        </g>
      ))}
    </svg>
  );
};

/* Keep CommandCenter and KPI for legacy compatibility */
const CommandCenter = ({ onOpenAgent }) => {
  window.useCOfficeRefresh();
  const [prompt, setPrompt] = React.useState('');
  const [provider, setProvider] = React.useState('claude');
  const [personaId, setPersonaId] = React.useState('orchestra');
  const [selectedId, setSelectedId] = React.useState(null);
  const [chatText, setChatText] = React.useState('');
  const [copied, setCopied] = React.useState('');

  const dispatches = window.DISPATCHES || [];
  const selected = dispatches.find(d => d.id === selectedId) || dispatches[0] || null;
  const activeAgent = AGENTS.find(a => a.id === (selected?.personaId || personaId)) || AGENTS[0];
  const draftAgent = AGENTS.find(a => a.id === personaId) || AGENTS[0];
  const draftCommand = providerCommand(provider, draftAgent, prompt);
  const selectedCommand = selected ? providerCommand(selected.provider, activeAgent, selected.prompt) : '';

  React.useEffect(() => {
    if (!selectedId && dispatches[0]) setSelectedId(dispatches[0].id);
  }, [dispatches.length, selectedId]);

  const submitDispatch = async () => {
    const body = prompt.trim();
    if (!body) return;
    const res = await fetch('/api/dispatches', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ prompt: body, provider, personaId, status: 'queued' }),
    });
    const created = await res.json();
    setPrompt('');
    if (created?.id) setSelectedId(created.id);
  };

  const updateSelected = async (patch) => {
    if (!selected) return;
    await fetch(`/api/dispatches/${selected.id}`, {
      method: 'PATCH',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(patch),
    });
  };

  const sendChat = async () => {
    if (!selected || !chatText.trim()) return;
    const messages = [
      ...(selected.messages || []),
      { role: 'pilot', text: chatText.trim(), ts: Date.now() },
    ];
    setChatText('');
    window.COfficeApplyDispatch?.({ ...selected, messages, status: 'chatting', updatedAt: Date.now() });
    await updateSelected({ messages, status: 'chatting' });
  };

  const copyCommand = async (cmd, key) => {
    await writeClipboard(cmd);
    setCopied(key);
    setTimeout(() => setCopied(''), 1200);
  };

  return (
    <div className="panel command-center">
      <div className="panel-head">
        <h3>Command Center</h3>
        <div className="right">notes → agent → cli</div>
      </div>
      <div className="cmd-grid">
        <div className="cmd-compose">
          <div className="mono-s">MISSION NOTE</div>
          <textarea
            className="cmd-textarea"
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            placeholder="จดสิ่งที่อยากให้เอเจนท์ทำ..."
          />
          <div className="cmd-controls">
            <select className="cmd-select" value={personaId} onChange={e => setPersonaId(e.target.value)}>
              {AGENTS.map(a => <option key={a.id} value={a.id}>{a.name} · {a.role}</option>)}
            </select>
            <select className="cmd-select" value={provider} onChange={e => setProvider(e.target.value)}>
              {CLI_PROVIDERS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
          </div>
          <div className="cmd-preview">
            <span>{draftCommand}</span>
            <button className="btn ghost" onClick={() => copyCommand(draftCommand, 'draft')} disabled={!prompt.trim()}>
              {copied === 'draft' ? 'Copied' : 'Copy'}
            </button>
          </div>
          <button className="btn primary" onClick={submitDispatch} disabled={!prompt.trim()}>Queue Mission</button>
        </div>

        <div className="cmd-notes">
          <div className="mono-s">CLICK A NOTE TO TALK</div>
          <div className="cmd-note-list">
            {dispatches.length === 0 && (
              <div className="muted" style={{fontSize:12, padding:'18px 0'}}>No mission notes yet.</div>
            )}
            {dispatches.slice(0, 8).map(d => {
              const ag = AGENTS.find(a => a.id === d.personaId);
              return (
                <div key={d.id} className={'cmd-note ' + (selected?.id === d.id ? 'is-selected' : '')} onClick={() => setSelectedId(d.id)}>
                  <AgentDot agent={ag} size={30}/>
                  <div style={{flex:1, minWidth:0}}>
                    <div className="cmd-note-title">{d.title}</div>
                    <div className="mono-s">{d.provider} · {d.status} · {relTime(d.updatedAt)}</div>
                  </div>
                  <span className="badge cyan">{(d.messages || []).length}</span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="cmd-chat">
          <div className="cmd-chat-head">
            <div>
              <div className="mono-s">SELECTED AGENT</div>
              <div className="row" style={{gap:8, marginTop:6, cursor:'pointer'}} onClick={() => activeAgent && onOpenAgent(activeAgent.id)}>
                <AgentDot agent={activeAgent} size={28}/>
                <b>{activeAgent?.name || '—'}</b>
              </div>
            </div>
            {selected && <button className="btn gold" onClick={() => updateSelected({status: 'done'})}>Mark Done</button>}
          </div>
          {selected ? (
            <>
              <div className="cmd-messages">
                <div className="cmd-message cmd-message-mission">
                  <strong>Mission</strong>
                  <span>{selected.prompt}</span>
                  <em>{relTime(selected.createdAt)}</em>
                </div>
                {(selected.messages || []).length === 0 && <div className="muted" style={{fontSize:12}}>Start a short handoff chat for this note.</div>}
                {(selected.messages || []).map((m, i) => (
                  <div key={i} className="cmd-message">
                    <strong>{m.role || 'pilot'}</strong>
                    <span>{m.text}</span>
                    <em>{relTime(m.ts)}</em>
                  </div>
                ))}
              </div>
              <div className="cmd-preview">
                <span>{selectedCommand}</span>
                <button className="btn ghost" onClick={() => copyCommand(selectedCommand, selected.id)}>
                  {copied === selected.id ? 'Copied' : 'Copy'}
                </button>
              </div>
              <div className="cmd-chat-input">
                <input value={chatText} onChange={e => setChatText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') sendChat(); }} placeholder="คุยต่อกับเอเจนท์จากโน้ตนี้..." />
                <button className="btn" onClick={sendChat}>Send</button>
              </div>
            </>
          ) : (
            <div className="muted" style={{fontSize:12}}>Create or select a note to start.</div>
          )}
        </div>
      </div>
    </div>
  );
};

const KPI = ({ label, value, delta, spark, color }) => (
  <div className="panel" style={{padding: 16}}>
    <div className="mono-s" style={{marginBottom: 6}}>{label}</div>
    <div style={{display:'flex', alignItems:'baseline', gap:8, justifyContent:'space-between'}}>
      <div style={{fontFamily:'var(--font-display)', fontSize: 26, fontWeight: 700}}>{value}</div>
      <div style={{fontFamily:'var(--font-mono)', fontSize:11, color:'var(--text-3)'}}>{delta}</div>
    </div>
    <div style={{marginTop: 8}}><Sparkline data={spark} color={color} h={28}/></div>
  </div>
);

// Dedicated full-page workspace for a single run. The Dashboard's inline
// TeamTimeline gives a cramped overview; this page lets the user see the
// briefing room — goal + Boss + per-step lanes — at full width with extra
// affordances like inline comment-while-running on each step.
const RunWorkspacePage = ({ runId, onBack }) => {
  window.useCOfficeRefresh?.();
  const runs = window.RUNS || [];
  const [comment, setComment] = React.useState('');
  const [stepIdx, setStepIdx] = React.useState(null);
  const [posting, setPosting] = React.useState(false);
  const run = runs.find(r => r.id === runId) || runs.find(r => r.status === 'running') || runs[0];

  const sendComment = async () => {
    if (!run || !comment.trim()) return;
    setPosting(true);
    try {
      const r = await fetch(`/api/task/${run.id}/comment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stepIdx, text: comment.trim() }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'comment failed');
      setComment('');
      setStepIdx(null);
    } catch (e) {
      alert(e.message);
    } finally {
      setPosting(false);
    }
  };

  const plan = Array.isArray(run?.plan) ? run.plan : [];

  return (
    <div>
      <div className="topbar">
        <div>
          <button className="btn-ghost" onClick={onBack} style={{ marginRight: 12, fontSize: 11 }}>← Dashboard</button>
          <h1 style={{ display:'inline' }}>Run <span className="accent">Workspace</span></h1>
          <div className="sub">Briefing room — track every step, comment in real time</div>
        </div>
      </div>

      {!run ? (
        <div className="muted" style={{ padding: 40, textAlign: 'center' }}>No run selected.</div>
      ) : (
        <>
          {/* Reuse TeamTimeline — already renders header / progress / step
              cards / final deliverable. Force the runId so this page is
              decoupled from "active run" auto-pick. */}
          <TeamTimeline forceRunId={run.id}/>

          {/* Mid-run comment broadcaster. Pinned below the timeline so the
              user can drop instructions into a specific step without
              scrolling back. The note lands in the run's scratchpad and
              the next executing step picks it up via prior context. */}
          <div className="panel" style={{ padding: 16, marginTop: 14 }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10, color: 'var(--gold)' }}>
              💬 ส่งข้อความถึงทีมงาน (regardless of step running)
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', flexWrap: 'wrap' }}>
              <select
                value={stepIdx ?? ''}
                onChange={e => setStepIdx(e.target.value === '' ? null : Number(e.target.value))}
                style={{ background: 'var(--bg-2)', color: 'var(--text-1)', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 8px', fontSize: 12 }}
                title="Pin to a specific step (optional)">
                <option value="">— ทุกขั้นตอน —</option>
                {plan.map((p, i) => (
                  <option key={i} value={i}>#{i + 1} {p.persona}</option>
                ))}
              </select>
              <textarea
                value={comment}
                onChange={e => setComment(e.target.value)}
                placeholder="เช่น 'ใช้ tone friendlier', 'อย่าใส่ราคาเป็นบาท', 'รอ research จาก Nana ก่อน'…"
                rows={2}
                style={{ flex: 1, minWidth: 240, padding: '8px 10px', background: 'var(--bg-2)', color: 'var(--text-1)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13, resize: 'vertical' }}/>
              <button
                className="btn-primary-task"
                disabled={posting || !comment.trim()}
                onClick={sendComment}>
                {posting ? 'Sending…' : 'ส่งความคิดเห็น'}
              </button>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 6 }}>
              ความคิดเห็นจะถูกบันทึกใน scratchpad ทันที — ขั้นตอนที่กำลังทำงานหรือกำลังจะเริ่มถัดไปจะเห็นข้อความนี้ใน prior context
            </div>
          </div>
        </>
      )}
    </div>
  );
};

Object.assign(window, { Dashboard, AgentWorkspace, CommandCenter, OfficeFloor: AgentWorkspace, RunWorkspacePage });
