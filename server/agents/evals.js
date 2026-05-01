// Eval harness — record (goal, rubric) pairs and grade later runs.
//
// An eval captures the desired quality bar for a recurring goal type. After
// each successful run, if the run's goal matches an existing eval (by exact
// string match or tag overlap), a one-shot grader compares the final output
// to the rubric and stores a grade record.
//
// Storage layout:
//   ~/.c-office/evals/<id>.json                           — eval definition
//   ~/.c-office/evals/grades/<evalId>__<runId>.json       — grade record

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';

const EVALS_DIR = process.env.COFFICE_EVALS_DIR || path.join(os.homedir(), '.c-office', 'evals');
const GRADES_DIR = path.join(EVALS_DIR, 'grades');

function ensureDirs() {
  try { fs.mkdirSync(EVALS_DIR,  { recursive: true }); } catch { /* best effort */ }
  try { fs.mkdirSync(GRADES_DIR, { recursive: true }); } catch { /* best effort */ }
}

function evalPath(id) {
  const safe = String(id).replace(/[^a-zA-Z0-9_.-]/g, '_');
  return path.join(EVALS_DIR, `${safe}.json`);
}

function gradePath(evalId, runId) {
  const safeE = String(evalId).replace(/[^a-zA-Z0-9_.-]/g, '_');
  const safeR = String(runId).replace(/[^a-zA-Z0-9_.-]/g, '_');
  return path.join(GRADES_DIR, `${safeE}__${safeR}.json`);
}

// ── CRUD ──────────────────────────────────────────────────────────────────

export function createEval({ goal, rubric, referenceOutput, tags } = {}) {
  const trimGoal = String(goal || '').trim();
  const trimRubric = String(rubric || '').trim();
  if (!trimGoal) throw new Error('goal is required');
  if (!trimRubric) throw new Error('rubric is required');

  ensureDirs();
  const id = `eval_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`;
  const record = {
    id,
    goal: trimGoal,
    rubric: trimRubric,
    referenceOutput: referenceOutput ? String(referenceOutput).slice(0, 4000) : undefined,
    tags: Array.isArray(tags) ? tags.map(String) : [],
    createdAt: new Date().toISOString(),
  };
  fs.writeFileSync(evalPath(id), JSON.stringify(record, null, 2), { mode: 0o600 });
  return record;
}

export function getEval(id) {
  try {
    return JSON.parse(fs.readFileSync(evalPath(id), 'utf8'));
  } catch {
    return null;
  }
}

