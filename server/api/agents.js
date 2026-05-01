import express from 'express';
import { bus, state } from '../state.js';
import { createAgent, deleteAgent, getAgentSync, listAgentsSync, updateAgent } from '../store/agents.js';

const router = express.Router();

function sendError(res, error) {
  res.status(error.statusCode || 500).json({ error: error.message || String(error) });
}

function broadcastAgents() {
  bus.emit('agents', listAgentsSync());
}

router.get('/', (_req, res) => {
  res.json({ agents: listAgentsSync() });
});

router.post('/', (req, res) => {
  try {
    const agent = createAgent(req.body || {});
    broadcastAgents();
    res.status(201).json(agent);
  } catch (error) {
    sendError(res, error);
  }
});

router.get('/:id/history', (req, res) => {
  const id = req.params.id;
  if (!getAgentSync(id)) return res.status(404).json({ error: 'unknown agent' });
  const limit = Math.min(500, Number(req.query.limit) || 200);
  const items = state.events.filter((event) => event.personaId === id).slice(-limit).reverse();
  res.json({ agent: id, persona: id, items });
});

router.get('/:id', (req, res) => {
  const agent = getAgentSync(req.params.id);
  if (!agent) return res.status(404).json({ error: 'unknown agent' });
  res.json(agent);
});

router.patch('/:id', (req, res) => {
  try {
    const agent = updateAgent(req.params.id, req.body || {});
    if (!agent) return res.status(404).json({ error: 'unknown agent' });
    broadcastAgents();
    res.json(agent);
  } catch (error) {
    sendError(res, error);
  }
});

router.delete('/:id', (req, res) => {
  const ok = deleteAgent(req.params.id);
  if (!ok) return res.status(404).json({ error: 'unknown agent' });
  broadcastAgents();
  res.json({ ok: true });
});

export default router;
