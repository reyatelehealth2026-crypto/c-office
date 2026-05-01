import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'c-office-runs-'));
process.env.COFFICE_RUNS_DIR = TMP_DIR;
process.env.COFFICE_MAX_USD_PER_RUN = '0.01';

const { persistRun, loadRun, listRunIds, findStaleRunningRuns } =
  await import('../server/store/runs.js');
const {
  state,
  startRun,
  addPhaseCost,
  runOverBudget,
  COST_CEILING_USD,
  sweepStaleRuns,
  clearState,
} = await import('../server/state.js');

function reset() {
  clearState();
  for (const f of fs.readdirSync(TMP_DIR)) fs.unlinkSync(path.join(TMP_DIR, f));
}

test('COST_CEILING_USD reflects env override', () => {
  assert.equal(COST_CEILING_USD, 0.01);
});

test('runOverBudget returns false below ceiling, true above', () => {
  reset();
  startRun('budget_run_1', 'demo');
  assert.equal(runOverBudget('budget_run_1'), false);
  addPhaseCost('budget_run_1', 'plan', { tokens: 1000, usd: 0.005 });
  assert.equal(runOverBudget('budget_run_1'), false);
  addPhaseCost('budget_run_1', 'execute', { tokens: 5000, usd: 0.02 });
  assert.equal(runOverBudget('budget_run_1'), true);
});

test('addPhaseCost returns running total usd', () => {
  reset();
  startRun('budget_run_2', 'demo');
  const t1 = addPhaseCost('budget_run_2', 'plan', { tokens: 100, usd: 0.001 });
  const t2 = addPhaseCost('budget_run_2', 'execute', { tokens: 200, usd: 0.002 });
  assert.ok(Math.abs(t1 - 0.001) < 1e-9);
  assert.ok(Math.abs(t2 - 0.003) < 1e-9);
});

test('persistRun + loadRun round-trip writes the run snapshot to disk', () => {
  reset();
  startRun('persist_run_1', 'demo persist');
  const run = state.runs.get('persist_run_1');
  run.phase = 'execute';
  persistRun(run);
  const loaded = loadRun('persist_run_1');
  assert.equal(loaded.id, 'persist_run_1');
  assert.equal(loaded.goal, 'demo persist');
  assert.equal(loaded.phase, 'execute');
});

test('listRunIds returns persisted run ids', () => {
  reset();
  startRun('list_a', 'a');
  startRun('list_b', 'b');
  persistRun(state.runs.get('list_a'));
  persistRun(state.runs.get('list_b'));
  const ids = listRunIds().sort();
  assert.deepEqual(ids, ['list_a', 'list_b']);
});

test('findStaleRunningRuns flags only old running runs', () => {
  reset();
  startRun('stale_run', 'demo');
  const run = state.runs.get('stale_run');
  run.startedAt = Date.now() - 10 * 60 * 1000;
  persistRun(run);

  startRun('fresh_run', 'demo');
  const fresh = state.runs.get('fresh_run');
  fresh.startedAt = Date.now();
  persistRun(fresh);

  startRun('done_run', 'demo');
  const done = state.runs.get('done_run');
  done.status = 'done';
  done.startedAt = Date.now() - 10 * 60 * 1000;
  persistRun(done);

  const stale = findStaleRunningRuns();
  const ids = stale.map((r) => r.id).sort();
  assert.deepEqual(ids, ['stale_run']);
});

test('sweepStaleRuns marks stale running runs as failed', () => {
  reset();
  startRun('sweep_target', 'demo');
  const run = state.runs.get('sweep_target');
  run.startedAt = Date.now() - 10 * 60 * 1000;
  persistRun(run);
  state.runs.delete('sweep_target');

  const swept = sweepStaleRuns();
  assert.equal(swept, 1);
  assert.equal(state.runs.get('sweep_target')?.status, 'failed');
  assert.match(state.runs.get('sweep_target')?.error || '', /restart|abandoned/i);

  const persisted = loadRun('sweep_target');
  assert.equal(persisted.status, 'failed');
});
