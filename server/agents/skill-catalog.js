// Agent Skill Catalog — installable AI capabilities for agents.
//
// Distinct from server/agents/skills.js (auto-persists past Orchestra runs as
// Hermes-style playbooks). This catalog is a curated set of reusable AI
// capabilities (system-prompt fragments + optional tool hints) that an admin
// installs onto specific agents. At delegate time the runner appends the
// installed skill prompts to the agent's system prompt.
//
// Storage: ~/.c-office/agent-skills/<id>.md  (markdown + YAML-ish frontmatter)
//
// API used by server/api/agent-skills.js and server/agents/runner.js:
//   listAgentSkills() → SkillRecord[]
//   getAgentSkill(id) → SkillRecord | null
//   createAgentSkill({ name, summary, category, tools, body }) → SkillRecord
//   updateAgentSkill(id, patch) → SkillRecord
//   deleteAgentSkill(id) → boolean (only non-builtin)
//   resolveSkillsPromptFragment(skillIds: string[]) → string

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';

const SKILLS_DIR = process.env.COFFICE_AGENT_SKILLS_DIR
  || path.join(os.homedir(), '.c-office', 'agent-skills');

function ensureDir() {
  try { fs.mkdirSync(SKILLS_DIR, { recursive: true }); } catch { /* best-effort */ }
}

function slugify(text, max = 60) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, max) || 'skill';
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
      meta[key] = raw.slice(1, -1).split(',').map((s) => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
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
    if (Array.isArray(v)) lines.push(`${k}: [${v.map((x) => JSON.stringify(String(x))).join(', ')}]`);
    else if (typeof v === 'string') lines.push(`${k}: ${JSON.stringify(v)}`);
    else lines.push(`${k}: ${v}`);
  }
  lines.push('---');
  return lines.join('\n');
}

