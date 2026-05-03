/* ===== SCENE MODE — sim office dialogue room ============================
   Triggered by: window.openScene({ noteId, agentId, message, provider })
   On close:     window.closeScene()
   Renders fullscreen on top of the dashboard via <SceneOverlay/> in App.
   ====================================================================== */

(function () {
  // ── Lightweight global state for scene visibility ──────────────────────
  const sceneListeners = new Set();
  let scene = null;          // { phase, script, note, persona, message, provider, error }
  let phase = null;          // 'loading' | 'ready' | 'error' | null
  let activeAbort = null;

  function notify() { sceneListeners.forEach(fn => { try { fn(); } catch {} }); }

  window.useSceneStore = function useSceneStore() {
    const [, setTick] = React.useState(0);
    React.useEffect(() => {
      const fn = () => setTick(t => t + 1);
      sceneListeners.add(fn);
      return () => sceneListeners.delete(fn);
    }, []);
    return { scene, phase };
  };

  window.openScene = async function openScene({ noteId, agentId, message, provider, title, body, tag = 'task' }) {
    // If no noteId, create one inline so users can launch a scene from anywhere.
    let nid = noteId;
    let inlineNote = null;
    if (!nid) {
      try {
        const r = await fetch('/api/notes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: (title || message || 'Untitled scene').slice(0, 80),
            body:  body  || message || '',
            tag,
            agentId,
          }),
        });
        inlineNote = await r.json();
        nid = inlineNote.id;
      } catch (e) {
        scene = { error: 'Failed to create note: ' + e.message };
        phase = 'error';
        notify();
        return;
      }
    }

    const personaId = agentId || (inlineNote?.agentId) || 'atlas';
    const persona   = (window.AGENTS || []).find(a => a.id === personaId);
    const def       = window.PROVIDERS?.default || 'claude';
    const prov      = provider || def;

    scene = {
      noteId: nid,
      message: message || '',
      provider: prov,
      persona,
      script: null,
      // Pre-roll beats so the scene fades in immediately while we await the CLI.
      previewBeats: [
        { speaker: 'system',  text: 'Opening sim office desk — calling ' + (persona?.name || 'agent') + '...', mood: 'enter' },
        { speaker: 'player',  text: 'Brief for ' + (persona?.name || 'Agent') + ':\n' + (message || ''), mood: null },
        { speaker: 'system',  text: '(Workstation running via ' + prov + '...)', mood: 'busy' },
      ],
    };
    phase = 'loading';
    notify();

    let timeout = null;
    try {
      if (activeAbort) activeAbort.abort();
      const controller = new AbortController();
      activeAbort = controller;
      timeout = setTimeout(() => controller.abort(), 50_000);
      const r = await fetch('/api/notes/' + nid + '/dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: prov, agentId: personaId, message: message || '' }),
        signal: controller.signal,
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Provider run failed');
      scene = {
        ...scene,
        script: j.scene || null,
        rawOutput: j.output,
        ok: j.ok,
        persona: j.scene?.persona || persona,
      };
      phase = 'ready';
      notify();
      window.refreshNotes && window.refreshNotes();
    } catch (e) {
      const timedOut = e.name === 'AbortError';
      scene = {
        ...(scene || {}),
        error: timedOut
          ? 'Provider timed out or is waiting for a window/permission. Try Claude or Codex again after checking login.'
          : e.message,
      };
      phase = 'error';
      notify();
    } finally {
      if (timeout) clearTimeout(timeout);
      activeAbort = null;
    }
  };

  window.closeScene = function closeScene() {
    if (activeAbort) activeAbort.abort();
    scene = null;
    phase = null;
    notify();
  };
})();


