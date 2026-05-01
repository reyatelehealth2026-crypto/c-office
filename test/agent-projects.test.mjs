import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const PROJECTS_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'c-office-projects-'));
const SKILLS_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'c-office-skills-proj-'));
process.env.COFFICE_PROJECTS_DIR = PROJECTS_DIR;
process.env.COFFICE_SKILLS_DIR = SKILLS_DIR;

const { listProjects, getProject, createProject, patchProject, deleteProject } =
  await import('../server/store/projects.js');
const { persistSkill, recallSkills, listSkills } =
  await import('../server/agents/skills.js');
const { state, startRun, clearState } = await import('../server/state.js');

function reset() {
  clearState();
  for (const f of fs.readdirSync(PROJECTS_DIR)) fs.unlinkSync(path.join(PROJECTS_DIR, f));
  for (const f of fs.readdirSync(SKILLS_DIR)) fs.unlinkSync(path.join(SKILLS_DIR, f));
}

test('createProject returns a record with id, name, createdAt', () => {
  reset();
  const p = createProject({ name: 'My Project', description: 'do things' });
  assert.match(p.id, /^proj_/);
  assert.equal(p.name, 'My Project');
  assert.equal(p.description, 'do things');
  assert.ok(p.createdAt > 0);
});

test('createProject throws when name is missing', () => {
  reset();
  assert.throws(() => createProject({}), /name required/);
});

test('listProjects returns newest first', () => {
  reset();
  const a = createProject({ name: 'A' });
  const b = createProject({ name: 'B' });
  patchProject(b.id, { description: 'newer' });
  const list = listProjects();
  assert.equal(list[0].id, b.id);
  assert.equal(list[1].id, a.id);
});

test('patchProject updates name + description and bumps updatedAt', async () => {
  reset();
  const p = createProject({ name: 'Old' });
  await new Promise((r) => setTimeout(r, 5));
  const updated = patchProject(p.id, { name: 'New', description: 'changed' });
  assert.equal(updated.name, 'New');
  assert.equal(updated.description, 'changed');
  assert.ok(updated.updatedAt > p.updatedAt);
});

test('deleteProject removes the file', () => {
  reset();
  const p = createProject({ name: 'Doomed' });
  assert.ok(getProject(p.id));
  assert.equal(deleteProject(p.id), true);
  assert.equal(getProject(p.id), null);
});

test('persistSkill writes projectId into frontmatter when run.projectId is set', () => {
  reset();
  const proj = createProject({ name: 'Scoped' });
  startRun('proj_run_1', 'research pricing strategies');
  const run = state.runs.get('proj_run_1');
  run.projectId = proj.id;
  run.steps = [
    { persona: 'nyx', result: { ok: true } },
    { persona: 'lumen', result: { ok: true } },
  ];
  run.status = 'done';
  run.final = 'result';
  const skill = persistSkill(run);
  assert.ok(skill);
  const text = fs.readFileSync(skill.path, 'utf8');
  assert.match(text, new RegExp(`projectId: "?${proj.id}"?`));
});

test('recallSkills with projectId scope only returns skills from that project', () => {
  reset();
  const projA = createProject({ name: 'A' });
  const projB = createProject({ name: 'B' });

  startRun('a_run', 'research competitor pricing fintech');
  const a = state.runs.get('a_run');
  a.projectId = projA.id;
  a.steps = [
    { persona: 'nyx', result: { ok: true } },
    { persona: 'lumen', result: { ok: true } },
  ];
  a.status = 'done';
  a.final = 'A result';
  persistSkill(a);

  startRun('b_run', 'research pricing fintech competitor');
  const b = state.runs.get('b_run');
  b.projectId = projB.id;
  b.steps = [
    { persona: 'nyx', result: { ok: true } },
    { persona: 'lumen', result: { ok: true } },
  ];
  b.status = 'done';
  b.final = 'B result';
  persistSkill(b);

  const allRecalled = recallSkills('analyze fintech competitor pricing');
  assert.equal(allRecalled.length, 2);

  const aRecalled = recallSkills('analyze fintech competitor pricing', { projectId: projA.id });
  assert.equal(aRecalled.length, 1);
  assert.equal(aRecalled[0].projectId, projA.id);

  const aOnly = listSkills({ projectId: projA.id });
  assert.equal(aOnly.length, 1);
});
