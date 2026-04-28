import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import stateRoute from './api/state.js';
import streamRoute from './api/stream.js';
import hooksRoute from './api/hooks.js';
import { clearState } from './state.js';
import agentHistoryRoute from './api/agents.js';
import memoryRoute from './api/memory.js';
import dispatchesRoute from './api/dispatches.js';
import { getSettings } from './api/settings.js';
import { startSessionsWatcher } from './watchers/sessions.js';
import { startTranscriptsWatcher } from './watchers/transcripts.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.resolve(__dirname, '../public');
const PORT = Number(process.env.PORT) || 7878;
const HOST = process.env.HOST || '127.0.0.1';

const app = express();
app.use(express.json({ limit: '4mb' }));

app.get ('/api/state',          stateRoute);
app.post('/api/state/reset',    (req, res) => { clearState(); res.json({ ok: true, cleared: true, ts: Date.now() }); });
app.get ('/api/stream',         streamRoute);
app.post('/hooks/event',        hooksRoute);
app.get ('/api/agents/:id/history', agentHistoryRoute);
app.get ('/api/memory',         memoryRoute);
app.use ('/api/dispatches',     dispatchesRoute);
app.get ('/api/settings',       getSettings);

app.use(express.static(PUBLIC_DIR, {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.jsx')) res.setHeader('Content-Type', 'text/babel; charset=utf-8');
  },
}));

app.listen(PORT, HOST, async () => {
  console.log(`[c-office] monitor on http://${HOST}:${PORT}`);
  try { await startSessionsWatcher();    console.log('[c-office] sessions watcher up'); } catch (e) { console.error('[c-office] sessions watcher failed:', e.message); }
  try { await startTranscriptsWatcher(); console.log('[c-office] transcripts watcher up'); } catch (e) { console.error('[c-office] transcripts watcher failed:', e.message); }
});

process.on('uncaughtException',  e => console.error('[c-office] uncaught:', e));
process.on('unhandledRejection', e => console.error('[c-office] unhandledRejection:', e));
