import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const nav = readFileSync(new URL('../public/components.jsx', import.meta.url), 'utf8');
const notes = readFileSync(new URL('../public/page-notes.jsx', import.meta.url), 'utf8');
const detail = readFileSync(new URL('../public/page-detail.jsx', import.meta.url), 'utf8');
const guild = readFileSync(new URL('../public/page-guild.jsx', import.meta.url), 'utf8');
const dashboard = readFileSync(new URL('../public/page-dashboard.jsx', import.meta.url), 'utf8');

test('app no longer loads or routes scene and adventure modes', () => {
  assert.doesNotMatch(html, /page-scene\.jsx|scene\.css|SceneOverlay|SceneLaunchPage/);
  assert.doesNotMatch(html, /page-adventure\.jsx|adventure\.css|AdventurePage/);
  assert.doesNotMatch(nav, /label:\s*'Scene'|label:\s*'Adventure'/);
});

test('loaded interaction surfaces dispatch inline without opening scene overlays', () => {
  for (const [name, source] of [
    ['notes', notes],
    ['detail', detail],
    ['guild', guild],
  ]) {
    assert.doesNotMatch(source, /window\.openScene/, `${name} should not call openScene`);
  }
});

test('dashboard first screen exposes sim office workfloor cues', () => {
  assert.match(dashboard, /Sim Office/);
  assert.match(dashboard, /SIM OFFICE CONTROL/);
  assert.match(dashboard, /dashboard-office-floor/);
  assert.match(dashboard, /office-room-backdrop/);
  assert.match(dashboard, /AgentModelUnit/);
});
