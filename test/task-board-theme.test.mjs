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

test('task board stores backlog/running/review/done cards with event history', async (t) => {
  const dir = makeSandbox('board');
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  process.env.C_OFFICE_TASK_BOARD_PATH = path.join(dir, 'task-board.json');

  const board = await import('../server/store/task-board.js');
  const task = board.createBoardTask({
    title: 'Wire dynamic monitor',
    agentId: 'orchestra',
    provider: 'claude',
  });
  assert.equal(task.status, 'backlog');
  assert.equal(task.events.length, 1);

  const running = board.updateBoardTask(task.id, { status: 'running', runStatus: 'thinking' });
  const review = board.updateBoardTask(task.id, { status: 'review', event: 'provider responded' });
  const done = board.updateBoardTask(task.id, { status: 'done', runStatus: 'complete' });

  assert.equal(running.status, 'running');
  assert.equal(review.status, 'review');
  assert.equal(done.status, 'done');
  assert.ok(done.events.length >= 4);
  assert.equal(board.getTaskBoardSync().columns.done[0].id, task.id);
});

test('theme engine accepts only configured office themes', async (t) => {
  const dir = makeSandbox('theme');
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  process.env.C_OFFICE_THEME_PATH = path.join(dir, 'theme.json');

  const theme = await import('../server/store/theme.js');
  assert.deepEqual(theme.listThemes(), ['anime_command', 'dark_ops', 'game_guild', 'rpg_guild']);
  assert.equal(theme.getThemeState().theme, 'game_guild');
  assert.equal(theme.setTheme('dark_ops').theme, 'dark_ops');
  assert.throws(() => theme.setTheme('jrpg_only'), /unknown theme/);
});
