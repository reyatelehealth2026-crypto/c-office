import { EventEmitter } from 'node:events';
import { Dedupe, RingBuffer } from './util/dedupe.js';
import { PERSONAS, PERSONAS_BY_ID, mapPersona } from './mapping/personas.js';
import { costUsd } from './mapping/pricing.js';

export const bus = new EventEmitter();
bus.setMaxListeners(50);

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
};

export const state = {
  sessions: new Map(),               // sessionId → {pid, sessionId, cwd, startedAt, endedAt, kind, personaId, parentSessionId, currentTask}
  events:   new RingBuffer(2000),    // normalized events
  tasks:    new Map(),               // tool_use_id → task
  runs:     new Map(),               // run_id → orchestrator run record (server-side agent execution)
  dispatches: new Map(),             // dashboard-created mission notes / CLI dispatch drafts
  fileOffsets: new Map(),            // jsonlPath → byte offset
  personaStatus: new Map(PERSONAS.map(p => [p.id, 'idle'])),
  personaLevels: new Map(PERSONAS.map(p => [p.id, 1])),  // runtime progression; +1 per successful Task after reset/server start
  stats: { tokensToday: 0, spendToday: 0, agentsOnline: 0, tasksRunning: 0, dayKey: today() },
  dedupe: new Dedupe(4096),
  lastToolActivity: new Map(),       // personaId → ts (mark busy while within window)
};

// Persona is "busy" for BUSY_WINDOW_MS after any tool_use event.
// Stop hook (turn-end) clears immediately.
const BUSY_WINDOW_MS = 8000;

let evCounter = 0;
const nextId = () => `ev_${Date.now().toString(36)}_${(evCounter++).toString(36)}`;
let dispatchCounter = 0;
const nextDispatchId = () => `dispatch_${Date.now().toString(36)}_${(dispatchCounter++).toString(36)}`;

const DISPATCH_STATUSES = new Set(['draft', 'queued', 'chatting', 'done']);

const hasPersona = (id) => PERSONAS_BY_ID.has(id);
const resolvePersonaId = (value) => {
  const raw = String(value || '').trim();
  if (hasPersona(raw)) return raw;
  const norm = raw.toLowerCase().replace(/\s+/g, '-');
  const match = PERSONAS.find(p =>
    p.id === norm ||
    p.name.toLowerCase() === raw.toLowerCase() ||
    p.name.toLowerCase().replace(/\s+/g, '-') === norm
  );
  return match?.id || 'orchestra';
};

const summarize = (s, n = 140) => {
  s = String(s ?? '').replace(/\s+/g, ' ').trim();
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
};

function rolloverIfNewDay() {
  const k = today();
  if (k !== state.stats.dayKey) {
    state.stats.dayKey = k;
    state.stats.tokensToday = 0;
    state.stats.spendToday = 0;
  }
}

function recomputePersonaStatus() {
  // base: idle for all
  for (const p of PERSONAS) state.personaStatus.set(p.id, 'idle');
  // active for any persona that owns a live session
  for (const s of state.sessions.values()) {
    if (s.endedAt) continue;
    const cur = state.personaStatus.get(s.personaId) || 'idle';
    state.personaStatus.set(s.personaId, cur === 'busy' ? 'busy' : 'active');
  }
  // busy: running Task-tool subagent
  for (const t of state.tasks.values()) {
    if (t.status === 'running') state.personaStatus.set(t.personaId, 'busy');
  }
  // busy: recent tool activity (Read/Edit/Bash/etc.) inside the decay window
  const now = Date.now();
  for (const [pid, ts] of state.lastToolActivity) {
    if (now - ts <= BUSY_WINDOW_MS) state.personaStatus.set(pid, 'busy');
  }
}

// periodic tick lets recent-tool-use decay back to active/idle even when
// no further hooks fire (e.g. long silence after a tool finishes).
let lastBroadcastStatus = '';
setInterval(() => {
  // cull stale entries from lastToolActivity to keep map tiny
  const cutoff = Date.now() - BUSY_WINDOW_MS;
  for (const [pid, ts] of state.lastToolActivity) {
    if (ts < cutoff) state.lastToolActivity.delete(pid);
  }
  recomputePersonaStatus();
  const snapshot = JSON.stringify(Object.fromEntries(state.personaStatus));
  if (snapshot !== lastBroadcastStatus) {
    lastBroadcastStatus = snapshot;
    bus.emit('persona.status', Object.fromEntries(state.personaStatus));
  }
}, 2000).unref?.();

