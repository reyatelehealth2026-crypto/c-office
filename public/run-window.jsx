/* ===== Run windows — Facebook-Messenger-style floating chat windows
   per task. Each window shows the run's goal as the user message and
   each persona delegation as a chat bubble with their full output.
   The dock at the bottom-left tracks all open / minimised windows
   and exposes a history flyout to reopen any past task.
*/

const STORAGE_KEY = 'c-office-open-runs';
const MAX_OPEN = 6;

const personaColor = (personaId) => {
  const a = (window.AGENTS || []).find((x) => x.id === personaId);
  return a?.color || 'var(--accent-violet)';
};
const personaName = (personaId) => {
  const a = (window.AGENTS || []).find((x) => x.id === personaId);
  return a?.name || personaId || 'Agent';
};

function loadOpen() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.slice(0, MAX_OPEN) : [];
  } catch { return []; }
}
function saveOpen(arr) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(arr.slice(0, MAX_OPEN))); }
  catch { /* quota; ignore */ }
}

function findRun(runId) {
  const all = window.RUNS || [];
  return all.find((r) => r.id === runId) || null;
}

const Avatar = ({ personaId, size = 24 }) => {
  const color = personaColor(personaId);
  const name = personaName(personaId);
  const initial = (name || personaId || '?').slice(0, 1).toUpperCase();
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      width: size, height: size, borderRadius: '50%',
      background: color, color: 'var(--bg-0)',
      fontWeight: 700, fontSize: Math.round(size * 0.45),
      flexShrink: 0,
    }}>{initial}</span>
  );
};

const ChatBubble = ({ entry, onCopy, copied }) => {
  const ok = entry.result?.ok;
  const failed = entry.result && !ok;
  const text = entry.result?.text || entry.result?.error || '';
  const dur = Number.isFinite(entry.durationMs) ? `${(entry.durationMs / 1000).toFixed(1)}s` : '';
  return (
    <div style={{display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 10}}>
      <Avatar personaId={entry.persona} size={28}/>
      <div style={{flex: 1, minWidth: 0}}>
        <div style={{display: 'flex', gap: 6, alignItems: 'baseline', marginBottom: 4}}>
          <b style={{fontSize: 12, color: 'var(--text-1)'}}>{entry.personaName || personaName(entry.persona)}</b>
          <span className="mono-s" style={{
            fontSize: 10,
            color: failed ? 'var(--red)' : ok ? 'var(--green)' : 'var(--text-3)',
          }}>
            {failed ? 'failed' : ok ? 'done' : 'running'}{dur ? ' · ' + dur : ''}
          </span>
        </div>
        {entry.instruction && (
          <div style={{
            fontSize: 11, color: 'var(--text-3)',
            marginBottom: 4, fontStyle: 'italic',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }} title={entry.instruction}>
            ➜ {entry.instruction}
          </div>
        )}
        <div style={{
          padding: '8px 12px',
          background: failed ? 'rgba(220,80,80,0.08)' : 'var(--bg-2)',
          borderRadius: 14,
          borderTopLeftRadius: 4,
          fontSize: 12,
          lineHeight: 1.5,
          color: failed ? 'var(--red)' : 'var(--text-1)',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          maxHeight: 360,
          overflowY: 'auto',
        }}>
          {entry.result?.image?.url && (
            <a href={entry.result.image.url} target="_blank" rel="noreferrer"
              style={{display: 'block', marginBottom: text ? 8 : 0}}>
              <img src={entry.result.image.url}
                alt={entry.instruction || 'generated image'}
                style={{
                  maxWidth: '100%', maxHeight: 240,
                  borderRadius: 8, display: 'block',
                  border: '1px solid var(--border)',
                }}/>
            </a>
          )}
          {text || (!entry.result?.image?.url && <span className="muted" style={{fontStyle:'italic'}}>(running…)</span>)}
        </div>
        {text && (
          <button onClick={() => onCopy(text, entry.persona + ':' + (entry.tool_use_id || ''))}
            style={{
              marginTop: 4, padding: '2px 8px',
              background: 'transparent',
              border: '1px solid var(--border)',
              borderRadius: 4, fontSize: 10,
              color: 'var(--text-3)', cursor: 'pointer',
              fontFamily: 'var(--font-mono)',
            }}>
            {copied ? '✓ copied' : '📋 copy'}
          </button>
        )}
      </div>
    </div>
  );
};

