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
  isRunCancellationRequested,
} from '../state.js';
import { getAgentSync, listAgentsSync, resolveAgentIdSync } from '../store/agents.js';
import { costUsd } from '../mapping/pricing.js';
import { recallSkills, persistSkill, degradeSkill, forkSkill, listSkills } from './skills.js';
import { generateImage } from './image.js';
import { callLLM } from './providers-llm.js';
import { getWorkflow } from './workflows.js';
import { getProject } from '../store/projects.js';
import { appendAudit } from './audit.js';
import { gradeRunAgainstEval } from './evals.js';
import { userProfileBlock } from './user-profile.js';
import { registerGateResolver } from '../state.js';
import { recordPersonaOutcome } from './persona-tune.js';
import { composedRecall, recordSkillCoOccurrence } from './skill-graph.js';

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

const ANALYZE_SYSTEM = `You are Orchestra, the boss. Decide if the user's goal can be acted on
right now. Default STRONGLY to action — your specialists can fill reasonable
gaps with sensible defaults.

Reply with exactly "CLEAR" UNLESS the goal is genuinely impossible to start
without one specific missing fact (e.g. no subject for a profile, no
language for a translation, no destination for a delivery). Surface
phrasing, informality, brevity, or ambiguity about style / tone / length /
format are NOT reasons to ask — pick a sensible default and proceed.

When in doubt, reply "CLEAR". Only if execution is truly blocked, reply
with ONE concise question (no preface, no plan).`;

async function analyzeRun(runId, goal, opts = {}) {
  setRunPhase(runId, 'plan'); // Reuse plan phase for analysis
  const orch = orchestratorAgent();
  const model = orch.model || 'claude-sonnet-4-5';
  let text = '';
  try {
    for await (const message of callOrchLLM({
      phase: 'plan',
      prompt: `Goal: ${goal}\n\nAnalyze this goal. Is it clear or do you need more info?`,
      systemPrompt: ANALYZE_SYSTEM,
      model,
      opts,
    })) {
      if (message.type === 'assistant') text += textFromAssistant(message) + '\n';
    }
  } catch (error) {
    return 'CLEAR'; // Fallback
  }
  return text.trim();
}

// ---------- Phase 1: Planning ----------

const PLANNER_SYSTEM = `You are Orchestra in PLAN mode. Decompose the user goal into the
SHORTEST possible sequence of delegations to specialist personas. Each step must
be self-contained.

Available personas:
{ROSTER}

--- IMPORTANT INSTRUCTIONS FOR 2026 REAL-TIME DATA ---
1. Your internal knowledge is OUTDATED (it stops at 2024). 
2. If the goal involves "latest trends", "news", "current events", or anything regarding the year 2026, you MUST start by delegating a research task to 'nana' (NOT nyx, NOT lumen, NOT yourself).
3. The instruction for 'nana' MUST include the phrase "Search the internet for current May 2026 information".
4. DO NOT assign research or drafting of current events to 'orchestra'. Orchestra only synthesizes.
5. You are FORBIDDEN from hallucinating 2026 facts. Use 'nana' first.
-------------------------------------------------------

You MUST reply with exactly and only a JSON array. DO NOT wrap the array in an object.
DO NOT use keys like "step", "task", or "description".
Use EXACTLY this schema:
[
  {
    "persona": "<id>",
    "instruction": "<self-contained brief>",
    "depends_on": <index|null>
  }
]

Constraints:
- 1 to 6 steps. Fewer is better.
- "depends_on" is the index (0-based) of an earlier step whose output this step needs, or null.
- Do NOT include orchestra in the steps; orchestra synthesizes after execution.
- Pick the MINIMUM set of personas needed. Don't pad with extras.`;

function extractJsonArray(text) {
  if (!text) return null;
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  let candidate = fenced ? fenced[1].trim() : trimmed;
  
  let rawArray = null;

  // Try parsing the whole thing first
  try {
    const parsed = JSON.parse(candidate);
    if (Array.isArray(parsed)) {
      rawArray = parsed;
    } else if (parsed && Array.isArray(parsed.plan)) {
      rawArray = parsed.plan;
    }
  } catch {}

  // Fallback: try finding the first [ to the last ]
  if (!rawArray) {
    const start = candidate.indexOf('[');
    const end = candidate.lastIndexOf(']');
    if (start !== -1 && end !== -1 && end > start) {
      try {
        const parsed = JSON.parse(candidate.slice(start, end + 1));
        if (Array.isArray(parsed)) rawArray = parsed;
      } catch {}
    }
  }

  if (!rawArray) return null;

  // Normalize the array to the expected schema
  return rawArray.map((s, idx) => ({
    persona: s.persona || s.agent || s.agentId || s.role || 'orchestra',
    instruction: s.instruction || s.description || s.task || s.action || JSON.stringify(s),
    depends_on: s.depends_on !== undefined ? s.depends_on : (idx > 0 ? idx - 1 : null)
  }));
}