function recomputeStats() {
  state.stats.agentsOnline = new Set(
    [...state.sessions.values()].filter(s => !s.endedAt).map(s => s.personaId)
  ).size;
  state.stats.tasksRunning = [...state.tasks.values()].filter(t => t.status === 'running').length;
}

function broadcastStats() {
  bus.emit('stats', state.stats);
}

function broadcastPersonaStatus() {
  const snapshot = Object.fromEntries(state.personaStatus);
  bus.emit('persona.status', snapshot);
}

// ---------- Session lifecycle ----------

export function upsertSession(meta) {
  const { sessionId, pid, cwd, startedAt, kind, version, parentSessionId } = meta;
  if (!sessionId) return;
  const existing = state.sessions.get(sessionId);
  const personaId = existing?.personaId || mapPersona(meta.subagent_type, kind);
  const session = {
    pid, sessionId, cwd, startedAt, kind, version, parentSessionId, personaId,
    endedAt: null,                                  // upsert always revives — file presence wins
    currentTask: existing?.currentTask || null,
  };
  state.sessions.set(sessionId, session);
  recomputePersonaStatus();
  recomputeStats();
  bus.emit('session.start', session);
  broadcastPersonaStatus();
  broadcastStats();
}

export function endSession(sessionId, reason = 'closed') {
  const s = state.sessions.get(sessionId);
  if (!s || s.endedAt) return;
  s.endedAt = Date.now();
  s.endReason = reason;
  recomputePersonaStatus();
  recomputeStats();
  bus.emit('session.end', { sessionId, reason });
  broadcastPersonaStatus();
  broadcastStats();
}

// ---------- Events ----------

export function pushEvent(ev) {
  rolloverIfNewDay();
  if (ev.dedupeKey && state.dedupe.seen(ev.dedupeKey)) return;
  if (!ev.id) ev.id = nextId();
  if (!ev.ts) ev.ts = Date.now();
  // resolve persona via session
  if (!ev.personaId && ev.sessionId) {
    const s = state.sessions.get(ev.sessionId);
    if (s) ev.personaId = s.personaId;
  }
  if (!ev.personaId) ev.personaId = 'orchestra';

  state.events.push(ev);
  bus.emit('event', ev);

  // tool-activity → busy state (both PreToolUse and PostToolUse refresh the window)
  if (ev.personaId && (ev.verb === 'used' || ev.verb === 'result')) {
    state.lastToolActivity.set(ev.personaId, ev.ts);
    recomputePersonaStatus();
    broadcastPersonaStatus();
  }
  // turn ended → clear busy immediately
  if (ev.personaId && ev.verb === 'turn-end') {
    state.lastToolActivity.delete(ev.personaId);
    recomputePersonaStatus();
    broadcastPersonaStatus();
  }
}

// Usage tracking is intentionally separate from event dedupe.
// Hook + JSONL tail will both hit the same tool_use_id, but JSONL line carries
// the assistant `usage` block — recording it under a uuid-based key prevents
// the hook duplicate from drowning the token tally.
export function recordUsage({ model, usage, dedupeKey, sessionId }) {
  if (!usage) return;
  if (dedupeKey && state.dedupe.seen(dedupeKey)) return;
  rolloverIfNewDay();
  const tokensCounted =
    (usage.input_tokens || 0) +
    (usage.output_tokens || 0) +
    (usage.cache_read_input_tokens || 0) +
    (usage.cache_creation_input_tokens || 0);
  state.stats.tokensToday += tokensCounted;
  state.stats.spendToday += costUsd(model, usage);
  broadcastStats();
  if (tokensCounted > 0) bus.emit('reward.usage', { tokens: tokensCounted });
}

// ---------- Tasks (Task tool spawns) ----------

