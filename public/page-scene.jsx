/* ===== SCENE MODE — JRPG-style dialogue scene ===========================
   Triggered by: window.openScene({ noteId, agentId, message, provider })
   On close:     window.closeScene()
   Renders fullscreen on top of the dashboard via <SceneOverlay/> in App.
   ====================================================================== */

(function () {
  // ── Lightweight global state for scene visibility ──────────────────────
  const sceneListeners = new Set();
  let scene = null;          // { phase, script, note, persona, message, provider, error }
  let phase = null;          // 'loading' | 'ready' | 'error' | null

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

    const personaId = agentId || (inlineNote?.agentId) || 'orchestra';
    const persona   = (window.AGENTS || []).find(a => a.id === personaId);
    const def       = window.PROVIDERS?.default || 'echo';
    const prov      = provider || def;

    scene = {
      noteId: nid,
      message: message || '',
      provider: prov,
      persona,
      script: null,
      // Pre-roll beats so the scene fades in immediately while we await the CLI.
      previewBeats: [
        { speaker: 'system',  text: 'Scene loading — summoning ' + (persona?.name || 'agent') + '…', mood: 'enter' },
        { speaker: 'player',  text: 'เอเจนต์ ' + (persona?.name || 'Agent') + ', ภารกิจของคุณ:\n' + (message || ''), mood: null },
        { speaker: 'system',  text: '(running ' + prov + '…)', mood: 'busy' },
      ],
    };
    phase = 'loading';
    notify();

    try {
      const r = await fetch('/api/notes/' + nid + '/dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: prov, agentId: personaId, message: message || '' }),
      });
      const j = await r.json();
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
      scene = { ...(scene || {}), error: e.message };
      phase = 'error';
      notify();
    }
  };

  window.closeScene = function closeScene() {
    scene = null;
    phase = null;
    notify();
  };
})();


// ── SceneOverlay — fullscreen JRPG dialogue stage ────────────────────────
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
  const persona  = scene.persona  || (window.AGENTS || []).find(a => a.id === 'orchestra');
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
  const [auto, setAuto]     = React.useState(true);

  // Reset when scene starts fresh
  React.useEffect(() => {
    setCursor(0); setTyped(0);
  }, [scene.noteId]);

  // When new beats arrive (loading→ready) and cursor is past previewBeats,
  // keep cursor where it was. When we still on the last preview beat and the
  // ready beats are now available, advance to first ready beat.
  React.useEffect(() => {
    if (phase === 'ready' && cursor >= (scene.previewBeats?.length || 0) && cursor >= beats.length - 1) {
      // already past — leave cursor alone (final beat will be shown)
    }
  }, [phase]);

  // Clamp cursor when beats list shrinks
  React.useEffect(() => {
    if (cursor >= beats.length) setCursor(Math.max(0, beats.length - 1));
  }, [beats.length]);

  const current = beats[cursor];
  const fullText = current?.text || '';

  // Typewriter — reveal characters at ~30 chars/sec
  React.useEffect(() => {
    setTyped(0);
    if (!fullText) return;
    let i = 0;
    const id = setInterval(() => {
      i += 2;
      if (i >= fullText.length) {
        setTyped(fullText.length);
        clearInterval(id);
      } else {
        setTyped(i);
      }
    }, 24);
    return () => clearInterval(id);
  }, [cursor, fullText]);

  // Auto-advance after a beat finishes typing — cinematic mode
  React.useEffect(() => {
    if (!auto) return;
    if (typed < fullText.length) return;
    if (cursor >= beats.length - 1) return;
    // Wait long enough to read, longer for system framing beats.
    const dwell = current?.speaker === 'system' ? 1100 :
                  fullText.length > 80 ? 2400 : 1500;
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

        {/* mission card top */}
        <div className="scene-mission-card">
          <div className="scene-mission-tier">⚔ MISSION</div>
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
          ✕ Exit Scene
        </button>

        {/* characters layer */}
        <div className="scene-actors">
          {/* Player (left) */}
          <div className={'scene-actor scene-player' + (current?.speaker === 'player' ? ' is-speaking' : '')}>
            <div className="scene-actor-portrait scene-player-portrait">
              <div className="scene-player-avatar">P</div>
            </div>
            <div className="scene-actor-name">Pilot</div>
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
          </div>
        </div>

        {/* dialogue box bottom */}
        <div className={'scene-dialogue speaker-' + (current?.speaker || 'system') + (current?.mood ? ' mood-' + current.mood : '')}>
          <div className="scene-dialogue-name">
            {current?.speaker === 'player' ? 'You' :
             current?.speaker === 'agent'  ? (persona?.name || 'Agent') :
             '— narration'}
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
                {auto ? '◐ Auto' : '◯ Manual'}
              </button>
              {!allDone && (
                <button className="scene-btn primary" onClick={advance} title="Space / Enter / Click">
                  {typed < fullText.length ? '⏭ Skip' : '▶ Next'}
                </button>
              )}
              {allDone && (
                <button className="scene-btn primary" onClick={onClose}>
                  ✓ Close
                </button>
              )}
            </div>
          </div>
        </div>

        {/* phase-specific overlays */}
        {phase === 'loading' && (
          <div className="scene-loading-strip">
            <span>summoning {agentName}…</span>
          </div>
        )}
        {phase === 'ready' && allDone && scene.ok && (
          <div className="scene-victory">VICTORY</div>
        )}
      </div>
    </div>
  );
};

Object.assign(window, { SceneOverlay });
