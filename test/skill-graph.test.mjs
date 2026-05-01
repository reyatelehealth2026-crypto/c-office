// Tests for Phase 5.3 — Skill co-occurrence graph
//
// All I/O is redirected to a process-scoped tmp dir via COFFICE_SKILLS_DIR
// so real ~/.c-office/skills/ is never touched.
//
// Skill .md files are seeded manually so composedRecall can list/score them.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// ── Isolated tmp dir ──────────────────────────────────────────────────────
const TMP_SKILLS = fs.mkdtempSync(path.join(os.tmpdir(), 'c-office-graph-'));
process.env.COFFICE_SKILLS_DIR = TMP_SKILLS;

const { recordSkillCoOccurrence, composedRecall, getGraph, graphFilePath } =
  await import('../server/agents/skill-graph.js');

function resetGraph() {
  try { fs.unlinkSync(graphFilePath()); } catch { /* ok if absent */ }
}

function resetSkills() {
  try {
    for (const f of fs.readdirSync(TMP_SKILLS)) {
      if (f !== '_graph.json') fs.unlinkSync(path.join(TMP_SKILLS, f));
    }
  } catch { /* ok */ }
}

// Writes a minimal parseable skill file (same frontmatter format as persistSkill).
function writeSkillFile(id, goal, tags = []) {
  const tagsLine = `tags: [${tags.map((t) => `"${t}"`).join(', ')}]`;
  const content = [
    '---',
    `id: "${id}"`,
    `goal: "${goal}"`,
    tagsLine,
    'steps: ["kai"]',
    'success: true',
    'revisions: 0',
    'tokens: 100',
    `createdAt: "${new Date().toISOString()}"`,
    '---',
    '',
    '## When to use',
    `Goals matching: ${tags.join(', ')}`,
    '',
    '## Persona sequence',
    '1. kai',
    '',
    '## Notes',
    goal,
  ].join('\n');
  fs.writeFileSync(path.join(TMP_SKILLS, `${id}.md`), content, { mode: 0o600 });
}

// ── Test 1: graphFilePath uses COFFICE_SKILLS_DIR ────────────────────────

test('graphFilePath() returns _graph.json inside COFFICE_SKILLS_DIR', () => {
  assert.equal(graphFilePath(), path.join(TMP_SKILLS, '_graph.json'));
});

// ── Test 2: recordSkillCoOccurrence creates the graph file ───────────────

test('recordSkillCoOccurrence creates _graph.json on first call', () => {
  resetGraph();
  resetSkills();
  recordSkillCoOccurrence('run-1', ['skill_a', 'skill_b']);
  assert.ok(fs.existsSync(graphFilePath()), '_graph.json must be created');
});

// ── Test 3: node usageCount increments per run ────────────────────────────

test('recordSkillCoOccurrence increments usageCount for each skill node', () => {
  resetGraph();
  recordSkillCoOccurrence('run-2', ['skill_x', 'skill_y']);
  recordSkillCoOccurrence('run-3', ['skill_x']);
  const g = getGraph();
  assert.equal(g.nodes['skill_x']?.usageCount, 2, 'skill_x used in 2 runs');
  assert.equal(g.nodes['skill_y']?.usageCount, 1, 'skill_y used in 1 run');
});

// ── Test 4: edge weight accumulates across runs ───────────────────────────

test('recordSkillCoOccurrence accumulates edge weight across multiple runs', () => {
  resetGraph();
  recordSkillCoOccurrence('run-a', ['skill_p', 'skill_q']);
  recordSkillCoOccurrence('run-b', ['skill_p', 'skill_q']);
  recordSkillCoOccurrence('run-c', ['skill_p', 'skill_q']);
  const g = getGraph();
  const key = 'skill_p__skill_q';
  assert.equal(g.edges[key], 3, 'edge weight must equal 3 after 3 co-occurrences');
});

// ── Test 5: canonical edge key (lexicographic lower first) ────────────────

test('edge key is always stored lexicographically regardless of input order', () => {
  resetGraph();
  recordSkillCoOccurrence('run-order', ['skill_z', 'skill_a']);
  const g = getGraph();
  assert.ok('skill_a__skill_z' in g.edges, 'canonical key must put "a" before "z"');
  assert.ok(!('skill_z__skill_a' in g.edges), 'reversed key must not exist');
});

// ── Test 6: single skill creates no edges ────────────────────────────────

test('recordSkillCoOccurrence with one skill creates no edges', () => {
  resetGraph();
  recordSkillCoOccurrence('run-solo', ['skill_solo']);
  const g = getGraph();
  assert.equal(Object.keys(g.edges).length, 0, 'no edges for a single skill');
  assert.equal(g.nodes['skill_solo']?.usageCount, 1, 'node usage still recorded');
});

// ── Test 7: empty / invalid input is a no-op ─────────────────────────────

test('recordSkillCoOccurrence handles empty array and null gracefully', () => {
  resetGraph();
  assert.doesNotThrow(() => recordSkillCoOccurrence('run-empty', []));
  assert.doesNotThrow(() => recordSkillCoOccurrence('run-null', null));
  const g = getGraph();
  assert.equal(Object.keys(g.nodes).length, 0);
  assert.equal(Object.keys(g.edges).length, 0);
});

// ── Test 8: graph persists to disk ───────────────────────────────────────

