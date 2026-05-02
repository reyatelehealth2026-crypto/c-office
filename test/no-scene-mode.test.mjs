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

test('dashboard keeps OpenClaw-style operations summary cues', () => {
  assert.match(dashboard, /Office floor/);
  assert.match(dashboard, /sessions/);
  assert.match(dashboard, /Tokens today/);
  assert.match(dashboard, /Running tasks/);
  assert.match(dashboard, /Agents online/);
  assert.match(dashboard, /Spend today/);
  assert.match(dashboard, /Live Activity/);
  assert.match(dashboard, /Active Agents/);
});

test('dashboard does not reintroduce scene or adventure launch controls', () => {
  assert.doesNotMatch(dashboard, /SceneOverlay|openScene|SceneLaunchPage/);
  assert.doesNotMatch(dashboard, /AdventurePage|page-adventure|adventure mode/i);
});
