import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import stateRoute from './api/state.js';
import streamRoute from './api/stream.js';
import hooksRoute from './api/hooks.js';
import { clearState, resetPersonaLevels } from './state.js';
import agentsRoute from './api/agents.js';
import memoryRoute from './api/memory.js';
import dispatchesRoute from './api/dispatches.js';
import authRoute from './api/auth.js';
import taskRoute from './api/task.js';
import taskBoardRoute from './api/task-board.js';
import themeRoute from './api/theme.js';
import shopRoute from './api/shop.js';
import { getInventory } from './orchestration/shop.js';
import { getSettings } from './api/settings.js';
import { imageStatusRoute, generateImageRoute } from './api/images.js';
import {
  listRoute as notesList, getOneRoute as notesGet, createRoute as notesCreate,
  patchRoute as notesPatch, deleteRoute as notesDelete,
  messageRoute as notesMessage, dispatchRoute as notesDispatch,
  providersRoute as notesProviders,
} from './api/notes.js';
import { startSessionsWatcher } from './watchers/sessions.js';
import { startTranscriptsWatcher } from './watchers/transcripts.js';
import { accessLoginRoute, accessStatus, requireAccessToken } from './security/access-token.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.resolve(__dirname, '../public');
const PORT = Number(process.env.PORT) || 7878;
const HOST = process.env.HOST || '127.0.0.1';

const app = express();
app.use(express.json({ limit: '4mb' }));
app.get('/access', accessLoginRoute);
app.use(requireAccessToken);

app.get ('/api/state',          stateRoute);
app.post('/api/state/reset',    (req, res) => { clearState(); res.json({ ok: true, cleared: true, ts: Date.now() }); });
app.post('/api/levels/reset',   (req, res) => { resetPersonaLevels(); res.json({ ok: true, levelsReset: true, ts: Date.now() }); });
app.get ('/api/stream',         streamRoute);
app.post('/hooks/event',        hooksRoute);
app.use ('/api/agents',        agentsRoute);
app.get ('/api/memory',         memoryRoute);
app.use ('/api/dispatches',     dispatchesRoute);
app.use (authRoute);                              // /auth/*, /api/auth/*
app.use (taskRoute);                              // /api/task, /api/task/:id, /api/tasks
app.use ('/api/task-board',     taskBoardRoute);
app.use ('/api/theme',          themeRoute);
app.get ('/api/settings',       getSettings);

// Notes inbox + agent dispatch
app.get   ('/api/notes',                   notesList);
app.post  ('/api/notes',                   notesCreate);
app.get   ('/api/notes/providers',         notesProviders);
app.get   ('/api/providers',               notesProviders);
app.get   ('/api/notes/:id',               notesGet);
app.patch ('/api/notes/:id',               notesPatch);
app.delete('/api/notes/:id',               notesDelete);
app.post  ('/api/notes/:id/message',       notesMessage);
app.post  ('/api/notes/:id/dispatch',      notesDispatch);
app.get   ('/api/shop',                    shopRoute);
app.post  ('/api/shop/buy',                shopRoute);
app.post  ('/api/shop/unequip',            shopRoute);
app.post  ('/api/shop/use',                shopRoute);
app.post  ('/api/shop/grant-victory',      shopRoute);
app.get   ('/api/images/status',           imageStatusRoute);
app.post  ('/api/images/generate',         generateImageRoute);

app.use(express.static(PUBLIC_DIR, {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.jsx')) res.setHeader('Content-Type', 'text/babel; charset=utf-8');
  },
}));

app.listen(PORT, HOST, async () => {
  console.log(`[c-office] monitor on http://${HOST}:${PORT}`);
  if (accessStatus().enabled) console.log('[c-office] access token gate enabled');
  else if (HOST !== '127.0.0.1' && HOST !== 'localhost') console.warn('[c-office] WARNING: external host without C_OFFICE_ACCESS_TOKEN');
  try { await startSessionsWatcher();    console.log('[c-office] sessions watcher up'); } catch (e) { console.error('[c-office] sessions watcher failed:', e.message); }
  try { await startTranscriptsWatcher(); console.log('[c-office] transcripts watcher up'); } catch (e) { console.error('[c-office] transcripts watcher failed:', e.message); }
  try {
    const inv = await getInventory();
    console.log(`[c-office] shop inventory hydrated: ${inv.gold} gold, ${Object.keys(inv.skills).length} agents with skills`);
  } catch (e) {
    console.error('[c-office] inventory hydrate failed:', e.message);
  }
});

process.on('uncaughtException',  e => console.error('[c-office] uncaught:', e));
process.on('unhandledRejection', e => console.error('[c-office] unhandledRejection:', e));
