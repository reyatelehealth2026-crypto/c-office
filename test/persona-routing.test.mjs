import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mapPersona } from '../server/mapping/personas.js';

// Per CLAUDE.md, Vivi (id: 'vex') is the Sentinel that absorbs review duties,
// including code-reviewer. Language-specific reviewers (typescript-reviewer,
// python-reviewer, rust-reviewer, etc.) all serve the same review function and
// must route to the same persona. Previously the regex `review(?!er)` actively
// excluded `*-reviewer` matches, sending them to the Builder default.
test('language-specific *-reviewer agents route to Sentinel (vex)', () => {
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
      'vex',
      `${slug} should route to vex (Sentinel · Audit & Security), not the Builder fallback`,
    );
  }
});

test('Builder (kai) still receives engineering agents that are not reviewers', () => {
  // Regression guard: the reviewer fix must not pull engineering agents into Vivi.
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
      'kai',
      `${slug} should remain on Builder (kai) after the reviewer fix`,
    );
  }
});
