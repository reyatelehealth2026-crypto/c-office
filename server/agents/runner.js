// Orchestrator runner.
//
// runOrchestrator(goal) — kicks off an Orchestra session, loops on tool_use
// until end_turn, dispatches each `delegate(persona, instruction)` to the
// appropriate child:
//   - persona === 'echo'  → image adapter (no Claude call)
//   - other personas      → child Claude messages.create with that persona's
//                           system prompt + tool allowlist
//
// All step events go through the EXISTING pushEvent / startTask / finishTask
// pipeline so the dashboard's busy animation, persona-status broadcast, and
// level-ups light up with no frontend changes.

import crypto from 'node:crypto';
import { pushEvent, recordUsage, startTask, finishTask, startRun, stepRun, finishRun } from '../state.js';
import { AGENT_REGISTRY, DELEGATE_TOOL, getPersonaConfig } from './personas.js';
import { generateImage } from './image.js';
import { getAnthropicAuth } from '../auth/anthropic.js';

const ORCHESTRA_PERSONA = 'orchestra';
const MAX_TURNS = 12;
const MAX_DELEGATIONS = 16;

function newId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`;
}

async function makeClient() {
  const auth = await getAnthropicAuth();
  if (!auth.connected) throw new Error('Anthropic not connected. Connect in Settings.');
  const sdk = await import('@anthropic-ai/claude-agent-sdk');
  // SDK exports vary slightly by version; pick whichever client constructor exists.
  const Ctor = sdk.Anthropic || sdk.default || sdk.Client;
  if (!Ctor) throw new Error('Could not locate client constructor in @anthropic-ai/claude-agent-sdk');
  return auth.mode === 'api-key'
    ? new Ctor({ apiKey: auth.apiKey })
    : new Ctor({ authToken: auth.accessToken });
}

function summarize(s, n = 90) {
  if (typeof s !== 'string') s = JSON.stringify(s ?? '');
  s = s.replace(/\s+/g, ' ').trim();
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

function extractText(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content.filter(b => b?.type === 'text').map(b => b.text || '').join('\n').trim();
}

// Run a single non-orchestra persona. Returns { ok, text }.
async function runPersona(personaId, instruction, runId, client) {
  const cfg = getPersonaConfig(personaId);
  if (!cfg) return { ok: false, text: `Unknown persona: ${personaId}` };

  if (personaId === 'echo') {
    try {
      const img = await generateImage({ prompt: instruction, persona: 'echo' });
      return { ok: true, text: `Image generated: ${img.url} (provider: ${img.provider})`, image: img };
    } catch (e) {
      return { ok: false, text: `Image generation failed: ${e.message}` };
    }
  }

  try {
    const resp = await client.messages.create({
      model: cfg.model,
      max_tokens: 1500,
      system: cfg.systemPrompt,
      messages: [{ role: 'user', content: instruction }],
    });
    recordUsage({ model: cfg.model, usage: resp.usage, dedupeKey: `usage:run:${runId}:${personaId}:${Date.now()}`, sessionId: runId });
    return { ok: resp.stop_reason !== 'max_tokens', text: extractText(resp.content) };
  } catch (e) {
    return { ok: false, text: `${cfg.name} failed: ${e.message}` };
  }
}

export async function runOrchestrator(goal) {
  const runId = newId('run');
  startRun(runId, goal);
  pushEvent({
    sessionId: runId,
    personaId: ORCHESTRA_PERSONA,
    verb: 'prompt',
    text: summarize(goal),
    status: 'ok',
    dedupeKey: `prompt:run:${runId}`,
  });

  // Run in the background so callers get run_id immediately.
  (async () => {
    let client;
    try {
      client = await makeClient();
    } catch (e) {
      finishRun(runId, { status: 'failed', error: e.message });
      pushEvent({
        sessionId: runId,
        personaId: ORCHESTRA_PERSONA,
        verb: 'result',
        text: e.message,
        status: 'err',
        dedupeKey: `runerr:${runId}`,
      });
      return;
    }

    const orch = AGENT_REGISTRY.orchestra;
    const messages = [{ role: 'user', content: goal }];
    let delegations = 0;
    let lastFinal = '';

    try {
      for (let turn = 0; turn < MAX_TURNS; turn++) {
        const resp = await client.messages.create({
          model: orch.model,
          max_tokens: 2000,
          system: orch.systemPrompt,
          tools: [DELEGATE_TOOL],
          messages,
        });
        recordUsage({ model: orch.model, usage: resp.usage, dedupeKey: `usage:run:${runId}:orch:${turn}`, sessionId: runId });

        if (resp.stop_reason !== 'tool_use') {
          lastFinal = extractText(resp.content);
          break;
        }

        const toolUses = (resp.content || []).filter(b => b?.type === 'tool_use');
        if (toolUses.length === 0) break;

        // Must echo the assistant turn before pushing tool_results.
        messages.push({ role: 'assistant', content: resp.content });

        const toolResults = [];
        for (const tu of toolUses) {
          if (++delegations > MAX_DELEGATIONS) {
            toolResults.push({ type: 'tool_result', tool_use_id: tu.id, is_error: true, content: 'Delegation limit reached.' });
            continue;
          }
          const { persona, instruction } = tu.input || {};
          startTask({ tool_use_id: tu.id, sessionId: runId, subagent_type: persona, description: summarize(instruction) });
          pushEvent({
            sessionId: runId,
            personaId: persona,
            verb: 'used',
            toolName: 'delegate',
            text: summarize(instruction),
            status: 'ok',
            toolUseId: tu.id,
            dedupeKey: `tu:run:${runId}:${tu.id}`,
          });

          const result = await runPersona(persona, instruction, runId, client);
          stepRun(runId, { tool_use_id: tu.id, persona, instruction, result });

          pushEvent({
            sessionId: runId,
            personaId: persona,
            verb: 'result',
            toolName: 'delegate',
            text: summarize(result.text),
            status: result.ok ? 'ok' : 'err',
            toolUseId: tu.id,
            dedupeKey: `tr:run:${runId}:${tu.id}`,
          });
          finishTask({ tool_use_id: tu.id, status: result.ok ? 'done' : 'failed' });

          toolResults.push({
            type: 'tool_result',
            tool_use_id: tu.id,
            is_error: !result.ok,
            content: result.text,
          });
        }
        messages.push({ role: 'user', content: toolResults });
      }

      finishRun(runId, { status: 'done', final: lastFinal });
      pushEvent({
        sessionId: runId,
        personaId: ORCHESTRA_PERSONA,
        verb: 'turn-end',
        text: '— run complete',
        status: 'ok',
        dedupeKey: `end:run:${runId}`,
      });
    } catch (e) {
      finishRun(runId, { status: 'failed', error: e.message });
      pushEvent({
        sessionId: runId,
        personaId: ORCHESTRA_PERSONA,
        verb: 'result',
        text: e.message,
        status: 'err',
        dedupeKey: `runerr:${runId}`,
      });
    }
  })();

  return { runId };
}
