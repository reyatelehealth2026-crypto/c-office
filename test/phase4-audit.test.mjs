// Phase 4.4 — Audit trail tests
// Verifies appendAudit creates the JSONL file, multiple appends are read back
// in order, parseAuditLog parses correctly, and malformed lines are skipped.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Isolate to a temp directory so the real ~/.c-office/audit/ is never touched.
const TMP_AUDIT = fs.mkdtempSync(path.join(os.tmpdir(), 'c-office-audit-'));
process.env.COFFICE_AUDIT_DIR = TMP_AUDIT;

const { appendAudit, readAuditLog, parseAuditLog, auditDir } = await import('../server/agents/audit.js');

function reset() {
  for (const f of fs.readdirSync(TMP_AUDIT)) fs.unlinkSync(path.join(TMP_AUDIT, f));
}

test('auditDir respects COFFICE_AUDIT_DIR env override', () => {
  assert.equal(auditDir(), TMP_AUDIT);
});

test('appendAudit creates the JSONL file on first call', () => {
  reset();
  appendAudit('run_audit_1', 'plan-emitted', { steps: 3 });
  const files = fs.readdirSync(TMP_AUDIT).filter((f) => f.endsWith('.jsonl'));
  assert.ok(files.length >= 1, 'at least one .jsonl file should exist');
});

test('appendAudit writes a valid JSON line with ts, runId, kind, payload', () => {
  reset();
  appendAudit('run_audit_2', 'delegation-start', { persona: 'nyx', description: 'research task' });
  const raw = fs.readFileSync(path.join(TMP_AUDIT, 'run_audit_2.jsonl'), 'utf8');
  const parsed = JSON.parse(raw.trim());
  assert.equal(parsed.runId, 'run_audit_2');
  assert.equal(parsed.kind, 'delegation-start');
  assert.ok(parsed.ts, 'should have a ts field');
  assert.equal(parsed.payload.persona, 'nyx');
  assert.equal(parsed.payload.description, 'research task');
});

test('appendAudit ts field is an ISO 8601 string', () => {
  reset();
  appendAudit('run_audit_ts', 'run-done', {});
  const raw = fs.readFileSync(path.join(TMP_AUDIT, 'run_audit_ts.jsonl'), 'utf8');
  const parsed = JSON.parse(raw.trim());
  assert.match(parsed.ts, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
});

test('multiple appendAudit calls accumulate lines in order', () => {
  reset();
  const runId = 'run_audit_order';
  appendAudit(runId, 'plan-emitted', { steps: 2 });
  appendAudit(runId, 'delegation-start', { persona: 'nyx' });
  appendAudit(runId, 'delegation-result', { persona: 'nyx', ok: true });
  appendAudit(runId, 'critique-done', { severity: 'none' });
  appendAudit(runId, 'verify-done', { passed: true });
  appendAudit(runId, 'run-done', { revisions: 0 });

  const entries = parseAuditLog(runId);
  assert.equal(entries.length, 6, 'should have 6 entries');
  assert.equal(entries[0].kind, 'plan-emitted');
  assert.equal(entries[1].kind, 'delegation-start');
  assert.equal(entries[2].kind, 'delegation-result');
  assert.equal(entries[3].kind, 'critique-done');
  assert.equal(entries[4].kind, 'verify-done');
  assert.equal(entries[5].kind, 'run-done');
});

test('readAuditLog returns empty string for unknown runId', () => {
  reset();
  assert.equal(readAuditLog('nonexistent_run_xyz'), '');
});

test('parseAuditLog returns empty array for unknown runId', () => {
  reset();
  assert.deepEqual(parseAuditLog('nonexistent_run_xyz'), []);
});

test('parseAuditLog skips malformed lines without throwing', () => {
  reset();
  const runId = 'run_audit_malformed';
  const filePath = path.join(TMP_AUDIT, `${runId}.jsonl`);
  fs.writeFileSync(filePath, [
    JSON.stringify({ ts: '2026-05-02T05:00:00.000Z', runId, kind: 'plan-emitted', payload: {} }),
    '{ this is not valid json !!!',
    JSON.stringify({ ts: '2026-05-02T05:01:00.000Z', runId, kind: 'run-done', payload: {} }),
    '',
  ].join('\n'), { mode: 0o600 });

  const entries = parseAuditLog(runId);
  assert.equal(entries.length, 2, 'should parse only the 2 valid lines, skipping the malformed one');
  assert.equal(entries[0].kind, 'plan-emitted');
  assert.equal(entries[1].kind, 'run-done');
});

test('appendAudit is a no-op for empty runId or empty kind', () => {
  reset();
  appendAudit('', 'plan-emitted', {});
  appendAudit('run_noop', '', {});
  const files = fs.readdirSync(TMP_AUDIT).filter((f) => f.endsWith('.jsonl'));
  assert.equal(files.length, 0, 'no files should be created when runId or kind is empty');
});

test('each run gets its own separate JSONL file', () => {
  reset();
  appendAudit('run_file_a', 'plan-emitted', { steps: 1 });
  appendAudit('run_file_b', 'run-done', { revisions: 0 });
  appendAudit('run_file_a', 'run-done', { revisions: 1 });

  const filesA = fs.readdirSync(TMP_AUDIT).filter((f) => f.includes('run_file_a'));
  const filesB = fs.readdirSync(TMP_AUDIT).filter((f) => f.includes('run_file_b'));
  assert.equal(filesA.length, 1, 'run_file_a should have exactly one file');
  assert.equal(filesB.length, 1, 'run_file_b should have exactly one file');

  assert.equal(parseAuditLog('run_file_a').length, 2, 'run_file_a should have 2 entries');
  assert.equal(parseAuditLog('run_file_b').length, 1, 'run_file_b should have 1 entry');
});

test('payload fields are stored and retrieved correctly', () => {
  reset();
  const runId = 'run_payload_test';
  appendAudit(runId, 'budget-exceeded', { phase: 'execute', totalUsd: 5.01, ceilingUsd: 5.0 });
  appendAudit(runId, 'gate-pending', { phase: 'verify' });
  appendAudit(runId, 'gate-approved', { phase: 'verify' });

  const entries = parseAuditLog(runId);
  assert.equal(entries.length, 3);
  assert.equal(entries[0].payload.phase, 'execute');
  assert.ok(Math.abs(entries[0].payload.totalUsd - 5.01) < 1e-9);
  assert.equal(entries[1].payload.phase, 'verify');
  assert.equal(entries[2].kind, 'gate-approved');
});