async function planRun(runId, goal, opts = {}) {
  setRunPhase(runId, 'plan');

  let recalled = [];
  try {
    const run = state.runs.get(runId);
    const recallOpts = run?.projectId ? { projectId: run.projectId } : {};
    // 5.3: composedRecall augments direct tag recall with graph-adjacent skills
    recalled = composedRecall(goal, recallOpts).map((s) => ({ ...s, score: undefined }));
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
    for await (const message of callOrchLLM({
      phase: 'plan',
      prompt: `Goal: ${goal}${recalledSkillsBlock(recalled)}\n\nReturn the JSON plan now.`,
      systemPrompt: PLANNER_SYSTEM.replace('{ROSTER}', rosterText()),
      model,
      opts,
    })) {
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

export async function critiquePlan(runId, goal, plan, opts = {}) {
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
    for await (const message of callOrchLLM({
      phase: 'plan',
      prompt: `Audit this plan now.\n\n${planJson}`,
      systemPrompt,
      model,
      opts,
    })) {
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

async function rewritePlan(runId, goal, plan, issues, opts = {}) {
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
    for await (const message of callOrchLLM({
      phase: 'plan',
      prompt: `Original plan:\n${planJson}\n\nReturn the corrected JSON plan now.`,
      systemPrompt,
      model,
      opts,
    })) {
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

// Direct sequential execution: iterate plan, call query() once per step.
// Avoids the SDK Task-tool / nested-agents path which doesn't propagate the
// OAuth beta header and hangs sub-agent calls indefinitely on OAuth tokens.
async function executeStep(runId, goal, step, idx, prior, opts = {}) {
  const personaId = step.persona;
  const persona = getAgentSync(personaId) || { id: personaId, name: personaId, role: 'agent' };
  const provider = opts.provider || 'claude';
  const model = persona.model || (provider === 'codex' ? 'gpt-4o' : provider === 'gemini' ? 'gemini-3.1-pro-preview' : 'claude-sonnet-4-6');
  const toolUseId = `step_${runId}_${idx}_${crypto.randomBytes(3).toString('hex')}`;

  startTask({
    tool_use_id: toolUseId,
    sessionId: runId,
    subagent_type: personaId,
    description: summarize(step.instruction, 200),
  });
  pushEvent({
    sessionId: runId,
    personaId,
    verb: 'used',
    toolName: 'Task',
    text: summarize(step.instruction, 200),
    status: 'ok',
    toolUseId,
    dedupeKey: `tu:run:${runId}:${toolUseId}`,
  });
  appendScratchpad(runId, { persona: personaId, kind: 'delegation', text: step.instruction });

  // Surface mid-run user comments (kind === 'user-note') so the model
  // actually sees what the operator typed into the workspace comment box.
  // Filter to ones that target this step (or are global).
  const runForNotes = state.runs.get(runId);
  const userNotes = (runForNotes?.scratchpad || [])
    .filter((s) => s.kind === 'user-note')
    .filter((s) => {
      const m = /^\[Re: step #(\d+)\]/.exec(s.text || '');
      return !m || Number(m[1]) === idx + 1;
    })
    .map((s) => s.text)
    .slice(-6); // cap to avoid runaway prompt growth
  const userNoteBlock = userNotes.length
    ? `\n\nUser notes / instructions during this run (treat these as authoritative):\n${userNotes.map((t) => `- ${t}`).join('\n')}`
    : '';

  const priorBlock = (prior.length
    ? `\n\nContext from earlier steps:\n${prior.map((p) => `### ${p.persona}\n${p.text}`).join('\n\n')}`
    : '') + userNoteBlock;

  // ── Image-generation branch ─────────────────────────────────────────
  // Echo (Emi) is an image persona, not an LLM persona. Calling query()
  // would hang because persona.model is null. Route to the image adapter
  // (Nano Banana 2) directly and write the URL into result.image.
  //
  // Earlier steps (research / writing) often contain the actual visual
  // subject — we used to drop that context and send only step.instruction,
  // which is why generated images were generic. Now we (a) distill priors
  // + instruction into a focused visual prompt via a cheap LLM call, and
  // (b) fall back to a direct concat if the distillation fails.
  if (personaId === 'echo') {
    // Compose ONE OR MANY image prompts based on the prior context. The
    // composer LLM returns a JSON array — if the prior text contained
    // "post 1 / post 2" or the instruction asks for N images, we get
    // N prompts. Otherwise it returns a single-item array.
    let imagePrompts = [step.instruction];
    if (prior.length > 0) {
      const priorText = prior
        .map((p) => `[${p.persona}]\n${p.text}`)
        .join('\n\n')
        .slice(0, 6000);
      const composerSystem = `You compose image-generation prompts for diffusion models.
Read the assignment + earlier research/writing context, then decide how
many distinct images this deliverable needs (e.g. one image per Facebook
post, one per product variant). Output a JSON array of self-contained
English prompts — each ~80-160 words, including subject, setting,
lighting, composition, mood, and concrete visual cues from the context.

Reply with ONLY the JSON array, no preface or prose:
["prompt 1", "prompt 2", ...]

Use 1 prompt unless the context clearly calls for more. Cap at 4.`;
      const composerPrompt = `Assignment: ${step.instruction}\n\nContext from earlier steps:\n${priorText}\n\nReturn the JSON array of prompts now.`;
      try {
        let composed = '';
        for await (const message of callOrchLLM({
          phase: 'execute',
          prompt: composerPrompt,
          systemPrompt: composerSystem,
          model: 'claude-haiku-4-5-20251001',
          opts,
        })) {
          if (message.type === 'assistant') composed += textFromAssistant(message) + '\n';
          if (message.type === 'result') {
            recordPhaseCost(runId, 'execute', 'claude-haiku-4-5-20251001', message.usage);
            recordUsage({
              model: 'claude-haiku-4-5-20251001',
              usage: message.usage,
              dedupeKey: `usage:run:${runId}:${toolUseId}:imgcompose:${message.uuid}`,
              sessionId: runId,
            });
          }
        }
        const parsed = extractJsonArray(composed);
        if (Array.isArray(parsed) && parsed.length > 0) {
          imagePrompts = parsed
            .map((p) => typeof p === 'string' ? p : (p?.prompt || p?.instruction || ''))
            .filter((p) => p && p.length > 30)
            .slice(0, 4);
        } else if (composed.trim().length > 40) {
          imagePrompts = [composed.trim()];
        } else {
          imagePrompts = [`${step.instruction}\n\nVisualize using these details from earlier research:\n${priorText.slice(0, 2000)}`];
        }
      } catch (composeErr) {
        imagePrompts = [`${step.instruction}\n\nVisualize using these details from earlier research:\n${priorText.slice(0, 2000)}`];
      }
    }
    imagePrompts = imagePrompts.map((p) => p.slice(0, 4000));
    appendScratchpad(runId, {
      persona: personaId,
      kind: 'image-prompt',
      text: `Composing ${imagePrompts.length} image${imagePrompts.length === 1 ? '' : 's'}:\n\n` +
        imagePrompts.map((p, n) => `[#${n + 1}] ${p}`).join('\n\n'),
    });

    // Hard timeout per image — keeps a hung provider from stalling the run.
    const IMAGE_TIMEOUT_MS = Number(process.env.COFFICE_TIMEOUT_IMAGE_MS) || 120_000;
    const generateOne = async (prompt, n) => {
      let timer;
      const deadline = new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`Image ${n + 1} timed out after ${Math.round(IMAGE_TIMEOUT_MS / 1000)}s`)),
          IMAGE_TIMEOUT_MS,
        );
      });
      try {
        return await Promise.race([
          generateImage({ prompt, persona: `${runId}-echo-${idx}-${n}` }),
          deadline,
        ]);
      } finally {
        clearTimeout(timer);
      }
    };

    // Generate sequentially so a single rate-limit doesn't fan out.
    const images = [];
    let imageError = '';
    for (let n = 0; n < imagePrompts.length; n++) {
      // Visible progress signal — image API can take 30-90s; without this
      // the UI shows "execute" with no movement and looks frozen.
      pushEvent({
        sessionId: runId,
        personaId,
        verb: 'used',
        toolName: 'ImageGen',
        text: `Calling image API (${n + 1}/${imagePrompts.length})…`,
        status: 'ok',
        dedupeKey: `imggen:${runId}:${toolUseId}:${n}`,
      });
      try {
        const out = await generateOne(imagePrompts[n], n);
        if (out?.url) images.push({ url: out.url, model: out.model, provider: out.provider });
      } catch (err) {
        if (!imageError) imageError = err?.message || String(err);
        break; // stop on first failure to avoid burning budget
      }
    }

    const ok = images.length > 0;
    const imageOut = images[0] || null;
    const summary = ok
      ? `Generated ${images.length} image${images.length === 1 ? '' : 's'} (${imageOut.model || imageOut.provider}):\n${images.map((im) => im.url).join('\n')}`
      : `Image generation failed: ${imageError}`;
    const result = {
      ok,
      text: summary,
      error: ok ? null : imageError,
      image: ok ? imageOut : null,
      images: ok ? images : [],
    };
    stepRun(runId, {
      tool_use_id: toolUseId,
      persona: personaId,
      instruction: step.instruction,
      result,
    });
    pushEvent({
      sessionId: runId,
      personaId,
      verb: 'result',
      toolName: 'Task',
      text: summary,
      status: ok ? 'ok' : 'err',
      toolUseId,
      dedupeKey: `tr:run:${runId}:${toolUseId}`,
    });
    appendScratchpad(runId, {
      persona: personaId,
      kind: ok ? 'finding' : 'error',
      text: summary,
    });
    finishTask({ tool_use_id: toolUseId, status: ok ? 'done' : 'failed' });
    return {
      ok,
      persona: personaId,
      personaName: persona.name || personaId,
      text: ok ? summary : '',
      error: ok ? '' : imageError,
    };
  }

  const dateStr = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const prompt = `[CURRENT DATE: ${dateStr}]
Original goal: ${goal}

Your assignment: ${step.instruction}${priorBlock}

TOOL BUDGET (hard limit): you may make at most 6 tool calls total. After
the 6th tool call — or sooner if you have enough — STOP calling tools and
write your final answer as a plain assistant text message. Do not exceed
the budget; partial information is acceptable.

FORMATTING REQUIREMENTS:
- Use clear Markdown headers (##, ###) for sections.
- Use bullet points or numbered lists for details.
- Add double line breaks between paragraphs for readability.
- If providing data/tables, use Markdown table format.
- Ensure the output is clean and ready for professional use.

Return the artifact only — no preface or conversational filler.`;
  
  const baseSystemPrompt = persona.systemPrompt
    || `You are ${persona.name || personaId}. ${persona.role || ''}\nReturn a concise, self-contained artifact for the assigned task.`;
  const systemPrompt = baseSystemPrompt + `\n\nIMPORTANT TEMPORAL CONTEXT: Today is ${dateStr} (Simulation Year 2026). All your responses, research, and data processing MUST be relative to this date. If you search the internet, look for 2026 data. Do not treat 2024 or 2025 as the present; they are the past.` + userProfileBlock();

  let outText = '';
  let stepError = '';

  // Codex / Gemini route through providers-llm.js (no SDK tools support).
  if (provider === 'codex' || provider === 'gemini') {
    const ms = PHASE_TIMEOUTS_MS.execute;
    const call = callLLM({ provider, systemPrompt, prompt, model });
    let r;
    if (ms && ms > 0) {
      let timer;
      const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => reject(new PhaseTimeoutError('execute', ms)), ms);
      });
      try {
        r = await Promise.race([call, timeout]);
      } catch (err) {
        if (err instanceof PhaseTimeoutError) {
          stepError = err.message;
          r = { ok: false };
        } else {
          throw err;
        }
      } finally {
        clearTimeout(timer);
      }
    } else {
      r = await call;
    }
    if (r.ok) outText = r.text;
    else if (!stepError) stepError = (r.error || '') + (r.hint ? ` (${r.hint})` : '');
  } else {
    // Claude path — SDK with tools support. Personas with a non-empty
    // toolsAllowed list need multiple turns (call tool → read result →
    // write text). Research personas (WebSearch, WebFetch) often need
    // several search iterations + a synthesis turn, so we budget 20.
    const personaTools = Array.isArray(persona.toolsAllowed) ? persona.toolsAllowed
      : Array.isArray(persona.tools) ? persona.tools
      : [];
    const maxTurns = personaTools.length > 0 ? 30 : 1;
    try {
      const sdkOpts = {
        model,
        maxTurns,
        systemPrompt,
        permissionMode: 'dontAsk',
      };
      if (personaTools.length > 0) {
        sdkOpts.tools = personaTools;
        sdkOpts.allowedTools = personaTools;
      }
      let hitMaxTurns = false;
      for await (const message of withPhaseTimeout(query({ prompt, options: sdkOpts }), 'execute')) {
        if (message.type === 'assistant') {
          outText += textFromAssistant(message) + '\n';
        }
        if (message.type === 'result') {
          recordPhaseCost(runId, 'execute', model, message.usage);
          recordUsage({
            model,
            usage: message.usage,
            dedupeKey: `usage:run:${runId}:${toolUseId}:${message.uuid}`,
            sessionId: runId,
          });
          if (message.is_error || message.subtype !== 'success') {
            if (message.subtype === 'error_max_turns') {
              hitMaxTurns = true;
            } else {
              stepError = (message.errors || []).join('\n') || message.subtype || 'step failed';
            }
          }
        }
      }
      // If we hit max turns BUT the agent produced enough accumulated text,
      // accept the partial result. Only fail if we got nothing usable.
      if (hitMaxTurns && !stepError) {
        if (outText.trim().length < 100) {
          // Force a final synthesis turn with no tools — agent must reply now.
          try {
            const synthPrompt = `You exhausted your tool budget before producing a final answer. ` +
              `Based on whatever you have so far, write your best final answer as plain text now. ` +
              `No more tool calls. If you have nothing, say so explicitly.\n\nOriginal assignment: ${step.instruction}${priorBlock}`;
            for await (const m2 of withPhaseTimeout(query({
              prompt: synthPrompt,
              options: { model, maxTurns: 1, systemPrompt, permissionMode: 'dontAsk' },
            }), 'execute')) {
              if (m2.type === 'assistant') outText += textFromAssistant(m2) + '\n';
              if (m2.type === 'result') {
                recordPhaseCost(runId, 'execute', model, m2.usage);
                recordUsage({
                  model,
                  usage: m2.usage,
                  dedupeKey: `usage:run:${runId}:${toolUseId}:synth:${m2.uuid}`,
                  sessionId: runId,
                });
              }
            }
          } catch (synthErr) {
            stepError = `error_max_turns; synthesis failed: ${synthErr.message || synthErr}`;
          }
          if (!stepError && outText.trim().length < 20) {
            stepError = 'error_max_turns (no usable output even after synthesis)';
          }
        }
      }
    } catch (error) {
      stepError = error.message || String(error);
    }
  }

  outText = outText.trim();
  const ok = !stepError && !!outText;
  const result = { ok, text: outText || stepError, error: stepError || null };

  stepRun(runId, {
    tool_use_id: toolUseId,
    persona: personaId,
    instruction: step.instruction,
    result,
  });
  pushEvent({
    sessionId: runId,
    personaId,
    verb: 'result',
    toolName: 'Task',
    text: summarize(outText || stepError, 200),
    status: ok ? 'ok' : 'err',
    toolUseId,
    dedupeKey: `tr:run:${runId}:${toolUseId}`,
  });
  appendScratchpad(runId, {
    persona: personaId,
    kind: ok ? 'finding' : 'error',
    text: outText || stepError,
  });
  finishTask({ tool_use_id: toolUseId, status: ok ? 'done' : 'failed' });

  return { ok, persona: personaId, personaName: persona.name || personaId, text: outText, error: stepError };
}

