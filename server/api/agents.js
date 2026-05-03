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

// Real Orchestra-pipeline runs that touched this persona — used by the
// Activity History and Desk Chat tabs to surface clickable run summaries.
router.get('/:id/runs', (req, res) => {
  const id = req.params.id;
  if (!getAgentSync(id)) return res.status(404).json({ error: 'unknown agent' });
  const limit = Math.min(200, Number(req.query.limit) || 50);
  const runs = [...state.runs.values()]
    .filter((run) => {
      if (!run) return false;
      const personas = Array.isArray(run.personas) ? run.personas : [];
      const planPersonas = Array.isArray(run.plan) ? run.plan.map((s) => s && s.persona) : [];
      const stepPersonas = Array.isArray(run.steps) ? run.steps.map((s) => s && s.persona) : [];
      return personas.includes(id) || planPersonas.includes(id) || stepPersonas.includes(id);
    })
    .sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0))
    .slice(0, limit)
    .map((run) => ({
      id: run.id,
      goal: run.goal,
      status: run.status,
      phase: run.phase,
      startedAt: run.startedAt,
      finishedAt: run.finishedAt,
      personas: run.personas || [],
      plan: Array.isArray(run.plan)
        ? run.plan.map((s) => ({ persona: s.persona, instruction: s.instruction }))
        : [],
      stepCount: Array.isArray(run.steps) ? run.steps.length : 0,
      hasFinal: !!(run.final && String(run.final).trim()),
    }));
  res.json({ agent: id, runs });
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
  try {
    const ok = deleteAgent(req.params.id);
    if (!ok) return res.status(404).json({ error: 'unknown agent' });
    broadcastAgents();
    res.json({ ok: true });
  } catch (error) {
    sendError(res, error);
  }
});

export default router;