// ── SceneOverlay — fullscreen sim office workroom ────────────────────────
const SceneOverlay = () => {
  const { scene, phase } = window.useSceneStore();

  // Keyboard handler: ESC to close
  React.useEffect(() => {
    if (!phase) return;
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        window.closeScene();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [phase]);

  if (!phase || !scene) return null;

  return (
    <SceneStage scene={scene} phase={phase} onClose={() => window.closeScene()}/>
  );
};

const SceneStage = ({ scene, phase, onClose }) => {
  const persona  = scene.persona  || (window.AGENTS || []).find(a => a.id === 'atlas');
  const note     = scene.script?.note || { title: scene.message || 'Mission' };
  const agentName = persona?.name || 'Agent';

  // Compose displayed beats: previewBeats while loading, full script when ready.
  const beats = React.useMemo(() => {
    if (phase === 'ready' && scene.script?.beats) return scene.script.beats;
    if (phase === 'loading') return scene.previewBeats || [];
    if (phase === 'error') return [
      { speaker: 'system', text: 'Scene error', mood: 'fail' },
      { speaker: 'system', text: scene.error || 'Unknown error', mood: 'fail' },
    ];
    return [];
  }, [phase, scene.script, scene.previewBeats, scene.error]);

  // Index of current dialogue line, plus typewriter progress for that line.
  const [cursor, setCursor] = React.useState(0);
  const [typed, setTyped]   = React.useState(0);   // chars revealed in current beat
  // Default to manual mode so operators can read each handoff beat. Toggle
  // to auto-advance with the [A] key or the Auto button.
  const [auto, setAuto]     = React.useState(false);

  // Reset when scene starts fresh
  React.useEffect(() => {
    setCursor(0); setTyped(0);
  }, [scene.noteId]);

  // When the script transitions from `loading` (3 preview beats) to `ready`
  // (8+ real beats), the preview beats are replaced. If the user already
  // auto-advanced past the previews while the CLI was running, restart the
  // ready script from beat 0 so they actually see the dialogue.
  const lastPhaseRef = React.useRef(phase);
  React.useEffect(() => {
    if (lastPhaseRef.current === 'loading' && phase === 'ready') {
      setCursor(0);
      setTyped(0);
    }
    lastPhaseRef.current = phase;
  }, [phase]);

  // Clamp cursor when beats list shrinks
  React.useEffect(() => {
    if (cursor >= beats.length) setCursor(Math.max(0, beats.length - 1));
  }, [beats.length]);

  const current = beats[cursor];
  const fullText = current?.text || '';

  // Typewriter — reveal one character at a time (~28 chars/sec)
  React.useEffect(() => {
    setTyped(0);
    if (!fullText) return;
    let i = 0;
    const id = setInterval(() => {
      i += 1;
      if (i >= fullText.length) {
        setTyped(fullText.length);
        clearInterval(id);
      } else {
        setTyped(i);
      }
    }, 36);
    return () => clearInterval(id);
  }, [cursor, fullText]);

  // Auto-advance after a beat finishes typing — cinematic mode.
  // Dwell scales with text length so users always have time to read.
  React.useEffect(() => {
    if (!auto) return;
    if (typed < fullText.length) return;
    if (cursor >= beats.length - 1) return;
    const len = fullText.length;
    const dwell =
      current?.speaker === 'system' ? Math.max(1800, 1200 + len * 18) :
      Math.max(2400, 1400 + len * 24);
    const t = setTimeout(() => setCursor(c => Math.min(beats.length - 1, c + 1)), dwell);
    return () => clearTimeout(t);
  }, [typed, fullText, cursor, beats.length, auto, current?.speaker]);

  // Spacebar / Enter / click → advance or skip typewriter
  const advance = React.useCallback(() => {
    if (typed < fullText.length) {
      setTyped(fullText.length); // skip typing
    } else if (cursor < beats.length - 1) {
      setCursor(c => c + 1);
    }
  }, [typed, fullText, cursor, beats.length]);

  React.useEffect(() => {
    const onKey = (e) => {
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        advance();
      } else if (e.key === 'a' || e.key === 'A') {
        setAuto(a => !a);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [advance]);

  const onStageClick = (e) => {
    // Click anywhere on the stage advances dialogue, except on the action buttons.
    if (e.target.closest('.scene-actions') || e.target.closest('.scene-close')) return;
    advance();
  };

  // Mood → bg gradient hint
  const sceneClass = [
    'scene-stage',
    'phase-' + phase,
    persona ? 'rarity-' + (persona.rarity || 'SR').toLowerCase() : '',
    current?.mood ? 'mood-' + current.mood : '',
  ].filter(Boolean).join(' ');

  const allDone = cursor >= beats.length - 1 && typed >= fullText.length;

  return (
    <div className="scene-overlay" onClick={onStageClick}>
      <div className={sceneClass}>
        {/* parallax bg layers */}
        <div className="scene-bg-far"/>
        <div className="scene-bg-mid"/>
        <div className="scene-bg-near"/>
        <div className="scene-office-room" aria-hidden="true">
          <div className="scene-office-window">
            <span/><span/><span/><span/>
          </div>
          <div className="scene-office-board">
            <b>QUEUE</b>
            <em>{phase}</em>
            <i>{agentName}</i>
          </div>
          <div className="scene-office-shelf">
            <span/><span/><span/>
          </div>
          <div className="scene-office-clock"/>
          <div className="scene-office-plant"/>
        </div>

        {/* mission card top */}
        <div className="scene-mission-card">
          <div className="scene-mission-tier">▣ WORK ORDER</div>
          <div className="scene-mission-title">{note.title}</div>
          {note.body && <div className="scene-mission-body">{note.body}</div>}
          <div className="scene-mission-meta">
            <span>provider · <b>{scene.provider}</b></span>
            <span className="dot-sep"/>
          <span>agent · <b>{agentName}</b></span>
            <span className="dot-sep"/>
            <span>mode · <b>{phase}</b></span>
          </div>
        </div>

        {/* close button */}
        <button className="scene-close" onClick={(e) => { e.stopPropagation(); onClose(); }} title="Close (Esc)">
          Close
        </button>

        {/* characters layer */}
        <div className="scene-actors">
          {/* Player (left) */}
          <div className={'scene-actor scene-player' + (current?.speaker === 'player' ? ' is-speaking' : '')}>
            <div className="scene-actor-portrait scene-player-portrait">
            <div className="scene-player-avatar">You</div>
            </div>
            <div className="scene-desk-line">
              <span className="scene-keyboard"/>
              <span className="scene-mug"/>
            </div>
            <div className="scene-actor-name">You <span className="role">Operator desk</span></div>
          </div>

          {/* Agent (right) */}
          <div className={'scene-actor scene-agent' +
            (current?.speaker === 'agent' ? ' is-speaking' : '') +
            (current?.mood === 'busy' ? ' is-busy' : '') +
            (current?.mood === 'win'  ? ' is-victory' : '') +
            (current?.mood === 'fail' ? ' is-defeated' : '')
          }>
            <div className="scene-actor-portrait" style={{
              background: persona?.gradient,
            }}>
              {persona?.image
                ? <img src={persona.image} alt={persona.name}/>
                : <span className="scene-actor-initials">{persona?.avatarInitials || 'A'}</span>}
              {phase === 'loading' && <div className="scene-summon-ring"/>}
            </div>
            <div className="scene-actor-name">
              <span className="sigil">{persona?.sigil || ''}</span>
              {persona?.name || 'Agent'}
              <span className="role">{persona?.role || ''}</span>
            </div>
            <div className="scene-desk-line">
              <span className="scene-keyboard"/>
              <span className="scene-mug"/>
            </div>
          </div>
        </div>

        {/* dialogue box bottom */}
        <div className={'scene-dialogue speaker-' + (current?.speaker || 'system') + (current?.mood ? ' mood-' + current.mood : '')}>
          <div className="scene-dialogue-name">
            {current?.speaker === 'player' ? 'You' :
             current?.speaker === 'agent'  ? (persona?.name || 'Agent') :
             'System'}
          </div>
          <div className="scene-dialogue-text">
            {fullText.slice(0, typed)}
            {typed < fullText.length && <span className="scene-cursor">▍</span>}
          </div>
          <div className="scene-dialogue-foot">
            <span className="scene-dialogue-progress">
              {Math.min(cursor + 1, beats.length)} / {beats.length}
            </span>
            <div className="scene-actions" onClick={(e) => e.stopPropagation()}>
              <button className="scene-btn ghost" onClick={() => setAuto(a => !a)} title="Toggle auto-advance (A)">
                {auto ? 'Auto' : 'Manual'}
              </button>
              {!allDone && (
                <button className="scene-btn primary" onClick={advance} title="Space / Enter / Click">
                  {typed < fullText.length ? 'Skip' : 'Next'}
                </button>
              )}
              {allDone && (
                <button className="scene-btn primary" onClick={onClose}>
                  Close
                </button>
              )}
            </div>
          </div>
        </div>

        {/* phase-specific overlays */}
        {phase === 'loading' && (
          <div className="scene-loading-strip">
            <span>Desk ping: {agentName}</span>
          </div>
        )}
        {phase === 'ready' && allDone && scene.ok && (
          <div className="scene-victory">VICTORY</div>
        )}
      </div>
    </div>
  );
};

const SceneLaunchPage = ({ onOpenAgent }) => {
  window.useCOfficeRefresh?.();
  const [message, setMessage] = React.useState('');
  const [agentId, setAgentId] = React.useState('atlas');
  const agent = (window.AGENTS || []).find(a => a.id === agentId) || (window.AGENTS || [])[0];
  const recentNotes = (window.NOTES || []).slice(0, 4);

  const launch = (payload = {}) => {
    const text = (payload.message || message || 'Open a workroom review for the current task.').trim();
    window.openScene?.({
      agentId: payload.agentId || agent?.id || 'atlas',
      message: text,
      title: text.slice(0, 80),
      tag: 'scene',
    });
  };

  return (
    <div className="scene-launch">
      <div className="scene-launch-hero">
        <div>
          <div className="mono-s">SIM OFFICE MODE</div>
          <h1>Workroom <span className="accent">Scene</span></h1>
          <p>Turn any note or agent handoff into a live office desk review.</p>
        </div>
        <button className="btn primary" onClick={() => launch()}>Start Scene</button>
      </div>

      <div className="scene-launch-grid">
        <div className="panel scene-launch-compose">
          <div className="panel-head">
            <h3>Direct Scene</h3>
            <div className="right">agent prompt</div>
          </div>
          <select className="cmd-select" value={agentId} onChange={e => setAgentId(e.target.value)}>
            {(window.AGENTS || []).map(a => <option key={a.id} value={a.id}>{a.name} - {a.role}</option>)}
          </select>
          <textarea
            className="cmd-textarea"
            value={message}
            onChange={e => setMessage(e.target.value)}
            placeholder="Describe what you want this agent to stage, review, or explain..."
          />
          <div className="scene-launch-agent" onClick={() => agent && onOpenAgent?.(agent.id)}>
            <AgentDot agent={agent} size={42}/>
            <div>
              <b>{agent?.name || 'Agent'}</b>
              <span>{agent?.role || 'Scene partner'}</span>
            </div>
          </div>
        </div>

        <div className="panel">
          <div className="panel-head">
            <h3>Recent Notes</h3>
            <div className="right">{recentNotes.length} ready</div>
          </div>
          <div className="scene-note-list">
            {recentNotes.length === 0 && (
              <div className="muted" style={{fontSize:12, padding:'20px 0'}}>
                No notes yet. Start a direct scene instead.
              </div>
            )}
            {recentNotes.map(n => (
              <button
                key={n.id}
                className="scene-note-card"
                onClick={() => window.openScene?.({
                  noteId: n.id,
                  agentId: n.agentId || agent?.id || 'atlas',
                  message: n.body || n.title,
                  title: n.title,
                })}
              >
                <span>{n.title || 'Untitled note'}</span>
                <em>{n.tag || 'note'}</em>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

Object.assign(window, { SceneOverlay, SceneLaunchPage });