test('skill graph is written to disk and readable via getGraph()', () => {
  resetGraph();
  recordSkillCoOccurrence('run-disk-1', ['skill_disk_1', 'skill_disk_2']);
  recordSkillCoOccurrence('run-disk-2', ['skill_disk_1', 'skill_disk_2']);

  assert.ok(fs.existsSync(graphFilePath()), 'graph file must be on disk');
  const raw = JSON.parse(fs.readFileSync(graphFilePath(), 'utf8'));
  assert.ok('skill_disk_1' in raw.nodes);
  assert.ok('skill_disk_2' in raw.nodes);
  const key = 'skill_disk_1__skill_disk_2';
  assert.equal(raw.edges[key], 2, 'persisted edge weight must equal 2');
});

// ── Test 9: composedRecall returns direct skills when graph is empty ──────

test('composedRecall returns only direct recalls when graph has no edges', () => {
  resetGraph();
  resetSkills();
  writeSkillFile('skill_direct_1', 'analyze market research data', ['analyze', 'market', 'research', 'data']);
  writeSkillFile('skill_direct_2', 'analyze customer research surveys', ['analyze', 'customer', 'research']);

  const result = composedRecall('analyze market research trends');
  assert.ok(Array.isArray(result));
  for (const s of result) {
    assert.ok(typeof s.id === 'string', 'each result must have a string id');
  }
});

// ── Test 10: composedRecall surfaces a 1-hop composed neighbour ───────────

test('composedRecall surfaces 1-hop composed neighbour via graph edge', () => {
  resetGraph();
  resetSkills();

  // A: directly recallable by tag overlap
  writeSkillFile(
    'skill_recall_alpha',
    'build social media content strategy',
    ['social', 'media', 'content', 'strategy', 'build'],
  );
  // B: NOT recallable by tag (different domain) but graph-adjacent to A
  writeSkillFile(
    'skill_compose_beta',
    'design visual brand assets for campaigns',
    ['design', 'visual', 'brand', 'assets'],
  );

  // Record strong co-occurrence between A and B
  recordSkillCoOccurrence('run-co-1', ['skill_recall_alpha', 'skill_compose_beta']);
  recordSkillCoOccurrence('run-co-2', ['skill_recall_alpha', 'skill_compose_beta']);
  recordSkillCoOccurrence('run-co-3', ['skill_recall_alpha', 'skill_compose_beta']);

  const result = composedRecall('build a social media content strategy');
  const ids = result.map((s) => s.id);

  assert.ok(ids.includes('skill_recall_alpha'), 'directly recalled skill must appear');
  assert.ok(
    ids.includes('skill_compose_beta'),
    `1-hop composed neighbour 'skill_compose_beta' must appear; got: ${ids.join(', ')}`,
  );
});

// ── Test 11: 2-hop composed recall ───────────────────────────────────────

test('composedRecall surfaces a 2-hop neighbour (A→B edge + B→C edge)', () => {
  resetGraph();
  resetSkills();

  writeSkillFile(
    'skill_hop_a',
    'research competitor pricing strategies',
    ['research', 'competitor', 'pricing', 'strategies'],
  );
  writeSkillFile(
    'skill_hop_b',
    'summarize findings into executive report',
    ['summarize', 'findings', 'executive', 'report'],
  );
  writeSkillFile(
    'skill_hop_c',
    'draft presentation deck from report',
    ['draft', 'presentation', 'deck', 'report'],
  );

  // A-B co-occur: B is 1-hop from A
  recordSkillCoOccurrence('run-hop-1', ['skill_hop_a', 'skill_hop_b']);
  // B-C co-occur: C is 2-hop from A via B
  recordSkillCoOccurrence('run-hop-2', ['skill_hop_b', 'skill_hop_c']);

  const result = composedRecall('research competitor pricing strategies');
  const ids = result.map((s) => s.id);

  assert.ok(ids.includes('skill_hop_a'), 'skill_hop_a must be directly recalled');
  assert.ok(ids.includes('skill_hop_b'), 'skill_hop_b must appear as 1-hop composed');
  assert.ok(
    ids.includes('skill_hop_c'),
    `skill_hop_c must appear as 2-hop composed; got: ${ids.join(', ')}`,
  );
});

// ── Test 12: composedRecall caps results at MAX_COMPOSED (5) ─────────────

test('composedRecall never returns more than 5 results', () => {
  resetGraph();
  resetSkills();

  for (let i = 0; i < 8; i++) {
    writeSkillFile(`skill_cap_${i}`, `analyze strategy plan item ${i}`, ['analyze', 'strategy', 'plan']);
  }

  const result = composedRecall('analyze strategy plans');
  assert.ok(result.length <= 5, `must not exceed MAX_COMPOSED=5; got ${result.length}`);
});

// ── Test 13: three-skill run creates all three pairwise edges ─────────────

test('recordSkillCoOccurrence with 3 skills creates all 3 pairwise edges', () => {
  resetGraph();
  recordSkillCoOccurrence('run-triple', ['skill_1', 'skill_2', 'skill_3']);
  const g = getGraph();
  assert.ok('skill_1__skill_2' in g.edges, 'edge 1-2 must exist');
  assert.ok('skill_1__skill_3' in g.edges, 'edge 1-3 must exist');
  assert.ok('skill_2__skill_3' in g.edges, 'edge 2-3 must exist');
  assert.equal(Object.keys(g.edges).length, 3, 'exactly 3 edges for 3 skills');
});