const DEFAULT_SKILLS = [
  {
    id: 'skill-brand-voice', name: 'Brand Voice',
    summary: 'Apply the user-profile brand brief (tone, restricted words, audience).',
    category: 'writing', tools: [], builtin: true,
    body: [
      '## Brand voice rules',
      'Read the active brand profile (~/.c-office/user-profile.md) before composing user-facing copy.',
      'Match the brand tone, audience, and persona; avoid restricted phrases (e.g. unverified medical claims, FDA red flags).',
      'When the brief includes a tone scale (formal/casual), pick the closest match per channel.',
      'When in doubt, ask the user for the channel (Facebook / LINE / email) and target audience.',
    ].join('\n'),
  },
  {
    id: 'skill-web-research', name: 'Web Research SOP',
    summary: 'Search-first methodology: cite at least 2 sources before drafting findings.',
    category: 'research', tools: ['WebSearch', 'WebFetch'], builtin: true,
    body: [
      '## Web research workflow',
      '1. Query with the most specific keywords first; broaden only when zero hits.',
      '2. Verify a fact across two independent sources before stating it as fact.',
      '3. Capture each citation as `[#] <title> — <url>` and append to the deliverable.',
      '4. If the topic is rapidly changing, prefer sources <= 6 months old.',
      '5. Stop searching when the answer is verified; do not over-collect.',
    ].join('\n'),
  },
  {
    id: 'skill-code-review', name: 'Code Review Checklist',
    summary: 'Quality / security / performance review with severity scoring.',
    category: 'engineering', tools: ['Read', 'Grep', 'Glob'], builtin: true,
    body: [
      '## Code review checklist',
      'Pass each diff through:',
      '- **Correctness:** does it solve the stated problem? edge cases?',
      '- **Security:** input validation, auth, secrets, injection vectors',
      '- **Performance:** N+1 queries, unbounded loops, missing pagination',
      '- **Readability:** naming, function size <= 50 LOC, file size <= 800 LOC',
      '- **Tests:** new behavior covered? mocks reasonable?',
      'Report findings as CRITICAL / HIGH / MEDIUM / LOW with file:line references.',
    ].join('\n'),
  },
  {
    id: 'skill-bilingual-th-en', name: 'Bilingual TH/EN',
    summary: 'Default to Thai output with inline English for technical terms; UI labels in English.',
    category: 'writing', tools: [], builtin: true,
    body: [
      '## Bilingual output',
      'When the user writes in Thai, respond in Thai. Keep UI labels and product names in English.',
      'For technical jargon (API, SDK, OAuth) use English directly without forced Thai equivalents.',
      'Inline English clarification when a term is rare in Thai: "เอเจนต์ (agent)" — once per document.',
      'Numbers, dates: prefer the format the user used (พ.ศ. vs CE).',
    ].join('\n'),
  },
  {
    id: 'skill-compliance-fda-pdpa', name: 'Compliance Check (FDA/PDPA)',
    summary: 'Block restricted health claims and PII leaks before publishing.',
    category: 'governance', tools: [], builtin: true,
    body: [
      '## Compliance gate',
      'Before sending any user-facing output, scan for:',
      '- FDA/อย. red flags: "รักษา", "หาย", "ดีที่สุด", "100%", "ปลอดภัย 100%", "ทดแทนยา"',
      '- PDPA: real names, ID card numbers, phone numbers, addresses, medical history',
      '- Brand: comparative attacks on competitors, fear-marketing without evidence',
      'If any flag triggers, rewrite or reject; do not pass through silently.',
    ].join('\n'),
  },
  {
    id: 'skill-image-brief', name: 'Image Brief Template',
    summary: 'Translate a content goal into a complete image-generation prompt.',
    category: 'creative', tools: [], builtin: true,
    body: [
      '## Image brief structure',
      'Distill the request into:',
      '1. **Subject:** main figure / object / scene',
      '2. **Composition:** framing, ratio (1:1 / 4:3 / 9:16), focal point',
      '3. **Style:** photo / 3D / illustration / anime — be specific',
      '4. **Lighting & palette:** time of day, color mood, accent colors',
      '5. **Negatives:** what to avoid (broken anatomy, watermark, text artifacts)',
      'Output the brief as a single coherent prompt, ready to send to the image provider.',
    ].join('\n'),
  },
  {
    id: 'skill-sales-copy', name: 'Sales Copy (Hook · Body · CTA)',
    summary: 'Structure conversion-driven copy: hook → body → CTA.',
    category: 'commerce', tools: [], builtin: true,
    body: [
      '## Sales copy framework',
      '- **Hook (1 line):** name the pain or curiosity gap',
      '- **Body (2-4 lines):** specific benefit, social proof, differentiation',
      '- **CTA (1 line):** clear next step, low-friction (link, click, message)',
      'Keep the whole post within the platform limit; do not bury the CTA.',
      'Avoid superlatives unless backed by evidence — see the Compliance skill.',
    ].join('\n'),
  },
  {
    id: 'skill-data-analysis', name: 'Data Analysis SOP',
    summary: 'Methodology-first analysis: question → method → findings → caveats.',
    category: 'research', tools: ['Read', 'Bash'], builtin: true,
    body: [
      '## Data analysis structure',
      '1. State the question precisely.',
      '2. Describe the method (which fields, what aggregation, time window).',
      '3. Report the result with units and a sanity check.',
      '4. List caveats: sample size, missing data, possible biases.',
      'Never present a result without method + caveats — both are required.',
    ].join('\n'),
  },
  {
    id: 'skill-tdd', name: 'Test-Driven Development',
    summary: 'Red → Green → Refactor with 80%+ coverage on new logic.',
    category: 'engineering', tools: ['Read', 'Edit', 'Bash'], builtin: true,
    body: [
      '## TDD workflow',
      '1. Write a failing test that captures the desired behavior.',
      '2. Run it; confirm it fails for the right reason.',
      '3. Implement the minimum code to pass.',
      '4. Refactor with the test green; never break it during refactor.',
      'New behavior should hit at least 80% line coverage. Use real DB / fixtures, not mocks, for integration paths.',
    ].join('\n'),
  },
];

function listFiles() {
  ensureDir();
  try { return fs.readdirSync(SKILLS_DIR).filter((f) => f.endsWith('.md')); }
  catch { return []; }
}

