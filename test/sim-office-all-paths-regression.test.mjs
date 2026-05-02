import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const agents = readFileSync(new URL('../public/page-agents.jsx', import.meta.url), 'utf8');
const detail = readFileSync(new URL('../public/page-detail.jsx', import.meta.url), 'utf8');
const notes = readFileSync(new URL('../public/page-notes.jsx', import.meta.url), 'utf8');
const misc = readFileSync(new URL('../public/page-misc.jsx', import.meta.url), 'utf8');
const memory = readFileSync(new URL('../public/page-memory.jsx', import.meta.url), 'utf8');

test('visible primary path sources keep sim office and operations cues', () => {
  assert.match(agents, /SIM OFFICE CONTROL/);
  assert.match(agents, /Workfloor/);
  assert.match(agents, /workstation/i);
  assert.match(notes, /assign owner/i);
  assert.match(misc, /Operations\s*<span className="accent">Log<\/span>/);
  assert.match(misc, /Control Room\s*<span className="accent">Settings<\/span>/);
  assert.match(memory, /Knowledge\s*<span className="accent">Archive<\/span>/);
  assert.match(memory, /Playbook coverage matrix across all staff/);
});

test('app routes stay on primary office paths without scene/adventure pages', () => {
  assert.doesNotMatch(html, /page-scene\.jsx|scene\.css|SceneOverlay|SceneLaunchPage/);
  assert.doesNotMatch(html, /page-adventure\.jsx|adventure\.css|AdventurePage/);
  assert.doesNotMatch(html, /page === 'scene'|page === 'adventure'/);
});

test('sparse and dynamic guards stay in place for agent detail, notes, and memory views', () => {
  assert.match(detail, /Array\.isArray\(agent\.traits\) \? agent\.traits : \[\]/);
  assert.match(detail, /const skills = Array\.isArray\(agent\.skills\) \? agent\.skills : \[\]/);
  assert.match(detail, /const personality = \(agent\.personality && typeof agent\.personality === 'object'\) \? agent\.personality : \{\}/);
  assert.match(detail, /const stats = agent\.stats \|\| \{ tasks: 0, success: 0, uptime: '-', tokens: 0 \}/);
  assert.match(notes, /const displayedMessages = React\.useMemo/);
  assert.match(notes, /const saved = note\.messages \|\| \[\]/);
  assert.match(memory, /const agents = Array\.isArray\(AGENTS\) \? AGENTS : \[\]/);
  assert.match(memory, /const skills = Array\.isArray\(a\.skills\) \? a\.skills : \[\]/);
});
