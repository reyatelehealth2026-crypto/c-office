// Run persistence — writes run snapshots to disk on phase transitions
// so a server restart doesn't silently lose a "running" record. Resume of
// in-flight runs is deferred to Phase 2; for now we only sweep stale
// running runs into a failed state on boot.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const RUNS_DIR = process.env.COFFICE_RUNS_DIR || path.join(os.homedir(), '.c-office', 'runs');
const STALE_RUN_MS = 5 * 60 * 1000;

function ensureDir() {
  try {
    fs.mkdirSync(RUNS_DIR, { recursive: true });
  } catch {
    /* best effort */
  }
}

function pathFor(runId) {
  const safe = String(runId || '').replace(/[^a-zA-Z0-9_.-]/g, '_');
  return path.join(RUNS_DIR, `${safe}.json`);
}

export function persistRun(run) {
  if (!run?.id) return;
  ensureDir();
  try {
    fs.writeFileSync(pathFor(run.id), JSON.stringify(run, null, 2), { mode: 0o600 });
  } catch {
    /* best effort — disk failure should not break the run */
  }
}

export function loadRun(runId) {
  try {
    const raw = fs.readFileSync(pathFor(runId), 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function listRunIds() {
  ensureDir();
  try {
    return fs.readdirSync(RUNS_DIR)
      .filter((f) => f.endsWith('.json'))
      .map((f) => f.slice(0, -5));
  } catch {
    return [];
  }
}

// Returns the run records that were "running" longer ago than STALE_RUN_MS
// — boot-time recovery uses these to mark them failed (server restart).
export function findStaleRunningRuns(now = Date.now()) {
  const ids = listRunIds();
  const stale = [];
  for (const id of ids) {
    const run = loadRun(id);
    if (!run) continue;
    if (run.status !== 'running') continue;
    const lastTs = run.endedAt || run.startedAt || 0;
    if (now - lastTs > STALE_RUN_MS) stale.push(run);
  }
  return stale;
}

export function runsDir() {
  return RUNS_DIR;
}
