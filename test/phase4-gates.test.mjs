// Phase 4.3 — Approval gates tests
// Verifies gate state transitions: pending → approved → running,
// pending → rejected → failed, and that rejectRunPhase stores the reason.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  state,
  startRun,
  clearState,
  setRunStatus,
  approveRunPhase,
  rejectRunPhase,
  registerGateResolver,
} from '../server/state.js';

function reset() {
  clearState();
}

test('setRunStatus updates run status in memory', () => {
  reset();
  startRun('gate_run_1', 'demo goal');
  setRunStatus('gate_run_1', 'awaiting-approval');
  assert.equal(state.runs.get('gate_run_1').status, 'awaiting-approval');
});

test('approveRunPhase transitions status back to running', () => {
  reset();
  startRun('gate_run_2', 'demo goal');
  setRunStatus('gate_run_2', 'awaiting-approval');
  approveRunPhase('gate_run_2', 'execute');
  assert.equal(state.runs.get('gate_run_2').status, 'running');
});

test('approveRunPhase records a gate-approved scratchpad entry', () => {
  reset();
  startRun('gate_run_3', 'demo goal');
  setRunStatus('gate_run_3', 'awaiting-approval');
  approveRunPhase('gate_run_3', 'execute');
  const run = state.runs.get('gate_run_3');
  const entry = run.scratchpad.find((e) => e.kind === 'gate-approved');
  assert.ok(entry, 'should have a gate-approved scratchpad entry');
  assert.match(entry.text, /execute/);
});

test('approveRunPhase resolves the registered gate Promise', async () => {
  reset();
  startRun('gate_run_4', 'demo goal');
  setRunStatus('gate_run_4', 'awaiting-approval');

  const gatePromise = new Promise((resolve, reject) => {
    registerGateResolver('gate_run_4', resolve, reject);
  });

  approveRunPhase('gate_run_4', 'verify');
  const result = await gatePromise;
  assert.equal(result, 'verify', 'Promise should resolve with the approved phase name');
});

test('rejectRunPhase sets status to failed', () => {
  reset();
  startRun('gate_run_5', 'demo goal');
  setRunStatus('gate_run_5', 'awaiting-approval');
  rejectRunPhase('gate_run_5', 'execute', 'Output was not safe');
  assert.equal(state.runs.get('gate_run_5').status, 'failed');
});

test('rejectRunPhase stores the rejection reason in run.error', () => {
  reset();
  startRun('gate_run_6', 'demo goal');
  setRunStatus('gate_run_6', 'awaiting-approval');
  rejectRunPhase('gate_run_6', 'final', 'Does not meet quality bar');
  const run = state.runs.get('gate_run_6');
  assert.equal(run.error, 'Does not meet quality bar');
});

test('rejectRunPhase sets endedAt on the run', () => {
  reset();
  const before = Date.now();
  startRun('gate_run_7', 'demo goal');
  setRunStatus('gate_run_7', 'awaiting-approval');
  rejectRunPhase('gate_run_7', 'execute', 'Rejected');
  const run = state.runs.get('gate_run_7');
  assert.ok(run.endedAt >= before, 'endedAt should be set on rejection');
});

test('rejectRunPhase records a gate-rejected scratchpad entry', () => {
  reset();
  startRun('gate_run_8', 'demo goal');
  setRunStatus('gate_run_8', 'awaiting-approval');
  rejectRunPhase('gate_run_8', 'verify', 'Missing required data');
  const run = state.runs.get('gate_run_8');
  const entry = run.scratchpad.find((e) => e.kind === 'gate-rejected');
  assert.ok(entry, 'should have a gate-rejected scratchpad entry');
  assert.match(entry.text, /Missing required data/);
});

test('rejectRunPhase rejects the registered gate Promise', async () => {
  reset();
  startRun('gate_run_9', 'demo goal');
  setRunStatus('gate_run_9', 'awaiting-approval');

  const gatePromise = new Promise((resolve, reject) => {
    registerGateResolver('gate_run_9', resolve, reject);
  });

  rejectRunPhase('gate_run_9', 'execute', 'Unsafe content detected');

  await assert.rejects(gatePromise, /Gate rejected: Unsafe content detected/);
});

test('approveRunPhase throws for unknown run id', () => {
  reset();
  assert.throws(() => approveRunPhase('nonexistent_run_id', 'execute'), /unknown run/);
});

test('rejectRunPhase throws for unknown run id', () => {
  reset();
  assert.throws(() => rejectRunPhase('nonexistent_run_id', 'execute', 'reason'), /unknown run/);
});

test('gate resolver is cleaned up after approval so a second call is a no-op', async () => {
  reset();
  startRun('gate_run_10', 'demo goal');
  setRunStatus('gate_run_10', 'awaiting-approval');

  let resolveCount = 0;
  const gatePromise = new Promise((resolve, reject) => {
    registerGateResolver('gate_run_10', (phase) => { resolveCount++; resolve(phase); }, reject);
  });

  approveRunPhase('gate_run_10', 'execute');
  await gatePromise;
  // Second approval: resolver map entry is gone — should not throw
  approveRunPhase('gate_run_10', 'execute');
  assert.equal(resolveCount, 1, 'resolver callback should only fire once');
});
