// Audit trail — append-only JSONL log of every pipeline decision.
//
// One file per run at ~/.c-office/audit/<runId>.jsonl
// Each line is a JSON object: { ts, runId, kind, payload }
//
// Decisions logged by runner.js:
//   plan-emitted       — planner produced a plan
//   plan-template      — workflow template used instead of planner
//   plan-error         — planner failed
//   delegation-start   — a persona was delegated to
//   delegation-result  — delegation returned (ok or error)
//   critique-done      — critic returned severity
//   verify-done        — verifier returned pass/fail
//   gate-pending       — pipeline paused awaiting approval
//   gate-approved      — gate cleared by user
//   gate-rejected      — gate rejected by user
//   budget-exceeded    — cost ceiling hit
//   run-done           — run completed successfully
//   run-failed         — run ended with failure

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const AUDIT_DIR = process.env.COFFICE_AUDIT_DIR || path.join(os.homedir(), '.c-office', 'audit');

function ensureDir() {
  try { fs.mkdirSync(AUDIT_DIR, { recursive: true }); } catch { /* best effort */ }
}

function auditPath(runId) {
  const safe = String(runId).replace(/[^a-zA-Z0-9_.-]/g, '_');
  return path.join(AUDIT_DIR, `${safe}.jsonl`);
}

/**
 * Append one audit entry to ~/.c-office/audit/<runId>.jsonl.
 * Best-effort — never throws so the pipeline is never disrupted.
 *
 * @param {string} runId
 * @param {string} kind     - event kind identifier (see list above)
 * @param {object} payload  - arbitrary structured data for this decision
 */
export function appendAudit(runId, kind, payload = {}) {
  if (!runId || !kind) return;
  ensureDir();
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    runId: String(runId),
    kind: String(kind),
    payload,
  }) + '\n';
  try {
    fs.appendFileSync(auditPath(runId), line, { mode: 0o600 });
  } catch {
    /* best effort — disk failure must not interrupt the pipeline */
  }
}

/**
 * Read the full JSONL audit log for a run as a raw string.
 * Returns an empty string if the file does not exist.
 *
 * @param {string} runId
 * @returns {string}
 */
export function readAuditLog(runId) {
  try {
    return fs.readFileSync(auditPath(runId), 'utf8');
  } catch {
    return '';
  }
}

/**
 * Parse the JSONL audit log for a run into an array of entry objects.
 * Malformed lines are skipped.
 *
 * @param {string} runId
 * @returns {Array<{ts: string, runId: string, kind: string, payload: object}>}
 */
export function parseAuditLog(runId) {
  const raw = readAuditLog(runId);
  if (!raw) return [];
  const entries = [];
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      entries.push(JSON.parse(trimmed));
    } catch {
      /* skip malformed lines */
    }
  }
  return entries;
}

export function auditDir() {
  return AUDIT_DIR;
}
