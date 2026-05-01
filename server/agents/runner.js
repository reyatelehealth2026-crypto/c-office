// Orchestrator runner — agent-team edition.
//
// Pipeline: plan → execute → critique → (optional revise) → finalize.
// Inspired by OpenClaw's manager/specialist/shared-memory layering and
// Hermes' planner-critic loop. Public surface (runOrchestrator) is unchanged;
// /api/task continues to receive { run_id } back.

import crypto from 'node:crypto';
import { query } from '@anthropic-ai/claude-agent-sdk';
import {
  state,
  pushEvent,
  recordUsage,
  startTask,
  finishTask,
  startRun,
  stepRun,
  finishRun,
  viewRun,
  setRunPhase,
  setRunPlan,
  appendScratchpad,
  setRunCritique,
  setRunVerification,
  bumpRunRevision,
  addPhaseCost,
  setRunSkillsRecalled,
  runOverBudget,
  COST_CEILING_USD,
} from '../state.js';
import { getAgentSync, listAgentsSync, resolveAgentIdSync } from '../store/agents.js';
import { costUsd } from '../mapping/pricing.js';
import { recallSkills, persistSkill, degradeSkill, forkSkill, listSkills } from './skills.js';
import { getWorkflow } from './workflows.js';
import { getProject } from '../store/projects.js';
import { appendAudit } from './audit.js';
import { gradeRunAgainstEval } from './evals.js';
import { registerGateResolver } from '../state.js';
import { recordPersonaOutcome } from './persona-tune.js';

const ORCHESTRA_PERSONA = 'orchestra';
const CRITIC_PERSONA = 'vex';
const MAX_TURNS = 14;
const MAX_REVISIONS = 1;

const PHASE_TIMEOUTS_MS = {
  plan: Number(process.env.COFFICE_TIMEOUT_PLAN_MS) || 60_000,
  execute: Number(process.env.COFFICE_TIMEOUT_EXECUTE_MS) || 600_000,
  critique: Number(process.env.COFFICE_TIMEOUT_CRITIQUE_MS) || 90_000,
  verify: Number(process.env.COFFICE_TIMEOUT_VERIFY_MS) || 60_000,
};

class PhaseTimeoutError extends Error {
  constructor(phase, ms) {
    super(`Phase '${phase}' exceeded ${ms}ms timeout`);
    this.phase = phase;
    this.timeoutMs = ms;
  }
}

// Race the query iterator against a wall-clock deadline. Resolves with
// `{ timedOut: false, value }` per iteration or throws PhaseTimeoutError if
// the iterator doesn't yield/finish before `ms`.
async function* withPhaseTimeout(iterable, phase) {
  const ms = PHASE_TIMEOUTS_MS[phase];
  if (!ms || ms <= 0) {
    yield* iterable;
    return;
  }
  const iter = iterable[Symbol.asyncIterator]();
  const deadline = Date.now() + ms;
  while (true) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new PhaseTimeoutError(phase, ms);
    let timer;
    const next = iter.next();
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new PhaseTimeoutError(phase, ms)), remaining);
    });
    let result;
    try {
      result = await Promise.race([next, timeout]);
    } finally {
      clearTimeout(timer);
    }
    if (result.done) return;
    yield result.value;
  }
}