export function startTask({ tool_use_id, sessionId, subagent_type, description }) {
  if (!tool_use_id) return;
  const personaId = mapPersona(subagent_type, 'agent');
  const task = {
    id: tool_use_id,
    sessionId,
    subagent_type,
    personaId,
    status: 'running',
    description,
    startedAt: Date.now(),
    endedAt: null,
  };
  state.tasks.set(tool_use_id, task);
  // overlay current task on the conducting session
  const parent = state.sessions.get(sessionId);
  if (parent) parent.currentTask = description;
  recomputePersonaStatus();
  recomputeStats();
  bus.emit('task', task);
  broadcastPersonaStatus();
  broadcastStats();
}

export function finishTask({ tool_use_id, status = 'done' }) {
  const t = state.tasks.get(tool_use_id);
  if (!t) return;
  t.status = status;
  t.endedAt = Date.now();
  // Level up the actor on success — accumulates indefinitely after a reset.
  if (status === 'done' && t.personaId) {
    const cur = state.personaLevels.get(t.personaId) ?? 1;
    state.personaLevels.set(t.personaId, cur + 1);
    bus.emit('reward.task', { personaId: t.personaId, taskId: t.id });
    bus.emit('persona.levels', Object.fromEntries(state.personaLevels));
  }
  recomputePersonaStatus();
  recomputeStats();
  bus.emit('task', t);
  broadcastPersonaStatus();
  broadcastStats();
}

// ---------- Orchestrator runs (server-side agent execution) ----------

export function startRun(runId, goal) {
  const run = {
    id: runId,
    goal: String(goal || '').slice(0, 4000),
    steps: [],
    status: 'running',
    result: null,
    startedAt: Date.now(),
    endedAt: null,
  };
  state.runs.set(runId, run);
  bus.emit('run', run);
  return run;
}

export function stepRun(runId, step) {
  const run = state.runs.get(runId);
  if (!run) return;
  run.steps.push({
    tool_use_id: step.tool_use_id,
    persona: step.persona,
    instruction: summarize(step.instruction || '', 220),
    result: {
      ok: !!step.result?.ok,
      text: summarize(step.result?.text || '', 4000),
      image: step.result?.image || null,
    },
    ts: Date.now(),
  });
  bus.emit('run', run);
}

export function finishRun(runId, outcome = {}) {
  const run = state.runs.get(runId);
  if (!run) return;
  run.status = outcome.status || 'done';
  run.result = outcome.final ?? outcome.error ?? null;
  run.endedAt = Date.now();
  bus.emit('run', run);
}

// ---------- Dashboard dispatches / mission notes ----------

export function createDispatch(input = {}) {
  const now = Date.now();
  const prompt = String(input.prompt || input.title || '').trim();
  const personaId = resolvePersonaId(input.personaId);
  const dispatch = {
    id: nextDispatchId(),
    title: summarize(input.title || prompt || 'Untitled mission', 80),
    prompt,
    provider: String(input.provider || 'claude'),
    personaId,
    status: DISPATCH_STATUSES.has(input.status) ? input.status : 'queued',
    messages: Array.isArray(input.messages) ? input.messages.slice(0, 50) : [],
    createdAt: now,
    updatedAt: now,
  };
  state.dispatches.set(dispatch.id, dispatch);
  bus.emit('dispatch', dispatch);
  pushEvent({
    ts: now,
    personaId,
    verb: 'prompt',
    toolName: 'Dashboard',
    text: summarize(prompt || dispatch.title),
    status: 'ok',
    dispatchId: dispatch.id,
    dedupeKey: `dispatch:create:${dispatch.id}`,
  });
  return dispatch;
}

export function updateDispatch(id, patch = {}) {
  const existing = state.dispatches.get(id);
  if (!existing) return null;
  const next = { ...existing };
  if ('title' in patch) next.title = summarize(patch.title || existing.title, 80);
  if ('prompt' in patch) next.prompt = String(patch.prompt || '').trim();
  if ('provider' in patch) next.provider = String(patch.provider || existing.provider);
  if ('personaId' in patch) next.personaId = resolvePersonaId(patch.personaId);
  if ('status' in patch && DISPATCH_STATUSES.has(patch.status)) next.status = patch.status;
  if (Array.isArray(patch.messages)) next.messages = patch.messages.slice(-50);
  next.updatedAt = Date.now();
  state.dispatches.set(id, next);
  bus.emit('dispatch', next);
  if (patch.status === 'done') {
    pushEvent({
      ts: next.updatedAt,
      personaId: next.personaId,
      verb: 'turn-end',
      toolName: 'Dashboard',
      text: summarize(`${next.title} complete`),
      status: 'ok',
      dispatchId: next.id,
      dedupeKey: `dispatch:done:${next.id}:${next.updatedAt}`,
    });
  }
  return next;
}

