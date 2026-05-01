// Phase 4.1 — Eval harness tests
// Verifies CRUD operations and grade-record persistence.
// The grader SDK call is mocked so no API key is required.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Isolate to a temp directory so the real ~/.c-office/evals/ is never touched.
const TMP_EVALS = fs.mkdtempSync(path.join(os.tmpdir(), 'c-office-evals-'));
process.env.COFFICE_EVALS_DIR = TMP_EVALS;

const {
  createEval,
  getEval,
  listEvals,
  deleteEval,
  writeGrade,
  listGrades,
  findMatchingEval,
  gradeRunAgainstEval,
  setGraderFn,
  evalsDir,
} = await import('../server/agents/evals.js');

function cleanDir(dir) {
  for (const f of fs.readdirSync(dir)) {
    const full = path.join(dir, f);
    if (fs.statSync(full).isDirectory()) cleanDir(full);
    else fs.unlinkSync(full);
  }
}

function reset() {
  cleanDir(TMP_EVALS);
}

test('evalsDir respects COFFICE_EVALS_DIR env override', () => {
  assert.equal(evalsDir(), TMP_EVALS);
});

test('createEval requires goal and rubric', () => {
  assert.throws(() => createEval({}), /goal is required/);
  assert.throws(() => createEval({ goal: 'test' }), /rubric is required/);
});

test('createEval writes a JSON file and returns the record', () => {
  reset();
  const rec = createEval({ goal: 'analyze pricing', rubric: 'Must cite 3+ sources' });
  assert.ok(rec.id, 'should have an id');
  assert.equal(rec.goal, 'analyze pricing');
  assert.equal(rec.rubric, 'Must cite 3+ sources');
  assert.ok(rec.createdAt, 'should have createdAt');
  const filePath = path.join(TMP_EVALS, `${rec.id}.json`);
  assert.ok(fs.existsSync(filePath), 'file should exist on disk');
  const onDisk = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  assert.equal(onDisk.id, rec.id);
});

test('createEval stores optional referenceOutput and tags', () => {
  reset();
  const rec = createEval({
    goal: 'write a report',
    rubric: 'Clear structure',
    referenceOutput: 'Introduction... Body... Conclusion...',
    tags: ['report', 'writing'],
  });
  assert.equal(rec.referenceOutput, 'Introduction... Body... Conclusion...');
  assert.deepEqual(rec.tags, ['report', 'writing']);
});

test('getEval returns the record by id', () => {
  reset();
  const created = createEval({ goal: 'some goal', rubric: 'some rubric' });
  const fetched = getEval(created.id);
  assert.ok(fetched, 'should return a record');
  assert.equal(fetched.id, created.id);
  assert.equal(fetched.goal, 'some goal');
});

test('getEval returns null for unknown id', () => {
  reset();
  assert.equal(getEval('nonexistent_id'), null);
});

test('listEvals returns all persisted evals sorted newest-first', () => {
  reset();
  createEval({ goal: 'goal alpha', rubric: 'rubric 1' });
  createEval({ goal: 'goal beta', rubric: 'rubric 2' });
  createEval({ goal: 'goal gamma', rubric: 'rubric 3' });
  const list = listEvals();
  assert.equal(list.length, 3);
  assert.ok(list[0].createdAt >= list[1].createdAt, 'should be sorted newest-first');
});

test('deleteEval removes the file and returns true', () => {
  reset();
  const rec = createEval({ goal: 'to delete', rubric: 'rubric' });
  const filePath = path.join(TMP_EVALS, `${rec.id}.json`);
  assert.ok(fs.existsSync(filePath));
  const result = deleteEval(rec.id);
  assert.equal(result, true);
  assert.ok(!fs.existsSync(filePath), 'file should be gone');
});

test('deleteEval returns false for unknown id', () => {
  reset();
  assert.equal(deleteEval('nonexistent'), false);
});

test('writeGrade stores a grade record under grades/ sub-directory', () => {
  reset();
  const ev = createEval({ goal: 'grade test', rubric: 'rubric' });
  const grade = writeGrade(ev.id, 'run_abc123', { score: 0.85, verdict: 'Good output' });
  assert.equal(grade.evalId, ev.id);
  assert.equal(grade.runId, 'run_abc123');
  assert.ok(grade.score >= 0 && grade.score <= 1);
  assert.equal(grade.verdict, 'Good output');
  assert.ok(grade.ts, 'should have a ts field');

  const gradesDir = path.join(TMP_EVALS, 'grades');
  assert.ok(fs.existsSync(gradesDir));
  const files = fs.readdirSync(gradesDir).filter((f) => f.endsWith('.json'));
  assert.ok(files.length >= 1, 'grade file should exist on disk');
  const onDisk = JSON.parse(fs.readFileSync(path.join(gradesDir, files[0]), 'utf8'));
  assert.equal(onDisk.evalId, ev.id);
  assert.equal(onDisk.runId, 'run_abc123');
});

