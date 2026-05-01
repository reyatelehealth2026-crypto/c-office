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

test('agents are persisted in JSON and can grow beyond the old persona count', async (t) => {
  const dir = makeSandbox('agents');
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  process.env.C_OFFICE_AGENTS_PATH = path.join(dir, 'agents.json');

  const store = await import('../server/store/agents.js');
  const base = store.listAgentsSync().length;
  assert.ok(base > 0, 'store seeds default agents when JSON is missing');

  for (let i = 0; i < 12; i += 1) {
    store.createAgent({
      name: `Dynamic ${i}`,
      role: 'Runtime configurable agent',
      provider: i % 2 ? 'codex' : 'claude',
      color: '#22d3ee',
      enabled: true,
      toolsAllowed: ['Read'],
      systemPrompt: 'Answer from the configured dynamic agent.',
    });
  }

  const agents = store.listAgentsSync();
  assert.equal(agents.length, base + 12);
  assert.ok(agents.some((agent) => agent.name === 'Dynamic 11'));
  assert.ok(agents.every((agent) => Array.isArray(agent.toolsAllowed)));

  const target = agents.find((agent) => agent.name === 'Dynamic 3');
  store.updateAgent(target.id, { name: 'Renamed Dynamic', enabled: false, toolsAllowed: ['Read', 'Write'] });
  assert.equal(store.getAgentSync(target.id).name, 'Renamed Dynamic');
  assert.equal(store.getAgentSync(target.id).enabled, false);
  assert.deepEqual(store.getAgentSync(target.id).toolsAllowed, ['Read', 'Write']);

  assert.equal(store.resolveAgentIdSync('Renamed Dynamic'), target.id);
  assert.equal(store.deleteAgent(target.id), true);
  assert.equal(store.getAgentSync(target.id), null);
});

test('state snapshot exposes dynamic agents as agents and personas aliases', async (t) => {
  const dir = makeSandbox('state');
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  process.env.C_OFFICE_AGENTS_PATH = path.join(dir, 'agents.json');
  process.env.C_OFFICE_TASK_BOARD_PATH = path.join(dir, 'task-board.json');
  process.env.C_OFFICE_THEME_PATH = path.join(dir, 'theme.json');

  const agentStore = await import('../server/store/agents.js');
  const { snapshot } = await import('../server/state.js');

  const created = agentStore.createAgent({
    id: 'dynamic-state-agent',
    name: 'Dynamic State Agent',
    role: 'Snapshot test agent',
    provider: 'claude',
    color: '#fbbf24',
    enabled: true,
    toolsAllowed: [],
    systemPrompt: 'Appear in /api/state.',
  });

  const s = snapshot();
  assert.ok(s.agents.some((agent) => agent.id === created.id));
  assert.ok(s.personas.some((agent) => agent.id === created.id));
  assert.equal(s.agents.length, s.personas.length);
  assert.ok(s.gameProgress.perAgent[created.id], 'game progress is derived for every dynamic agent');
});
