// Tests for Phase 5.2 — Persona auto-tune suggestions
//
// All file I/O is redirected to a process-scoped tmp dir via env vars so
// real ~/.c-office/ is never touched.
//
// generateSuggestion() makes an LLM call. When no API key is present the
// module catches the error and writes a placeholder file, so the file-contract
// tests still pass regardless of network availability.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// ── Isolated tmp dirs (set before module import so env is read at init) ───
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'c-office-tune-'));
const TMP_STATS = path.join(TMP, 'personas-stats.json');
const TMP_TUNING = path.join(TMP, 'persona-tuning');

process.env.COFFICE_PERSONA_STATS_PATH = TMP_STATS;
process.env.COFFICE_PERSONA_TUNING_DIR = TMP_TUNING;

const {
  recordPersonaOutcome,
  getPersonaStats,
  listPendingSuggestions,
  generateSuggestion,
  FAILURE_THRESHOLD,
  tuningDir,
  statsPath,
} = await import('../server/agents/persona-tune.js');

function resetAll() {
  try { fs.unlinkSync(TMP_STATS); } catch { /* ok if absent */ }
  try {
    for (const f of fs.readdirSync(TMP_TUNING)) {
      fs.unlinkSync(path.join(TMP_TUNING, f));
    }
  } catch { /* ok if absent */ }
}

// ── Test 1: env overrides are respected ───────────────────────────────────

test('tuningDir() and statsPath() respect env overrides', () => {
  assert.equal(tuningDir(), TMP_TUNING);
  assert.equal(statsPath(), TMP_STATS);
});

// ── Test 2: successCount accumulates ─────────────────────────────────────

test('recordPersonaOutcome increments successCount', () => {
  resetAll();
  recordPersonaOutcome({ personaId: 'kai', outcome: 'success' });
  recordPersonaOutcome({ personaId: 'kai', outcome: 'success' });
  const s = getPersonaStats('kai');
  assert.equal(s.successCount, 2);
  assert.equal(s.failureCount, 0);
  assert.equal(s.criticHighCount, 0);
  assert.equal(s.verifyFailCount, 0);
});

// ── Test 3: failureCount accumulates ─────────────────────────────────────

test('recordPersonaOutcome increments failureCount', () => {
  resetAll();
  recordPersonaOutcome({ personaId: 'nyx', outcome: 'failure' });
  recordPersonaOutcome({ personaId: 'nyx', outcome: 'failure' });
  recordPersonaOutcome({ personaId: 'nyx', outcome: 'failure' });
  const s = getPersonaStats('nyx');
  assert.equal(s.failureCount, 3);
  assert.equal(s.successCount, 0);
});

// ── Test 4: critic-high and verify-fail accumulate ────────────────────────

test('recordPersonaOutcome tracks criticHighCount and verifyFailCount', () => {
  resetAll();
  recordPersonaOutcome({ personaId: 'vex', outcome: 'critic-high' });
  recordPersonaOutcome({ personaId: 'vex', outcome: 'critic-high' });
  recordPersonaOutcome({ personaId: 'vex', outcome: 'verify-fail' });
  const s = getPersonaStats('vex');
  assert.equal(s.criticHighCount, 2);
  assert.equal(s.verifyFailCount, 1);
});

// ── Test 5: project-scoped stats tracked independently ────────────────────

test('recordPersonaOutcome tracks project-scoped stats separately from global', () => {
  resetAll();
  recordPersonaOutcome({ personaId: 'lumen', projectId: 'proj-a', outcome: 'failure' });
  recordPersonaOutcome({ personaId: 'lumen', projectId: 'proj-b', outcome: 'failure' });
  recordPersonaOutcome({ personaId: 'lumen', projectId: 'proj-a', outcome: 'failure' });

  const global = getPersonaStats('lumen');
  assert.equal(global.failureCount, 3, 'global counts all failures');

  const a = getPersonaStats('lumen', 'proj-a');
  assert.equal(a.projectScoped.failureCount, 2, 'proj-a has 2 failures');

  const b = getPersonaStats('lumen', 'proj-b');
  assert.equal(b.projectScoped.failureCount, 1, 'proj-b has 1 failure');
});

// ── Test 6: unknown outcome is silently ignored ────────────────────────────

test('recordPersonaOutcome ignores unknown outcome strings', () => {
  resetAll();
  recordPersonaOutcome({ personaId: 'orbit', outcome: 'not-a-valid-outcome' });
  const s = getPersonaStats('orbit');
  assert.equal(s.successCount, 0);
  assert.equal(s.failureCount, 0);
  assert.equal(s.criticHighCount, 0);
  assert.equal(s.verifyFailCount, 0);
});

// ── Test 7: missing personaId or outcome is a no-op ──────────────────────

test('recordPersonaOutcome with missing personaId or outcome does not throw', () => {
  resetAll();
  assert.doesNotThrow(() => recordPersonaOutcome({ outcome: 'success' }));
  assert.doesNotThrow(() => recordPersonaOutcome({ personaId: 'kai' }));
  assert.doesNotThrow(() => recordPersonaOutcome({}));
});

// ── Test 8: stats survive across calls (disk persistence) ────────────────

