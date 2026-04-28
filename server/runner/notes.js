// Notes inbox — user jots down "stuff I want to do", picks an agent, and
// either chats or dispatches a CLI run. Persisted to disk so reloads keep
// the inbox between server restarts.
//
// Storage shape (single JSON file):
//   {
//     notes: [
//       { id, title, body, tag, agentId, createdAt, updatedAt, status,
//         messages: [{ role, content, ts, provider?, agentId? }] }
//     ]
//   }
//
// status: 'idea' | 'queued' | 'running' | 'done' | 'archived'

import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { EventEmitter } from 'node:events';

const STORE_PATH = process.env.C_OFFICE_NOTES_PATH ||
  path.join(os.homedir(), '.c-office', 'notes.json');

export const notesBus = new EventEmitter();
notesBus.setMaxListeners(50);

let cache = null;
let writeQueue = Promise.resolve();
const STALE_RUNNING_MS = 2 * 60 * 1000;
const MAX_NOTE_BODY_CHARS = 3000;
const MAX_MESSAGE_CHARS = 800;
const MAX_PROMPT_CHARS = 8000;

function clip(value, max) {
  const text = String(value || '');
  return text.length > max ? text.slice(0, max - 1) + '...' : text;
}

async function load() {
  if (cache) return cache;
  try {
    const txt = await fs.readFile(STORE_PATH, 'utf8');
    cache = JSON.parse(txt);
    if (!cache || !Array.isArray(cache.notes)) cache = { notes: [] };
  } catch (e) {
    cache = { notes: [] };
  }
  return cache;
}

async function persist() {
  const data = await load();
  const json = JSON.stringify(data, null, 2);
  writeQueue = writeQueue.then(async () => {
    try {
      await fs.mkdir(path.dirname(STORE_PATH), { recursive: true });
      await fs.writeFile(STORE_PATH, json, 'utf8');
    } catch (e) {
      // best-effort; don't crash the request path
      console.error('[c-office:notes] write failed:', e.message);
    }
  });
  return writeQueue;
}

function newId() {
  return 'n_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
}

function normalizeNote(note) {
  if (!note || typeof note !== 'object') return note;
  if (!Array.isArray(note.messages)) note.messages = [];
  if (!note.agentId && note.selectedAgent) note.agentId = note.selectedAgent;
  if (!note.status) note.status = 'idea';
  return note;
}

export async function listNotes() {
  const data = await load();
  const now = Date.now();
  let changed = false;
  for (const note of data.notes) {
    normalizeNote(note);
    if (note.status === 'running' && now - (note.updatedAt || note.createdAt || 0) > STALE_RUNNING_MS) {
      note.status = 'queued';
      note.updatedAt = now;
      changed = true;
    }
  }
  if (changed) await persist();
  // newest first
  return [...data.notes].sort((a, b) => (b.updatedAt || b.createdAt) - (a.updatedAt || a.createdAt));
}

export async function getNote(id) {
  const data = await load();
  const note = data.notes.find(n => n.id === id) || null;
  return note ? normalizeNote(note) : null;
}

export async function createNote({ title, body, tag, agentId }) {
  const data = await load();
  const now = Date.now();
  const note = {
    id: newId(),
    title: (title || '').trim() || 'Untitled note',
    body:  (body  || '').trim(),
    tag:   tag || null,
    agentId: agentId || null,
    status: 'idea',
    createdAt: now,
    updatedAt: now,
    messages: [],
  };
  data.notes.unshift(note);
  await persist();
  notesBus.emit('change', { type: 'create', note });
  return note;
}

export async function updateNote(id, patch) {
  const data = await load();
  const n = data.notes.find(x => x.id === id);
  if (!n) return null;
  normalizeNote(n);
  for (const k of ['title', 'body', 'tag', 'agentId', 'status']) {
    if (patch[k] !== undefined) n[k] = patch[k];
  }
  n.updatedAt = Date.now();
  await persist();
  notesBus.emit('change', { type: 'update', note: n });
  return n;
}

export async function deleteNote(id) {
  const data = await load();
  const i = data.notes.findIndex(x => x.id === id);
  if (i < 0) return false;
  const [removed] = data.notes.splice(i, 1);
  await persist();
  notesBus.emit('change', { type: 'delete', note: removed });
  return true;
}

export async function appendMessage(id, message) {
  const data = await load();
  const n = data.notes.find(x => x.id === id);
  if (!n) return null;
  normalizeNote(n);
  const msg = { ts: Date.now(), ...message };
  n.messages.push(msg);
  n.updatedAt = msg.ts;
  await persist();
  notesBus.emit('change', { type: 'message', noteId: id, message: msg });
  return msg;
}

// Build a single prompt string from a note + the user's latest reply, scoped
// to the persona's role/persona + tagline so the agent stays in character.
export function buildPromptForNote(note, userMessage, persona) {
  const lines = [];
  if (persona) {
    lines.push(`You are ${persona.name}, the ${persona.role}.`);
    if (persona.tagline) lines.push(persona.tagline);
    if (persona.tone)    lines.push(`Tone: ${persona.tone}.`);
  }
  lines.push('');
  lines.push(`## Note: ${note.title}`);
  if (note.body) {
    lines.push('');
    lines.push(clip(note.body, MAX_NOTE_BODY_CHARS));
  }
  if (note.tag) lines.push(`\nTag: ${note.tag}`);
  if (note.messages && note.messages.length > 0) {
    lines.push('\n## Conversation so far');
    for (const m of note.messages.slice(-8)) {
      const who = m.role === 'user' ? 'User'
                : m.role === 'agent' ? (persona?.name || 'Agent')
                : 'System';
      lines.push(`${who}: ${clip(m.content, MAX_MESSAGE_CHARS)}`);
    }
  }
  lines.push('\n## Latest user message');
  lines.push(clip(userMessage, MAX_MESSAGE_CHARS) || '(no message - please respond with next steps)');
  lines.push('\n## Your reply (be concise, actionable, and stay in character):');
  return clip(lines.join('\n'), MAX_PROMPT_CHARS);
}