function newId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`;
}

function summarize(value, max = 90) {
  const text = String(typeof value === 'string' ? value : JSON.stringify(value ?? ''))
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > max ? text.slice(0, max - 1) + '...' : text;
}

function sdkAgentDefinitions() {
  const entries = listAgentsSync({ includeDisabled: false })
    .filter((agent) => agent.id !== ORCHESTRA_PERSONA)
    .map((agent) => [
      agent.id,
      {
        description: `${agent.name} - ${agent.role}`,
        prompt: agent.systemPrompt || `You are ${agent.name}. Return a concise answer for the assigned task.`,
        tools: agent.toolsAllowed || [],
        model: 'inherit',
      },
    ]);
  return Object.fromEntries(entries);
}

function orchestratorAgent() {
  return getAgentSync(ORCHESTRA_PERSONA) || getAgentSync(resolveAgentIdSync(ORCHESTRA_PERSONA)) || {
    id: ORCHESTRA_PERSONA,
    name: 'Orchestra',
    role: 'Lead agent',
    model: 'claude-sonnet-4-5',
    systemPrompt: 'You are the lead C-Office agent. Route work to available agents and return a concise final answer.',
  };
}

function criticAgent() {
  return getAgentSync(CRITIC_PERSONA) || {
    id: CRITIC_PERSONA,
    name: 'Vivi',
    role: 'review',
    model: 'claude-sonnet-4-5',
    systemPrompt: 'You are Vivi, c-office\'s sentinel.',
  };
}

function textFromAssistant(message) {
  const content = message?.message?.content;
  if (!Array.isArray(content)) return '';
  return content
    .filter((block) => block?.type === 'text')
    .map((block) => block.text || '')
    .join('\n')
    .trim();
}

function taskDescription(input) {
  if (!input || typeof input !== 'object') return '';
  return input.description || input.prompt || input.instruction || input.task || JSON.stringify(input);
}

function taskAgent(input) {
  if (!input || typeof input !== 'object') return 'agent';
  return input.subagent_type || input.persona || input.agent || 'agent';
}

function rosterText() {
  return listAgentsSync({ includeDisabled: false })
    .filter((a) => a.id !== ORCHESTRA_PERSONA)
    .map((a) => `- ${a.id} (${a.name}) — ${a.role}`)
    .join('\n');
}

function tokensFromUsage(usage) {
  if (!usage) return 0;
  return (
    (usage.input_tokens || 0) +
    (usage.output_tokens || 0) +
    (usage.cache_read_input_tokens || 0) +
    (usage.cache_creation_input_tokens || 0)
  );
}

class BudgetExceededError extends Error {
  constructor(totalUsd) {
    super(`Cost ceiling reached ($${totalUsd.toFixed(4)} > $${COST_CEILING_USD})`);
    this.totalUsd = totalUsd;
  }
}

function recordPhaseCost(runId, phase, model, usage) {
  if (!usage) return;
  addPhaseCost(runId, phase, {
    tokens: tokensFromUsage(usage),
    usd: costUsd(model, usage),
  });
  if (runOverBudget(runId)) {
    appendScratchpad(runId, {
      persona: ORCHESTRA_PERSONA,
      kind: 'budget-exceeded',
      text: `Cost ceiling $${COST_CEILING_USD} reached during ${phase}; aborting pipeline.`,
    });
    const run = state.runs.get(runId);
    const total = run?.phaseCosts
      ? Object.values(run.phaseCosts).reduce((s, c) => s + (c.usd || 0), 0)
      : 0;
    appendAudit(runId, 'budget-exceeded', { phase, totalUsd: total, ceilingUsd: COST_CEILING_USD });
    throw new BudgetExceededError(total);
  }
}

function recalledSkillsBlock(skills) {
  if (!skills || skills.length === 0) return '';
  const lines = skills.map((s) => {
    const seq = (s.steps || []).join(' → ') || '(no sequence)';
    return `- "${summarize(s.goal, 100)}" → ${seq}`;
  });
  return `\n\nPrior similar runs (from skill library — adapt only what fits):\n${lines.join('\n')}`;
}

// ---------- Phase 1: Plan ----------

const PLANNER_SYSTEM = `You are Orchestra in PLAN mode. Decompose the user goal into the
SHORTEST possible sequence of delegations to specialist personas. Each step must
be self-contained — the executing persona has no shared memory beyond the
scratchpad summary you give them.

Available personas:
{ROSTER}

Reply with ONLY a JSON array, no prose. Schema:
[{"persona":"<id>","instruction":"<self-contained brief>","depends_on":<index|null>}]

Constraints:
- 1 to 6 steps. Fewer is better.
- "depends_on" is the index (0-based) of an earlier step whose output this step needs, or null.
- Do NOT include orchestra in the steps; orchestra synthesizes after execution.
- Pick the MINIMUM set of personas needed. Don't pad with extras.`;

function extractJsonArray(text) {
  if (!text) return null;
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1].trim() : trimmed;
  const start = candidate.indexOf('[');
  const end = candidate.lastIndexOf(']');
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    const parsed = JSON.parse(candidate.slice(start, end + 1));
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

async function planRun(runId, goal) {
  setRunPhase(runId, 'plan');

  let recalled = [];
  try {
    const run = state.runs.get(runId);
    const recallOpts = run?.projectId ? { projectId: run.projectId } : {};
    recalled = recallSkills(goal, recallOpts).map((s) => ({ ...s, score: undefined }));
  } catch {
    /* recall best-effort */
  }
  if (recalled.length) {
    setRunSkillsRecalled(runId, recalled);
    appendScratchpad(runId, {
      persona: ORCHESTRA_PERSONA,
      kind: 'recall',
      text: `Recalled ${recalled.length} prior skill${recalled.length === 1 ? '' : 's'}: ${recalled.map((s) => s.id).join(', ')}`,
    });
  }

  pushEvent({
    sessionId: runId,
    personaId: ORCHESTRA_PERSONA,
    verb: 'used',
    toolName: 'Plan',
    text: recalled.length ? `Decomposing goal (${recalled.length} skills recalled)` : 'Decomposing goal',
    status: 'ok',
    dedupeKey: `plan:start:${runId}`,
  });

  const orch = orchestratorAgent();
  const model = orch.model || 'claude-sonnet-4-5';
  let planText = '';
  try {
    for await (const message of withPhaseTimeout(query({
      prompt: `Goal: ${goal}${recalledSkillsBlock(recalled)}\n\nReturn the JSON plan now.`,
      options: {
        model,
        maxTurns: 1,
        systemPrompt: PLANNER_SYSTEM.replace('{ROSTER}', rosterText()),
        permissionMode: 'dontAsk',
      },
    }), 'plan')) {
      if (message.type === 'assistant') planText += textFromAssistant(message) + '\n';
      if (message.type === 'result') {
        recordPhaseCost(runId, 'plan', model, message.usage);
        recordUsage({
          model,
          usage: message.usage,
          dedupeKey: `usage:plan:${runId}:${message.uuid}`,
          sessionId: runId,
        });
      }
    }
  } catch (error) {
    appendScratchpad(runId, { persona: ORCHESTRA_PERSONA, kind: 'plan-error', text: error.message || String(error) });
    return null;
  }

  const plan = extractJsonArray(planText);
  if (!plan || plan.length === 0) {
    appendScratchpad(runId, {
      persona: ORCHESTRA_PERSONA,
      kind: 'plan-error',
      text: `Could not parse plan: ${summarize(planText, 200)}`,
    });
    return null;
  }
  setRunPlan(runId, plan);
  appendScratchpad(runId, {
    persona: ORCHESTRA_PERSONA,
    kind: 'plan',
    text: plan.map((s, i) => `${i}. [${s.persona}] ${summarize(s.instruction, 140)}`).join(' | '),
  });
  appendAudit(runId, 'plan-emitted', {
    steps: plan.length,
    personas: plan.map((s) => s.persona),
    skillsRecalled: recalled.length,
  });
  pushEvent({
    sessionId: runId,
    personaId: ORCHESTRA_PERSONA,
    verb: 'result',
    toolName: 'Plan',
    text: `Plan: ${plan.length} step${plan.length === 1 ? '' : 's'}`,
    status: 'ok',
    dedupeKey: `plan:done:${runId}`,
  });
  return plan;
}