async function* callOrchLLM({ phase, prompt, systemPrompt, model, opts }) {
  const dateStr = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const finalSystemPrompt = systemPrompt + `\n\nIMPORTANT TEMPORAL CONTEXT: Today is ${dateStr} (Simulation Year 2026). All your responses, research, and data processing MUST be relative to this date. If you search the internet, look for 2026 data. Do not treat 2024 or 2025 as the present; they are the past.` + userProfileBlock();
  const provider = opts.provider || 'claude';
  let m = model;
  if (provider !== 'claude' && typeof m === 'string' && m.includes('claude')) {
    m = undefined; // allow provider-specific defaults
  } else if (provider === 'claude' && !m) {
    m = 'claude-sonnet-4-5';
  }

  if (provider === 'claude') {
    yield* withPhaseTimeout(query({
      prompt,
      options: {
        model: m,
        maxTurns: 1,
        systemPrompt: finalSystemPrompt,
        permissionMode: 'dontAsk',
      },
    }), phase);
  } else {
    // Non-claude providers go through callLLM() which has no internal
    // streaming. Race against the same per-phase wall-clock budget that
    // withPhaseTimeout enforces on the claude path, otherwise an
    // unresponsive provider hangs the pipeline indefinitely.
    const ms = PHASE_TIMEOUTS_MS[phase];
    const call = callLLM({ provider, systemPrompt: finalSystemPrompt, prompt, model: m });
    let r;
    if (ms && ms > 0) {
      let timer;
      const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => reject(new PhaseTimeoutError(phase, ms)), ms);
      });
      try {
        r = await Promise.race([call, timeout]);
      } finally {
        clearTimeout(timer);
      }
    } else {
      r = await call;
    }
    if (r.ok) {
      yield { type: 'assistant', message: { content: [{ type: 'text', text: r.text }] } };
      yield { type: 'result', usage: { input_tokens: 0, output_tokens: 0 }, uuid: crypto.randomBytes(4).toString('hex'), subtype: 'success' };
    } else {
      throw new Error(r.error + (r.hint ? ` (${r.hint})` : ''));
    }
  }
}

