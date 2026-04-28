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
import { PERSONAS_BY_ID } from '../mapping/personas.js';
import { pushEvent, startTask, finishTask } from '../state.js';

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
  const note = await getNote(req.params.id);
  if (!note) return res.status(404).json({ error: 'note not found' });

  const { provider: providerName = defaultProvider(),
          message = '',
          agentId } = req.body || {};

  const personaId = agentId || note.agentId || 'orchestra';
  const persona   = PERSONAS_BY_ID.get(personaId);
  const provider  = getProvider(providerName);
  if (!provider) return res.status(400).json({ error: 'unknown provider: ' + providerName });

  // Persist the user message (if provided) before dispatch — keeps the chat log honest.
  if (message && message.trim()) {
    await appendMessage(note.id, { role: 'user', content: message.trim() });
  }

  // Mark note as "running" while the CLI is in flight.
  await updateNote(note.id, { status: 'running', agentId: personaId });

  // Spawn a synthetic Task entry so the agent shows as busy on the dashboard.
  const taskId = `note:${note.id}:${Date.now().toString(36)}`;
  startTask({
    tool_use_id: taskId,
    sessionId:   `dispatch:${personaId}`,
    subagent_type: persona?.role || personaId,
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

  const prompt = buildPromptForNote(note, message, persona);

  let collected = '';
  try {
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
    await updateNote(note.id, { status: result.ok ? 'done' : 'queued' });
    pushEvent({
      sessionId: `dispatch:${personaId}`,
      personaId,
      verb: 'result',
      toolName: providerName,
      text: result.ok ? 'Dispatch complete' : `Dispatch failed (exit ${result.exitCode})`,
      status: result.ok ? 'ok' : 'err',
      dedupeKey: `dispatch-end:${taskId}`,
    });
    res.json({
      ok: result.ok,
      provider: providerName,
      output: result.output,
      exitCode: result.exitCode,
    });
  } catch (e) {
    finishTask({ tool_use_id: taskId, status: 'failed' });
    await appendMessage(note.id, {
      role: 'agent',
      agentId: personaId,
      provider: providerName,
      content: `Dispatch error: ${e.message}`,
      ok: false,
    });
    await updateNote(note.id, { status: 'queued' });
    res.status(500).json({ ok: false, error: String(e) });
  }
}
