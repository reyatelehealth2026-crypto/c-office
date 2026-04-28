import express from 'express';
import { createDispatch, snapshot, updateDispatch } from '../state.js';

const router = express.Router();

export function listDispatches(req, res) {
  res.json({ dispatches: snapshot().dispatches });
}

export function createDispatchRoute(req, res) {
  const prompt = String(req.body?.prompt || '').trim();
  const title = String(req.body?.title || prompt).trim();
  if (!prompt && !title) {
    res.status(400).json({ ok: false, error: 'prompt is required' });
    return;
  }
  const dispatch = createDispatch({
    title,
    prompt,
    provider: req.body?.provider,
    personaId: req.body?.personaId,
    status: req.body?.status,
    messages: req.body?.messages,
  });
  res.status(201).json({ ok: true, dispatch });
}

export function updateDispatchRoute(req, res) {
  const dispatch = updateDispatch(req.params.id, req.body || {});
  if (!dispatch) {
    res.status(404).json({ ok: false, error: 'dispatch not found' });
    return;
  }
  res.json({ ok: true, dispatch });
}

router.get('/', listDispatches);
router.post('/', createDispatchRoute);
router.patch('/:id', updateDispatchRoute);

export default router;
