import { bus } from '../state.js';

const HEARTBEAT_MS = 25_000;
const EVENT_TYPES = ['event', 'session.start', 'session.end', 'task', 'dispatch', 'stats', 'persona.status'];

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

  const hb = setInterval(() => res.write(`: hb\n\n`), HEARTBEAT_MS);

  req.on('close', () => {
    clearInterval(hb);
    for (const t of EVENT_TYPES) bus.off(t, handlers[t]);
  });
}
