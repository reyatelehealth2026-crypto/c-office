// Workflow templates — pre-baked plans the user can pick instead of letting
// the planner LLM decompose the goal from scratch. Saves tokens and gives
// deterministic structure for repeat use cases. Inspired by OpenClaw's
// "Manager → Researcher → Writer → Editor" pipeline pattern.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '../..');
const WORKFLOWS_DIR = process.env.COFFICE_WORKFLOWS_DIR || path.join(PROJECT_ROOT, '.claude', 'workflows');

const BUILT_INS = {
  'research-write-publish': {
    name: 'research-write-publish',
    description: 'Trend research → long-form draft → distribution plan',
    plan: [
      { persona: 'scout', instruction: 'Pull 5-7 recent signals on the goal topic with source URLs.', depends_on: null },
      { persona: 'scribe', instruction: 'Write a 600-word article weaving in the research findings.', depends_on: 0 },
      { persona: 'pulse', instruction: 'Build a multi-platform distribution plan for the article.', depends_on: 1 },
    ],
  },
  'code-review-ship': {
    name: 'code-review-ship',
    description: 'Engineering implementation → security review → ops runbook',
    plan: [
      { persona: 'vector', instruction: 'Implement the requested change. Return diff or final code.', depends_on: null },
      { persona: 'warden', instruction: 'Security and quality review of the implementation.', depends_on: 0 },
      { persona: 'relay', instruction: 'Produce a deploy runbook with rollback steps.', depends_on: 0 },
    ],
  },
  'content-brief-distribute': {
    name: 'content-brief-distribute',
    description: 'Content draft → critique → distribution',
    plan: [
      { persona: 'scribe', instruction: 'Draft the requested content piece.', depends_on: null },
      { persona: 'warden', instruction: 'Audit the draft for accuracy, brand voice, and compliance.', depends_on: 0 },
      { persona: 'pulse', instruction: 'Build a distribution plan for the (revised) draft.', depends_on: 0 },
    ],
  },
};

function isValidWorkflow(wf) {
  if (!wf || typeof wf !== 'object') return false;
  if (typeof wf.name !== 'string' || !wf.name) return false;
  if (!Array.isArray(wf.plan) || wf.plan.length === 0) return false;
  return wf.plan.every(
    (s) => s && typeof s.persona === 'string' && typeof s.instruction === 'string',
  );
}

function loadDiskWorkflows() {
  let files;
  try {
    files = fs.readdirSync(WORKFLOWS_DIR).filter((f) => f.endsWith('.json'));
  } catch {
    return {};
  }
  const out = {};
  for (const file of files) {
    try {
      const raw = fs.readFileSync(path.join(WORKFLOWS_DIR, file), 'utf8');
      const wf = JSON.parse(raw);
      if (isValidWorkflow(wf)) out[wf.name] = wf;
    } catch {
      /* skip malformed */
    }
  }
  return out;
}

export function listWorkflows() {
  return { ...BUILT_INS, ...loadDiskWorkflows() };
}

export function getWorkflow(name) {
  if (!name) return null;
  const all = listWorkflows();
  return all[name] || null;
}

export function workflowsDir() {
  return WORKFLOWS_DIR;
}

// Slugify into a safe filename. Allows letters/digits/dash/underscore only —
// prevents user-supplied names from escaping WORKFLOWS_DIR.
function workflowFilename(name) {
  const slug = String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  if (!slug) throw new Error('workflow name required');
  return `${slug}.json`;
}

export function saveWorkflow({ name, description, plan }) {
  const wf = {
    name: String(name || '').trim(),
    description: String(description || '').trim(),
    plan: Array.isArray(plan) ? plan.map((s, i) => ({
      persona: String(s.persona || '').trim(),
      instruction: String(s.instruction || '').trim(),
      depends_on: Number.isInteger(s.depends_on) ? s.depends_on : (i > 0 ? i - 1 : null),
    })) : [],
  };
  if (!isValidWorkflow(wf)) {
    throw new Error('Invalid workflow: name and at least 1 step (persona + instruction) required');
  }
  if (BUILT_INS[wf.name]) {
    throw new Error(`"${wf.name}" is a built-in workflow and cannot be overwritten — pick a different name`);
  }
  fs.mkdirSync(WORKFLOWS_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(WORKFLOWS_DIR, workflowFilename(wf.name)),
    JSON.stringify(wf, null, 2),
    'utf8',
  );
  return wf;
}

export function deleteWorkflow(name) {
  if (BUILT_INS[name]) throw new Error('cannot delete a built-in workflow');
  const filePath = path.join(WORKFLOWS_DIR, workflowFilename(name));
  try {
    fs.unlinkSync(filePath);
    return true;
  } catch (e) {
    if (e.code === 'ENOENT') return false;
    throw e;
  }
}

export function isBuiltInWorkflow(name) {
  return Object.prototype.hasOwnProperty.call(BUILT_INS, name);
}