// ---------- Phase 1b: Plan Critique (5.1) ----------
//
// Before executing, ask the planner to audit the plan for:
//   (a) persona outside its declared role
//   (b) depends_on cycles
//   (c) two adjacent steps that could merge
//   (d) plan references a persona that doesn't exist in the roster
//
// If any HIGH issue is found, run a single rewrite pass (MAX_PLAN_REWRITES = 1).
// Critique tokens are folded into the 'plan' phase cost bucket.

const MAX_PLAN_REWRITES = 1;

const PLAN_CRITIQUE_SYSTEM = `You are Orchestra in PLAN-CRITIC mode.
Audit the JSON plan below against the agent roster for these problems only:
(a) ROLE — a persona is asked to do work outside its declared role
(b) CYCLE — a depends_on chain that has a cycle
(c) MERGE — two adjacent steps that are so similar they should be one
(d) UNKNOWN — plan references a persona id that does not appear in the roster

Roster of valid persona ids and roles:
{ROSTER}

Reply format — JSON only, no prose:
{"verdict":"OK"} — if no issues found, or only LOW-severity observations
{"verdict":"REWRITE","issues":["<HIGH issue 1>","<HIGH issue 2>",...]} — if any HIGH-severity issues exist

HIGH means the run would likely fail or produce wrong results. LOW means minor suggestions; treat them as OK.
Respond with only valid JSON.`;

const PLAN_REWRITE_SYSTEM = `You are Orchestra in PLAN-REWRITE mode.
You have an existing plan with the following HIGH issues:
{ISSUES}

Rewrite the plan to fix those issues. Keep all non-problematic steps.
Available personas:
{ROSTER}

Reply with ONLY a corrected JSON array in exactly the same schema:
[{"persona":"<id>","instruction":"<brief>","depends_on":<index|null>}]`;

function detectCycles(plan) {
  const n = plan.length;
  const visited = new Set();
  const stack = new Set();

  function dfs(idx) {
    if (stack.has(idx)) return true;
    if (visited.has(idx)) return false;
    visited.add(idx);
    stack.add(idx);
    const dep = plan[idx]?.depends_on;
    if (Number.isInteger(dep) && dep >= 0 && dep < n) {
      if (dfs(dep)) return true;
    }
    stack.delete(idx);
    return false;
  }

  for (let i = 0; i < n; i++) {
    if (dfs(i)) return true;
  }
  return false;
}

function validatePlanLocally(plan, validPersonaIds) {
  const issues = [];
  const idSet = new Set(validPersonaIds);

  if (detectCycles(plan)) {
    issues.push('CYCLE: depends_on chain contains a cycle');
  }

  for (const step of plan) {
    if (!idSet.has(step.persona)) {
      issues.push(`UNKNOWN: persona "${step.persona}" is not in the roster`);
    }
  }

  return issues;
}

export async function critiquePlan(runId, goal, plan) {
  const orch = orchestratorAgent();
  const model = orch.model || 'claude-sonnet-4-5';
  const validIds = listAgentsSync({ includeDisabled: false }).map((a) => a.id);

  const localIssues = validatePlanLocally(plan, validIds);

  const planJson = JSON.stringify(
    plan.map((s) => ({ persona: s.persona, instruction: s.instruction, depends_on: s.depends_on })),
    null,
    2,
  );

  const systemPrompt = PLAN_CRITIQUE_SYSTEM.replace('{ROSTER}', rosterText());

  let verdict = 'OK';
  let issues = [...localIssues];

  try {
    let raw = '';
    for await (const message of withPhaseTimeout(
      query({
        prompt: `Audit this plan now.\n\n${planJson}`,
        options: {
          model,
          maxTurns: 1,
          systemPrompt,
          permissionMode: 'dontAsk',
        },
      }),
      'plan',
    )) {
      if (message.type === 'assistant') raw += textFromAssistant(message) + '\n';
      if (message.type === 'result') {
        recordPhaseCost(runId, 'plan', model, message.usage);
        recordUsage({
          model,
          usage: message.usage,
          dedupeKey: `usage:plan-critique:${runId}:${message.uuid}`,
          sessionId: runId,
        });
      }
    }
    const jsonStart = raw.indexOf('{');
    const jsonEnd = raw.lastIndexOf('}');
    if (jsonStart !== -1 && jsonEnd > jsonStart) {
      try {
        const parsed = JSON.parse(raw.slice(jsonStart, jsonEnd + 1));
        if (parsed.verdict === 'REWRITE' && Array.isArray(parsed.issues)) {
          issues = [...new Set([...issues, ...parsed.issues])];
          verdict = 'REWRITE';
        }
      } catch {
        /* fall through — local issues still captured */
      }
    }
  } catch (err) {
    appendScratchpad(runId, {
      persona: ORCHESTRA_PERSONA,
      kind: 'plan-critique-error',
      text: `Plan critique LLM call failed: ${err.message || String(err)}`,
    });
  }

  if (localIssues.length > 0) verdict = 'REWRITE';

  return { verdict, issues };
}

