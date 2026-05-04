import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const page = readFileSync(new URL('../public/page-agents.jsx', import.meta.url), 'utf8');
const dashboard = readFileSync(new URL('../public/page-dashboard.jsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../public/agent-office.css', import.meta.url), 'utf8');
const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');

test('agents page renders the SIM office workfloor layout', () => {
  // 2026-05 redesign: AgentModelUnit → DeskTile, agent-party-stage → wf-floor,
  // agent-workstation → wf-desk-stage. The intent is unchanged: SIM office
  // concept with desk + monitor + live workload/energy meters.
  assert.match(page, /DeskTile/);
  assert.match(page, /wf-floor/);
  assert.match(page, /wf-portrait/);
  assert.match(page, /Sim Office Control/i);
  assert.match(page, /wf-desk-stage/);
  assert.match(page, /wf-monitor/);
  assert.match(page, /workload/i);
  assert.match(page, /energy/i);
  assert.doesNotMatch(page, /<AgentCard/);
});

test('agents page exposes free-form image generation across all three providers', () => {
  // 2026-05 redesign: CharacterImagePanel → InspectorImageLab. No rigid
  // Look Lock UI — user types a free prompt; provider tabs cover codex CLI,
  // 3.1 flash gen, and nano banana 2 pro.
  assert.match(page, /InspectorImageLab/);
  assert.match(page, /\/api\/images\/generate/);
  assert.match(page, /nanobanana-2-pro/);
  assert.match(page, /codex-image2/);
  assert.match(page, /Style hints/);
});

test('agents page is not locked to the original fixed persona id groups', () => {
  assert.doesNotMatch(page, /ids:\s*\[/);
  // 2026-05 redesign: AgentEditorPanel → Inspector + InspectorProfile.
  assert.match(page, /InspectorProfile/);
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
