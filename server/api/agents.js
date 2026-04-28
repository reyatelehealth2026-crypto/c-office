import { state } from '../state.js';
import { PERSONAS_BY_ID } from '../mapping/personas.js';

export default function agentHistoryRoute(req, res) {
  const id = req.params.id;
  if (!PERSONAS_BY_ID.has(id)) return res.status(404).json({ error: 'unknown persona' });
  const limit = Math.min(500, Number(req.query.limit) || 200);
  const items = state.events.filter(e => e.personaId === id).slice(-limit).reverse();
  res.json({ persona: id, items });
}