test('writeGrade clamps score to [0, 1]', () => {
  reset();
  const ev = createEval({ goal: 'clamp test', rubric: 'rubric' });
  const g1 = writeGrade(ev.id, 'run_over', { score: 1.5, verdict: 'high' });
  const g2 = writeGrade(ev.id, 'run_under', { score: -0.5, verdict: 'low' });
  assert.equal(g1.score, 1);
  assert.equal(g2.score, 0);
});

test('listGrades returns only grades for the specified eval', () => {
  reset();
  const ev1 = createEval({ goal: 'goal one', rubric: 'rubric' });
  const ev2 = createEval({ goal: 'goal two', rubric: 'rubric' });
  writeGrade(ev1.id, 'run_a', { score: 0.9, verdict: 'good' });
  writeGrade(ev1.id, 'run_b', { score: 0.7, verdict: 'ok' });
  writeGrade(ev2.id, 'run_c', { score: 0.5, verdict: 'poor' });

  const gradesEv1 = listGrades(ev1.id);
  assert.equal(gradesEv1.length, 2);
  assert.ok(gradesEv1.every((g) => g.evalId === ev1.id));

  const gradesEv2 = listGrades(ev2.id);
  assert.equal(gradesEv2.length, 1);
  assert.equal(gradesEv2[0].runId, 'run_c');
});

test('listGrades returns empty array when no grades exist', () => {
  reset();
  const ev = createEval({ goal: 'ungraded goal', rubric: 'rubric' });
  assert.deepEqual(listGrades(ev.id), []);
});

test('findMatchingEval returns exact match (case-insensitive)', () => {
  reset();
  const ev = createEval({ goal: 'Analyze Competitor Pricing', rubric: 'rubric' });
  const match = findMatchingEval('analyze competitor pricing');
  assert.ok(match, 'should find a match');
  assert.equal(match.matchType, 'exact');
  assert.equal(match.eval.id, ev.id);
});

test('findMatchingEval returns tag-overlap match when no exact match', () => {
  reset();
  createEval({ goal: 'research competitor pricing strategies for fintech', rubric: 'rubric' });
  const match = findMatchingEval('analyze pricing strategies competitor fintech market');
  assert.ok(match, 'should find a tag-overlap match');
  assert.equal(match.matchType, 'tag');
});

test('findMatchingEval returns null when no eval matches', () => {
  reset();
  createEval({ goal: 'write a blog post about climate change', rubric: 'rubric' });
  const match = findMatchingEval('build a React login component');
  assert.equal(match, null);
});

test('gradeRunAgainstEval calls injected grader and persists the grade', async () => {
  reset();
  const ev = createEval({ goal: 'exact grade goal', rubric: 'Must be useful' });

  let graderCalled = false;
  setGraderFn(async (_evalRec, _finalText) => {
    graderCalled = true;
    return { score: 0.9, verdict: 'Mocked: looks good' };
  });

  const mockRun = {
    id: 'run_mock_grade',
    status: 'done',
    goal: 'exact grade goal',
    final: 'This is the final output.',
  };

  const grade = await gradeRunAgainstEval(mockRun);
  assert.ok(graderCalled, 'grader function should have been called');
  assert.ok(grade, 'should return a grade record');
  assert.equal(grade.evalId, ev.id);
  assert.equal(grade.runId, 'run_mock_grade');
  assert.ok(Math.abs(grade.score - 0.9) < 1e-9);
  assert.equal(grade.verdict, 'Mocked: looks good');

  const persisted = listGrades(ev.id);
  assert.ok(persisted.length >= 1, 'grade should be persisted to disk');

  setGraderFn(null);
});

test('gradeRunAgainstEval returns null for runs without final output', async () => {
  reset();
  setGraderFn(async () => ({ score: 1, verdict: 'should not reach here' }));
  const r1 = await gradeRunAgainstEval({ id: 'r1', status: 'done', goal: 'g', final: null });
  const r2 = await gradeRunAgainstEval({ id: 'r2', status: 'failed', goal: 'g', final: 'output' });
  assert.equal(r1, null);
  assert.equal(r2, null);
  setGraderFn(null);
});

test('gradeRunAgainstEval returns null when no eval matches the run goal', async () => {
  reset();
  setGraderFn(async () => ({ score: 1, verdict: 'should not reach here' }));
  const result = await gradeRunAgainstEval({
    id: 'r3',
    status: 'done',
    goal: 'completely unrelated obscure xyz goal with unique words',
    final: 'some output',
  });
  assert.equal(result, null);
  setGraderFn(null);
});
