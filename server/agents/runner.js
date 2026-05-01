// Orchestrator runner.
//
// The installed Claude Agent SDK exposes the high-level query() API. C-Office
// uses that API directly and wires SDK messages back into the existing state
// pipeline so /api/task remains visible in the dashboard.

import crypto from 'node:crypto';
import { query } from '@anthropic-ai/claude-agent-sdk';
import { pushEvent, recordUsage, startTask, finishTask, startRun, stepRun, finishRun, viewRun } from '../state.js';
import { getAgentSync, listAgentsSync, resolveAgentIdSync } from '../store/agents.js';

const ORCHESTRA_PERSONA = 'orchestra';
const MAX_TURNS = 12;

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
  }
}

function handleUserMessage(runId, message) {
  const content = message?.message?.content;
  if (!Array.isArray(content)) return;
  for (const block of content) {
    if (block?.type !== 'tool_result') continue;
    const text = Array.isArray(block.content)
      ? block.content.map((part) => part?.text || '').filter(Boolean).join('\n')
      : String(block.content || '');
    const result = { ok: !block.is_error, text };
    stepRun(runId, {
      tool_use_id: block.tool_use_id,
      result,
    });
    pushEvent({
      sessionId: runId,
      personaId: 'agent',
      verb: 'result',
      toolName: 'Task',
      text: summarize(text),
      status: result.ok ? 'ok' : 'err',
      toolUseId: block.tool_use_id,
      dedupeKey: `tr:run:${runId}:${block.tool_use_id}`,
    });
    finishTask({ tool_use_id: block.tool_use_id, status: result.ok ? 'done' : 'failed' });
  }
}

async function executeRun(runId, goal) {
  const orch = orchestratorAgent();
  const model = orch.model || 'claude-sonnet-4-5';
  let finalText = '';
  let finalStatus = 'failed';
  let finalError = '';

  try {
    for await (const message of query({
      prompt: goal,
      options: {
        model,
        maxTurns: MAX_TURNS,
        systemPrompt: orch.systemPrompt,
        tools: ['Task'],
        allowedTools: ['Task'],
        permissionMode: 'dontAsk',
        agents: sdkAgentDefinitions(),
      },
    })) {
      if (message.type === 'assistant') handleAssistantMessage(runId, message);
      if (message.type === 'user') handleUserMessage(runId, message);
      if (message.type === 'result') {
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

  const outcome = finalStatus === 'done'
    ? { status: 'done', final: finalText }
    : { status: 'failed', error: finalError || 'Claude Agent SDK produced no final answer.' };
  finishRun(runId, outcome);
  pushEvent({
    sessionId: runId,
    personaId: ORCHESTRA_PERSONA,
    verb: outcome.status === 'done' ? 'turn-end' : 'result',
    text: outcome.status === 'done' ? '-- run complete' : outcome.error,
    status: outcome.status === 'done' ? 'ok' : 'err',
    dedupeKey: `end:run:${runId}`,
  });
}

export async function runOrchestrator(goal) {
  const runId = newId('run');
  const run = startRun(runId, goal);
  pushEvent({
    sessionId: runId,
    personaId: ORCHESTRA_PERSONA,
    verb: 'prompt',
    text: summarize(goal),
    status: 'ok',
    dedupeKey: `prompt:run:${runId}`,
  });

  executeRun(runId, goal);
  return { runId, run: viewRun(run) };
}
