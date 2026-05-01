import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Use a per-process tmp dir so the real ~/.c-office/skills/ stays untouched.
const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'c-office-skills-'));
process.env.COFFICE_SKILLS_DIR = TMP_DIR;

const { persistSkill, listSkills, recallSkills, skillsDir } = await import('../server/agents/skills.js');
const {
  state,
  startRun,
  setRunVerification,
  addPhaseCost,
  setRunSkillsRecalled,
  clearState,
} = await import('../server/state.js');

function reset() {
  clearState();
  for (const f of fs.readdirSync(TMP_DIR)) fs.unlinkSync(path.join(TMP_DIR, f));
}

test('skillsDir respects COFFICE_SKILLS_DIR env override', () => {
  assert.equal(skillsDir(), TMP_DIR);
});

test('persistSkill skips runs with fewer than 2 successful delegations', () => {
  reset();
  startRun('skill_run_1', 'short goal');
  const run = state.runs.get('skill_run_1');
  run.steps = [{ persona: 'kai', result: { ok: true, text: 'one step' } }];
  run.status = 'done';
  run.final = 'short final';
  const result = persistSkill(run);
  assert.equal(result, null);
});

test('persistSkill writes a skill file for multi-step successful runs', () => {
  reset();
  startRun('skill_run_2', 'research social media trends and write a launch post');
  const run = state.runs.get('skill_run_2');
  run.steps = [
    { persona: 'nyx', result: { ok: true, text: 'sources cited' } },
    { persona: 'lumen', result: { ok: true, text: 'draft ready' } },
  ];
  run.status = 'done';
  run.final = 'final post text';
  run.phaseCosts = {
    plan: { tokens: 200, usd: 0.01 },
    execute: { tokens: 1000, usd: 0.05 },
  };
  const result = persistSkill(run);
  assert.ok(result, 'should persist');
  assert.ok(fs.existsSync(result.path));
  const text = fs.readFileSync(result.path, 'utf8');
  assert.match(text, /id:/);
  assert.match(text, /goal:/);
  assert.match(text, /steps: \["nyx", "lumen"\]/);
});

test('listSkills returns persisted skills', () => {
  reset();
  for (let i = 0; i < 3; i++) {
    startRun(`skill_list_${i}`, `goal alpha bravo charlie ${i}`);
    const run = state.runs.get(`skill_list_${i}`);
    run.steps = [
      { persona: 'nyx', result: { ok: true } },
      { persona: 'lumen', result: { ok: true } },
    ];
    run.status = 'done';
    run.final = `out ${i}`;
    persistSkill(run);
  }
  const skills = listSkills();
  assert.equal(skills.length, 3);
});

test('recallSkills surfaces skills with overlapping tags', () => {
  reset();
  startRun('recall_seed', 'research competitor pricing strategies for fintech');
  const seed = state.runs.get('recall_seed');
  seed.steps = [
    { persona: 'nyx', result: { ok: true } },
    { persona: 'lumen', result: { ok: true } },
  ];
  seed.status = 'done';
  seed.final = 'pricing analysis';
  persistSkill(seed);

  const recalled = recallSkills('analyze pricing strategies of competitor fintech');
  assert.ok(recalled.length >= 1, 'should recall the prior pricing skill');
  assert.match(recalled[0].goal, /pricing/);
});

test('addPhaseCost accumulates tokens and usd per phase', () => {
  reset();
  startRun('cost_run', 'demo');
  addPhaseCost('cost_run', 'plan', { tokens: 100, usd: 0.005 });
  addPhaseCost('cost_run', 'plan', { tokens: 50, usd: 0.0025 });
  addPhaseCost('cost_run', 'execute', { tokens: 800, usd: 0.04 });
  const run = state.runs.get('cost_run');
  assert.equal(run.phaseCosts.plan.tokens, 150);
  assert.ok(Math.abs(run.phaseCosts.plan.usd - 0.0075) < 1e-9);
  assert.equal(run.phaseCosts.execute.tokens, 800);
});

test('setRunSkillsRecalled normalizes entries', () => {
  reset();
  startRun('recall_run', 'demo');
  setRunSkillsRecalled('recall_run', [
    { id: 'skill_a', goal: 'do something cool', tags: ['cool'], score: 2 },
    { id: 'skill_b', goal: 'irrelevant' },
  ]);
  const run = state.runs.get('recall_run');
  assert.equal(run.skillsRecalled.length, 2);
  assert.equal(run.skillsRecalled[0].id, 'skill_a');
  assert.equal(run.skillsRecalled[0].score, 2);
});

test('setRunVerification stores pass/fail and scratchpad note', () => {
  reset();
  startRun('verify_run', 'demo');
  setRunVerification('verify_run', { passed: false, text: 'FAIL — missing pricing comparison' });
  const run = state.runs.get('verify_run');
  assert.equal(run.verification.passed, false);
  assert.match(run.verification.text, /missing pricing/);
  assert.ok(run.scratchpad.some((e) => e.kind === 'verify-fail'));
});
