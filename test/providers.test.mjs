import assert from 'node:assert/strict';
import { test } from 'node:test';

import { defaultProvider, listProviders } from '../server/runner/providers.js';

test('provider list exposes only real chat providers', () => {
  const providers = listProviders().map((provider) => provider.name).sort();
  assert.deepEqual(providers, ['claude', 'codex']);
});

test('default provider is a real chat provider', () => {
  assert.match(defaultProvider(), /^(claude|codex)$/);
});
