import chokidar from 'chokidar';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { upsertSession, endSession, state } from '../state.js';
import { pidAlive } from '../util/ps.js';

const SESSIONS_DIR = path.join(os.homedir(), '.claude', 'sessions');

async function loadSession(file) {
  try {
    const txt = await fs.readFile(file, 'utf8');
    const j = JSON.parse(txt);
    upsertSession({
      sessionId: j.sessionId,
      pid: j.pid,
      cwd: j.cwd,
      startedAt: j.startedAt ? Date.parse(j.startedAt) || Date.now() : Date.now(),
      kind: j.kind || 'interactive',
      version: j.version,
      parentSessionId: j.parentSessionId || null,
    });
  } catch { /* file mid-write or gone */ }
}

async function unloadFile(file) {
  // file path is sessions/<PID>.json — use PID to find which session
  const pid = Number(path.basename(file, '.json'));
  for (const [sid, s] of state.sessions) {
    if (s.pid === pid && !s.endedAt) endSession(sid, 'file-removed');
  }
}

export async function startSessionsWatcher() {
  await fs.mkdir(SESSIONS_DIR, { recursive: true });
  const watcher = chokidar.watch(SESSIONS_DIR, {
    ignoreInitial: false,
    depth: 0,
    persistent: true,
  });
  watcher.on('add',    loadSession);
  watcher.on('change', loadSession);
  watcher.on('unlink', unloadFile);

  // liveness sweep every 15s — also revives sessions whose file + pid are still alive.
  setInterval(async () => {
    let sessionFiles = new Set();
    try {
      const files = await fs.readdir(SESSIONS_DIR);
      sessionFiles = new Set(files.filter(f => f.endsWith('.json')).map(f => Number(path.basename(f, '.json'))));
    } catch { /* dir gone */ }

    for (const [sid, s] of state.sessions) {
      const alive = await pidAlive(s.pid) && sessionFiles.has(s.pid);
      if (!alive && !s.endedAt) endSession(sid, 'pid-gone');
      // Note: we don't auto-revive ended sessions here — chokidar 'change' event
      // will trigger upsertSession() if the file is touched again, which clears endedAt.
    }
    // Pick up any session files we missed (e.g. server started after Claude)
    for (const pid of sessionFiles) {
      const known = [...state.sessions.values()].some(x => x.pid === pid && !x.endedAt);
      if (!known) await loadSession(path.join(SESSIONS_DIR, pid + '.json'));
    }
  }, 15_000).unref();

  return watcher;
}
