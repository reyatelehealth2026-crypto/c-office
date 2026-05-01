// Phase 4.2 — Skill versioning tests
// Verifies degradation counter increments, success flag after 3 strikes,
// forkSkill creates a _v2 file and marks v1 superseded, and recallSkills
// skips superseded skills.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Isolate to a temp directory so the real ~/.c-office/skills/ is untouched.
const TMP_SKILLS = fs.mkdtempSync(path.join(os.tmpdir(), 'c-office-skills-v2-'));
process.env.COFFICE_SKILLS_DIR = TMP_SKILLS;

const {
  persistSkill,
  listSkills,
  recallSkills,
  degradeSkill,
  forkSkill,
} = await import('../server/agents/skills.js');

function reset() {
  for (const f of fs.readdirSync(TMP_SKILLS)) fs.unlinkSync(path.join(TMP_SKILLS, f));
}

// Helper: build a minimal run that persistSkill will accept (>= 2 ok delegations).
function makeRun(id, goal, overrides = {}) {
  return {
    id,
    goal,
    status: 'done',
    final: `Final output for: ${goal}`,
    steps: [
      { persona: 'nyx', result: { ok: true, text: 'research done' } },
      { persona: 'lumen', result: { ok: true, text: 'draft done' } },
    ],
    revisions: 0,
    phaseCosts: {},
    scratchpad: [],
    skillsRecalled: [],
    ...overrides,
  };
}

test('persistSkill includes degradedCount: 0 in new skill frontmatter', () => {
  reset();
  const run = makeRun('run_dg_1', 'analyze market trends for saas products');
  const result = persistSkill(run);
  assert.ok(result, 'skill should be persisted');
  const text = fs.readFileSync(result.path, 'utf8');
  assert.match(text, /degradedCount: 0/, 'frontmatter should include degradedCount: 0');
});

test('degradeSkill bumps degradedCount by 1', () => {
  reset();
  const run = makeRun('run_dg_2', 'build content strategy for b2b company launch');
  const persisted = persistSkill(run);
  assert.ok(persisted);

  const count = degradeSkill(persisted.id);
  assert.equal(count, 1, 'degradeSkill should return new count of 1');

  const text = fs.readFileSync(persisted.path, 'utf8');
  assert.match(text, /degradedCount: 1/);
});

test('degradeSkill accumulates across multiple calls', () => {
  reset();
  const run = makeRun('run_dg_3', 'research pricing strategy for startup launch');
  const persisted = persistSkill(run);
  assert.ok(persisted);

  degradeSkill(persisted.id);
  degradeSkill(persisted.id);
  const count = degradeSkill(persisted.id);
  assert.equal(count, 3, 'should be 3 after three calls');

  const text = fs.readFileSync(persisted.path, 'utf8');
  assert.match(text, /degradedCount: 3/);
});

test('skill success becomes false after 3 degradation strikes', () => {
  reset();
  const run = makeRun('run_dg_4', 'create social media plan for product launch');
  const persisted = persistSkill(run);
  assert.ok(persisted);

  // Skill starts as success: true
  const before = fs.readFileSync(persisted.path, 'utf8');
  assert.match(before, /success: true/);

  degradeSkill(persisted.id);
  degradeSkill(persisted.id);
  degradeSkill(persisted.id); // 3rd strike → success flips

  const after = fs.readFileSync(persisted.path, 'utf8');
  assert.match(after, /success: false/, 'success should flip to false at 3 strikes');
});

test('degradeSkill returns false for unknown skill id', () => {
  reset();
  const result = degradeSkill('nonexistent_skill_id_xyz');
  assert.equal(result, false);
});

