// Skill library — Hermes-inspired persistent learning.
//
// After a successful multi-step run (>= 2 delegations), persist a markdown
// "skill" file with YAML frontmatter under ~/.c-office/skills/. Future
// planner calls receive a short list of relevant prior skills as context
// so common goal patterns don't get planned from scratch every time.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';

const SKILLS_DIR = process.env.COFFICE_SKILLS_DIR || path.join(os.homedir(), '.c-office', 'skills');
const MAX_SKILLS_RECALLED = 3;
const MIN_DELEGATIONS_TO_PERSIST = 2;

function ensureDir() {
  try {
    fs.mkdirSync(SKILLS_DIR, { recursive: true });
  } catch {
    /* dir creation best-effort */
  }
}

function slugify(text, max = 60) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, max) || 'skill';
}

function tokensOf(usage) {
  if (!usage || typeof usage !== 'object') return 0;
  return (
    (usage.input_tokens || 0) +
    (usage.output_tokens || 0) +
    (usage.cache_read_input_tokens || 0) +
    (usage.cache_creation_input_tokens || 0)
  );
}

function extractTags(goal) {
  const words = String(goal || '').toLowerCase().match(/[a-z][a-z0-9]{3,}/g) || [];
  const stop = new Set(['this', 'that', 'with', 'from', 'have', 'will', 'about', 'into', 'they', 'them', 'their', 'then', 'than', 'what', 'when', 'where', 'which', 'while', 'would', 'could', 'should', 'make', 'need']);
  const counts = new Map();
  for (const w of words) {
    if (stop.has(w)) continue;
    counts.set(w, (counts.get(w) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([w]) => w);
}

function parseFrontmatter(text) {
  const m = String(text || '').match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) return { meta: {}, body: text };
  const meta = {};
  for (const line of m[1].split('\n')) {
    const kv = line.match(/^([\w_]+):\s*(.*)$/);
    if (!kv) continue;
    const key = kv[1];
    const raw = kv[2].trim();
    if (raw.startsWith('[') && raw.endsWith(']')) {
      meta[key] = raw
        .slice(1, -1)
        .split(',')
        .map((s) => s.trim().replace(/^["']|["']$/g, ''))
        .filter(Boolean);
    } else if (/^\d+$/.test(raw)) {
      meta[key] = Number(raw);
    } else if (raw === 'true' || raw === 'false') {
      meta[key] = raw === 'true';
    } else {
      meta[key] = raw.replace(/^["']|["']$/g, '');
    }
  }
  return { meta, body: m[2] || '' };
}

function formatFrontmatter(meta) {
  const lines = ['---'];
  for (const [k, v] of Object.entries(meta)) {
    if (Array.isArray(v)) {
      lines.push(`${k}: [${v.map((x) => JSON.stringify(String(x))).join(', ')}]`);
    } else if (typeof v === 'string') {
      lines.push(`${k}: ${JSON.stringify(v)}`);
    } else {
      lines.push(`${k}: ${v}`);
    }
  }
  lines.push('---');
  return lines.join('\n');
}

export function persistSkill(run) {
  if (!run || run.status !== 'done') return null;
  const steps = Array.isArray(run.steps) ? run.steps.filter((s) => s.result?.ok) : [];
  if (steps.length < MIN_DELEGATIONS_TO_PERSIST) return null;

  ensureDir();
  const id = `skill_${slugify(run.goal, 40)}_${crypto.randomBytes(3).toString('hex')}`;
  const personaSequence = steps.map((s) => s.persona);
  const tags = extractTags(run.goal);
  const tokens = run.phaseCosts
    ? Object.values(run.phaseCosts).reduce((a, b) => a + tokensOf(b?.usage), 0)
    : 0;
  const meta = {
    id,
    goal: String(run.goal || '').slice(0, 200),
    tags,
    steps: personaSequence,
    success: true,
    revisions: run.revisions || 0,
    tokens,
    createdAt: new Date().toISOString(),
  };
  if (run.projectId) meta.projectId = String(run.projectId);
  const body = [
    `## When to use`,
    `Goals matching: ${tags.length ? tags.join(', ') : '(no salient tags)'}`,
    ``,
    `## Persona sequence`,
    personaSequence.map((p, i) => `${i + 1}. ${p}`).join('\n'),
    ``,
    `## Notes`,
    String(run.final || '').slice(0, 600),
  ].join('\n');

  const filePath = path.join(SKILLS_DIR, `${id}.md`);
  try {
    fs.writeFileSync(filePath, `${formatFrontmatter(meta)}\n\n${body}\n`, { mode: 0o600 });
  } catch {
    return null;
  }
  return { id, path: filePath, meta };
}

export function listSkills(opts = {}) {
  ensureDir();
  let files;
  try {
    files = fs.readdirSync(SKILLS_DIR).filter((f) => f.endsWith('.md'));
  } catch {
    return [];
  }
  const skills = [];
  for (const file of files) {
    try {
      const text = fs.readFileSync(path.join(SKILLS_DIR, file), 'utf8');
      const { meta, body } = parseFrontmatter(text);
      if (!meta.id) continue;
      if (opts.projectId !== undefined && meta.projectId !== opts.projectId) continue;
      skills.push({ ...meta, body, path: path.join(SKILLS_DIR, file) });
    } catch {
      /* skip unreadable */
    }
  }
  return skills.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

export function recallSkills(goal, opts = {}) {
  const skills = listSkills(opts.projectId !== undefined ? { projectId: opts.projectId } : {});
  if (skills.length === 0) return [];
  const goalTags = new Set(extractTags(goal));
  if (goalTags.size === 0) return [];

  const scored = skills.map((s) => {
    const skillTags = new Set(s.tags || []);
    let overlap = 0;
    for (const t of goalTags) if (skillTags.has(t)) overlap++;
    return { skill: s, score: overlap };
  });
  return scored
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_SKILLS_RECALLED)
    .map((x) => x.skill);
}

export function skillsDir() {
  return SKILLS_DIR;
}
