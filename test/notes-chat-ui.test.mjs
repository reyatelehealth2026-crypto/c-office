import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const source = readFileSync(new URL('../public/page-notes.jsx', import.meta.url), 'utf8');
const dataSource = readFileSync(new URL('../public/data.js', import.meta.url), 'utf8');
const streamSource = readFileSync(new URL('../server/api/stream.js', import.meta.url), 'utf8');
const adventureSource = readFileSync(new URL('../public/page-adventure.jsx', import.meta.url), 'utf8');
const detailSource = readFileSync(new URL('../public/page-detail.jsx', import.meta.url), 'utf8');
const miscSource = readFileSync(new URL('../public/page-misc.jsx', import.meta.url), 'utf8');

test('notes chat sends directly to the dispatch API instead of opening scene', () => {
  const dispatchBody = source.match(/async function dispatch[\s\S]*?\r?\n  }\r?\n\r?\n  function openScene/)?.[0] || '';
  assert.match(dispatchBody, /fetch\(`\/api\/notes\/\$\{note\.id\}\/dispatch`/);
  assert.doesNotMatch(dispatchBody, /window\.openScene/);
});

test('notes chat defaults to a real provider, not the demo echo provider', () => {
  assert.match(source, /window\.PROVIDERS\?\.default \|\| 'claude'/);
  assert.doesNotMatch(source, /window\.PROVIDERS\?\.default \|\| 'echo'/);
});

test('other dispatch surfaces do not fall back to the demo echo provider', () => {
  for (const [name, text] of [
    ['adventure', adventureSource],
    ['agent detail', detailSource],
    ['settings', miscSource],
  ]) {
    assert.doesNotMatch(text, /window\.PROVIDERS\?\.default \|\| 'echo'/, `${name} should not use echo fallback`);
  }
});

test('notes chat shows the sent message immediately and exposes agent typing state', () => {
  assert.match(source, /optimisticMessages/);
  assert.match(source, /note-msg-typing/);
  assert.match(source, /isAgentTyping/);
});

test('notes changes stream to the browser while dispatch is still running', () => {
  assert.match(streamSource, /notesBus/);
  assert.match(streamSource, /event: \$\{type\}/);
  assert.match(dataSource, /addEventListener\('notes'/);
  assert.match(dataSource, /refreshNotes\(\)/);
});
