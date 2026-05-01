// REST endpoints for the Notes inbox.
//   GET    /api/notes             → list all notes
//   POST   /api/notes             → create a new note
//   GET    /api/notes/:id         → fetch a single note (with messages)
//   PATCH  /api/notes/:id         → update title/body/tag/agentId/status
//   DELETE /api/notes/:id         → remove a note
//   POST   /api/notes/:id/message → append a user message
//   POST   /api/notes/:id/dispatch→ run the chosen CLI provider for this note

import {
  listNotes, getNote, createNote, updateNote, deleteNote,
  appendMessage, buildPromptForNote,
} from '../runner/notes.js';
import { getProvider, defaultProvider, listProviders } from '../runner/providers.js';
import { buildSceneScript } from '../runner/scene.js';
import { getAgentSync, listAgentsSync, resolveAgentIdSync } from '../store/agents.js';
import { pushEvent, startTask, finishTask } from '../state.js';

function hasHandoffIntent(text) {
  return /@|handoff|delegate|assign|route|forward|send|ส่งต่อ|มอบหมาย|โยนงาน|ให้|ไป/.test(String(text || '').toLowerCase());
}

function slugAgentToken(value) {
  return String(value || '').trim().toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function findMentionedAgent(token, agents) {
  const raw = String(token || '').trim();
  const norm = slugAgentToken(raw);
  return agents.find((agent) =>
    agent.id === norm ||
    agent.name.toLowerCase() === raw.toLowerCase() ||
    slugAgentToken(agent.name) === norm ||
    slugAgentToken(agent.avatarInitials) === norm
  ) || null;
}

export function resolveHandoffAgentId(message, currentAgentId) {
  const text = String(message || '').trim();
  if (!text || !hasHandoffIntent(text)) return null;

  const current = resolveAgentIdSync(currentAgentId || 'orchestra');
  const agents = listAgentsSync({ includeDisabled: false });
  for (const match of text.matchAll(/@([a-z0-9_-]+)/gi)) {
    const agent = findMentionedAgent(match[1], agents);
    if (agent && agent.id !== current) return agent.id;
  }

  const haystack = text.toLowerCase();
  const candidates = agents
    .filter((agent) => agent.id !== current)
    .sort((a, b) => b.name.length - a.name.length);
  for (const agent of candidates) {
    const names = [agent.id, agent.name, agent.avatarInitials]
      .filter(Boolean)
      .map((value) => String(value).toLowerCase());
    if (names.some((name) => haystack.includes(name))) return agent.id;
  }
  return null;
}

export async function listRoute(req, res) {
  res.json({ notes: await listNotes() });
}

export async function getOneRoute(req, res) {
  const n = await getNote(req.params.id);
  if (!n) return res.status(404).json({ error: 'not found' });
  res.json(n);
}

export async function createRoute(req, res) {
  const { title, body, tag, agentId } = req.body || {};
  if (!title && !body) return res.status(400).json({ error: 'title or body required' });
  const note = await createNote({ title, body, tag, agentId });
  res.json(note);
}

export async function patchRoute(req, res) {
  const n = await updateNote(req.params.id, req.body || {});
  if (!n) return res.status(404).json({ error: 'not found' });
  res.json(n);
}

export async function deleteRoute(req, res) {
  const ok = await deleteNote(req.params.id);
  if (!ok) return res.status(404).json({ error: 'not found' });
  res.json({ ok: true });
}

export async function messageRoute(req, res) {
  const { content, role } = req.body || {};
  if (!content || !content.trim()) return res.status(400).json({ error: 'content required' });
  const m = await appendMessage(req.params.id, {
    role: role || 'user',
    content: content.trim(),
  });
  if (!m) return res.status(404).json({ error: 'note not found' });
  res.json({ ok: true, message: m });
}

export async function providersRoute(_req, res) {
  res.json({
    providers: listProviders(),
    default: defaultProvider(),
  });
}

// Streamed dispatch — runs the selected provider, pushes incremental output
// into the global event bus AND appends a final agent message to the note.
export async function dispatchRoute(req, res) {
  let note = null;
  let taskId = null;
  let personaId = null;
  let providerName = null;
  try {
    note = await getNote(req.params.id);
    if (!note) return res.status(404).json({ error: 'note not found' });

    const { provider: requestedProvider = defaultProvider(),
            message = '',
            agentId } = req.body || {};

    providerName = requestedProvider;
    const requestedPersonaId = resolveAgentIdSync(agentId || note.agentId || 'orchestra');
    const handoffPersonaId = resolveHandoffAgentId(message, requestedPersonaId);
    personaId = handoffPersonaId || requestedPersonaId;
    const persona = getAgentSync(personaId);
    const requestedPersona = getAgentSync(requestedPersonaId);
    const provider  = getProvider(providerName);
    if (!provider) return res.status(400).json({ error: 'unknown provider: ' + providerName });

    // Persist the user message (if provided) before dispatch — keeps the chat log honest.
    if (message && message.trim()) {
      await appendMessage(note.id, { role: 'user', content: message.trim() });
    }

    if (handoffPersonaId && handoffPersonaId !== requestedPersonaId) {
      const targetName = persona?.name || handoffPersonaId;
      const sourceName = requestedPersona?.name || requestedPersonaId;
      pushEvent({
        sessionId: `dispatch:${requestedPersonaId}`,
        personaId: requestedPersonaId,
        verb: 'handoff',
        toolName: 'Notes',
        text: `${sourceName} -> ${targetName}: ${String(message || note.title).slice(0, 100)}`,
        status: 'ok',
        dedupeKey: `dispatch-handoff:${note.id}:${Date.now()}`,
      });
      await appendMessage(note.id, {
        role: 'agent',
        agentId: requestedPersonaId,
        provider: 'handoff',
        content: `รับทราบ - ส่งต่อให้ ${targetName} ลงมือทำแล้ว`,
        ok: true,
      });
    }

    // Mark note as "running" while the CLI is in flight.
    await updateNote(note.id, { status: 'running', agentId: personaId });

    // Spawn a synthetic Task entry so the agent shows as busy on the dashboard.
    taskId = `note:${note.id}:${Date.now().toString(36)}`;
    startTask({
      tool_use_id: taskId,
      sessionId:   `dispatch:${personaId}`,
      subagent_type: personaId,
      description: `Dispatch — ${note.title}`,
    });
    // Push a "prompt" event so Adventure mode sees a new boss
    pushEvent({
      sessionId: `dispatch:${personaId}`,
      personaId,
      verb: 'prompt',
      text: (message || note.title).slice(0, 140),
      status: 'ok',
      dedupeKey: `dispatch-prompt:${taskId}`,
    });

    const prompt = buildPromptForNote(note, message, persona, {
      handoffFrom: handoffPersonaId && handoffPersonaId !== requestedPersonaId ? requestedPersona : null,
    });

    let collected = '';
    const result = await provider.run(
      { prompt, agentName: persona?.name },
      (chunk) => {
        collected += chunk;
        // mirror progress as activity events so the dashboard feed sees it
        pushEvent({
          sessionId: `dispatch:${personaId}`,
          personaId,
          verb: 'used',
          toolName: providerName,
          text: chunk.replace(/\s+/g, ' ').slice(0, 90),
          status: 'ok',
          dedupeKey: `dispatch-chunk:${taskId}:${collected.length}`,
        });
      },
    );
    finishTask({ tool_use_id: taskId, status: result.ok ? 'done' : 'failed' });
    await appendMessage(note.id, {
      role: 'agent',
      agentId: personaId,
      provider: providerName,
      content: (result.output || '').trim() || '(empty response)',
      ok: result.ok,
    });
    await updateNote(note.id, { status: result.ok ? 'done' : 'queued', agentId: personaId });
    pushEvent({
      sessionId: `dispatch:${personaId}`,
      personaId,
      verb: 'result',
      toolName: providerName,
      text: result.ok ? 'Dispatch complete' : `Dispatch failed (exit ${result.exitCode})`,
      status: result.ok ? 'ok' : 'err',
      dedupeKey: `dispatch-end:${taskId}`,
    });
    const scene = buildSceneScript({
      persona,
      note: await getNote(note.id),
      userMessage: message,
      providerName,
      rawOutput: result.output,
      ok: result.ok,
    });
    res.json({
      ok: result.ok,
      provider: providerName,
      output: result.output,
      exitCode: result.exitCode,
      scene,
    });
  } catch (e) {
    console.error('[c-office:notes] dispatch failed:', e);
    if (taskId) finishTask({ tool_use_id: taskId, status: 'failed' });
    if (note?.id) {
      await appendMessage(note.id, {
        role: 'agent',
        agentId: personaId || note.agentId || 'orchestra',
        provider: providerName || defaultProvider(),
        content: e.message || String(e),
        ok: false,
      }).catch(() => {});
      await updateNote(note.id, { status: 'queued' }).catch(() => {});
    }
    res.status(500).json({ ok: false, error: e.message || String(e) });
  }
}