export function listEvals() {
  ensureDirs();
  let files;
  try {
    files = fs.readdirSync(EVALS_DIR).filter((f) => f.endsWith('.json'));
  } catch {
    return [];
  }
  const out = [];
  for (const f of files) {
    try {
      const rec = JSON.parse(fs.readFileSync(path.join(EVALS_DIR, f), 'utf8'));
      if (rec?.id) out.push(rec);
    } catch { /* skip malformed */ }
  }
  return out.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

export function deleteEval(id) {
  try {
    fs.unlinkSync(evalPath(id));
    return true;
  } catch {
    return false;
  }
}

// ── Grade records ──────────────────────────────────────────────────────────

export function writeGrade(evalId, runId, gradeData) {
  ensureDirs();
  const record = {
    evalId,
    runId,
    score: Math.max(0, Math.min(1, Number(gradeData?.score ?? 0))),
    verdict: String(gradeData?.verdict || '').slice(0, 500),
    ts: new Date().toISOString(),
  };
  fs.writeFileSync(gradePath(evalId, runId), JSON.stringify(record, null, 2), { mode: 0o600 });
  return record;
}

export function listGrades(evalId) {
  ensureDirs();
  let files;
  try {
    files = fs.readdirSync(GRADES_DIR)
      .filter((f) => f.startsWith(`${String(evalId).replace(/[^a-zA-Z0-9_.-]/g, '_')}__`) && f.endsWith('.json'));
  } catch {
    return [];
  }
  const out = [];
  for (const f of files) {
    try {
      const rec = JSON.parse(fs.readFileSync(path.join(GRADES_DIR, f), 'utf8'));
      if (rec?.evalId) out.push(rec);
    } catch { /* skip */ }
  }
  return out.sort((a, b) => String(b.ts).localeCompare(String(a.ts)));
}

// ── Matching logic ──────────────────────────────────────────────────────────

function extractWords(text) {
  const stop = new Set([
    'this','that','with','from','have','will','about','into','they','them',
    'their','then','than','what','when','where','which','while','would',
    'could','should','make','need',
  ]);
  const words = String(text || '').toLowerCase().match(/[a-z][a-z0-9]{3,}/g) || [];
  return words.filter((w) => !stop.has(w));
}

// Returns null (no match) or { eval, matchType: 'exact'|'tag' }.
export function findMatchingEval(goal) {
  const evals = listEvals();
  if (!evals.length) return null;

  const trimGoal = String(goal || '').trim().toLowerCase();

  // 1. Exact match (case-insensitive)
  const exact = evals.find((e) => String(e.goal).trim().toLowerCase() === trimGoal);
  if (exact) return { eval: exact, matchType: 'exact' };

  // 2. Tag overlap — require at least 2 shared content words
  const goalWords = new Set(extractWords(goal));
  let best = null;
  let bestCount = 1; // threshold: more than 1 overlap required
  for (const ev of evals) {
    const evalWords = extractWords(ev.goal);
    let overlap = 0;
    for (const w of evalWords) if (goalWords.has(w)) overlap++;
    if (overlap > bestCount) {
      bestCount = overlap;
      best = ev;
    }
  }
  if (best) return { eval: best, matchType: 'tag' };

  return null;
}

// ── Grader ────────────────────────────────────────────────────────────────
//
// _graderFn is injectable so tests can mock without needing API keys.
// The default implementation uses Claude Haiku via the Agent SDK.

let _graderFn = null;

export function setGraderFn(fn) {
  _graderFn = fn;
}

async function defaultGraderFn(evalRecord, finalText) {
  const { query } = await import('@anthropic-ai/claude-agent-sdk');

  const prompt = [
    'You are an impartial grader. Score the following AI output against the rubric.',
    '',
    '## Rubric',
    evalRecord.rubric,
    '',
    evalRecord.referenceOutput
      ? `## Reference output\n${String(evalRecord.referenceOutput).slice(0, 2000)}\n`
      : '',
    '## Output to grade',
    String(finalText || '').slice(0, 3000),
    '',
    'Reply with ONLY a JSON object: {"score": <0.0-1.0>, "verdict": "<one sentence>"}',
  ].join('\n');

  let rawText = '';
  for await (const msg of query({
    prompt,
    options: {
      model: 'claude-haiku-4-5',
      maxTurns: 1,
      permissionMode: 'dontAsk',
    },
  })) {
    if (msg.type === 'assistant') {
      const content = msg?.message?.content;
      if (Array.isArray(content)) {
        rawText += content
          .filter((b) => b?.type === 'text')
          .map((b) => b.text || '')
          .join('');
      }
    }
  }

  const m = rawText.match(/\{[\s\S]*\}/);
  if (!m) {
    return { score: 0, verdict: `Grader returned unparseable output: ${rawText.slice(0, 120)}` };
  }
  try {
    const parsed = JSON.parse(m[0]);
    return {
      score: Math.max(0, Math.min(1, Number(parsed.score) || 0)),
      verdict: String(parsed.verdict || '').slice(0, 500),
    };
  } catch {
    return { score: 0, verdict: `JSON parse error in grader output: ${rawText.slice(0, 120)}` };
  }
}

// Called by runner after a successful run. Best-effort — never throws.
export async function gradeRunAgainstEval(run) {
  if (!run || run.status !== 'done' || !run.final) return null;
  try {
    const match = findMatchingEval(run.goal);
    if (!match) return null;

    const graderFn = _graderFn || defaultGraderFn;
    const gradeData = await graderFn(match.eval, run.final);
    return writeGrade(match.eval.id, run.id, gradeData);
  } catch {
    return null; // best effort — never interrupt the run
  }
}

export function evalsDir() {
  return EVALS_DIR;
}
