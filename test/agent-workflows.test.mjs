import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'c-office-workflows-'));
process.env.COFFICE_WORKFLOWS_DIR = TMP_DIR;

const { listWorkflows, getWorkflow, workflowsDir } =
  await import('../server/agents/workflows.js');

function clean() {
  for (const f of fs.readdirSync(TMP_DIR)) fs.unlinkSync(path.join(TMP_DIR, f));
}

test('workflowsDir reflects env override', () => {
  assert.equal(workflowsDir(), TMP_DIR);
});

test('built-in workflows are always available', () => {
  clean();
  const wfs = listWorkflows();
  assert.ok(wfs['research-write-publish']);
  assert.ok(wfs['code-review-ship']);
  assert.ok(wfs['content-brief-distribute']);
});

test('built-in workflow plans have valid structure', () => {
  const wf = getWorkflow('research-write-publish');
  assert.ok(Array.isArray(wf.plan));
  assert.ok(wf.plan.length >= 2);
  for (const step of wf.plan) {
    assert.equal(typeof step.persona, 'string');
    assert.equal(typeof step.instruction, 'string');
  }
});

test('disk workflow files are loaded and merged with built-ins', () => {
  clean();
  fs.writeFileSync(path.join(TMP_DIR, 'custom.json'), JSON.stringify({
    name: 'my-custom',
    description: 'Custom test workflow',
    plan: [
      { persona: 'kai', instruction: 'do thing', depends_on: null },
      { persona: 'vex', instruction: 'review thing', depends_on: 0 },
    ],
  }));
  const wfs = listWorkflows();
  assert.ok(wfs['my-custom']);
  assert.equal(wfs['my-custom'].plan.length, 2);
  assert.ok(wfs['research-write-publish']);
});

test('malformed workflow files are skipped, not thrown', () => {
  clean();
  fs.writeFileSync(path.join(TMP_DIR, 'broken.json'), '{ not valid json');
  fs.writeFileSync(path.join(TMP_DIR, 'incomplete.json'), JSON.stringify({ name: 'x' }));
  const wfs = listWorkflows();
  assert.ok(wfs['research-write-publish']);
  assert.equal(wfs['x'], undefined);
});

test('getWorkflow returns null for unknown name', () => {
  assert.equal(getWorkflow('nope'), null);
  assert.equal(getWorkflow(''), null);
  assert.equal(getWorkflow(null), null);
});

test('disk workflow overrides built-in with same name', () => {
  clean();
  fs.writeFileSync(path.join(TMP_DIR, 'override.json'), JSON.stringify({
    name: 'research-write-publish',
    description: 'overridden',
    plan: [{ persona: 'kai', instruction: 'override step', depends_on: null }],
  }));
  const wf = getWorkflow('research-write-publish');
  assert.equal(wf.description, 'overridden');
  assert.equal(wf.plan.length, 1);
});
