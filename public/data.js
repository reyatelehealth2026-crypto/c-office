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
  window.NOTES          = [];
  window.PROVIDERS      = { providers: [], default: 'claude' };
  window.TASK_BOARD     = { statuses: ['backlog', 'running', 'review', 'done'], columns: {}, tasks: [] };
  window.THEME_STATE    = { theme: 'game_guild', themes: ['anime_command', 'dark_ops', 'game_guild', 'rpg_guild'] };

  const Bus = window.COfficeBus = new EventTarget();
  const fire = () => Bus.dispatchEvent(new Event('refresh'));

  let es = null;
  let stateVersion = 0;            // bumped on each snapshot/event so React re-renders

  function applySnapshot(s) {
    window.AGENTS         = s.agents || s.personas || [];
    window.ACTIVITY       = (s.events || []).slice(-50).reverse();
    window.TASKS          = s.tasks || [];
    window.RUNS           = s.runs || [];
    window.DISPATCHES     = s.dispatches || [];
    window.STATS          = s.stats || window.STATS;
    window.STATE_EDGES    = s.edges || [];
    window.STATE_SESSIONS = s.sessions || [];
    window.TASK_BOARD     = s.taskBoard || window.TASK_BOARD;
    window.THEME_STATE    = { theme: s.theme || window.THEME_STATE.theme, themes: s.themes || window.THEME_STATE.themes };
    document.documentElement.dataset.theme = window.THEME_STATE.theme;
    stateVersion++;
    fire();
  }

  function applyPersonaStatus(map) {
    if (!map) return;
    window.AGENTS = window.AGENTS.map(a => ({ ...a, status: map[a.id] || 'idle' }));
    stateVersion++;
    fire();
  }

  function applyPersonaLevels(map) {
    if (!map) return;
    window.AGENTS = window.AGENTS.map(a => ({ ...a, level: map[a.id] || 1 }));
    stateVersion++;
    fire();
  }

  function applyAgents(agents) {
    if (!Array.isArray(agents)) return;
    const statusById = Object.fromEntries((window.AGENTS || []).map((agent) => [agent.id, agent.status]));
    window.AGENTS = agents.map((agent) => ({ ...agent, status: agent.status || statusById[agent.id] || 'idle' }));
    fetch('/api/state').then(r => r.json()).then(applySnapshot).catch(() => {
      stateVersion++;
      fire();
    });
  }

  function applyTaskBoard(board) {
    if (!board || typeof board !== 'object') return;
    window.TASK_BOARD = board;
    stateVersion++;
    fire();
  }

  function applyTheme(themeState) {
    if (!themeState || typeof themeState !== 'object') return;
    window.THEME_STATE = {
      theme: themeState.theme || window.THEME_STATE.theme,
      themes: themeState.themes || window.THEME_STATE.themes,
    };
    document.documentElement.dataset.theme = window.THEME_STATE.theme;
    stateVersion++;
    fire();
  }

  function pushEvent(ev) {
    window.ACTIVITY = [ev, ...window.ACTIVITY].slice(0, 50);
    stateVersion++;
    fire();
  }

  async function refreshNotes() {
    try {
      const r = await fetch('/api/notes');
      const j = await r.json();
      window.NOTES = j.notes || [];
      stateVersion++;
      fire();
    } catch (e) { /* ignore */ }
  }
  window.refreshNotes = refreshNotes;

  async function refreshAuthStatus() {
    try {
      const r = await fetch('/api/auth/status');
      if (r.ok) {
        window.AUTH_STATUS = await r.json();
        stateVersion++;
        fire();
      }
    } catch (e) { /* SSE will deliver an updated snapshot later */ }
  }
  window.refreshAuthStatus = refreshAuthStatus;

  async function refreshProviders() {
    try {
      const r = await fetch('/api/notes/providers');
      window.PROVIDERS = await r.json();
      stateVersion++;
      fire();
    } catch (e) { /* ignore */ }
  }
  window.refreshProviders = refreshProviders;

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
    refreshNotes();
    refreshProviders();
    refreshAuthStatus();
    if (es) try { es.close(); } catch {}
    es = new EventSource('/api/stream');
    window._cofficeStream = es;             // exposed so live UI (note chat indicator) can listen too
    es.addEventListener('event',          e => pushEvent(JSON.parse(e.data)));
    es.addEventListener('stats',          e => { window.STATS = { ...window.STATS, ...JSON.parse(e.data) }; stateVersion++; fire(); });
    es.addEventListener('persona.status', e => applyPersonaStatus(JSON.parse(e.data)));
    es.addEventListener('persona.levels', e => applyPersonaLevels(JSON.parse(e.data)));
    es.addEventListener('agents',         e => applyAgents(JSON.parse(e.data)));
    es.addEventListener('task-board',     e => applyTaskBoard(JSON.parse(e.data)));
    es.addEventListener('theme',          e => applyTheme(JSON.parse(e.data)));
    es.addEventListener('notes',          () => refreshNotes());
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

  Object.assign(window, {
    fetchCOfficeNotes: refreshNotes,
    fetchCOfficeProviders: refreshProviders,
    fetchCOfficeState: () => fetch('/api/state').then(r => r.json()).then(applySnapshot),
  });

  bootstrap();
})();