test('forkSkill creates a _v2 file with the new run trajectory', () => {
  reset();
  const run = makeRun('run_fork_1', 'write technical documentation for api endpoints');
  const v1 = persistSkill(run);
  assert.ok(v1);

  // Simulate 3 strikes to reach fork threshold
  degradeSkill(v1.id);
  degradeSkill(v1.id);
  degradeSkill(v1.id);

  const successRun = makeRun('run_fork_success', 'write technical documentation for api endpoints', {
    steps: [
      { persona: 'kai', result: { ok: true, text: 'implementation done' } },
      { persona: 'lumen', result: { ok: true, text: 'docs written' } },
    ],
    final: 'New successful output for technical documentation.',
  });

  const forked = forkSkill(v1.id, successRun);
  assert.ok(forked, 'forkSkill should return a result');
  assert.ok(forked.id.endsWith('_v2'), `forked id should end with _v2, got: ${forked.id}`);
  assert.ok(fs.existsSync(forked.path), 'v2 skill file should exist on disk');

  const v2Text = fs.readFileSync(forked.path, 'utf8');
  assert.match(v2Text, /supersedes:/, 'v2 should reference original skill id via supersedes field');
  assert.match(v2Text, /degradedCount: 0/, 'v2 starts fresh with degradedCount: 0');
  assert.match(v2Text, /success: true/, 'v2 should be marked success: true');
});

test('forkSkill marks v1 as superseded and success: false', () => {
  reset();
  const run = makeRun('run_fork_2', 'analyze user research for product redesign');
  const v1 = persistSkill(run);
  assert.ok(v1);

  degradeSkill(v1.id);
  degradeSkill(v1.id);
  degradeSkill(v1.id);

  const successRun = makeRun('run_fork_success_2', 'analyze user research for product redesign', {
    final: 'Improved analysis result.',
  });

  forkSkill(v1.id, successRun);

  // Re-read v1 to verify supersededBy and success were updated
  const v1Text = fs.readFileSync(v1.path, 'utf8');
  assert.match(v1Text, /supersededBy:/, 'v1 should have supersededBy field pointing to v2');
  assert.match(v1Text, /success: false/, 'v1 should be marked success: false after fork');
});

test('forkSkill returns null for unknown skill id', () => {
  reset();
  const result = forkSkill('nonexistent_skill_xyz', makeRun('r', 'some goal'));
  assert.equal(result, null);
});

test('recallSkills skips superseded skills and surfaces the fork', () => {
  reset();

  // Persist v1 then fork it — making v1 superseded
  const run = makeRun('run_recall_v1', 'research fintech competitor pricing strategies');
  const v1 = persistSkill(run);
  assert.ok(v1);

  degradeSkill(v1.id);
  degradeSkill(v1.id);
  degradeSkill(v1.id);

  const successRun = makeRun('run_recall_v2_src', 'research fintech competitor pricing strategies', {
    final: 'Better fintech pricing research output.',
  });
  const v2 = forkSkill(v1.id, successRun);
  assert.ok(v2, 'v2 should be created');

  const recalled = recallSkills('analyze fintech competitor pricing strategies market');

  // v1 must not appear (it has supersededBy set)
  const hasV1 = recalled.some((s) => s.id === v1.id);
  assert.equal(hasV1, false, 'superseded v1 must not appear in recall results');

  // v2 should appear (it is active and has matching tags)
  const hasV2 = recalled.some((s) => s.id === v2.id);
  assert.equal(hasV2, true, 'forked v2 should appear in recall results');
});

test('listSkills returns both superseded and active skills', () => {
  reset();

  const run = makeRun('run_list_fork', 'build marketing campaign for enterprise software');
  const v1 = persistSkill(run);
  assert.ok(v1);

  degradeSkill(v1.id);
  degradeSkill(v1.id);
  degradeSkill(v1.id);

  const successRun = makeRun('run_list_fork_success', 'build marketing campaign for enterprise software', {
    final: 'New campaign plan.',
  });
  const v2 = forkSkill(v1.id, successRun);
  assert.ok(v2);

  const all = listSkills();
  // Both v1 and v2 should appear in full listing
  assert.ok(all.some((s) => s.id === v1.id), 'v1 should appear in listSkills');
  assert.ok(all.some((s) => s.id === v2.id), 'v2 should appear in listSkills');
});
