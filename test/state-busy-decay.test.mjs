import assert from 'node:assert/strict';
import { test } from 'node:test';
import { state, pushEvent, clearState } from '../server/state.js';

// CLAUDE.md: "The busy-state decay is the trickiest invariant ... If you change
// BUSY_WINDOW_MS or the recompute logic, exercise both the 'fast tool stream'
// and 'long silent assistant turn' cases."
//
// We drive the state machine directly via pushEvent + manipulating ev.ts to
// simulate decay without sleeping. recomputePersonaStatus runs synchronously
// inside pushEvent for tool/turn-end events, so personaStatus is observable
// the moment pushEvent returns.

const BUSY_WINDOW_MS = 8000;

function reset() {
  clearState();
}

test('tool_use event marks the persona busy', () => {
  reset();
  pushEvent({ verb: 'used', personaId: 'kai', toolName: 'Edit', ts: Date.now() });
  assert.equal(state.personaStatus.get('kai'), 'busy');
});

test('tool_result event also marks busy (not just tool_use)', () => {
  reset();
  pushEvent({ verb: 'result', personaId: 'vex', toolName: 'Read', ts: Date.now() });
  assert.equal(state.personaStatus.get('vex'), 'busy');
});

test('turn-end clears busy immediately for that persona', () => {
  reset();
  const now = Date.now();
  pushEvent({ verb: 'used', personaId: 'lumen', toolName: 'Write', ts: now });
  assert.equal(state.personaStatus.get('lumen'), 'busy');
  pushEvent({ verb: 'turn-end', personaId: 'lumen', ts: now + 1 });
  assert.notEqual(state.personaStatus.get('lumen'), 'busy');
});

test('persona returns to non-busy once tool activity is older than BUSY_WINDOW_MS', () => {
  reset();
  // Stamp activity in the past so the next recompute sees it as already-decayed.
  const stale = Date.now() - (BUSY_WINDOW_MS + 1000);
  pushEvent({ verb: 'used', personaId: 'mira', toolName: 'Bash', ts: stale });
  // Triggering another pushEvent for a different persona forces a recompute,
  // and stale `mira` should drop out of busy.
  pushEvent({ verb: 'used', personaId: 'orbit', toolName: 'Bash', ts: Date.now() });
  assert.notEqual(state.personaStatus.get('mira'), 'busy', 'stale activity should not keep mira busy');
  assert.equal(state.personaStatus.get('orbit'), 'busy', 'fresh activity keeps orbit busy');
});

test('busy state for one persona does not leak into another', () => {
  reset();
  pushEvent({ verb: 'used', personaId: 'echo', toolName: 'Write', ts: Date.now() });
  assert.equal(state.personaStatus.get('echo'), 'busy');
  for (const [pid, status] of state.personaStatus) {
    if (pid === 'echo') continue;
    assert.notEqual(status, 'busy', `${pid} should not be busy when only echo had activity`);
  }
});

test('turn-end for one persona does not clear busy on another', () => {
  reset();
  const now = Date.now();
  pushEvent({ verb: 'used', personaId: 'nyx',     toolName: 'Bash', ts: now });
  pushEvent({ verb: 'used', personaId: 'astra',   toolName: 'Read', ts: now });
  assert.equal(state.personaStatus.get('nyx'),   'busy');
  assert.equal(state.personaStatus.get('astra'), 'busy');
  pushEvent({ verb: 'turn-end', personaId: 'nyx', ts: now + 1 });
  assert.notEqual(state.personaStatus.get('nyx'),   'busy', 'nyx cleared by its own turn-end');
  assert.equal(   state.personaStatus.get('astra'), 'busy', 'astra still busy — its turn did not end');
});

test('clearState() resets persona status to non-busy', () => {
  pushEvent({ verb: 'used', personaId: 'kai', toolName: 'Edit', ts: Date.now() });
  assert.equal(state.personaStatus.get('kai'), 'busy');
  clearState();
  assert.notEqual(state.personaStatus.get('kai'), 'busy', 'kai must not still appear busy after reset');
  assert.equal(state.lastToolActivity.size, 0);
});
