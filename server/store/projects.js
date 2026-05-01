// Projects store — group runs and scoped skill libraries.
// Persists to ~/.c-office/projects/<id>.json (mode 0o600).

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';

const PROJECTS_DIR = process.env.COFFICE_PROJECTS_DIR || path.join(os.homedir(), '.c-office', 'projects');

function ensureDir() {
  try {
    fs.mkdirSync(PROJECTS_DIR, { recursive: true });
  } catch {
    /* best effort */
  }
}

function pathFor(id) {
  const safe = String(id || '').replace(/[^a-zA-Z0-9_.-]/g, '_');
  return path.join(PROJECTS_DIR, `${safe}.json`);
}

function slugify(text) {
  return String(text || 'project')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'project';
}

function isValidProject(p) {
  return p && typeof p.id === 'string' && typeof p.name === 'string';
}

export function listProjects() {
  ensureDir();
  let files;
  try {
    files = fs.readdirSync(PROJECTS_DIR).filter((f) => f.endsWith('.json'));
  } catch {
    return [];
  }
  const out = [];
  for (const file of files) {
    try {
      const raw = fs.readFileSync(path.join(PROJECTS_DIR, file), 'utf8');
      const p = JSON.parse(raw);
      if (isValidProject(p)) out.push(p);
    } catch {
      /* skip malformed */
    }
  }
  return out.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}

export function getProject(id) {
  if (!id) return null;
  try {
    const raw = fs.readFileSync(pathFor(id), 'utf8');
    const p = JSON.parse(raw);
    return isValidProject(p) ? p : null;
  } catch {
    return null;
  }
}

export function createProject({ name, description }) {
  const trimmedName = String(name || '').trim().slice(0, 80);
  if (!trimmedName) throw new Error('name required');
  ensureDir();
  const id = `proj_${slugify(trimmedName)}_${crypto.randomBytes(3).toString('hex')}`;
  const now = Date.now();
  const project = {
    id,
    name: trimmedName,
    description: String(description || '').slice(0, 500),
    createdAt: now,
    updatedAt: now,
  };
  fs.writeFileSync(pathFor(id), JSON.stringify(project, null, 2), { mode: 0o600 });
  return project;
}

export function patchProject(id, patch = {}) {
  const existing = getProject(id);
  if (!existing) return null;
  const next = { ...existing };
  if (typeof patch.name === 'string') next.name = patch.name.trim().slice(0, 80) || existing.name;
  if (typeof patch.description === 'string') next.description = patch.description.slice(0, 500);
  next.updatedAt = Date.now();
  fs.writeFileSync(pathFor(id), JSON.stringify(next, null, 2), { mode: 0o600 });
  return next;
}

export function deleteProject(id) {
  try {
    fs.unlinkSync(pathFor(id));
    return true;
  } catch {
    return false;
  }
}

export function projectsDir() {
  return PROJECTS_DIR;
}
