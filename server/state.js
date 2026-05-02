import { EventEmitter } from 'node:events';
import { Dedupe, RingBuffer } from './util/dedupe.js';
import { listAgentsSync, getAgentSync, resolveAgentIdSync, mapAgentSync } from './store/agents.js';
import { getTaskBoardSync } from './store/task-board.js';
import { getThemeState, listThemes } from './store/theme.js';
import { persistRun, findStaleRunningRuns } from './store/runs.js';
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
  personaStatus: new Map(listAgentsSync().map(p => [p.id, 'idle'])),
  personaLevels: new Map(listAgentsSync().map(p => [p.id, p.level || 1])),  // runtime progression; +1 per successful Task after reset/server start
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

const resolvePersonaId = (value) => {
  return resolveAgentIdSync(value, 'orchestra');
};

function syncAgentRuntimeMaps() {
  const ids = new Set(listAgentsSync().map((agent) => agent.id));
  for (const id of ids) {
    if (!state.personaStatus.has(id)) state.personaStatus.set(id, 'idle');
    if (!state.personaLevels.has(id)) state.personaLevels.set(id, getAgentSync(id)?.level || 1);
  }
  for (const id of [...state.personaStatus.keys()]) if (!ids.has(id)) state.personaStatus.delete(id);
  for (const id of [...state.personaLevels.keys()]) if (!ids.has(id)) state.personaLevels.delete(id);
}

const summarize = (s, n = 140) => {
  s = String(s ?? '').replace(/\s+/g, ' ').trim();
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
};

