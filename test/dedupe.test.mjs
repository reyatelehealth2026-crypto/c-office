import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Dedupe, RingBuffer } from '../server/util/dedupe.js';

// CLAUDE.md: "Both paths emit the same tool_use_id ... so deduplication is
// structural, not optional." These tests pin the LRU contract that prevents
// the hook + JSONL ingest paths from double-counting events.

test('Dedupe.seen returns false for a brand new key', () => {
  const d = new Dedupe(8);
  assert.equal(d.seen('tu:abc'), false);
});

test('Dedupe.seen returns true on the second sighting of the same key', () => {
  const d = new Dedupe(8);
  d.seen('tu:abc');
  assert.equal(d.seen('tu:abc'), true);
});

test('Dedupe evicts strictly by insertion order (FIFO, not true LRU)', () => {
  // Re-seeing a key does NOT refresh its position. The class name suggests
  // LRU but the implementation is a fixed-size FIFO over the *first* sighting
  // of each key — which is exactly what we want for dedupe (we don't care if
  // a duplicate keeps arriving; we care that the original is still remembered).
  // NOTE: every miss-then-add via seen() mutates state and may evict a key, so
  // each assertion is performed on its own fresh fixture.
  const seedAndPushFour = () => {
    const d = new Dedupe(3);
    d.seen('a'); d.seen('b'); d.seen('c'); // queue: [a,b,c]
    d.seen('a');                            // duplicate hit, no reorder
    d.seen('d');                            // overflow → evicts 'a' (oldest insert)
    return d;
  };
  assert.equal(seedAndPushFour().seen('a'), false, 'oldest insert (a) is evicted');
  assert.equal(seedAndPushFour().seen('b'), true,  'b is still cached');
  assert.equal(seedAndPushFour().seen('c'), true,  'c is still cached');
  assert.equal(seedAndPushFour().seen('d'), true,  'd (newest) is cached');
});

test('Dedupe key namespaces (tu:/tr:/usage:) do not collide', () => {
  // CLAUDE.md: "usage tracking is intentionally separate from event dedupe ...
  // recording it under a uuid-based key prevents the hook duplicate from
  // drowning the token tally."
  const d = new Dedupe(64);
  const id = '01HYZ-tool-use-uuid';
  assert.equal(d.seen(`tu:${id}`), false, 'first tool_use sighting');
  assert.equal(d.seen(`tr:${id}`), false, 'tool_result with same id is a different key');
  assert.equal(d.seen(`usage:${id}`), false, 'usage record with same id is a different key');
  assert.equal(d.seen(`tu:${id}`), true);
  assert.equal(d.seen(`tr:${id}`), true);
  assert.equal(d.seen(`usage:${id}`), true);
});

test('Dedupe default capacity matches the hot-path budget (4096)', () => {
  // The default in state.js is 4096. Lock both so a silent shrink is caught.
  const d = new Dedupe();
  for (let i = 0; i < 4096; i += 1) d.seen(`k:${i}`);
  assert.equal(d.seen('k:0'), true, 'k:0 must still be in the LRU after 4096 inserts');
  d.seen('k:overflow');
  assert.equal(d.seen('k:0'), false, 'k:0 should now be evicted');
});

test('RingBuffer keeps only the last `cap` items in insertion order', () => {
  const r = new RingBuffer(3);
  r.push('a'); r.push('b'); r.push('c');
  assert.deepEqual(r.toArray(), ['a', 'b', 'c']);
  r.push('d');
  assert.deepEqual(r.toArray(), ['b', 'c', 'd']);
  r.push('e'); r.push('f');
  assert.deepEqual(r.toArray(), ['d', 'e', 'f']);
});

test('RingBuffer.toArray returns a copy, not the live array', () => {
  const r = new RingBuffer(3);
  r.push(1); r.push(2);
  const snap = r.toArray();
  snap.push(999);
  assert.deepEqual(r.toArray(), [1, 2], 'internal state untouched by external mutation');
});

test('RingBuffer.filter does not mutate the buffer', () => {
  const r = new RingBuffer(5);
  for (const v of [1, 2, 3, 4, 5]) r.push(v);
  const evens = r.filter((v) => v % 2 === 0);
  assert.deepEqual(evens, [2, 4]);
  assert.deepEqual(r.toArray(), [1, 2, 3, 4, 5]);
});
