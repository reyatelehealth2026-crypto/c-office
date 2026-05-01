import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  state,
  startRun,
  setRunPhase,
  setRunPlan,
  appendScratchpad,
  setRunCritique,
  bumpRunRevision,
  viewRun,
  clearState,
} from '../server/state.js';

// Sprint B+C invariants: a run record carries the multi-phase pipeline
// shape (plan + scratchpad + critique + phase + revisions) so the dashboard
// can render the agent-team timeline without extra fetches.

function reset() {
  clearState();
}

test('startRun seeds the pipeline fields with safe defaults', () => {
  reset();
  const run = startRun('run_test_1', 'demo goal');
  assert.equal(run.phase, 'plan');
  assert.equal(run.plan, null);
  assert.deepEqual(run.scratchpad, []);
  assert.equal(run.critique, null);
  assert.equal(run.revisions, 0);
  assert.equal(run.status, 'running');
});

test('setRunPlan normalizes persona ids and indices', () => {
  reset();
  startRun('run_test_2', 'demo goal');
  setRunPlan('run_test_2', [
    { persona: 'nyx', instruction: 'gather signals', depends_on: null },
    { persona: 'lumen', instruction: 'draft post', depends_on: 0 },
    { persona: 'unknown-persona', instruction: 'fallback test', depends_on: null },
  ]);
  const run = state.runs.get('run_test_2');
  assert.equal(run.plan.length, 3);
  assert.equal(run.plan[0].index, 0);
  assert.equal(run.plan[1].depends_on, 0);
  assert.ok(run.plan[2].persona, 'unknown persona should resolve to fallback id');
});

test('appendScratchpad records entries with persona name + kind', () => {
  reset();
  startRun('run_test_3', 'demo');
  appendScratchpad('run_test_3', { persona: 'nyx', kind: 'finding', text: 'three sources cited' });
  appendScratchpad('run_test_3', { persona: 'lumen', kind: 'note', text: 'first draft ready' });
  const run = state.runs.get('run_test_3');
  assert.equal(run.scratchpad.length, 2);
  assert.equal(run.scratchpad[0].kind, 'finding');
  assert.equal(typeof run.scratchpad[0].personaName, 'string');
  assert.ok(run.scratchpad[0].ts > 0);
});

test('scratchpad is bounded to prevent unbounded growth', () => {
  reset();
  startRun('run_test_4', 'demo');
  for (let i = 0; i < 250; i++) {
    appendScratchpad('run_test_4', { persona: 'nyx', kind: 'note', text: `entry ${i}` });
  }
  const run = state.runs.get('run_test_4');
  assert.ok(run.scratchpad.length <= 200, 'scratchpad should be capped at 200 entries');
});

test('setRunCritique stores severity and mirrors entry into scratchpad', () => {
  reset();
  startRun('run_test_5', 'demo');
  setRunCritique('run_test_5', { text: '[HIGH] missing citations -> add sources', severity: 'high' });
  const run = state.runs.get('run_test_5');
  assert.equal(run.critique.severity, 'high');
  assert.match(run.critique.text, /missing citations/);
  assert.ok(run.scratchpad.some(e => e.kind === 'critique'));
});

test('setRunPhase + bumpRunRevision drive the revise loop', () => {
  reset();
  startRun('run_test_6', 'demo');
  setRunPhase('run_test_6', 'execute');
  assert.equal(state.runs.get('run_test_6').phase, 'execute');
  const r1 = bumpRunRevision('run_test_6');
  const r2 = bumpRunRevision('run_test_6');
  assert.equal(r1, 1);
  assert.equal(r2, 2);
  assert.equal(state.runs.get('run_test_6').revisions, 2);
});

test('viewRun exposes the new pipeline fields to the dashboard snapshot', () => {
  reset();
  startRun('run_test_7', 'demo');
  setRunPlan('run_test_7', [{ persona: 'kai', instruction: 'ship', depends_on: null }]);
  appendScratchpad('run_test_7', { persona: 'kai', kind: 'finding', text: 'shipped' });
  const view = viewRun(state.runs.get('run_test_7'));
  assert.ok(Array.isArray(view.plan));
  assert.ok(Array.isArray(view.scratchpad));
  assert.equal(view.phase, 'plan');
  assert.ok('revisions' in view);
});