function readSkillFile(file) {
  try {
    const text = fs.readFileSync(path.join(SKILLS_DIR, file), 'utf8');
    const { meta, body } = parseFrontmatter(text);
    if (!meta.id) return null;
    return { ...meta, body, builtin: meta.builtin === true || meta.builtin === 'true' };
  } catch { return null; }
}

function writeSkillFile(skill) {
  ensureDir();
  const meta = {
    id: skill.id,
    name: skill.name,
    summary: skill.summary || '',
    category: skill.category || 'general',
    tools: Array.isArray(skill.tools) ? skill.tools : [],
    builtin: skill.builtin === true,
    createdAt: skill.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const filePath = path.join(SKILLS_DIR, `${skill.id}.md`);
  fs.writeFileSync(filePath, `${formatFrontmatter(meta)}\n\n${(skill.body || '').trim()}\n`, { mode: 0o600 });
  return { ...meta, body: skill.body || '' };
}

function seedDefaultsIfEmpty() {
  ensureDir();
  for (const def of DEFAULT_SKILLS) {
    const target = path.join(SKILLS_DIR, `${def.id}.md`);
    if (!fs.existsSync(target)) writeSkillFile(def);
  }
}

export function listAgentSkills() {
  seedDefaultsIfEmpty();
  const skills = [];
  for (const file of listFiles()) {
    const s = readSkillFile(file);
    if (s) skills.push(s);
  }
  return skills.sort((a, b) => {
    if (!!a.builtin !== !!b.builtin) return a.builtin ? -1 : 1;
    return String(a.name).localeCompare(String(b.name));
  });
}

export function getAgentSkill(id) {
  seedDefaultsIfEmpty();
  for (const file of listFiles()) {
    const s = readSkillFile(file);
    if (s && s.id === id) return s;
  }
  return null;
}

export function createAgentSkill({ name, summary, category, tools, body } = {}) {
  if (!name || !String(name).trim()) throw new Error('name required');
  const id = `skill-${slugify(name)}-${crypto.randomBytes(2).toString('hex')}`;
  return writeSkillFile({
    id, name: String(name).trim(),
    summary: String(summary || '').trim(),
    category: String(category || 'general').trim(),
    tools: Array.isArray(tools) ? tools.map(String) : [],
    body: String(body || '').trim(),
    builtin: false,
  });
}

export function updateAgentSkill(id, patch = {}) {
  const existing = getAgentSkill(id);
  if (!existing) throw new Error('skill not found');
  if (existing.builtin && (patch.body !== undefined || patch.name !== undefined)) {
    throw new Error('builtin skills are read-only; fork by creating a new one');
  }
  const merged = {
    ...existing,
    name: patch.name ?? existing.name,
    summary: patch.summary ?? existing.summary,
    category: patch.category ?? existing.category,
    tools: Array.isArray(patch.tools) ? patch.tools : existing.tools,
    body: patch.body ?? existing.body,
    createdAt: existing.createdAt,
    builtin: existing.builtin,
  };
  return writeSkillFile(merged);
}

export function deleteAgentSkill(id) {
  const existing = getAgentSkill(id);
  if (!existing) return false;
  if (existing.builtin) throw new Error('builtin skills cannot be deleted');
  try { fs.unlinkSync(path.join(SKILLS_DIR, `${id}.md`)); return true; }
  catch { return false; }
}

export function resolveSkillsPromptFragment(skillIds) {
  if (!Array.isArray(skillIds) || skillIds.length === 0) return '';
  const parts = [];
  for (const id of skillIds) {
    const s = getAgentSkill(id);
    if (!s) continue;
    parts.push(`### Installed skill: ${s.name}\n${s.summary ? `_${s.summary}_\n\n` : ''}${(s.body || '').trim()}`);
  }
  if (!parts.length) return '';
  return `\n\n## Installed skills\n\n${parts.join('\n\n')}\n`;
}

export function skillCatalogDir() { return SKILLS_DIR; }