const RunWindow = ({ runId, position, onClose, onMinimize, minimized }) => {
  const [, force] = React.useReducer((n) => n + 1, 0);
  const [copiedKey, setCopiedKey] = React.useState(null);
  const [cancelling, setCancelling] = React.useState(false);
  const scrollRef = React.useRef(null);

  React.useEffect(() => {
    const handler = () => force();
    window.COfficeBus?.addEventListener('refresh', handler);
    return () => window.COfficeBus?.removeEventListener('refresh', handler);
  }, []);

  const run = findRun(runId);

  React.useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [run?.steps?.length, run?.final, minimized]);

  const copy = async (text, key) => {
    try { await navigator.clipboard.writeText(text); }
    catch { window.prompt('Copy', text); }
    setCopiedKey(key);
    setTimeout(() => setCopiedKey((k) => (k === key ? null : k)), 1400);
  };

  const cancel = async () => {
    if (cancelling || !run || run.status !== 'running') return;
    if (!window.confirm('Cancel this run?')) return;
    setCancelling(true);
    try {
      await fetch(`/api/task/${runId}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'user-cancelled' }),
      });
    } finally { setTimeout(() => setCancelling(false), 1500); }
  };

  if (!run) return null;

  const isLive = run.status === 'running';
  const phaseLabel = {
    plan: 'Planning', execute: 'Executing', critique: 'Reviewing',
    verify: 'Verifying', done: 'Done',
  }[run.phase || 'execute'] || (isLive ? 'Working' : 'Done');

  const statusColor = run.status === 'failed' ? 'var(--red)'
    : run.status === 'done' ? 'var(--green)' : 'var(--gold)';

  const right = 16 + position * 360;

  if (minimized) {
    return (
      <div onClick={() => onMinimize(false)}
        style={{
          position: 'fixed',
          bottom: 0, right,
          width: 240, height: 36,
          background: 'var(--bg-1)',
          border: '1px solid var(--border)',
          borderBottom: 'none',
          borderTopLeftRadius: 8, borderTopRightRadius: 8,
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '0 10px',
          cursor: 'pointer',
          fontSize: 12, color: 'var(--text-1)',
          zIndex: 9000,
          boxShadow: '0 -2px 8px rgba(0,0,0,0.2)',
        }}>
        <span style={{color: statusColor, fontSize: 10}}>●</span>
        <div style={{flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}}>
          {run.goal}
        </div>
        <span onClick={(e) => { e.stopPropagation(); onClose(); }}
          style={{padding: '0 4px', color: 'var(--text-3)', cursor: 'pointer'}}>×</span>
      </div>
    );
  }

  // Build chat entries from run.plan, hydrated by run.steps in array order.
  // Index-based matching is robust against (a) instruction-string truncation
  // mismatches between setRunPlan (320 chars) and stepRun (220 chars), and
  // (b) the same persona being delegated multiple times in team flow.
  const planArr = Array.isArray(run.plan) ? run.plan : [];
  const stepsArr = Array.isArray(run.steps) ? run.steps : [];
  let entries;
  if (planArr.length > 0) {
    entries = planArr.map((p, i) => {
      const s = stepsArr[i] && stepsArr[i].persona === p.persona ? stepsArr[i] : null;
      return {
        persona: p.persona,
        personaName: (s && s.personaName) || personaName(p.persona),
        instruction: (s && s.instruction) || p.instruction,
        result: s ? s.result : null,
        durationMs: s ? s.durationMs : null,
        tool_use_id: s ? s.tool_use_id : null,
      };
    });
    // Tail any extra steps beyond the plan (defensive).
    for (let i = planArr.length; i < stepsArr.length; i++) {
      const s = stepsArr[i];
      entries.push({
        persona: s.persona, personaName: s.personaName,
        instruction: s.instruction, result: s.result,
        durationMs: s.durationMs, tool_use_id: s.tool_use_id,
      });
    }
  } else {
    entries = stepsArr.map((s) => ({
      persona: s.persona, personaName: s.personaName,
      instruction: s.instruction, result: s.result,
      durationMs: s.durationMs, tool_use_id: s.tool_use_id,
    }));
  }

  return (
    <div style={{
      position: 'fixed',
      bottom: 0, right,
      width: 340, height: 480,
      background: 'var(--bg-1)',
      border: '1px solid var(--border)',
      borderBottom: 'none',
      borderTopLeftRadius: 12, borderTopRightRadius: 12,
      display: 'flex', flexDirection: 'column',
      zIndex: 9000,
      boxShadow: '0 -4px 18px rgba(0,0,0,0.28)',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        padding: '8px 12px',
        background: 'var(--bg-0)',
        borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <span style={{color: statusColor, fontSize: 10}}>●</span>
        <div style={{flex: 1, minWidth: 0}}>
          <div style={{fontSize: 12, fontWeight: 600, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}}>
            {run.goal}
          </div>
          <div className="mono-s" style={{fontSize: 10, color: 'var(--text-3)'}}>
            {phaseLabel}{run.workflow ? ` · ${run.workflow}` : ''}
          </div>
        </div>
        {isLive && (
          <button onClick={cancel} disabled={cancelling || run.cancelRequested}
            title="Cancel run"
            style={{
              border: '1px solid var(--red)', borderRadius: 4,
              background: 'transparent', color: 'var(--red)',
              fontSize: 10, padding: '2px 6px', cursor: 'pointer',
            }}>⏹</button>
        )}
        <button onClick={() => onMinimize(true)} title="Minimize"
          style={{border: 'none', background: 'transparent', color: 'var(--text-3)', fontSize: 14, cursor: 'pointer', padding: '0 4px'}}>—</button>
        <button onClick={onClose} title="Close"
          style={{border: 'none', background: 'transparent', color: 'var(--text-3)', fontSize: 16, cursor: 'pointer', padding: '0 4px'}}>×</button>
      </div>

      {/* Phase pills strip */}
      <div style={{
        padding: '6px 12px',
        background: 'var(--bg-1)',
        borderBottom: '1px solid var(--border)',
        display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap',
      }}>
        {['plan', 'execute', 'critique', 'verify', 'done'].map((p, i) => {
          const order = ['plan', 'execute', 'critique', 'verify', 'done'];
          const reached = order.indexOf(run.phase || 'plan') >= i;
          const isCurrent = run.phase === p;
          return (
            <span key={p} style={{
              fontSize: 9,
              padding: '2px 6px',
              borderRadius: 8,
              fontFamily: 'var(--font-mono)',
              background: isCurrent ? statusColor : reached ? 'var(--bg-2)' : 'transparent',
              color: isCurrent ? 'var(--bg-0)' : reached ? 'var(--text-2)' : 'var(--text-3)',
              border: `1px solid ${reached ? 'var(--border)' : 'var(--bg-2)'}`,
            }}>{p}</span>
          );
        })}
      </div>

      {/* Chat feed */}
      <div ref={scrollRef} style={{
        flex: 1, overflowY: 'auto',
        padding: 12,
        background: 'var(--bg-1)',
      }}>
        {/* The user goal as the first bubble */}
        <div style={{display: 'flex', justifyContent: 'flex-end', marginBottom: 12}}>
          <div style={{
            padding: '8px 12px',
            background: 'var(--accent-violet)',
            color: '#fff',
            borderRadius: 14, borderTopRightRadius: 4,
            fontSize: 12, lineHeight: 1.4,
            maxWidth: '85%',
          }}>{run.goal}</div>
        </div>

        {entries.length === 0 && (
          <div className="muted" style={{fontSize: 11, textAlign: 'center', padding: 20}}>
            Awaiting plan…
          </div>
        )}

        {entries.map((entry, i) => (
          <ChatBubble key={i} entry={entry}
            onCopy={copy}
            copied={copiedKey === (entry.persona + ':' + (entry.tool_use_id || ''))}/>
        ))}

        {run.critique && (
          <div style={{
            marginTop: 8, padding: '8px 10px',
            background: 'rgba(220,80,80,0.08)',
            borderRadius: 8,
            borderLeft: '3px solid var(--red)',
            fontSize: 11, color: 'var(--text-2)',
          }}>
            <b style={{color: 'var(--red)'}}>Vivi · {run.critique.severity}</b>
            <div style={{whiteSpace: 'pre-wrap'}}>{run.critique.text}</div>
          </div>
        )}

        {run.verification && (
          <div style={{
            marginTop: 8, padding: '8px 10px',
            background: run.verification.passed ? 'rgba(80,200,120,0.08)' : 'rgba(220,80,80,0.08)',
            borderRadius: 8,
            borderLeft: `3px solid ${run.verification.passed ? 'var(--green)' : 'var(--red)'}`,
            fontSize: 11, color: 'var(--text-2)',
          }}>
            <b>Verify · {run.verification.passed ? 'PASS' : 'FAIL'}</b>
            <div>{run.verification.text}</div>
          </div>
        )}

        {run.final && (
          <div style={{
            marginTop: 12, padding: 10,
            background: 'rgba(80,200,120,0.08)',
            borderRadius: 8,
            borderLeft: '3px solid var(--green)',
          }}>
            <div style={{display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6}}>
              <b style={{fontSize: 12}}>✦ Final</b>
              <button onClick={() => copy(run.final, 'final')}
                style={{
                  marginLeft: 'auto', padding: '2px 8px',
                  background: 'transparent',
                  border: '1px solid var(--border)',
                  borderRadius: 4, fontSize: 10,
                  color: 'var(--text-3)', cursor: 'pointer',
                  fontFamily: 'var(--font-mono)',
                }}>{copiedKey === 'final' ? '✓ copied' : '📋 copy final'}</button>
            </div>
            <pre style={{
              margin: 0, padding: 8,
              background: 'var(--bg-0)',
              borderRadius: 4,
              fontSize: 11, lineHeight: 1.5,
              maxHeight: 240, overflowY: 'auto',
              whiteSpace: 'pre-wrap', wordBreak: 'break-word',
              color: 'var(--text-1)', fontFamily: 'inherit',
            }}>{run.final}</pre>
          </div>
        )}
      </div>

      {/* Footer with run-level actions */}
      <div style={{
        padding: '6px 10px',
        background: 'var(--bg-0)',
        borderTop: '1px solid var(--border)',
        display: 'flex', gap: 6, fontSize: 10,
      }}>
        <a href={`/api/task/${runId}/trace`} target="_blank" rel="noreferrer"
          style={{
            color: 'var(--text-3)', textDecoration: 'none',
            fontFamily: 'var(--font-mono)',
            padding: '2px 6px',
            border: '1px solid var(--border)', borderRadius: 4,
          }}>↗ trace</a>
        {run.phaseCosts && Object.keys(run.phaseCosts).length > 0 && (
          <span className="mono-s" style={{
            color: 'var(--text-3)',
            marginLeft: 'auto', alignSelf: 'center',
          }}>
            ${Object.values(run.phaseCosts).reduce((a, b) => a + (b.usd || 0), 0).toFixed(3)}
          </span>
        )}
      </div>
    </div>
  );
};

const RunDock = () => {
  const [, force] = React.useReducer((n) => n + 1, 0);
  const [openRuns, setOpenRuns] = React.useState(loadOpen());
  const [minimized, setMinimized] = React.useState({});
  const [historyOpen, setHistoryOpen] = React.useState(false);

  React.useEffect(() => {
    const handler = () => force();
    window.COfficeBus?.addEventListener('refresh', handler);
    return () => window.COfficeBus?.removeEventListener('refresh', handler);
  }, []);

  React.useEffect(() => { saveOpen(openRuns); }, [openRuns]);

  // Expose imperative API for other pages.
  React.useEffect(() => {
    window.openRunWindow = (runId) => {
      if (!runId) return;
      setOpenRuns((curr) => {
        if (curr.includes(runId)) return curr;
        return [...curr, runId].slice(-MAX_OPEN);
      });
      setMinimized((m) => ({ ...m, [runId]: false }));
    };
    window.closeRunWindow = (runId) => {
      setOpenRuns((curr) => curr.filter((id) => id !== runId));
      setMinimized((m) => { const next = { ...m }; delete next[runId]; return next; });
    };
    window.minimizeRunWindow = (runId, val = true) => {
      setMinimized((m) => ({ ...m, [runId]: !!val }));
    };
    return () => {
      delete window.openRunWindow;
      delete window.closeRunWindow;
      delete window.minimizeRunWindow;
    };
  }, []);

  const allRuns = window.RUNS || [];
  // Drop ids no longer present in the snapshot (e.g. cleared state).
  const openValid = openRuns.filter((id) => allRuns.some((r) => r.id === id));

  return (
    <>
      {openValid.map((runId, i) => (
        <RunWindow
          key={runId}
          runId={runId}
          position={i}
          minimized={!!minimized[runId]}
          onClose={() => window.closeRunWindow(runId)}
          onMinimize={(val) => window.minimizeRunWindow(runId, val)}
        />
      ))}

      {/* History launcher pinned bottom-left */}
      <div style={{position: 'fixed', bottom: 12, left: 12, zIndex: 9100}}>
        <button onClick={() => setHistoryOpen((o) => !o)}
          style={{
            padding: '8px 14px',
            background: 'var(--bg-1)',
            border: '1px solid var(--border)',
            borderRadius: 18,
            color: 'var(--text-1)',
            fontSize: 12, fontWeight: 600,
            cursor: 'pointer',
            boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
          }}>
          💬 Tasks <span className="mono-s" style={{color:'var(--text-3)'}}>({allRuns.length})</span>
        </button>
        {historyOpen && (
          <div style={{
            position: 'absolute',
            bottom: 44, left: 0,
            width: 360, maxHeight: 480, overflowY: 'auto',
            background: 'var(--bg-1)',
            border: '1px solid var(--border)',
            borderRadius: 10,
            boxShadow: '0 4px 18px rgba(0,0,0,0.3)',
            padding: 8,
          }}>
            <div className="mono-s" style={{padding: 6, color: 'var(--text-3)', fontSize: 10}}>
              RECENT TASKS
            </div>
            {allRuns.length === 0 && (
              <div className="muted" style={{fontSize: 12, textAlign: 'center', padding: 16}}>
                No tasks yet.
              </div>
            )}
            {allRuns.map((r) => {
              const isOpen = openValid.includes(r.id);
              const sc = r.status === 'failed' ? 'var(--red)'
                : r.status === 'done' ? 'var(--green)' : 'var(--gold)';
              return (
                <div key={r.id} onClick={() => { window.openRunWindow(r.id); setHistoryOpen(false); }}
                  style={{
                    padding: '8px 10px',
                    borderRadius: 6,
                    cursor: 'pointer',
                    background: isOpen ? 'var(--bg-2)' : 'transparent',
                    marginBottom: 2,
                    display: 'flex', alignItems: 'center', gap: 8,
                  }}
                  onMouseEnter={(e) => { if (!isOpen) e.currentTarget.style.background = 'var(--bg-2)'; }}
                  onMouseLeave={(e) => { if (!isOpen) e.currentTarget.style.background = 'transparent'; }}>
                  <span style={{color: sc, fontSize: 10}}>●</span>
                  <div style={{flex: 1, minWidth: 0}}>
                    <div style={{
                      fontSize: 12, color: 'var(--text-1)',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>{r.goal}</div>
                    <div className="mono-s" style={{fontSize: 10, color: 'var(--text-3)'}}>
                      {r.status} · {r.phase || '—'}{r.workflow ? ' · ' + r.workflow : ''}
                      {r.durationLabel ? ' · ' + r.durationLabel : ''}
                    </div>
                  </div>
                  {isOpen && <span className="mono-s" style={{fontSize: 10, color: 'var(--gold)'}}>open</span>}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
};

window.RunWindow = RunWindow;
window.RunDock = RunDock;