// ---------- Reset ----------

// Clear in-memory accumulated state without restarting the server.
// Keeps live sessions (so currently-running claudes stay visible) and file offsets
// (so we don't re-replay historical JSONL bytes).
export function clearState() {
  state.events = new RingBuffer(2000);
  state.tasks.clear();
  state.runs.clear();
  state.dispatches.clear();
  for (const [sid, s] of state.sessions) {
    if (s.endedAt) state.sessions.delete(sid);
  }
  state.stats.tokensToday = 0;
  state.stats.spendToday  = 0;
  state.dedupe = new Dedupe(4096);
  state.lastToolActivity.clear();
  // Reset every persona to Lv.1 — fresh RPG progression starts here.
  for (const p of PERSONAS) state.personaLevels.set(p.id, 1);
  bus.emit('persona.levels', Object.fromEntries(state.personaLevels));
  recomputePersonaStatus();
  recomputeStats();
  broadcastPersonaStatus();
  broadcastStats();
  bus.emit('reset');
}

// Reset only RPG levels. Keeps activity, sessions, tasks, stats, and notes.
export function resetPersonaLevels() {
  for (const p of PERSONAS) state.personaLevels.set(p.id, 1);
  bus.emit('persona.levels', Object.fromEntries(state.personaLevels));
}

// ---------- Snapshot ----------

export function snapshot() {
  recomputeStats();
  recomputePersonaStatus();
  const personas = PERSONAS.map(p => {
    const status = state.personaStatus.get(p.id) || 'idle';
    // pick the most recent live session this persona owns for currentTask + stats
    const owned = [...state.sessions.values()].filter(s => s.personaId === p.id);
    const live  = owned.filter(s => !s.endedAt);
    const recent = (live[0] || owned[0]);
    const tasksDone = [...state.tasks.values()].filter(t => t.personaId === p.id && t.status !== 'running').length;
    const success = tasksDone
      ? Math.round(100 * [...state.tasks.values()].filter(t => t.personaId === p.id && t.status === 'done').length / tasksDone)
      : 100;
    const tokens = state.events.filter(e => e.personaId === p.id).reduce((acc, e) => {
      if (!e.usage) return acc;
      return acc + (e.usage.input_tokens||0) + (e.usage.output_tokens||0) + (e.usage.cache_read_input_tokens||0);
    }, 0);
    return {
      ...p,
      level: state.personaLevels.get(p.id) ?? 1,    // dynamic — reset to 1 by clearState, +1 per task done
      status,
      currentTask: recent?.currentTask || (status === 'idle' ? '— idle' : 'awaiting work'),
      stats: {
        tasks: tasksDone,
        success,
        uptime: live.length ? '100%' : '—',
        tokens: tokens > 1000 ? `${(tokens/1000).toFixed(1)}k` : `${tokens}`,
      },
      memoryNodes: 0,
      memoryFresh: 0,
    };
  });

  // session→subagent edges (Task spawns) for collab graph, last 1h
  const horizon = Date.now() - 60*60*1000;
  const edges = [...state.tasks.values()]
    .filter(t => t.startedAt >= horizon)
    .map(t => {
      const parent = state.sessions.get(t.sessionId);
      return parent ? [parent.personaId, t.personaId] : null;
    })
    .filter(Boolean)
    .filter(([a,b]) => a !== b);

  return {
    personas,
    sessions: [...state.sessions.values()],
    events: state.events.toArray(),
    tasks: [...state.tasks.values()].sort((a,b) => b.startedAt - a.startedAt).slice(0, 100),
    runs: [...state.runs.values()].sort((a,b) => b.startedAt - a.startedAt).slice(0, 50),
    dispatches: [...state.dispatches.values()].sort((a,b) => b.updatedAt - a.updatedAt).slice(0, 100),
    stats: state.stats,
    edges,
    serverTime: Date.now(),
  };
}