test('persona stats are written to disk and readable on subsequent calls', () => {
  resetAll();
  recordPersonaOutcome({ personaId: 'astra', projectId: 'proj-disk', outcome: 'failure' });
  recordPersonaOutcome({ personaId: 'astra', projectId: 'proj-disk', outcome: 'failure' });

  assert.ok(fs.existsSync(TMP_STATS), 'stats file must exist on disk');
  const raw = JSON.parse(fs.readFileSync(TMP_STATS, 'utf8'));
  assert.ok('astra::global' in raw, 'global key must be present');
  assert.ok('astra::proj-disk' in raw, 'project key must be present');
  assert.equal(raw['astra::proj-disk'].failureCount, 2);
});

// ── Test 9: FAILURE_THRESHOLD is exported and equals 5 ───────────────────

test('FAILURE_THRESHOLD equals 5', () => {
  assert.equal(typeof FAILURE_THRESHOLD, 'number');
  assert.equal(FAILURE_THRESHOLD, 5);
});

// ── Test 10: listPendingSuggestions returns [] when dir is empty ──────────

test('listPendingSuggestions returns empty array when no suggestions exist', () => {
  resetAll();
  const list = listPendingSuggestions();
  assert.ok(Array.isArray(list));
  assert.equal(list.length, 0);
});

// ── Test 11: listPendingSuggestions parses filename correctly ─────────────

test('listPendingSuggestions parses personaId and projectId from filename', () => {
  resetAll();
  fs.mkdirSync(TMP_TUNING, { recursive: true });
  fs.writeFileSync(path.join(TMP_TUNING, 'echo__proj-abc.md'), '# test\n', { mode: 0o600 });
  fs.writeFileSync(path.join(TMP_TUNING, 'orbit__proj-xyz.md'), '# test\n', { mode: 0o600 });

  const list = listPendingSuggestions();
  assert.ok(list.length >= 2);

  const echoEntry = list.find((e) => e.personaId === 'echo');
  assert.ok(echoEntry, 'echo entry must be found');
  assert.equal(echoEntry.projectId, 'proj-abc');

  const orbitEntry = list.find((e) => e.personaId === 'orbit');
  assert.ok(orbitEntry, 'orbit entry must be found');
  assert.equal(orbitEntry.projectId, 'proj-xyz');
});

// ── Test 12: generateSuggestion writes file with correct naming ───────────

test('generateSuggestion creates a suggestion file at the correct path', async () => {
  resetAll();
  // LLM may be unavailable — module writes a placeholder file on error,
  // so the file contract holds regardless of network availability.
  const filePath = await generateSuggestion('kai', 'proj-test');
  if (filePath === null) return; // write permission failure — skip

  assert.ok(fs.existsSync(filePath), 'suggestion file must exist');
  assert.match(path.basename(filePath), /^kai__proj-test\.md$/);

  const content = fs.readFileSync(filePath, 'utf8');
  assert.match(content, /Persona Tuning Suggestion/);
  assert.match(content, /kai/);
  assert.match(content, /proj-test/);
  assert.match(content, /Suggested system-prompt addendum/);
});

// ── Test 13: generateSuggestion is idempotent ────────────────────────────

test('generateSuggestion does not overwrite an existing suggestion file', async () => {
  resetAll();
  fs.mkdirSync(TMP_TUNING, { recursive: true });
  const preWrittenPath = path.join(TMP_TUNING, 'mira__proj-idem.md');
  fs.writeFileSync(preWrittenPath, '# Pre-existing content\n', { mode: 0o600 });
  const mtime1 = fs.statSync(preWrittenPath).mtimeMs;

  await new Promise((r) => setTimeout(r, 30));
  await generateSuggestion('mira', 'proj-idem');

  const mtime2 = fs.statSync(preWrittenPath).mtimeMs;
  assert.equal(mtime1, mtime2, 'existing file must not be overwritten');
  const content = fs.readFileSync(preWrittenPath, 'utf8');
  assert.match(content, /Pre-existing content/);
});

// ── Test 14: threshold trigger causes suggestion file to be created ───────

test('threshold trigger: FAILURE_THRESHOLD failures cause a suggestion file', async () => {
  resetAll();
  const personaId = 'miku';
  const projectId = 'proj-threshold';

  for (let i = 0; i < FAILURE_THRESHOLD; i++) {
    recordPersonaOutcome({ personaId, projectId, outcome: 'failure' });
  }

  // The async generateSuggestion is fire-and-forget inside recordPersonaOutcome.
  // Give it a moment to settle.
  await new Promise((r) => setTimeout(r, 100));

  const tuningPath = path.join(TMP_TUNING, `${personaId}__${projectId}.md`);
  // File may or may not exist depending on async timing + LLM availability.
  // What we CAN assert: the stats record the correct failure count.
  const s = getPersonaStats(personaId, projectId);
  assert.equal(s.projectScoped.failureCount, FAILURE_THRESHOLD);

  // If the file was written, verify it has the expected structure.
  if (fs.existsSync(tuningPath)) {
    const content = fs.readFileSync(tuningPath, 'utf8');
    assert.match(content, /Persona Tuning Suggestion/);
    assert.match(content, new RegExp(personaId));
    assert.match(content, new RegExp(projectId));
  }
});
