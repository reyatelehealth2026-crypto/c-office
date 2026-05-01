import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const scenePage = readFileSync(new URL('../public/page-scene.jsx', import.meta.url), 'utf8');
const sceneCss = readFileSync(new URL('../public/scene.css', import.meta.url), 'utf8');

test('scene overlay uses sim office language instead of JRPG mission framing', () => {
  assert.match(scenePage, /sim office dialogue room/i);
  assert.match(scenePage, /WORK ORDER/);
  assert.match(scenePage, /SIM OFFICE MODE/);
  assert.match(scenePage, /Workroom/);
  assert.doesNotMatch(scenePage, /Your mission/);
  assert.doesNotMatch(scenePage, /⚔ MISSION/);
});

test('scene overlay renders office room furniture and workstation desks', () => {
  for (const token of [
    'scene-office-room',
    'scene-office-window',
    'scene-office-board',
    'scene-office-shelf',
    'scene-desk-line',
    'scene-keyboard',
    'scene-mug',
  ]) {
    assert.match(scenePage, new RegExp(token));
    assert.match(sceneCss, new RegExp(`\\.${token}`));
  }
});
