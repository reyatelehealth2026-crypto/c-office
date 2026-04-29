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

  // window.openScene — formerly opened a fullscreen JRPG scene. Now routes
  // every dispatch through the inline Notes chat panel so the user stays in
  // their context and sees thinking / typing / using-tool indicators in
  // place. Adventure / Guild / scene-retry call sites still hit this and
  // get the inline behaviour for free.
  window.openScene = async function openScene({ noteId, agentId, message, provider, title, body, tag = 'task' }) {
    let nid = noteId;
    if (!nid) {
      try {
        const r = await fetch('/api/notes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: (title || message || 'Untitled').slice(0, 80),
            body:  body  || message || '',
            tag,
            agentId,
          }),
        });
        nid = (await r.json()).id;
      } catch (e) {
        console.warn('[c-office] inline dispatch could not create note:', e.message);
        return;
      }
    }

    const personaId = agentId || 'orchestra';
    const prov      = provider || (window.PROVIDERS?.default || 'echo');

    // Navigate to /#/notes with this note opened so the user sees the chat.
    try {
      localStorage.setItem('c-office-page', 'notes');
      localStorage.setItem('c-office-active-note', nid);
    } catch {}
    window.dispatchEvent(new CustomEvent('c-office:navigate', { detail: { page: 'notes' } }));
    window.dispatchEvent(new CustomEvent('c-office:open-note',  { detail: { noteId: nid } }));
    window.refreshNotes && window.refreshNotes();

    // Fire-and-forget dispatch. Refresh notes when the run lands.
    fetch('/api/notes/' + nid + '/dispatch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider: prov, agentId: personaId, message: message || '' }),
    })
      .then(() => window.refreshNotes && window.refreshNotes())
      .catch((e) => console.warn('[c-office] inline dispatch failed:', e.message));
  };

  window.closeScene = function closeScene() {
    scene = null;
    phase = null;
    notify();
  };
})();


// ── SceneOverlay — DEPRECATED. The fullscreen JRPG dialogue mode was retired
// in favour of inline chat (notes panel) with thinking / typing / tool-use
// indicators. We keep the stub so <SceneOverlay/> in App still renders, and
// preserve the old implementation below behind an early-return null.
const SceneOverlay = () => null;

const _LegacySceneOverlay = () => {
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
  // Default to manual mode — JRPG convention is "press to continue". Toggle
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
          ✕ ออกจากฉาก
        </button>

        {/* characters layer */}
        <div className="scene-actors">
          {/* Player (left) */}
          <div className={'scene-actor scene-player' + (current?.speaker === 'player' ? ' is-speaking' : '')}>
            <div className="scene-actor-portrait scene-player-portrait">
            <div className="scene-player-avatar">คุณ</div>
            </div>
            <div className="scene-actor-name">ผู้ใช้</div>
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
            {current?.speaker === 'player' ? 'คุณ' :
             current?.speaker === 'agent'  ? (persona?.name || 'Agent') :
             '— ฉาก'}
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
              {phase === 'error' && scene.canRetryEcho && (
                <button
                  className="scene-btn ghost"
                  onClick={() => window.openScene({
                    noteId: scene.noteId,
                    agentId: persona?.id,
                    provider: 'echo',
                    message: scene.message || '',
                  })}
                >
                  ลองด้วย Echo
                </button>
              )}
              <button className="scene-btn ghost" onClick={() => setAuto(a => !a)} title="Toggle auto-advance (A)">
                {auto ? '◐ อัตโนมัติ' : '◯ กดเอง'}
              </button>
              {!allDone && (
                <button className="scene-btn primary" onClick={advance} title="Space / Enter / Click">
                  {typed < fullText.length ? '⏭ ข้าม' : '▶ ต่อไป'}
                </button>
              )}
              {allDone && (
                <button className="scene-btn primary" onClick={onClose}>
                  ✓ ปิดฉาก
                </button>
              )}
            </div>
          </div>
        </div>

        {/* phase-specific overlays */}
        {phase === 'loading' && (
          <div className="scene-loading-strip">
            <span>กำลังเรียก {agentName}...</span>
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
