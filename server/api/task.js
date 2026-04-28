// HTTP surface for the orchestrator runner.
//
//   POST /api/task         { goal }            → { run_id }
//   GET  /api/task/:run_id                     → run record (status + steps + result)
//   GET  /api/tasks                            → recent runs

import { Router } from 'express';
import { state } from '../state.js';
import { runOrchestrator } from '../agents/runner.js';

const router = Router();

router.post('/api/task', async (req, res) => {
  const goal = String(req.body?.goal || '').trim();
  if (!goal) return res.status(400).json({ error: 'goal required' });
  if (goal.length > 4000) return res.status(400).json({ error: 'goal too long (max 4000 chars)' });
  try {
    const { runId } = await runOrchestrator(goal);
    res.json({ run_id: runId });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/api/task/:run_id', (req, res) => {
  const run = state.runs.get(req.params.run_id);
  if (!run) return res.status(404).json({ error: 'unknown run' });
  res.json(run);
});

router.get('/api/tasks', (req, res) => {
  const runs = [...state.runs.values()]
    .sort((a, b) => b.startedAt - a.startedAt)
    .slice(0, 50);
  res.json({ runs });
});

export default router;