const durationLabel = (ms) => {
  if (!Number.isFinite(ms) || ms < 0) return '0s';
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  if (m < 60) return rem ? `${m}m ${rem}s` : `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
};

const runProgress = (run) => {
  const steps = Array.isArray(run?.steps) ? run.steps : [];
  const failed = steps.filter(s => s.result?.ok === false).length;
  const ok = steps.filter(s => s.result?.ok === true).length;
  return { steps: steps.length, ok, failed };
};

const runSummary = (run) => {
  if (!run) return '';
  const progress = run.progress || runProgress(run);
  if (run.status === 'running') {
    return progress.steps
      ? `${progress.steps} delegation${progress.steps === 1 ? '' : 's'} running or complete`
      : 'Waiting for Orchestra to delegate';
  }
  if (run.status === 'failed') return summarize(run.error || run.result || 'Run failed', 180);
  if (run.final) return summarize(run.final, 180);
  if (run.result) return summarize(run.result, 180);
  return progress.steps ? `${progress.steps} delegation${progress.steps === 1 ? '' : 's'} complete` : 'Run complete';
};

export function viewRun(run) {
  if (!run) return null;
  const durationMs = (run.endedAt || Date.now()) - run.startedAt;
  const progress = run.progress || runProgress(run);
  return {
    ...run,
    progress,
    durationMs,
    durationLabel: durationLabel(durationMs),
    summary: run.summary || runSummary({ ...run, progress }),
  };
}

function emitRun(run) {
  bus.emit('run', viewRun(run));
  try { persistRun(run); } catch { /* best effort */ }
}

// Boot-time sweep: mark any "running" runs from a prior process as failed
// because we cannot resume them in Phase 1. Resume is Phase 2.
export function sweepStaleRuns() {
  let swept = 0;
  for (const stale of findStaleRunningRuns()) {
    stale.status = 'failed';
    stale.error = stale.error || 'Server restart — run abandoned';
    stale.endedAt = stale.endedAt || Date.now();
    state.runs.set(stale.id, stale);
    persistRun(stale);
    swept++;
  }
  return swept;
}

function rolloverIfNewDay() {
  const k = today();
  if (k !== state.stats.dayKey) {
    state.stats.dayKey = k;
    state.stats.tokensToday = 0;
    state.stats.spendToday = 0;
  }
}

function recomputePersonaStatus() {
  syncAgentRuntimeMaps();
  // base: idle for all
  for (const p of listAgentsSync()) state.personaStatus.set(p.id, p.enabled === false ? 'offline' : 'idle');
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
  const personaId = existing?.personaId || mapAgentSync(meta.subagent_type, kind);
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
}

// ---------- Tasks (Task tool spawns) ----------

export function startTask({ tool_use_id, sessionId, subagent_type, description }) {
  if (!tool_use_id) return;
  const personaId = mapAgentSync(subagent_type, 'agent');
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
    progress: { steps: 0, ok: 0, failed: 0 },
    status: 'running',
    phase: 'plan',
    plan: null,
    scratchpad: [],
    critique: null,
    verification: null,
    revisions: 0,
    phaseCosts: {},
    skillsRecalled: [],
    result: null,
    final: null,
    error: null,
    summary: 'Waiting for Orchestra to delegate',
    startedAt: Date.now(),
    endedAt: null,
  };
  state.runs.set(runId, run);
  emitRun(run);
  return run;
}

export function setRunPhase(runId, phase) {
  const run = state.runs.get(runId);
  if (!run) return;
  run.phase = phase;
  emitRun(run);
}

export function setRunPlan(runId, plan) {
  const run = state.runs.get(runId);
  if (!run) return;
  run.plan = Array.isArray(plan)
    ? plan.map((step, idx) => ({
        index: idx,
        persona: resolvePersonaId(step?.persona),
        instruction: summarize(step?.instruction || '', 320),
        depends_on: Number.isInteger(step?.depends_on) ? step.depends_on : null,
      }))
    : null;
  emitRun(run);
}

export function appendScratchpad(runId, entry) {
  const run = state.runs.get(runId);
  if (!run) return;
  const personaId = resolvePersonaId(entry?.persona);
  const persona = getAgentSync(personaId);
  run.scratchpad.push({
    ts: Date.now(),
    persona: personaId,
    personaName: persona?.name || personaId,
    kind: String(entry?.kind || 'note'),
    text: summarize(entry?.text || '', 1200),
  });
  if (run.scratchpad.length > 200) run.scratchpad.splice(0, run.scratchpad.length - 200);
  emitRun(run);
}

export function setRunCritique(runId, critique) {
  const run = state.runs.get(runId);
  if (!run) return;
  run.critique = critique
    ? {
        text: summarize(critique.text || '', 2000),
        severity: critique.severity || 'none',
        ts: Date.now(),
      }
    : null;
  if (critique?.text) {
    run.scratchpad.push({
      ts: Date.now(),
      persona: 'vex',
      personaName: getAgentSync('vex')?.name || 'Vivi',
      kind: 'critique',
      text: summarize(critique.text, 1200),
    });
    if (run.scratchpad.length > 200) run.scratchpad.splice(0, run.scratchpad.length - 200);
  }
  emitRun(run);
}

export function bumpRunRevision(runId) {
  const run = state.runs.get(runId);
  if (!run) return 0;
  run.revisions = (run.revisions || 0) + 1;
  emitRun(run);
  return run.revisions;
}

export function requestRunCancellation(runId, reason = 'user-cancelled') {
  const run = state.runs.get(runId);
  if (!run) return false;
  if (run.status === 'done' || run.status === 'failed') return false;
  run.cancelRequested = true;
  run.cancelReason = String(reason).slice(0, 200);
  run.scratchpad.push({
    ts: Date.now(),
    persona: 'orchestra',
    personaName: getAgentSync('orchestra')?.name || 'Orchestra',
    kind: 'cancel-requested',
    text: `Cancellation requested: ${run.cancelReason}`,
  });
  if (run.scratchpad.length > 200) run.scratchpad.splice(0, run.scratchpad.length - 200);
  emitRun(run);
  return true;
}

export function isRunCancellationRequested(runId) {
  const run = state.runs.get(runId);
  return !!run?.cancelRequested;
}

export function addPhaseCost(runId, phase, cost) {
  const run = state.runs.get(runId);
  if (!run || !phase) return 0;
  run.phaseCosts = run.phaseCosts || {};
  const prev = run.phaseCosts[phase] || { tokens: 0, usd: 0 };
  run.phaseCosts[phase] = {
    tokens: prev.tokens + (Number(cost?.tokens) || 0),
    usd: prev.usd + (Number(cost?.usd) || 0),
  };
  emitRun(run);
  return Object.values(run.phaseCosts).reduce((sum, c) => sum + (c.usd || 0), 0);
}

export const COST_CEILING_USD = Number(process.env.COFFICE_MAX_USD_PER_RUN) || 5.0;

export function runOverBudget(runId) {
  const run = state.runs.get(runId);
  if (!run?.phaseCosts) return false;
  const total = Object.values(run.phaseCosts).reduce((sum, c) => sum + (c.usd || 0), 0);
  return total > COST_CEILING_USD;
}

export function setRunSkillsRecalled(runId, skills) {
  const run = state.runs.get(runId);
  if (!run) return;
  run.skillsRecalled = Array.isArray(skills)
    ? skills.map((s) => ({
        id: String(s?.id || ''),
        goal: summarize(s?.goal || '', 160),
        tags: Array.isArray(s?.tags) ? s.tags.slice(0, 8) : [],
        score: Number.isFinite(s?.score) ? s.score : 0,
      }))
    : [];
  emitRun(run);
}

export function setRunVerification(runId, verification) {
  const run = state.runs.get(runId);
  if (!run) return;
  run.verification = verification
    ? {
        passed: !!verification.passed,
        text: summarize(verification.text || '', 1200),
        ts: Date.now(),
      }
    : null;
  if (verification?.text) {
    run.scratchpad.push({
      ts: Date.now(),
      persona: 'orchestra',
      personaName: getAgentSync('orchestra')?.name || 'Orchestra',
      kind: verification.passed ? 'verify-pass' : 'verify-fail',
      text: summarize(verification.text, 800),
    });
    if (run.scratchpad.length > 200) run.scratchpad.splice(0, run.scratchpad.length - 200);
  }
  emitRun(run);
}

export function stepRun(runId, step) {
  const run = state.runs.get(runId);
  if (!run) return;
  const personaId = resolvePersonaId(step.persona);
  const persona = getAgentSync(personaId);
  const ok = !!step.result?.ok;
  run.steps.push({
    tool_use_id: step.tool_use_id,
    persona: personaId,
    personaName: persona?.name || String(step.persona || personaId),
    instruction: summarize(step.instruction || '', 220),
    depends_on: step.depends_on || null,
    result: {
      ok,
      status: ok ? 'ok' : 'err',
      text: summarize(step.result?.text || '', 4000),
      error: step.result?.error || (!ok ? summarize(step.result?.text || 'Delegation failed', 300) : null),
      image: step.result?.image || null,
    },
    durationMs: Number.isFinite(step.durationMs) ? step.durationMs : null,
    ts: Date.now(),
  });
  run.progress = runProgress(run);
  run.summary = runSummary(run);
  emitRun(run);
}

// ---------- Approval gates ----------

export function setRunStatus(runId, status) {
  const run = state.runs.get(runId);
  if (!run) return;
  run.status = status;
  emitRun(run);
}

const gateResolvers = new Map();

export function registerGateResolver(runId, resolve, reject) {
  gateResolvers.set(runId, { resolve, reject });
}

export function approveRunPhase(runId, phase) {
  const run = state.runs.get(runId);
  if (!run) throw new Error("unknown run: " + runId);
  run.status = "running";
  run.scratchpad.push({ ts: Date.now(), persona: "orchestra", personaName: "Orchestra", kind: "gate-approved", text: "Phase " + phase + " approved" });
  if (run.scratchpad.length > 200) run.scratchpad.splice(0, run.scratchpad.length - 200);
  emitRun(run);
  const gate = gateResolvers.get(runId);
  if (gate) { gateResolvers.delete(runId); gate.resolve(phase); }
}

export function rejectRunPhase(runId, phase, reason) {
  reason = reason || "Rejected";
  const run = state.runs.get(runId);
  if (!run) throw new Error("unknown run: " + runId);
  run.status = "failed";
  run.error = String(reason);
  run.endedAt = Date.now();
  run.scratchpad.push({ ts: Date.now(), persona: "orchestra", personaName: "Orchestra", kind: "gate-rejected", text: "Phase " + phase + " rejected: " + reason });
  if (run.scratchpad.length > 200) run.scratchpad.splice(0, run.scratchpad.length - 200);
  emitRun(run);
  const gate = gateResolvers.get(runId);
  if (gate) { gateResolvers.delete(runId); gate.reject(new Error("Gate rejected: " + reason)); }
}

export function finishRun(runId, outcome = {}) {
  const run = state.runs.get(runId);
  if (!run) return;
  run.status = outcome.status || 'done';
  run.final = outcome.final || null;
  run.error = outcome.error || null;
  run.result = outcome.final ?? outcome.error ?? null;
  run.endedAt = Date.now();
  run.progress = runProgress(run);
  run.summary = runSummary(run);
  emitRun(run);
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
  syncAgentRuntimeMaps();
  for (const p of listAgentsSync()) state.personaLevels.set(p.id, 1);
  bus.emit('persona.levels', Object.fromEntries(state.personaLevels));
  recomputePersonaStatus();
  recomputeStats();
  broadcastPersonaStatus();
  broadcastStats();
  bus.emit('reset');
}

// Reset only RPG levels. Keeps activity, sessions, tasks, stats, and notes.
export function resetPersonaLevels() {
  syncAgentRuntimeMaps();
  for (const p of listAgentsSync()) state.personaLevels.set(p.id, 1);
  bus.emit('persona.levels', Object.fromEntries(state.personaLevels));
}

// ---------- Snapshot ----------

export function snapshot() {
  recomputeStats();
  recomputePersonaStatus();
  syncAgentRuntimeMaps();
  const agents = listAgentsSync().map(p => {
    const status = state.personaStatus.get(p.id) || 'idle';
    // pick the most recent live session this persona owns for currentTask + stats
    const owned = [...state.sessions.values()].filter(s => s.personaId === p.id);
    const live  = owned.filter(s => !s.endedAt);
    const recent = (live[0] || owned[0]);
    const tasksDone = [...state.tasks.values()].filter(t => t.personaId === p.id && t.status !== 'running').length;
    const doneCount = [...state.tasks.values()].filter(t => t.personaId === p.id && t.status === 'done').length;
    const success = tasksDone
      ? Math.round(100 * doneCount / tasksDone)
      : 100;
    const tokens = state.events.filter(e => e.personaId === p.id).reduce((acc, e) => {
      if (!e.usage) return acc;
      return acc + (e.usage.input_tokens||0) + (e.usage.output_tokens||0) + (e.usage.cache_read_input_tokens||0);
    }, 0);
    const exp = (doneCount * 100) + Math.floor(tokens / 100);
    const level = state.personaLevels.get(p.id) ?? p.level ?? 1;
    const progress = exp % 500;
    return {
      ...p,
      level: state.personaLevels.get(p.id) ?? 1,    // dynamic — reset to 1 by clearState, +1 per task done
      level,
      exp,
      reward: doneCount * 100,
      progress: Math.round((progress / 500) * 100),
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

  const gameProgress = {
    theme: getThemeState().theme,
    exp: agents.reduce((sum, agent) => sum + (agent.exp || 0), 0),
    reward: agents.reduce((sum, agent) => sum + (agent.reward || 0), 0),
    progress: agents.length
      ? Math.round(agents.reduce((sum, agent) => sum + (agent.progress || 0), 0) / agents.length)
      : 0,
    perAgent: Object.fromEntries(agents.map((agent) => [agent.id, {
      level: agent.level,
      exp: agent.exp || 0,
      reward: agent.reward || 0,
      progress: agent.progress || 0,
      status: agent.status,
    }])),
  };
  const liveBoardTasks = [...state.tasks.values()].slice(-100).map((task) => ({
    id: `live:${task.id}`,
    taskId: task.id,
    title: task.description || task.subagent_type || 'Live agent task',
    description: task.description || '',
    agentId: task.personaId,
    status: task.status === 'running' ? 'running' : task.status === 'done' ? 'done' : 'review',
    runStatus: task.status,
    createdAt: task.startedAt,
    updatedAt: task.endedAt || task.startedAt,
    events: [
      { id: `live-start:${task.id}`, ts: task.startedAt, text: 'live task started', status: 'running' },
      ...(task.endedAt ? [{ id: `live-end:${task.id}`, ts: task.endedAt, text: `live task ${task.status}`, status: task.status }] : []),
    ],
  }));

  return {
    agents,
    personas: agents,
    sessions: [...state.sessions.values()],
    events: state.events.toArray(),
    tasks: [...state.tasks.values()].sort((a,b) => b.startedAt - a.startedAt).slice(0, 100),
    runs: [...state.runs.values()].sort((a,b) => b.startedAt - a.startedAt).slice(0, 50).map(viewRun),
    dispatches: [...state.dispatches.values()].sort((a,b) => b.updatedAt - a.updatedAt).slice(0, 100),
    stats: state.stats,
    edges,
    taskBoard: getTaskBoardSync(liveBoardTasks),
    theme: getThemeState().theme,
    themes: listThemes(),
    gameProgress,
    serverTime: Date.now(),
  };
}
