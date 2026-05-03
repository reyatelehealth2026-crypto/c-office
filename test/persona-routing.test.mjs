import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mapPersona } from '../server/mapping/personas.js';

// Per the new roster, Warden (id: 'warden') is the Guardian that absorbs
// review duties, including code-reviewer. Language-specific reviewers
// (typescript-reviewer, python-reviewer, rust-reviewer, etc.) all serve the
// same review function and must route to the same persona.
test('language-specific *-reviewer agents route to Warden (warden)', () => {
  const reviewers = [
    'code-reviewer',
    'typescript-reviewer',
    'python-reviewer',
    'rust-reviewer',
    'go-reviewer',
    'java-reviewer',
    'csharp-reviewer',
    'cpp-reviewer',
    'kotlin-reviewer',
    'flutter-reviewer',
    'security-reviewer',
    'reviewer',
  ];
  for (const slug of reviewers) {
    assert.equal(
      mapPersona(slug, 'agent'),
      'warden',
      `${slug} should route to warden (Guardian · Audit & Security), not the engineering fallback`,
    );
  }
});

test('Vector still receives engineering agents that are not reviewers', () => {
  // Regression guard: the reviewer rule must not pull engineering agents into Warden.
  const builders = [
    'random-thing',
    'backend-architect',
    'frontend-developer',
    'database-admin',
    'rapid-prototyper',
  ];
  for (const slug of builders) {
    assert.equal(
      mapPersona(slug, 'agent'),
      'vector',
      `${slug} should remain on Vector (engineering fallback) after the reviewer fix`,
    );
  }
});

test('legacy persona ids still resolve via alias', () => {
  // Old hook events / settings may still emit legacy ids. They must resolve
  // to the new ids without manual migration.
  assert.equal(mapPersona('vex', 'agent'), 'warden');
  assert.equal(mapPersona('nyx', 'agent'), 'scout');
  assert.equal(mapPersona('lumen', 'agent'), 'scribe');
  assert.equal(mapPersona('echo', 'agent'), 'forge');
  assert.equal(mapPersona('kai', 'agent'), 'vector');
  assert.equal(mapPersona('mira', 'agent'), 'pulse');
  assert.equal(mapPersona('astra', 'agent'), 'oracle');
  assert.equal(mapPersona('orbit', 'agent'), 'relay');
});

test('interactive sessions land on Atlas (the orchestrator)', () => {
  assert.equal(mapPersona(null, 'interactive'), 'atlas');
  assert.equal(mapPersona('whatever', 'interactive'), 'atlas');
});
