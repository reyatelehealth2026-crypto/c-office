// HTTP surface for the orchestrator runner.
//
//   POST /api/task              { goal }            → { run_id }
//   GET  /api/task/:run_id                          → run record (status + steps + result)
//   GET  /api/tasks                                 → recent runs
//   GET  /api/task/:run_id/audit                    → append-only audit log (text/plain JSONL)
//   POST /api/task/:run_id/approve { phase }        → approve a gated phase
//   POST /api/task/:run_id/reject  { phase, reason }→ reject a gated phase
//
// Eval harness:
//   GET    /api/evals            → list evals
//   POST   /api/evals            → create eval { goal, rubric, referenceOutput?, tags? }
//   GET    /api/evals/:id        → get eval
//   DELETE /api/evals/:id        → delete eval
//   GET    /api/evals/:id/grades → list grades for eval

import { Router } from 'express';
import { state, approveRunPhase, rejectRunPhase, requestRunCancellation, appendScratchpad } from '../state.js';
import { runOrchestrator } from '../agents/runner.js';
import { listSkills } from '../agents/skills.js';
import { listWorkflows, saveWorkflow, deleteWorkflow, isBuiltInWorkflow } from '../agents/workflows.js';
import {
  listEvals,
  getEval,
  createEval,
  deleteEval,
  listGrades,
} from '../agents/evals.js';
import { readAuditLog } from '../agents/audit.js';

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
  const provider = req.body?.provider ? String(req.body.provider).trim() : '';
  try {
    const opts = {};
    if (workflow) opts.workflow = workflow;
    if (projectId) opts.projectId = projectId;
    if (provider) opts.provider = provider;
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
        builtIn: isBuiltInWorkflow(wf.name),
      })),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Create / overwrite a custom workflow. Built-in names are rejected by saveWorkflow.
router.post('/api/workflows', (req, res) => {
  try {
    const { name, description, plan } = req.body || {};
    const wf = saveWorkflow({ name, description, plan });
    res.json({ ok: true, workflow: wf });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.delete('/api/workflows/:name', (req, res) => {
  try {
    const removed = deleteWorkflow(req.params.name);
    if (!removed) return res.status(404).json({ error: 'workflow not found' });
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
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

router.post('/api/task/:run_id/cancel', (req, res) => {
  const reason = String(req.body?.reason || 'user-cancelled').slice(0, 200);
  const ok = requestRunCancellation(req.params.run_id, reason);
  if (!ok) return res.status(404).json({ error: 'unknown or already-finished run' });
  res.json({ ok: true });
});

// Mid-run user comment. Lands in the run's scratchpad as a `user-note`
// entry so currently-running and upcoming steps see it inside their prior
// context. `stepIdx` is optional — when provided the note prefixes which
// step the comment is aimed at.
router.post('/api/task/:run_id/comment', (req, res) => {
  const runId = req.params.run_id;
  const run = state.runs.get(runId);
  if (!run) return res.status(404).json({ error: 'unknown run' });
  const text = String(req.body?.text || '').trim();
  if (!text) return res.status(400).json({ error: 'text required' });
  const stepIdx = Number.isInteger(req.body?.stepIdx) ? req.body.stepIdx : null;
  const tag = stepIdx != null ? `[Re: step #${stepIdx + 1}] ` : '';
  appendScratchpad(runId, {
    persona: 'user',
    kind: 'user-note',
    text: `${tag}${text.slice(0, 4000)}`,
  });
  res.json({ ok: true });
});

router.post('/api/task/:run_id/chat', async (req, res) => {
  const { text } = req.body || {};
  if (!text) return res.status(400).json({ error: 'text required' });
  const run = state.runs.get(req.params.run_id);
  if (!run) return res.status(404).json({ error: 'unknown run' });

  try {
    const feedback = String(text).trim();
    const runId = req.params.run_id;

    // Inject feedback into scratchpad for agent awareness
    appendScratchpad(runId, {
      persona: 'user',
      kind: 'note',
      text: `User Follow-up: ${feedback}`,
    });

    // Reset status to allow the background worker to pick it up again
    // We update the goal to include context for the planner
    const augmentedGoal = `${run.goal}\n\n[FOLLOW-UP FEEDBACK]: ${feedback}`;
    
    // Trigger re-run in background
    runOrchestrator(augmentedGoal, { 
      existingRunId: runId,
      projectId: run.projectId,
      provider: run.provider || undefined 
    }).catch(e => console.error('[c-office] chat re-run failed:', e));

    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
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
      preview: String(s.body || '').slice(0, 1200),
    }));
    res.json({ skills });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Approval gates ─────────────────────────────────────────────────────────

router.post('/api/task/:run_id/approve', (req, res) => {
  const { run_id } = req.params;
  const phase = String(req.body?.phase || '').trim();
  if (!phase) return res.status(400).json({ error: 'phase required' });
  const run = state.runs.get(run_id);
  if (!run) return res.status(404).json({ error: 'unknown run' });
  try {
    approveRunPhase(run_id, phase);
    res.json({ ok: true, run_id, phase });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.post('/api/task/:run_id/reject', (req, res) => {
  const { run_id } = req.params;
  const phase = String(req.body?.phase || '').trim();
  const reason = String(req.body?.reason || 'Rejected by user').trim();
  if (!phase) return res.status(400).json({ error: 'phase required' });
  const run = state.runs.get(run_id);
  if (!run) return res.status(404).json({ error: 'unknown run' });
  try {
    rejectRunPhase(run_id, phase, reason);
    res.json({ ok: true, run_id, phase, reason });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// ── Audit trail ────────────────────────────────────────────────────────────

router.get('/api/task/:run_id/audit', (req, res) => {
  const { run_id } = req.params;
  const run = state.runs.get(run_id);
  if (!run) return res.status(404).json({ error: 'unknown run' });
  try {
    const log = readAuditLog(run_id);
    res.set('Content-Type', 'text/plain; charset=utf-8');
    res.send(log);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Eval harness ───────────────────────────────────────────────────────────

router.get('/api/evals', (req, res) => {
  try {
    res.json({ evals: listEvals() });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/api/evals', (req, res) => {
  try {
    const { goal, rubric, referenceOutput, tags } = req.body || {};
    const record = createEval({ goal, rubric, referenceOutput, tags });
    res.status(201).json(record);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.get('/api/evals/:id', (req, res) => {
  const record = getEval(req.params.id);
  if (!record) return res.status(404).json({ error: 'unknown eval' });
  res.json(record);
});

router.delete('/api/evals/:id', (req, res) => {
  const deleted = deleteEval(req.params.id);
  if (!deleted) return res.status(404).json({ error: 'unknown eval or already deleted' });
  res.json({ ok: true, id: req.params.id });
});

router.get('/api/evals/:id/grades', (req, res) => {
  const record = getEval(req.params.id);
  if (!record) return res.status(404).json({ error: 'unknown eval' });
  try {
    res.json({ grades: listGrades(req.params.id) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
