import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const source = readFileSync(new URL('../server/agents/runner.js', import.meta.url), 'utf8');

test('agent runner uses the installed Claude Agent SDK query API', () => {
  assert.match(source, /import\s+\{\s*query\s*\}\s+from '@anthropic-ai\/claude-agent-sdk'/);
  assert.doesNotMatch(source, /new Ctor|client\.messages\.create|Could not locate client constructor/);
});

test('Claude Agent SDK package is installed and exposes query', async () => {
  const sdk = await import('@anthropic-ai/claude-agent-sdk');
  assert.equal(typeof sdk.query, 'function');
});
