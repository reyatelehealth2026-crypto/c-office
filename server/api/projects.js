// HTTP CRUD for projects + project-scoped run listing.

import { Router } from 'express';
import { state } from '../state.js';
import {
  listProjects,
  getProject,
  createProject,
  patchProject,
  deleteProject,
} from '../store/projects.js';

const router = Router();

router.get('/api/projects', (req, res) => {
  try {
    res.json({ projects: listProjects() });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/api/projects', (req, res) => {
  try {
    const project = createProject({
      name: req.body?.name,
      description: req.body?.description,
    });
    res.json({ project });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.get('/api/projects/:id', (req, res) => {
  const project = getProject(req.params.id);
  if (!project) return res.status(404).json({ error: 'unknown project' });
  res.json({ project });
});

router.patch('/api/projects/:id', (req, res) => {
  try {
    const project = patchProject(req.params.id, req.body || {});
    if (!project) return res.status(404).json({ error: 'unknown project' });
    res.json({ project });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.delete('/api/projects/:id', (req, res) => {
  const ok = deleteProject(req.params.id);
  if (!ok) return res.status(404).json({ error: 'unknown project' });
  res.json({ ok: true });
});

router.get('/api/projects/:id/runs', (req, res) => {
  const project = getProject(req.params.id);
  if (!project) return res.status(404).json({ error: 'unknown project' });
  const runs = [...state.runs.values()]
    .filter((r) => r.projectId === project.id)
    .sort((a, b) => b.startedAt - a.startedAt)
    .slice(0, 50);
  res.json({ runs });
});

export default router;