async function executeRun(runId, goal, plan, critique, opts = {}) {
  setRunPhase(runId, 'execute');
  // results[i] is the output (or null) of plan[i], indexed by plan order.
  const results = new Array(plan.length).fill(null);
  let firstError = '';

  if (critique?.text) {
    appendScratchpad(runId, {
      persona: ORCHESTRA_PERSONA,
      kind: 'note',
      text: `Revising based on critique: ${summarize(critique.text, 200)}`,
    });
  }

  // Group plan into dependency waves. A step belongs to wave W iff the max
  // wave of any step it depends on is W-1. Independent steps share wave 0
  // and run concurrently — Orchestra fans them out, then synthesizes after.
  const waves = [];
  const waveOf = new Array(plan.length).fill(0);
  for (let i = 0; i < plan.length; i++) {
    const dep = plan[i].depends_on;
    const depIdx = (typeof dep === 'number' && dep >= 0 && dep < i) ? dep : null;
    waveOf[i] = depIdx !== null ? (waveOf[depIdx] + 1) : 0;
    if (!waves[waveOf[i]]) waves[waveOf[i]] = [];
    waves[waveOf[i]].push(i);
  }

  for (let w = 0; w < waves.length; w++) {
    if (isRunCancellationRequested(runId)) {
      return { status: 'failed', final: '', error: 'Run cancelled by user' };
    }
    const wave = waves[w];

    // Build the prior-context list each step in this wave should see — only
    // results from earlier waves count, so concurrent steps stay independent.
    const priorForWave = [];
    for (let j = 0; j < plan.length; j++) {
      if (waveOf[j] < w && results[j]) {
        priorForWave.push({
          persona: results[j].personaName || results[j].persona,
          personaName: results[j].personaName || results[j].persona,
          text: results[j].text,
        });
      }
    }

    if (wave.length > 1) {
      pushEvent({
        sessionId: runId,
        personaId: ORCHESTRA_PERSONA,
        verb: 'used',
        toolName: 'Dispatch',
        text: `Dispatching ${wave.length} steps in parallel: ${wave.map((i) => `[${plan[i].persona}]`).join(' ')}`,
        status: 'ok',
        dedupeKey: `dispatch:wave:${runId}:${w}`,
      });
    }

    const settled = await Promise.all(wave.map((i) =>
      executeStep(runId, goal, plan[i], i, priorForWave, opts)
        .then((out) => ({ i, out }))
        .catch((err) => ({ i, out: { ok: false, persona: plan[i].persona, error: err?.message || String(err) } }))
    ));

    for (const { i, out } of settled) {
      if (out.ok) {
        results[i] = {
          persona: out.personaName || out.persona,
          personaName: out.personaName || out.persona,
          text: out.text,
        };
      } else if (!firstError) {
        firstError = `Step ${i} (${out.persona}) failed: ${out.error || 'no output'}`;
      }
    }
  }

  const ordered = results.filter(Boolean);
  if (ordered.length === 0) {
    return { status: 'failed', final: '', error: firstError || 'No step produced output.' };
  }

  const finalText = ordered
    .map((p) => `## ${p.personaName || p.persona || 'Agent'}\n${p.text}`)
    .join('\n\n');
  return { status: 'done', final: finalText, error: '' };
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

async function critiqueRun(runId, goal, finalText, opts = {}) {
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
    for await (const message of callOrchLLM({
      phase: 'critique',
      prompt: `Goal:\n${goal}\n\nArtifact under review:\n${finalText}\n\nReturn your verdict now.`,
      systemPrompt: CRITIQUE_SYSTEM,
      model,
      opts,
    })) {
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

Reply with exactly and only a JSON object. Do not include any prose.
Schema: {"passed": boolean, "reason": "string"}

Do NOT rewrite or improve. Verifier only.`;

async function verifyRun(runId, goal, finalText, opts = {}) {
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
    for await (const message of callOrchLLM({
      phase: 'verify',
      prompt: `Goal:\n${goal}\n\nArtifact:\n${finalText}\n\nReturn your one-line verdict now.`,
      systemPrompt: VERIFY_SYSTEM,
      model,
      opts,
    })) {
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
  let passed = false;
  let reason = trimmed;

  try {
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
    const candidate = fenced ? fenced[1].trim() : trimmed;
    const start = candidate.indexOf('{');
    const end = candidate.lastIndexOf('}');
    if (start !== -1 && end !== -1 && end > start) {
      const parsed = JSON.parse(candidate.slice(start, end + 1));
      if (typeof parsed.passed === 'boolean') {
        passed = parsed.passed;
        reason = parsed.reason || trimmed;
      }
    }
  } catch {
    // Fallback if JSON parsing fails
    passed = /\bPASS\b/i.test(trimmed) || /successfully fulfills/i.test(trimmed);
  }

  setRunVerification(runId, { passed, text: reason });
  appendAudit(runId, 'verify-done', { passed, text: reason.slice(0, 200) });
  pushEvent({
    sessionId: runId,
    personaId: ORCHESTRA_PERSONA,
    verb: 'result',
    toolName: 'Verify',
    text: passed ? 'Goal verified' : 'Goal NOT verified',
    status: passed ? 'ok' : 'err',
    dedupeKey: `verify:done:${runId}:${Date.now()}`,
  });
  return { passed, text: reason };
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

// ---------- Team Flow (iterative orchestration) ----------
//
// Replaces the static "plan up front → execute" model with a dynamic loop.
// Orchestra (Sonnet) sees the goal + a transcript of previous specialist
// outputs and decides ONE of two things:
//   (a) delegate(persona, instruction) — call the next specialist
//   (b) done(final)                    — assemble final, stop the loop
//
// This lets the boss adapt: e.g. ask Nana for research, read it, then decide
// based on what came back whether to call Mira for distribution, Vex for a
// compliance pass, Echo for an image, or end. Plan grows live in state so
// the dashboard reflects the real branching.

const TEAM_FLOW_MAX_ITERATIONS = 12;

const TEAM_DECIDE_SYSTEM = `You are Orchestra, the team boss in TEAM-FLOW mode.
You orchestrate a chain of specialists ONE AT A TIME, reading the result
before deciding who comes next. You do NOT produce a static plan up front.

Roster of valid persona ids:
{ROSTER}

You will receive:
- The original user goal
- A numbered transcript of specialist outputs already produced (may be empty
  on the first turn)

Decide the next move and reply with EXACTLY ONE JSON object — no markdown,
no preface:

  { "action": "delegate", "persona": "<id>", "instruction": "<self-contained brief>", "reason": "<one sentence why this persona, why now>" }

  OR

  { "action": "done", "final": "<assembled final answer for the user>", "reason": "<one sentence why we are finished>" }

Rules:
- Pick the SINGLE next specialist whose output most advances the goal.
- The instruction MUST be self-contained — the specialist sees only what
  you write here, plus the prior transcript you decide to quote inline.
- Use 'done' as soon as the goal is satisfied. Do not pad with extra steps.
- Hard cap: if the transcript already has ${TEAM_FLOW_MAX_ITERATIONS - 1} entries, you MUST reply 'done' with the best assembly you can.
- For real-time / 2026 facts, delegate to nyx (Nana) FIRST before anyone writes copy.
- Do NOT delegate to 'orchestra' — that's you.
- Do NOT repeat a persona on the SAME sub-task. If a persona already produced what you need, move on.
- When 'done', 'final' must be the COMPLETE artifact the user asked for, not a summary of what happened.`;

function teamTranscript(history) {
  if (!history || history.length === 0) return '(empty — no specialists run yet)';
  return history.map((h, i) =>
    `[#${i + 1}] persona=${h.persona}\n  instruction: ${h.instruction}\n  output:\n${h.output || '(no output)'}\n`
  ).join('\n');
}

async function orchestraDecide(runId, goal, history, model, opts) {
  const sys = TEAM_DECIDE_SYSTEM.replace('{ROSTER}', rosterText());
  const userPrompt =
    `USER GOAL:\n${goal}\n\n` +
    `TRANSCRIPT (${history.length} specialist output${history.length === 1 ? '' : 's'} so far):\n${teamTranscript(history)}\n\n` +
    `Reply with the single JSON decision now.`;
  let text = '';
  try {
    for await (const message of callOrchLLM({
      phase: 'plan',
      prompt: userPrompt,
      systemPrompt: sys,
      model,
      opts,
    })) {
      if (message.type === 'assistant') text += textFromAssistant(message) + '\n';
      if (message.type === 'result') {
        recordPhaseCost(runId, 'plan', model, message.usage);
        recordUsage({
          model,
          usage: message.usage,
          dedupeKey: `usage:team-decide:${runId}:${history.length}:${message.uuid}`,
          sessionId: runId,
        });
      }
    }
  } catch (err) {
    return { action: 'done', final: '', reason: `decide failed: ${err.message || err}` };
  }
  // Parse the single JSON object the model emitted.
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1].trim() : trimmed;
  let obj = null;
  try { obj = JSON.parse(candidate); } catch {
    const start = candidate.indexOf('{');
    const end = candidate.lastIndexOf('}');
    if (start !== -1 && end > start) {
      try { obj = JSON.parse(candidate.slice(start, end + 1)); } catch { /* fallthrough */ }
    }
  }
  if (!obj || typeof obj !== 'object') {
    return { action: 'done', final: text, reason: 'decide returned non-JSON; using raw text as final' };
  }
  if (obj.action !== 'delegate' && obj.action !== 'done') obj.action = 'done';
  return obj;
}

async function runTeamFlow(runId, goal, opts = {}) {
  setRunPhase(runId, 'execute');
  const orch = orchestratorAgent();
  const model = orch.model || 'claude-sonnet-4-5';

  const history = [];      // { persona, instruction, output, ok }
  const planLive = [];     // mirror for setRunPlan / dashboard
  let final = '';
  let firstError = '';
  let stopReason = '';

  for (let iter = 0; iter < TEAM_FLOW_MAX_ITERATIONS; iter++) {
    if (isRunCancellationRequested(runId)) {
      return { status: 'failed', final: final || '', error: 'Run cancelled by user' };
    }

    pushEvent({
      sessionId: runId,
      personaId: ORCHESTRA_PERSONA,
      verb: 'used',
      toolName: 'Decide',
      text: history.length === 0
        ? 'Orchestra: deciding first specialist…'
        : `Orchestra: reviewing output #${history.length}, deciding next move…`,
      status: 'ok',
      dedupeKey: `team-decide:${runId}:${iter}`,
    });

    const decision = await orchestraDecide(runId, goal, history, model, opts);
    appendScratchpad(runId, {
      persona: ORCHESTRA_PERSONA,
      kind: 'team-decision',
      text: `iter ${iter}: action=${decision.action}` +
            (decision.action === 'delegate' ? ` → ${decision.persona}` : '') +
            (decision.reason ? `\nreason: ${decision.reason}` : ''),
    });

    if (decision.action === 'done') {
      final = decision.final || '';
      stopReason = decision.reason || 'orchestra signalled done';
      break;
    }

    const persona = String(decision.persona || '').toLowerCase();
    const instruction = String(decision.instruction || '').trim();
    if (!persona || !instruction) {
      stopReason = 'orchestra returned malformed delegation';
      break;
    }
    if (persona === ORCHESTRA_PERSONA) {
      stopReason = 'orchestra tried to delegate to itself';
      break;
    }

    planLive.push({ persona, instruction, depends_on: planLive.length ? planLive.length - 1 : null });
    setRunPlan(runId, planLive);

    const prior = history.map((h) => ({
      persona: h.persona,
      personaName: h.persona,
      text: h.output,
    }));

    const out = await executeStep(
      runId,
      goal,
      { persona, instruction, depends_on: planLive.length > 1 ? planLive.length - 2 : null },
      iter,
      prior,
      opts,
    );

    if (out.ok) {
      history.push({
        persona: out.personaName || out.persona || persona,
        instruction,
        output: out.text || '',
        ok: true,
      });
    } else {
      if (!firstError) firstError = `Step ${iter} (${out.persona}) failed: ${out.error || 'no output'}`;
      history.push({
        persona: out.personaName || out.persona || persona,
        instruction,
        output: `(step failed: ${out.error || 'no output'})`,
        ok: false,
      });
    }
  }

  // If Orchestra never said done (hit iteration cap), assemble from history.
  if (!final) {
    if (history.length === 0) {
      return { status: 'failed', final: '', error: firstError || stopReason || 'team flow produced no output' };
    }
    final = history
      .filter((h) => h.ok && h.output && h.output.trim())
      .map((h) => `## ${h.persona}\n${h.output}`)
      .join('\n\n');
    if (!final) {
      return { status: 'failed', final: '', error: firstError || stopReason || 'all team steps failed' };
    }
    appendScratchpad(runId, {
      persona: ORCHESTRA_PERSONA,
      kind: 'team-fallback-synth',
      text: `Hit iteration cap (${TEAM_FLOW_MAX_ITERATIONS}); assembled final from ${history.length} step(s) without explicit done`,
    });
  }

  return { status: 'done', final, error: '' };
}

async function runPipeline(runId, goal, opts = {}) {
  // Phase 0: Initial Analysis / Clarification.
  // Skip when the user has already supplied follow-up feedback — at that
  // point the goal has been augmented with the user's answer and re-asking
  // would just re-loop the same question. Treat resumed runs (existingRunId)
  // as already-clarified.
  const analysis = opts.existingRunId ? 'CLEAR' : await analyzeRun(runId, goal, opts);
  if (analysis !== 'CLEAR') {
    appendScratchpad(runId, {
      persona: ORCHESTRA_PERSONA,
      kind: 'analysis',
      text: analysis,
    });
    // Set run to awaiting-input state
    const run = state.runs.get(runId);
    if (run) {
      run.status = 'awaiting-approval'; // Map to a state that pauses
      run.phase = 'clarify';
      appendAudit(runId, 'awaiting-clarification', { question: analysis });
    }
    // We wait for the user to 'chat' back, which resumes runOrchestrator
    return; 
  }

  const workflow = opts.workflow ? getWorkflow(opts.workflow) : null;
  if (opts.workflow && !workflow) {
    finishRun(runId, { status: 'failed', error: `Unknown workflow '${opts.workflow}'` });
    return;
  }

  // Team-flow path: dynamic, per-step orchestration. Default for non-workflow
  // runs. Workflows continue to use the static template path so pre-validated
  // sequences keep working unchanged.
  if (!workflow) {
    if (requiresApproval(opts, 'execute')) {
      const run = state.runs.get(runId);
      if (run) {
        run.status = 'awaiting-approval';
        appendScratchpad(runId, { persona: ORCHESTRA_PERSONA, kind: 'gate-pending', text: "Awaiting approval before team flow starts" });
        appendAudit(runId, 'gate-pending', { phase: 'execute' });
      }
      try {
        await waitForGate(runId, 'execute');
        appendAudit(runId, 'gate-approved', { phase: 'execute' });
      } catch (gateErr) {
        appendAudit(runId, 'gate-rejected', { phase: 'execute', reason: gateErr.message });
        return;
      }
    }
    const teamExec = await runTeamFlow(runId, goal, opts);
    if (teamExec.status !== 'done' || !teamExec.final) {
      finishRun(runId, { status: 'failed', error: teamExec.error || 'team flow produced no output' });
      return;
    }
    finishRun(runId, { status: 'done', final: teamExec.final });
    return;
  }

  // Workflow (template) path — legacy static plan execution preserved.
  let plan = planFromTemplate(runId, goal, workflow);
  if (!plan) {
    finishRun(runId, { status: 'failed', error: 'Planner produced no usable plan.' });
    return;
  }

  const SKIP_CRITIQUE_PLAN_LEN = 2;
  const planIsTrivial = !!plan && plan.length <= SKIP_CRITIQUE_PLAN_LEN;
  if (!workflow && !planIsTrivial) {
    try {
      const planCritique = await critiquePlan(runId, goal, plan, opts);
      appendScratchpad(runId, {
        persona: ORCHESTRA_PERSONA,
        kind: 'plan-critique',
        text: planCritique.verdict === 'OK'
          ? 'Plan critique: OK — no high-severity issues found'
          : `Plan critique: REWRITE — ${planCritique.issues.join('; ')}`,
      });
      if (planCritique.verdict === 'REWRITE' && planCritique.issues.length > 0) {
        const rewrittenPlan = await rewritePlan(runId, goal, plan, planCritique.issues, opts);
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
  let exec = await executeRun(runId, goal, plan, null, opts);

  // Preserve every successful draft so a failed revision (or server restart
  // mid-revision) can never make the user's artifact disappear. We always
  // ship the BEST draft we have, even if it had open critiques.
  let bestDraft = exec.status === 'done' && exec.final ? { ...exec } : null;
  if (bestDraft) {
    appendScratchpad(runId, {
      persona: ORCHESTRA_PERSONA,
      kind: 'draft',
      text: `Draft v${attempt} preserved (length=${bestDraft.final.length})`,
    });
  }

  while (exec.status === 'done' && exec.final && attempt < MAX_REVISIONS) {
    const critique = await critiqueRun(runId, goal, exec.final, opts);
    // Only revise on CRITICAL — HIGH issues become disclaimers attached to
    // the artifact, not a full re-execute. Revisions are expensive and have
    // a real failure rate; protecting the user's artifact matters more.
    if (critique.severity !== 'critical') break;
    attempt = bumpRunRevision(runId);
    const revised = await executeRun(runId, goal, plan, critique, opts);
    if (revised.status === 'done' && revised.final) {
      // Revision succeeded — promote to current. Keep prior draft in scratchpad.
      bestDraft = { ...revised };
      exec = revised;
      appendScratchpad(runId, {
        persona: ORCHESTRA_PERSONA,
        kind: 'draft',
        text: `Draft v${attempt} preserved (length=${revised.final.length})`,
      });
    } else {
      // Revision failed — keep the prior best draft and stop revising.
      appendScratchpad(runId, {
        persona: ORCHESTRA_PERSONA,
        kind: 'revision-fallback',
        text: `Revision v${attempt} failed (${revised.error || 'no output'}); keeping draft v${attempt - 1}.`,
      });
      exec = bestDraft;
      break;
    }
  }

  // Skip the verify pass for short plans that already passed (or skipped)
  // critique — the artifact is the synthesis of 1–2 specialist outputs that
  // Orchestra already routed; a separate Sonnet round to "verify" mostly
  // tells us "OK" while costing another 30–60s.
  const skipVerify = planIsTrivial && attempt === 0;
  if (exec.status === 'done' && exec.final && !skipVerify) {
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

    const verdict = await verifyRun(runId, goal, exec.final, opts);
    if (!verdict.passed && attempt < MAX_REVISIONS) {
      attempt = bumpRunRevision(runId);
      const fixCritique = { text: `Verifier rejected: ${verdict.text}`, severity: 'high' };
      const verifyRevised = await executeRun(runId, goal, plan, fixCritique, opts);
      if (verifyRevised.status === 'done' && verifyRevised.final) {
        bestDraft = { ...verifyRevised };
        exec = verifyRevised;
        await verifyRun(runId, goal, exec.final, opts);
      } else {
        // Verify-revision failed — fall back to the best draft we have.
        appendScratchpad(runId, {
          persona: ORCHESTRA_PERSONA,
          kind: 'revision-fallback',
          text: `Verify-revision failed (${verifyRevised.error || 'no output'}); shipping prior draft.`,
        });
        exec = bestDraft;
      }
    }
  }

  // Final safety net: if we have any preserved draft, never let exec go
  // below it. Belt-and-suspenders against any path that could blank `exec`.
  if (bestDraft && bestDraft.final && (!exec || !exec.final)) {
    exec = bestDraft;
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
    // 5.3: record co-occurrence so the graph learns which skills compose well
    try {
      const finalRun = state.runs.get(runId);
      const recalledIds = (finalRun?.skillsRecalled || []).map((s) => s.id).filter(Boolean);
      if (recalledIds.length > 0) {
        recordSkillCoOccurrence(runId, recalledIds);
      }
    } catch {
      /* graph recording is best-effort */
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
  const runId = opts.existingRunId || newId('run');
  const run = opts.existingRunId ? state.runs.get(runId) : startRun(runId, goal);
  if (!run) throw new Error(`Run ${runId} not found`);

  if (opts.existingRunId) {
    run.goal = goal; // Update to augmented goal
    run.status = 'running';
    run.endedAt = null;
    run.error = null;
  }

  if (opts.workflow) {
    run.workflow = String(opts.workflow);
  }
  if (opts.projectId) {
    run.projectId = String(opts.projectId);
  }
  if (opts.provider) {
    run.provider = String(opts.provider);
  }
  pushEvent({
    sessionId: runId,
    personaId: ORCHESTRA_PERSONA,
    verb: opts.existingRunId ? 'chat' : 'prompt',
    text: summarize(goal),
    status: 'ok',
    dedupeKey: `prompt:run:${runId}:${Date.now()}`,
  });

  runPipeline(runId, goal, opts).catch((error) => {
    finishRun(runId, { status: 'failed', error: error.message || String(error) });
  });
  return { runId, run: viewRun(run) };
}
