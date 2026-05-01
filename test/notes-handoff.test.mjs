import assert from 'node:assert/strict';
import { mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

function makeSandbox(name) {
  const dir = path.join(tmpdir(), `c-office-${name}-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

test('note dispatch resolves explicit handoff targets from dynamic agent JSON', async (t) => {
  const dir = makeSandbox('notes-handoff');
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  process.env.C_OFFICE_AGENTS_PATH = path.join(dir, 'agents.json');

  const store = await import('../server/store/agents.js');
  const created = store.createAgent({
    id: 'visual-crafter',
    name: 'Visual Crafter',
    role: 'Generates visual assets',
    provider: 'claude',
    enabled: true,
  });
  const { resolveHandoffAgentId } = await import('../server/api/notes.js');

  assert.equal(resolveHandoffAgentId('@visual-crafter render this image', 'orchestra'), created.id);
  assert.equal(resolveHandoffAgentId('ส่งต่อ Visual Crafter ไปวาดภาพนี้', 'orchestra'), created.id);
  assert.equal(resolveHandoffAgentId('continue with the current agent only', 'orchestra'), null);
});
