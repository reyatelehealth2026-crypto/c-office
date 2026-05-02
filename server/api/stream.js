import { bus } from '../state.js';
import { notesBus } from '../runner/notes.js';
import { statusSnapshot } from './auth.js';

const HEARTBEAT_MS = 25_000;
const EVENT_TYPES = [
  'event',
  'session.start',
  'session.end',
  'task',
  'dispatch',
  'run',
  'stats',
  'persona.status',
  'persona.levels',
  'agents',
  'task-board',
  'theme',
  'auth.status',
];

export default function streamRoute(req, res) {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders?.();
  res.write(`retry: 2000\n\n`);

  const send = (type, payload) => {
    res.write(`event: ${type}\ndata: ${JSON.stringify(payload)}\n\n`);
  };

  const handlers = {};
  for (const t of EVENT_TYPES) {
    handlers[t] = (payload) => send(t, payload);
    bus.on(t, handlers[t]);
  }
  const notesHandler = (payload) => send('notes', payload);
  notesBus.on('change', notesHandler);

  // Push current auth status immediately on connect so the dashboard's
  // Gateway & Provider Health panel reflects real state instead of "disconnected"
  // until the next mutation event.
  statusSnapshot()
    .then((snap) => send('auth.status', snap))
    .catch(() => { /* best-effort initial push */ });

  const hb = setInterval(() => res.write(`: hb\n\n`), HEARTBEAT_MS);

  req.on('close', () => {
    clearInterval(hb);
    for (const t of EVENT_TYPES) bus.off(t, handlers[t]);
    notesBus.off('change', notesHandler);
  });
}