async function rewritePlan(runId, goal, plan, issues) {
  const orch = orchestratorAgent();
  const model = orch.model || 'claude-sonnet-4-5';
  const planJson = JSON.stringify(
    plan.map((s) => ({ persona: s.persona, instruction: s.instruction, depends_on: s.depends_on })),
    null,
    2,
  );

  const systemPrompt = PLAN_REWRITE_SYSTEM.replace(
    '{ISSUES}',
    issues.map((i, idx) => `${idx + 1}. ${i}`).join('\n'),
  ).replace('{ROSTER}', rosterText());

  let rewriteText = '';
  try {
    for await (const message of withPhaseTimeout(
      query({
        prompt: `Original plan:\n${planJson}\n\nReturn the corrected JSON plan now.`,
        options: {
          model,
          maxTurns: 1,
          systemPrompt,
          permissionMode: 'dontAsk',
        },
      }),
      'plan',
    )) {
      if (message.type === 'assistant') rewriteText += textFromAssistant(message) + '\n';
      if (message.type === 'result') {
        recordPhaseCost(runId, 'plan', model, message.usage);
        recordUsage({
          model,
          usage: message.usage,
          dedupeKey: `usage:plan-rewrite:${runId}:${message.uuid}`,
          sessionId: runId,
        });
      }
    }
  } catch (err) {
    appendScratchpad(runId, {
      persona: ORCHESTRA_PERSONA,
      kind: 'plan-rewrite-error',
      text: `Plan rewrite LLM call failed: ${err.message || String(err)}`,
    });
    return null;
  }

  return extractJsonArray(rewriteText);
}

// ---------- Phase 2: Execute ----------

function handleAssistantMessage(runId, message) {
  const content = message?.message?.content;
  if (!Array.isArray(content)) return;

  const text = textFromAssistant(message);
  if (text) {
    pushEvent({
      sessionId: runId,
      personaId: ORCHESTRA_PERSONA,
      verb: 'result',
      text: summarize(text),
      status: 'ok',
      dedupeKey: `assistant:${runId}:${message.uuid}`,
    });
    appendScratchpad(runId, { persona: ORCHESTRA_PERSONA, kind: 'note', text });
  }

  for (const block of content) {
    if (block?.type !== 'tool_use') continue;
    const persona = taskAgent(block.input);
    const description = taskDescription(block.input);
    startTask({
      tool_use_id: block.id,
      sessionId: runId,
      subagent_type: persona,
      description: summarize(description),
    });
    pushEvent({
      sessionId: runId,
      personaId: persona,
      verb: 'used',
      toolName: block.name || 'Task',
      text: summarize(description),
      status: 'ok',
      toolUseId: block.id,
      dedupeKey: `tu:run:${runId}:${block.id}`,
    });
    appendScratchpad(runId, { persona, kind: 'delegation', text: description });
    appendAudit(runId, 'delegation-start', { persona, toolUseId: block.id, description: summarize(description, 200) });
  }
}

// Track consecutive failure count per (runId, persona). After RETRY_BUDGET
// failures we add a "stop delegating here" hint to the scratchpad so the
// orchestrator picks a different specialist on its next turn.
const FAILURE_COUNTERS = new Map();
const RETRY_BUDGET = 2;
const failureKey = (runId, persona) => `${runId}:${persona}`;
const clearFailureCounters = (runId) => {
  for (const k of FAILURE_COUNTERS.keys()) if (k.startsWith(`${runId}:`)) FAILURE_COUNTERS.delete(k);
};

function handleUserMessage(runId, message) {
  const content = message?.message?.content;
  if (!Array.isArray(content)) return;
  for (const block of content) {
    if (block?.type !== 'tool_result') continue;
    const text = Array.isArray(block.content)
      ? block.content.map((part) => part?.text || '').filter(Boolean).join('\n')
      : String(block.content || '');
    const result = { ok: !block.is_error, text };
    const task = state.tasks.get(block.tool_use_id);
    const persona = task?.personaId || task?.subagent_type || 'agent';
    stepRun(runId, {
      tool_use_id: block.tool_use_id,
      persona,
      instruction: task?.description,
      result,
    });
    pushEvent({
      sessionId: runId,
      personaId: persona,
      verb: 'result',
      toolName: 'Task',
      text: summarize(text),
      status: result.ok ? 'ok' : 'err',
      toolUseId: block.tool_use_id,
      dedupeKey: `tr:run:${runId}:${block.tool_use_id}`,
    });
    appendScratchpad(runId, {
      persona,
      kind: result.ok ? 'finding' : 'error',
      text,
    });

    const fkey = failureKey(runId, persona);
    if (result.ok) {
      FAILURE_COUNTERS.delete(fkey);
    } else {
      const next = (FAILURE_COUNTERS.get(fkey) || 0) + 1;
      FAILURE_COUNTERS.set(fkey, next);
      if (next >= RETRY_BUDGET) {
        appendScratchpad(runId, {
          persona: ORCHESTRA_PERSONA,
          kind: 'retry-budget',
          text: `Persona ${persona} failed ${next}x — STOP delegating to ${persona} for this run; pick a different specialist or skip the step.`,
        });
      }
    }

    appendAudit(runId, 'delegation-result', { persona, toolUseId: block.tool_use_id, ok: result.ok });
    finishTask({ tool_use_id: block.tool_use_id, status: result.ok ? 'done' : 'failed' });
  }
}

