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
  window.INVENTORY      = { gold: 0, ownedAgents: ['orchestra'], skills: {}, items: {} };
  window.SHOP_CATALOG   = { skills: [], items: [], agents: [] };
  window.STATS = { tokensToday: 0, spendToday: 0, agentsOnline: 0, tasksRunning: 0 };
  window.NOTES          = [];
  window.PROVIDERS      = { providers: [], default: 'echo' };

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

  function applyPersonaLevels(map) {
    if (!map) return;
    window.AGENTS = window.AGENTS.map(a => ({ ...a, level: map[a.id] || 1 }));
    stateVersion++;
    fire();
  }

  function applyInventory(inv) {
    if (!inv || typeof inv !== 'object') return;
    window.INVENTORY = {
      gold: Number.isFinite(inv.gold) ? inv.gold : 0,
      ownedAgents: Array.isArray(inv.ownedAgents) ? inv.ownedAgents : ['orchestra'],
      skills: inv.skills && typeof inv.skills === 'object' ? inv.skills : {},
      items: inv.items && typeof inv.items === 'object' ? inv.items : {},
    };
    stateVersion++;
    fire();
  }

  function applyShopCatalog(catalog) {
    if (!catalog || typeof catalog !== 'object') return;
    window.SHOP_CATALOG = {
      skills: Array.isArray(catalog.skills) ? catalog.skills : [],
      items: Array.isArray(catalog.items) ? catalog.items : [],
      agents: Array.isArray(catalog.agents) ? catalog.agents : [],
    };
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

  async function refreshProviders() {
    try {
      const r = await fetch('/api/notes/providers');
      window.PROVIDERS = await r.json();
      stateVersion++;
      fire();
    } catch (e) { /* ignore */ }
  }
  window.refreshProviders = refreshProviders;

  async function refreshShop() {
    try {
      const r = await fetch('/api/shop');
      const j = await r.json();
      applyShopCatalog(j.catalog || { skills: [], items: [], agents: [] });
      applyInventory(j.inventory || { gold: 0, ownedAgents: ['orchestra'], skills: {}, items: {} });
    } catch (e) { /* ignore */ }
  }
  window.refreshShop = refreshShop;

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
    refreshShop();
    if (es) try { es.close(); } catch {}
    es = new EventSource('/api/stream');
    window._cofficeStream = es;             // exposed so live UI (note chat indicator) can listen too
    es.addEventListener('event',          e => pushEvent(JSON.parse(e.data)));
    es.addEventListener('stats',          e => { window.STATS = { ...window.STATS, ...JSON.parse(e.data) }; stateVersion++; fire(); });
    es.addEventListener('persona.status', e => applyPersonaStatus(JSON.parse(e.data)));
    es.addEventListener('persona.levels', e => applyPersonaLevels(JSON.parse(e.data)));
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
    es.addEventListener('inventory',      e => applyInventory(JSON.parse(e.data)));
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
    fetchCOfficeShop: refreshShop,
    fetchCOfficeNotes: refreshNotes,
    fetchCOfficeProviders: refreshProviders,
  });

  bootstrap();
})();
