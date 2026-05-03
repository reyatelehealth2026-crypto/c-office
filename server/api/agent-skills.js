// Agent Skill Catalog API — list/create/update/delete catalog entries and
// install/uninstall onto specific agents. Mounted from server/index.js.

import { Router } from 'express';
import {
  listAgentSkills,
  getAgentSkill,
  createAgentSkill,
  updateAgentSkill,
  deleteAgentSkill,
} from '../agents/skill-catalog.js';
import { getAgentSync, updateAgent } from '../store/agents.js';

const router = Router();

// ── Catalog CRUD ────────────────────────────────────────────────────────────

router.get('/api/agent-skills', (_req, res) => {
  try {
    res.json({ skills: listAgentSkills() });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/api/agent-skills/:id', (req, res) => {
  const skill = getAgentSkill(req.params.id);
  if (!skill) return res.status(404).json({ error: 'skill not found' });
  res.json({ skill });
});

router.post('/api/agent-skills', (req, res) => {
  try {
    const skill = createAgentSkill(req.body || {});
    res.status(201).json({ skill });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

router.patch('/api/agent-skills/:id', (req, res) => {
  try {
    const skill = updateAgentSkill(req.params.id, req.body || {});
    res.json({ skill });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

router.delete('/api/agent-skills/:id', (req, res) => {
  try {
    const ok = deleteAgentSkill(req.params.id);
    if (!ok) return res.status(404).json({ error: 'skill not found' });
    res.json({ ok: true });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// ── Install / uninstall on a specific agent ─────────────────────────────────

router.post('/api/agents/:agentId/skills', (req, res) => {
  const skillId = String(req.body?.skillId || '').trim();
  if (!skillId) return res.status(400).json({ error: 'skillId required' });
  if (!getAgentSkill(skillId)) return res.status(404).json({ error: 'skill not found in catalog' });

  const agent = getAgentSync(req.params.agentId);
  if (!agent) return res.status(404).json({ error: 'agent not found' });

  const installed = Array.isArray(agent.installedSkills) ? [...agent.installedSkills] : [];
  if (!installed.includes(skillId)) installed.push(skillId);
  const next = updateAgent(agent.id, { installedSkills: installed });
  res.json({ ok: true, agent: next });
});

router.delete('/api/agents/:agentId/skills/:skillId', (req, res) => {
  const agent = getAgentSync(req.params.agentId);
  if (!agent) return res.status(404).json({ error: 'agent not found' });

  const installed = Array.isArray(agent.installedSkills) ? agent.installedSkills.filter((id) => id !== req.params.skillId) : [];
  const next = updateAgent(agent.id, { installedSkills: installed });
  res.json({ ok: true, agent: next });
});

export default router;