function buildExecutionPrompt(goal, plan, scratchpad, critique) {
  const planLines = plan
    .map(
      (s, i) =>
        `  ${i}. [${s.persona}] ${s.instruction}${s.depends_on != null ? ` (after step ${s.depends_on})` : ''}`,
    )
    .join('\n');
  const scratch = scratchpad.length
    ? scratchpad
        .slice(-12)
        .map((e) => `  - [${e.personaName}/${e.kind}] ${summarize(e.text, 200)}`)
        .join('\n')
    : '  (empty)';
  const critiqueBlock = critique ? `\n\nPrevious critique to address:\n${critique.text}` : '';
  return `Goal: ${goal}

Approved plan:
${planLines}

Shared scratchpad (recent):
${scratch}${critiqueBlock}

Execute the plan via the Task tool. You may add or skip steps if the
scratchpad reveals new context. When complete, return the final assembled
deliverable as your last assistant message — no tool call.`;
}

async function executeRun(runId, goal, plan, critique) {
  setRunPhase(runId, 'execute');
  const orch = orchestratorAgent();
  const model = orch.model || 'claude-sonnet-4-5';
  let finalText = '';
  let finalStatus = 'failed';
  let finalError = '';

  const run = state.runs.get(runId);
  const scratchpad = run?.scratchpad || [];

  try {
    for await (const message of withPhaseTimeout(query({
      prompt: buildExecutionPrompt(goal, plan, scratchpad, critique),
      options: {
        model,
        maxTurns: MAX_TURNS,
        systemPrompt: orch.systemPrompt,
        tools: ['Task'],
        allowedTools: ['Task'],
        permissionMode: 'dontAsk',
        agents: sdkAgentDefinitions(),
      },
    }), 'execute')) {
      if (message.type === 'assistant') handleAssistantMessage(runId, message);
      if (message.type === 'user') handleUserMessage(runId, message);
      if (message.type === 'result') {
        recordPhaseCost(runId, 'execute', model, message.usage);
        recordUsage({
          model,
          usage: message.usage,
          dedupeKey: `usage:run:${runId}:${message.uuid}`,
          sessionId: runId,
        });
        if (!message.is_error && message.subtype === 'success') {
          finalStatus = 'done';
          finalText = message.result || finalText;
        } else {
          finalError = (message.errors || []).join('\n') || message.subtype || 'Claude Agent SDK run failed';
        }
      }
    }
  } catch (error) {
    finalError = error.message || String(error);
  }

  return { status: finalStatus, final: finalText, error: finalError };
}

// ---------- Phase 3: Critique ----------

const CRITIQUE_SYSTEM = `You are Vivi, c-office's sentinel. Review the artifact below for:
- factual errors / unsupported claims
- security issues, leaked secrets, unsafe patterns
- compliance / brand-voice problems
- missing requirements from the original goal

Reply format:
- If the artifact is acceptable: exactly "OK"
- Otherwise: numbered list, each line "[CRITICAL|HIGH|MED|LOW] <issue> → <fix>"

Be decisive. No preface.`;

async function critiqueRun(runId, goal, finalText) {
  setRunPhase(runId, 'critique');
  pushEvent({
    sessionId: runId,
    personaId: CRITIC_PERSONA,
    verb: 'used',
    toolName: 'Critique',
    text: 'Auditing draft',
    status: 'ok',
    dedupeKey: `crit:start:${runId}:${Date.now()}`,
  });

  const critic = criticAgent();
  const model = critic.model || 'claude-sonnet-4-5';
  let text = '';
  try {
    for await (const message of withPhaseTimeout(query({
      prompt: `Goal:\n${goal}\n\nArtifact under review:\n${finalText}\n\nReturn your verdict now.`,
      options: {
        model,
        maxTurns: 1,
        systemPrompt: CRITIQUE_SYSTEM,
        permissionMode: 'dontAsk',
      },
    }), 'critique')) {
      if (message.type === 'assistant') text += textFromAssistant(message) + '\n';
      if (message.type === 'result') {
        recordPhaseCost(runId, 'critique', model, message.usage);
        recordUsage({
          model,
          usage: message.usage,
          dedupeKey: `usage:crit:${runId}:${message.uuid}`,
          sessionId: runId,
        });
      }
    }
  } catch (error) {
    text = `[LOW] Critic call failed: ${error.message || String(error)} → proceed without revision`;
  }

  const trimmed = text.trim();
  const severity = /\bCRITICAL\b/i.test(trimmed)
    ? 'critical'
    : /\bHIGH\b/i.test(trimmed)
      ? 'high'
      : /^OK\b/i.test(trimmed)
        ? 'none'
        : /\bMED\b/i.test(trimmed)
          ? 'med'
          : 'low';

  setRunCritique(runId, { text: trimmed, severity });
  appendAudit(runId, 'critique-done', { severity, text: trimmed.slice(0, 300) });
  pushEvent({
    sessionId: runId,
    personaId: CRITIC_PERSONA,
    verb: 'result',
    toolName: 'Critique',
    text: `Severity: ${severity}`,
    status: severity === 'none' ? 'ok' : 'err',
    dedupeKey: `crit:done:${runId}:${Date.now()}`,
  });
  return { severity, text: trimmed };
}

