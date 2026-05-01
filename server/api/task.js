// HTTP surface for the orchestrator runner.
//
//   POST /api/task         { goal }            → { run_id }
//   GET  /api/task/:run_id                     → run record (status + steps + result)
//   GET  /api/tasks                            → recent runs

import { Router } from 'express';
import { state } from '../state.js';
import { runOrchestrator } from '../agents/runner.js';
import { listSkills } from '../agents/skills.js';
import { listWorkflows } from '../agents/workflows.js';

const router = Router();

function runToMarkdown(run) {
  const lines = [];
  lines.push(`# Run ${run.id}`);
  lines.push('');
  lines.push(`- **Status:** ${run.status}`);
  lines.push(`- **Phase:** ${run.phase || 'n/a'}`);
  lines.push(`- **Revisions:** ${run.revisions || 0}`);
  if (run.startedAt) lines.push(`- **Started:** ${new Date(run.startedAt).toISOString()}`);
  if (run.endedAt) lines.push(`- **Ended:** ${new Date(run.endedAt).toISOString()}`);
  lines.push('');
  lines.push(`## Goal`);
  lines.push(run.goal || '(empty)');
  lines.push('');

  if (Array.isArray(run.skillsRecalled) && run.skillsRecalled.length) {
    lines.push(`## Recalled skills`);
    for (const s of run.skillsRecalled) {
      lines.push(`- \`${s.id}\` — ${s.goal}`);
    }
    lines.push('');
  }

  if (Array.isArray(run.plan) && run.plan.length) {
    lines.push(`## Plan`);
    for (const step of run.plan) {
      const dep = step.depends_on != null ? ` (after step ${step.depends_on})` : '';
      lines.push(`${step.index + 1}. **[${step.persona}]** ${step.instruction}${dep}`);
    }
    lines.push('');
  }

  if (Array.isArray(run.steps) && run.steps.length) {
    lines.push(`## Executed delegations`);
    for (const step of run.steps) {
      lines.push(`### ${step.personaName || step.persona}`);
      if (step.instruction) lines.push(`*Instruction:* ${step.instruction}`);
      lines.push('');
      lines.push('```');
      lines.push((step.result?.text || step.result?.error || '(no output)').slice(0, 4000));
      lines.push('```');
      lines.push('');
    }
  }

  if (Array.isArray(run.scratchpad) && run.scratchpad.length) {
    lines.push(`## Scratchpad`);
    for (const e of run.scratchpad) {
      lines.push(`- \`${new Date(e.ts).toISOString()}\` **[${e.personaName || e.persona}/${e.kind}]** ${e.text}`);
    }
    lines.push('');
  }

  if (run.critique) {
    lines.push(`## Critique (severity: ${run.critique.severity})`);
    lines.push(run.critique.text);
    lines.push('');
  }

  if (run.verification) {
    lines.push(`## Verification`);
    lines.push(`- **Passed:** ${run.verification.passed}`);
    lines.push(run.verification.text);
    lines.push('');
  }

  if (run.phaseCosts && Object.keys(run.phaseCosts).length) {
    lines.push(`## Phase costs`);
    lines.push('| Phase | Tokens | USD |');
    lines.push('|---|---:|---:|');
    for (const [phase, cost] of Object.entries(run.phaseCosts)) {
      lines.push(`| ${phase} | ${cost.tokens.toLocaleString()} | $${cost.usd.toFixed(4)} |`);
    }
    lines.push('');
  }

  if (run.final) {
    lines.push(`## Final deliverable`);
    lines.push(run.final);
    lines.push('');
  }
  if (run.error) {
    lines.push(`## Error`);
    lines.push(run.error);
    lines.push('');
  }
  return lines.join('\n');
}

router.post('/api/task', async (req, res) => {
  const goal = String(req.body?.goal || '').trim();
  if (!goal) return res.status(400).json({ error: 'goal required' });
  if (goal.length > 4000) return res.status(400).json({ error: 'goal too long (max 4000 chars)' });
  const workflow = req.body?.workflow ? String(req.body.workflow).trim() : '';
  const projectId = req.body?.projectId ? String(req.body.projectId).trim() : '';
  try {
    const opts = {};
    if (workflow) opts.workflow = workflow;
    if (projectId) opts.projectId = projectId;
    const { runId } = await runOrchestrator(goal, opts);
    res.json({ run_id: runId });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.get('/api/workflows', (req, res) => {
  try {
    const workflows = listWorkflows();
    res.json({
      workflows: Object.values(workflows).map((wf) => ({
        name: wf.name,
        description: wf.description || '',
        steps: wf.plan.length,
        plan: wf.plan,
      })),
    });
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

router.get('/api/task/:run_id/trace', (req, res) => {
  const run = state.runs.get(req.params.run_id);
  if (!run) return res.status(404).json({ error: 'unknown run' });
  res.set('Content-Type', 'text/markdown; charset=utf-8');
  res.send(runToMarkdown(run));
});

router.get('/api/skills', (req, res) => {
  try {
    const skills = listSkills().map((s) => ({
      id: s.id,
      goal: s.goal,
      tags: s.tags || [],
      steps: s.steps || [],
      revisions: s.revisions || 0,
      tokens: s.tokens || 0,
      createdAt: s.createdAt,
    }));
    res.json({ skills });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
