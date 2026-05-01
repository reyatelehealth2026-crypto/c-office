import express from 'express';
import { bus } from '../state.js';
import { createBoardTask, deleteBoardTask, getTaskBoardSync, updateBoardTask } from '../store/task-board.js';

const router = express.Router();

function broadcast() {
  bus.emit('task-board', getTaskBoardSync());
}

function sendError(res, error) {
  res.status(error.statusCode || 500).json({ error: error.message || String(error) });
}

router.get('/', (_req, res) => {
  res.json(getTaskBoardSync());
});

router.post('/', (req, res) => {
  try {
    const task = createBoardTask(req.body || {});
    broadcast();
    res.status(201).json(task);
  } catch (error) {
    sendError(res, error);
  }
});

router.patch('/:id', (req, res) => {
  try {
    const task = updateBoardTask(req.params.id, req.body || {});
    if (!task) return res.status(404).json({ error: 'task not found' });
    broadcast();
    res.json(task);
  } catch (error) {
    sendError(res, error);
  }
});

router.delete('/:id', (req, res) => {
  const ok = deleteBoardTask(req.params.id);
  if (!ok) return res.status(404).json({ error: 'task not found' });
  broadcast();
  res.json({ ok: true });
});

export default router;