// ---------- Phase 4: Verify ----------

const VERIFY_SYSTEM = `You are Orchestra in VERIFY mode. Compare the artifact to the original
goal and judge: does it actually deliver what was asked?

Reply with EXACTLY one of:
- "PASS — <one-line justification>"
- "FAIL — <one-line reason what's missing>"

Do NOT rewrite or improve. Verifier only.`;

async function verifyRun(runId, goal, finalText) {
  setRunPhase(runId, 'verify');
  pushEvent({
    sessionId: runId,
    personaId: ORCHESTRA_PERSONA,
    verb: 'used',
    toolName: 'Verify',
    text: 'Goal-checking final',
    status: 'ok',
    dedupeKey: `verify:start:${runId}:${Date.now()}`,
  });

  const orch = orchestratorAgent();
  const model = orch.model || 'claude-sonnet-4-5';
  let text = '';
  try {
    for await (const message of withPhaseTimeout(query({
      prompt: `Goal:\n${goal}\n\nArtifact:\n${finalText}\n\nReturn your one-line verdict now.`,
      options: {
        model,
        maxTurns: 1,
        systemPrompt: VERIFY_SYSTEM,
        permissionMode: 'dontAsk',
      },
    }), 'verify')) {
      if (message.type === 'assistant') text += textFromAssistant(message) + '\n';
      if (message.type === 'result') {
        recordPhaseCost(runId, 'verify', model, message.usage);
        recordUsage({
          model,
          usage: message.usage,
          dedupeKey: `usage:verify:${runId}:${message.uuid}`,
          sessionId: runId,
        });
      }
    }
  } catch (error) {
    text = `PASS — verifier unavailable (${error.message || String(error)})`;
  }

  const trimmed = text.trim();
  const passed = /^PASS\b/i.test(trimmed);
  setRunVerification(runId, { passed, text: trimmed });
  appendAudit(runId, 'verify-done', { passed, text: trimmed.slice(0, 200) });
  pushEvent({
    sessionId: runId,
    personaId: ORCHESTRA_PERSONA,
    verb: 'result',
    toolName: 'Verify',
    text: passed ? 'Goal verified' : 'Goal NOT verified',
    status: passed ? 'ok' : 'err',
    dedupeKey: `verify:done:${runId}:${Date.now()}`,
  });
  return { passed, text: trimmed };
}

// ---------- Pipeline ----------

function planFromTemplate(runId, goal, workflow) {
  setRunPhase(runId, 'plan');
  setRunPlan(runId, workflow.plan);
  appendScratchpad(runId, {
    persona: ORCHESTRA_PERSONA,
    kind: 'plan',
    text: `Loaded workflow "${workflow.name}": ${workflow.plan.length} steps (planner skipped)`,
  });
  appendAudit(runId, 'plan-template', {
    workflow: workflow.name,
    steps: workflow.plan.length,
    personas: workflow.plan.map((s) => s.persona),
  });
  pushEvent({
    sessionId: runId,
    personaId: ORCHESTRA_PERSONA,
    verb: 'result',
    toolName: 'Plan',
    text: `Workflow ${workflow.name} (${workflow.plan.length} steps)`,
    status: 'ok',
    dedupeKey: `plan:done:${runId}`,
  });
  return workflow.plan;
}

// Wait for approval gate. Returns a Promise that resolves when the gate is
// approved or rejects when it is rejected. Times out after 30 minutes.
const GATE_TIMEOUT_MS = 30 * 60 * 1000;

