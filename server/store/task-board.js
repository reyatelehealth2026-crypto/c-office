import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const DEFAULT_DATA_DIR = path.join(os.homedir(), '.c-office');
const STATUSES = ['backlog', 'running', 'review', 'done'];

function boardFile() {
  return process.env.C_OFFICE_TASK_BOARD_PATH || path.join(DEFAULT_DATA_DIR, 'task-board.json');
}

function ensureDir(file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
}

function newId() {
  return `board_${Date.now().toString(36)}_${Math.random().toString(16).slice(2, 8)}`;
}

function cleanStatus(value) {
  return STATUSES.includes(value) ? value : 'backlog';
}

function event(text, patch = {}) {
  return {
    id: `evt_${Date.now().toString(36)}_${Math.random().toString(16).slice(2, 8)}`,
    ts: Date.now(),
    text,
    ...patch,
  };
}

function normalizeTask(input = {}) {
  const status = cleanStatus(input.status);
  const createdAt = Number.isFinite(input.createdAt) ? input.createdAt : Date.now();
  const updatedAt = Number.isFinite(input.updatedAt) ? input.updatedAt : createdAt;
  return {
    id: String(input.id || newId()),
    title: String(input.title || 'Untitled task').trim().slice(0, 160),
    description: String(input.description || '').trim().slice(0, 4000),
    status,
    runStatus: String(input.runStatus || (status === 'running' ? 'running' : 'idle')),
    agentId: input.agentId ? String(input.agentId) : null,
    provider: input.provider ? String(input.provider) : null,
    taskId: input.taskId ? String(input.taskId) : null,
    runId: input.runId ? String(input.runId) : null,
    createdAt,
    updatedAt,
    events: Array.isArray(input.events) ? input.events.slice(-100) : [event('task created', { status })],
  };
}

function readTasks() {
  const file = boardFile();
  ensureDir(file);
  if (!fs.existsSync(file)) {
    fs.writeFileSync(file, JSON.stringify({ tasks: [] }, null, 2) + '\n');
    return [];
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    const tasks = Array.isArray(parsed) ? parsed : parsed.tasks;
    return Array.isArray(tasks) ? tasks.map(normalizeTask) : [];
  } catch {
    return [];
  }
}

function writeTasks(tasks) {
  const file = boardFile();
  ensureDir(file);
  const normalized = tasks.map(normalizeTask);
  fs.writeFileSync(file, JSON.stringify({ tasks: normalized }, null, 2) + '\n');
  return normalized;
}

export function listBoardTasksSync() {
  return readTasks().sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}

export function getTaskBoardSync(extraTasks = []) {
  const all = [...listBoardTasksSync(), ...extraTasks.map(normalizeTask)];
  const columns = Object.fromEntries(STATUSES.map((status) => [status, []]));
  for (const task of all) columns[cleanStatus(task.status)].push(task);
  return { statuses: STATUSES, columns, tasks: all };
}

export function createBoardTask(input = {}) {
  const now = Date.now();
  const task = normalizeTask({
    ...input,
    id: input.id || newId(),
    status: input.status || 'backlog',
    createdAt: now,
    updatedAt: now,
    events: [event('task created', { status: input.status || 'backlog' })],
  });
  writeTasks([task, ...listBoardTasksSync()]);
  return task;
}

export function updateBoardTask(id, patch = {}) {
  const tasks = listBoardTasksSync();
  const index = tasks.findIndex((task) => task.id === id);
  if (index < 0) return null;
  const prev = tasks[index];
  const nextStatus = patch.status ? cleanStatus(patch.status) : prev.status;
  const next = normalizeTask({
    ...prev,
    ...patch,
    id: prev.id,
    status: nextStatus,
    updatedAt: Date.now(),
    events: [
      ...(prev.events || []),
      event(patch.event || `task updated: ${nextStatus}`, { status: nextStatus, runStatus: patch.runStatus || prev.runStatus }),
    ],
  });
  tasks[index] = next;
  writeTasks(tasks);
  return next;
}

export function deleteBoardTask(id) {
  const tasks = listBoardTasksSync();
  const next = tasks.filter((task) => task.id !== id);
  if (next.length === tasks.length) return false;
  writeTasks(next);
  return true;
}

export const taskBoardStoreInfo = { statuses: STATUSES, get file() { return boardFile(); } };
