// Live data client — replaces the static mock that used to live here.
// Bootstraps from /api/state, then incremental SSE deltas via /api/stream.
// All existing JSX components keep reading these globals; we just keep them fresh.
(function () {
  window.AGENTS         = [];
  window.ACTIVITY       = [];
  window.TASKS          = [];
  window.MEMORY_NODES   = [];
  window.MEMORY_EDGES   = [];
  window.DISPATCHES     = [];
  window.RUNS           = [];
  window.AUTH_STATUS    = null;
  window.STATE_EDGES    = [];
  window.STATE_SESSIONS = [];
  window.STATS = { tokensToday: 0, spendToday: 0, agentsOnline: 0, tasksRunning: 0 };

  const Bus = window.COfficeBus = new EventTarget();
  const fire = () => Bus.dispatchEvent(new Event('refresh'));

  let es = null;
  let stateVersion = 0;            // bumped on each snapshot/event so React re-renders

  function applySnapshot(s) {
    window.AGENTS         = s.personas || [];
    window.ACTIVITY       = (s.events || []).slice(-50).reverse();
    window.TASKS          = s.tasks || [];
    window.RUNS           = s.runs || [];
    window.DISPATCHES     = s.dispatches || [];
    window.STATS          = s.stats || window.STATS;
    window.STATE_EDGES    = s.edges || [];
    window.STATE_SESSIONS = s.sessions || [];
    stateVersion++;
    fire();
  }

  function applyPersonaStatus(map) {
    if (!map) return;
    window.AGENTS = window.AGENTS.map(a => ({ ...a, status: map[a.id] || 'idle' }));
    stateVersion++;
    fire();
  }

  function pushEvent(ev) {
    window.ACTIVITY = [ev, ...window.ACTIVITY].slice(0, 50);
    stateVersion++;
    fire();
  }

  async function fetchMemory() {
    try {
      const r = await fetch('/api/memory');
      const j = await r.json();
      window.MEMORY_NODES = j.nodes || [];
      window.MEMORY_EDGES = j.edges || [];
      stateVersion++;
      fire();
    } catch (e) { /* ignore */ }
  }

  async function bootstrap() {
    try {
      const s = await fetch('/api/state').then(r => r.json());
      applySnapshot(s);
    } catch (e) {
      console.warn('[c-office] state fetch failed; retrying in 2s', e);
      setTimeout(bootstrap, 2000);
      return;
    }
    fetchMemory();
    if (es) try { es.close(); } catch {}
    es = new EventSource('/api/stream');
    es.addEventListener('event',          e => pushEvent(JSON.parse(e.data)));
    es.addEventListener('stats',          e => { window.STATS = { ...window.STATS, ...JSON.parse(e.data) }; stateVersion++; fire(); });
    es.addEventListener('persona.status', e => applyPersonaStatus(JSON.parse(e.data)));
    window.COfficeApplyDispatch = function applyDispatch(dispatch) {
      window.DISPATCHES = [dispatch, ...window.DISPATCHES.filter(d => d.id !== dispatch.id)]
        .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
        .slice(0, 100);
      stateVersion++;
      fire();
    };
    es.addEventListener('dispatch',       e => window.COfficeApplyDispatch(JSON.parse(e.data)));
    es.addEventListener('run',            e => {
      const run = JSON.parse(e.data);
      window.RUNS = [run, ...window.RUNS.filter(r => r.id !== run.id)].slice(0, 50);
      stateVersion++;
      fire();
    });
    es.addEventListener('auth.status',    e => { window.AUTH_STATUS = JSON.parse(e.data); stateVersion++; fire(); });
    es.addEventListener('task',           () => {
      fetch('/api/state').then(r => r.json()).then(applySnapshot).catch(()=>{});
    });
    es.onerror = () => {
      try { es.close(); } catch {}
      es = null;
      setTimeout(bootstrap, 2000);
    };
  }

  // Hook for React components to subscribe to refreshes
  window.useCOfficeRefresh = function useCOfficeRefresh() {
    return React.useSyncExternalStore(
      (cb) => { Bus.addEventListener('refresh', cb); return () => Bus.removeEventListener('refresh', cb); },
      () => stateVersion,
      () => stateVersion,
    );
  };

  bootstrap();
})();