function waitForGate(runId, phase) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Gate for phase '${phase}' timed out after 30 minutes`));
    }, GATE_TIMEOUT_MS);
    registerGateResolver(runId, (approvedPhase) => {
      clearTimeout(timer);
      resolve(approvedPhase);
    }, (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

// Check whether the workflow or run requires approval for the given phase.
function requiresApproval(opts, phase) {
  const workflow = opts.workflow ? getWorkflow(opts.workflow) : null;
  const gates = workflow?.requiresApproval || opts.requiresApproval || [];
  return Array.isArray(gates) && gates.includes(phase);
}

async function runPipeline(runId, goal, opts = {}) {
  const workflow = opts.workflow ? getWorkflow(opts.workflow) : null;
  if (opts.workflow && !workflow) {
    finishRun(runId, { status: 'failed', error: `Unknown workflow '${opts.workflow}'` });
    return;
  }
  let plan = workflow
    ? planFromTemplate(runId, goal, workflow)
    : await planRun(runId, goal);
  if (!plan) {
    finishRun(runId, { status: 'failed', error: 'Planner produced no usable plan.' });
    return;
  }

  // Phase 1b: critique the plan before executing (5.1)
  // Workflows skip critique — they are pre-validated templates.
  if (!workflow) {
    try {
      const planCritique = await critiquePlan(runId, goal, plan);
      appendScratchpad(runId, {
        persona: ORCHESTRA_PERSONA,
        kind: 'plan-critique',
        text: planCritique.verdict === 'OK'
          ? 'Plan critique: OK — no high-severity issues found'
          : `Plan critique: REWRITE — ${planCritique.issues.join('; ')}`,
      });
      if (planCritique.verdict === 'REWRITE' && planCritique.issues.length > 0) {
        const rewrittenPlan = await rewritePlan(runId, goal, plan, planCritique.issues);
        if (rewrittenPlan && rewrittenPlan.length > 0) {
          plan = rewrittenPlan;
          setRunPlan(runId, plan);
          appendScratchpad(runId, {
            persona: ORCHESTRA_PERSONA,
            kind: 'plan-rewrite',
            text: `Plan rewritten (${plan.length} steps): ${plan.map((s, i) => `${i}.[${s.persona}]`).join(' ')}`,
          });
          pushEvent({
            sessionId: runId,
            personaId: ORCHESTRA_PERSONA,
            verb: 'result',
            toolName: 'PlanCritique',
            text: `Plan rewritten after critique (${planCritique.issues.length} issue${planCritique.issues.length === 1 ? '' : 's'} fixed)`,
            status: 'ok',
            dedupeKey: `plan-rewrite:done:${runId}`,
          });
        } else {
          appendScratchpad(runId, {
            persona: ORCHESTRA_PERSONA,
            kind: 'plan-rewrite-skipped',
            text: 'Plan rewrite returned no usable plan — proceeding with original',
          });
        }
      }
    } catch (critiqueErr) {
      // Plan critique is best-effort; pipeline continues with original plan.
      appendScratchpad(runId, {
        persona: ORCHESTRA_PERSONA,
        kind: 'plan-critique-error',
        text: `Plan critique failed unexpectedly: ${critiqueErr.message || String(critiqueErr)}`,
      });
    }
  }

  // Approval gate: execute phase
  if (requiresApproval(opts, 'execute')) {
    const run = state.runs.get(runId);
    if (run) {
      run.status = 'awaiting-approval';
      appendScratchpad(runId, { persona: ORCHESTRA_PERSONA, kind: 'gate-pending', text: "Awaiting approval before 'execute' phase" });
      appendAudit(runId, 'gate-pending', { phase: 'execute' });
      // emitRun is called by appendScratchpad internally
    }
    try {
      await waitForGate(runId, 'execute');
      appendAudit(runId, 'gate-approved', { phase: 'execute' });
    } catch (gateErr) {
      appendAudit(runId, 'gate-rejected', { phase: 'execute', reason: gateErr.message });
      return;
    }
  }

  let attempt = 0;
  let exec = await executeRun(runId, goal, plan, null);

  while (exec.status === 'done' && exec.final && attempt < MAX_REVISIONS) {
    const critique = await critiqueRun(runId, goal, exec.final);
    if (critique.severity !== 'critical' && critique.severity !== 'high') break;
    attempt = bumpRunRevision(runId);
    exec = await executeRun(runId, goal, plan, critique);
  }

  if (exec.status === 'done' && exec.final) {
    // Approval gate: verify phase
    if (requiresApproval(opts, 'verify')) {
      const run = state.runs.get(runId);
      if (run) {
        run.status = 'awaiting-approval';
        appendScratchpad(runId, { persona: ORCHESTRA_PERSONA, kind: 'gate-pending', text: "Awaiting approval before 'verify' phase" });
        appendAudit(runId, 'gate-pending', { phase: 'verify' });
      }
      try {
        await waitForGate(runId, 'verify');
        appendAudit(runId, 'gate-approved', { phase: 'verify' });
      } catch (gateErr) {
        appendAudit(runId, 'gate-rejected', { phase: 'verify', reason: gateErr.message });
        return;
      }
    }

    const verdict = await verifyRun(runId, goal, exec.final);
    if (!verdict.passed && attempt < MAX_REVISIONS) {
      attempt = bumpRunRevision(runId);
      const fixCritique = { text: `Verifier rejected: ${verdict.text}`, severity: 'high' };
      exec = await executeRun(runId, goal, plan, fixCritique);
      if (exec.status === 'done' && exec.final) {
        await verifyRun(runId, goal, exec.final);
      }
    }
  }

  // Approval gate: final phase
  if (exec.status === 'done' && exec.final && requiresApproval(opts, 'final')) {
    const run = state.runs.get(runId);
    if (run) {
      run.status = 'awaiting-approval';
      appendScratchpad(runId, { persona: ORCHESTRA_PERSONA, kind: 'gate-pending', text: "Awaiting approval before finalizing run" });
      appendAudit(runId, 'gate-pending', { phase: 'final' });
    }
    try {
      await waitForGate(runId, 'final');
      appendAudit(runId, 'gate-approved', { phase: 'final' });
    } catch (gateErr) {
      appendAudit(runId, 'gate-rejected', { phase: 'final', reason: gateErr.message });
      return;
    }
  }

  setRunPhase(runId, 'done');
  clearFailureCounters(runId);

  // Degrade skills that contributed to failed runs
  const finalRunSnapshot = state.runs.get(runId);
  if (exec.status !== 'done' && Array.isArray(finalRunSnapshot?.skillsRecalled)) {
    for (const recalled of finalRunSnapshot.skillsRecalled) {
      try { degradeSkill(recalled.id); } catch { /* best effort */ }
    }
  }

  if (exec.status === 'done') {
    finishRun(runId, { status: 'done', final: exec.final });
    appendAudit(runId, 'run-done', { revisions: attempt });
    try {
      const finalRun = state.runs.get(runId);
      const persisted = persistSkill(finalRun);
      if (persisted) {
        appendScratchpad(runId, {
          persona: ORCHESTRA_PERSONA,
          kind: 'skill-saved',
          text: `Skill saved: ${persisted.id}`,
        });
      }
    } catch {
      /* skill persistence is best-effort */
    }
    // Fork degraded skills that were recalled for this goal — this successful
    // run is evidence that the goal is still achievable, so we mint a v2.
    try {
      const finalRun = state.runs.get(runId);
      if (Array.isArray(finalRun?.skillsRecalled)) {
        for (const recalled of finalRun.skillsRecalled) {
          const allSkills = listSkills();
          const skill = allSkills.find((s) => s.id === recalled.id);
          if (skill && (Number(skill.degradedCount) || 0) >= 3 && !skill.supersededBy) {
            const forked = forkSkill(recalled.id, finalRun);
            if (forked) {
              appendScratchpad(runId, {
                persona: ORCHESTRA_PERSONA,
                kind: 'skill-forked',
                text: `Skill ${recalled.id} forked to ${forked.id} after ${skill.degradedCount} degradation strikes`,
              });
            }
          }
        }
      }
    } catch {
      /* fork is best-effort */
    }
    // Grade the run against any matching eval — best-effort
    try {
      const finalRun = state.runs.get(runId);
      await gradeRunAgainstEval(finalRun);
    } catch {
      /* grading is best-effort */
    }
    // 5.2: record per-persona success outcomes for auto-tune stats
    try {
      const finalRun = state.runs.get(runId);
      const projectId = finalRun?.projectId;
      const personasSeen = new Set(
        (finalRun?.steps || []).map((s) => s.persona).filter(Boolean),
      );
      for (const personaId of personasSeen) {
        recordPersonaOutcome({ personaId, projectId, outcome: 'success' });
      }
      // Record critic-high if applicable
      if (finalRun?.critique?.severity === 'high' || finalRun?.critique?.severity === 'critical') {
        for (const personaId of personasSeen) {
          recordPersonaOutcome({ personaId, projectId, outcome: 'critic-high' });
        }
      }
      // Record verify-fail if applicable
      if (finalRun?.verification && !finalRun.verification.passed) {
        for (const personaId of personasSeen) {
          recordPersonaOutcome({ personaId, projectId, outcome: 'verify-fail' });
        }
      }
    } catch {
      /* outcome recording is best-effort */
    }
    pushEvent({
      sessionId: runId,
      personaId: ORCHESTRA_PERSONA,
      verb: 'turn-end',
      text: '-- run complete',
      status: 'ok',
      dedupeKey: `end:run:${runId}`,
    });
  } else {
    finishRun(runId, {
      status: 'failed',
      error: exec.error || 'Run failed without final answer.',
    });
    appendAudit(runId, 'run-failed', { error: (exec.error || 'no final answer').slice(0, 200) });
    // 5.2: record per-persona failure outcomes for auto-tune stats
    try {
      const failedRun = state.runs.get(runId);
      const projectId = failedRun?.projectId;
      const personasSeen = new Set(
        (failedRun?.steps || []).map((s) => s.persona).filter(Boolean),
      );
      for (const personaId of personasSeen) {
        recordPersonaOutcome({ personaId, projectId, outcome: 'failure' });
      }
    } catch {
      /* outcome recording is best-effort */
    }
    pushEvent({
      sessionId: runId,
      personaId: ORCHESTRA_PERSONA,
      verb: 'result',
      text: exec.error || 'Run failed',
      status: 'err',
      dedupeKey: `end:run:${runId}`,
    });
  }
}

export async function runOrchestrator(goal, opts = {}) {
  if (opts.projectId) {
    const project = getProject(opts.projectId);
    if (!project) throw new Error(`Unknown project '${opts.projectId}'`);
  }
  const runId = newId('run');
  const run = startRun(runId, goal);
  if (opts.workflow) {
    run.workflow = String(opts.workflow);
  }
  if (opts.projectId) {
    run.projectId = String(opts.projectId);
  }
  pushEvent({
    sessionId: runId,
    personaId: ORCHESTRA_PERSONA,
    verb: 'prompt',
    text: summarize(goal),
    status: 'ok',
    dedupeKey: `prompt:run:${runId}`,
  });

  runPipeline(runId, goal, opts).catch((error) => {
    finishRun(runId, { status: 'failed', error: error.message || String(error) });
  });
  return { runId, run: viewRun(run) };
}
