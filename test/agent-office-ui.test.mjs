import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const page = readFileSync(new URL('../public/page-agents.jsx', import.meta.url), 'utf8');
const dashboard = readFileSync(new URL('../public/page-dashboard.jsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../public/agent-office.css', import.meta.url), 'utf8');
const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');

test('agents page renders the HUD office model layout', () => {
  assert.match(page, /AgentModelUnit/);
  assert.match(page, /agent-party-stage/);
  assert.match(page, /agent-model-portrait/);
  assert.match(page, /SIM OFFICE CONTROL/);
  assert.match(page, /agent-workstation/);
  assert.match(page, /workstation-monitor/);
  assert.match(page, /Workload/);
  assert.match(page, /Energy/);
  assert.doesNotMatch(page, /<AgentCard/);
});

test('agents page exposes character generation controls with nano banana pro', () => {
  assert.match(page, /CharacterImagePanel/);
  assert.match(page, /\/api\/images\/generate/);
  assert.match(page, /Nano Banana 2 Pro/);
});

test('agents page is not locked to the original fixed persona id groups', () => {
  assert.doesNotMatch(page, /ids:\s*\[/);
  assert.match(page, /AgentEditorPanel/);
  assert.match(page, /\/api\/agents/);
});

test('dashboard and office views rely on dynamic agent collections, not fixed nine slots', () => {
  assert.match(page, /agents\.map/);
  assert.match(page, /filtered\.map/);
  assert.match(page, /new Set\(agents\.map/);
  assert.doesNotMatch(page, /slice\(0,\s*9\)/);
});

test('dashboard rendering keeps defensive fallbacks for sparse agent or run data', () => {
  assert.match(page, /agent\?\.id/);
  assert.match(page, /agent\?\.generatedImage/);
  assert.match(page, /agents\[0\]\?\.id \|\| ''/);
  assert.match(page, /window\.PROVIDERS\?\.default \|\| 'claude'/);
});

test('dashboard checks Codex CLI login independently from OpenAI image keys', () => {
  assert.match(dashboard, /authStatus\.codex\?\.connected/);
  assert.match(dashboard, /Codex CLI/);
  // OpenAI Images row removed from the providers panel by design — image
  // generation is routed through Codex CLI / Gemini.
});

test('agent office stylesheet is loaded and defines workroom pieces', () => {
  assert.match(html, /agent-office\.css/);
  assert.match(css, /\.agent-party-stage/);
  assert.match(css, /\.agent-model-unit/);
  assert.match(css, /\.agent-brief-panel/);
  assert.match(css, /\.agent-workstation/);
  assert.match(css, /\.workstation-chair/);
  assert.match(css, /\.office-coffee-bar/);
});
