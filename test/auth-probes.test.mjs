import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  probeAnthropic,
  probeOpenAI,
  probeGoogle,
  probeReplicate,
  probeCodex,
} from '../server/auth/probes.js';

function fakeFetch(handler) {
  return (url, options = {}) => Promise.resolve(handler(url, options));
}

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

test('probeAnthropic returns ok when models endpoint replies 200', async () => {
  const fetchImpl = fakeFetch((url, opts) => {
    assert.match(url, /api\.anthropic\.com\/v1\/models/);
    assert.equal(opts.headers['x-api-key'], 'sk-ant-test');
    assert.equal(opts.headers['anthropic-version'], '2023-06-01');
    return jsonResponse({ data: [
      { id: 'claude-haiku-4-5' },
      { id: 'claude-sonnet-4-6' },
      { id: 'claude-opus-4-7' },
    ] });
  });
  const r = await probeAnthropic({ apiKey: 'sk-ant-test' }, fetchImpl);
  assert.equal(r.ok, true);
  assert.equal(r.model, 'claude-opus-4-7');
  assert.equal(r.modelCount, 3);
  assert.ok(r.latencyMs >= 0);
});

test('probeAnthropic returns 401 hint when unauthorized', async () => {
  const fetchImpl = fakeFetch(() => jsonResponse({}, 401));
  const r = await probeAnthropic({ apiKey: 'sk-ant-bad' }, fetchImpl);
  assert.equal(r.ok, false);
  assert.match(r.error, /unauthorized/);
  assert.match(r.hint, /sk-ant/);
});

test('probeAnthropic OAuth path posts to /v1/messages with the OAuth beta header', async () => {
  const fetchImpl = fakeFetch((url, opts) => {
    assert.match(url, /api\.anthropic\.com\/v1\/messages/);
    assert.equal(opts.method, 'POST');
    assert.equal(opts.headers['Authorization'], 'Bearer oauth-tok');
    assert.equal(opts.headers['anthropic-beta'], 'oauth-2025-04-20');
    const body = JSON.parse(opts.body);
    assert.equal(body.max_tokens, 1);
    return jsonResponse({ model: 'claude-sonnet-4-6', content: [{ type: 'text', text: '.' }] });
  });
  const r = await probeAnthropic({ accessToken: 'oauth-tok' }, fetchImpl);
  assert.equal(r.ok, true);
  assert.equal(r.mode, 'oauth');
  assert.equal(r.model, 'claude-sonnet-4-6');
});

test('probeAnthropic OAuth path returns refresh hint on 401', async () => {
  const r = await probeAnthropic({ accessToken: 'oauth-bad' }, fakeFetch(() => jsonResponse({}, 401)));
  assert.equal(r.ok, false);
  assert.equal(r.mode, 'oauth');
  assert.match(r.hint, /claude login/);
});

test('probeAnthropic skips network when no credentials are provided', async () => {
  const r = await probeAnthropic({}, fakeFetch(() => { throw new Error('should not be called'); }));
  assert.equal(r.ok, false);
  assert.match(r.error, /no credentials/);
});

test('probeOpenAI uses Bearer auth and returns model count', async () => {
  const fetchImpl = fakeFetch((url, opts) => {
    assert.match(url, /api\.openai\.com\/v1\/models/);
    assert.equal(opts.headers['Authorization'], 'Bearer sk-openai-test');
    return jsonResponse({ data: [{ id: 'gpt-4' }, { id: 'gpt-3.5' }] });
  });
  const r = await probeOpenAI({ apiKey: 'sk-openai-test' }, fetchImpl);
  assert.equal(r.ok, true);
  assert.equal(r.modelCount, 2);
});

test('probeGoogle uses query string when only apiKey is present', async () => {
  const fetchImpl = fakeFetch((url) => {
    assert.match(url, /generativelanguage\.googleapis\.com\/v1beta\/models\?key=AIza/);
    return jsonResponse({ models: [{ name: 'models/gemini-flash' }, { name: 'models/imagen-4' }] });
  });
  const r = await probeGoogle({ apiKey: 'AIzaTEST' }, fetchImpl);
  assert.equal(r.ok, true);
  assert.match(r.model, /imagen/);
});

test('probeGoogle uses Bearer when accessToken is present', async () => {
  const fetchImpl = fakeFetch((url, opts) => {
    assert.equal(opts.headers['Authorization'], 'Bearer access-tok');
    return jsonResponse({ models: [{ name: 'models/gemini-flash' }] });
  });
  const r = await probeGoogle({ accessToken: 'access-tok' }, fetchImpl);
  assert.equal(r.ok, true);
});

test('probeReplicate returns the account username', async () => {
  const fetchImpl = fakeFetch((url, opts) => {
    assert.match(url, /api\.replicate\.com\/v1\/account/);
    assert.equal(opts.headers['Authorization'], 'Token r8_test');
    return jsonResponse({ username: 'demo-user' });
  });
  const r = await probeReplicate({ apiKey: 'r8_test' }, fetchImpl);
  assert.equal(r.ok, true);
  assert.equal(r.account, 'demo-user');
});

test('probeReplicate flags 401 with hint to refresh token', async () => {
  const r = await probeReplicate({ apiKey: 'r8_bad' }, fakeFetch(() => jsonResponse({}, 401)));
  assert.equal(r.ok, false);
  assert.match(r.hint, /r8_/);
});

test('probeCodex does not require network and reports presence of token', async () => {
  const present = await probeCodex({ accessToken: 'codex-tok' });
  assert.equal(present.ok, true);
  const missing = await probeCodex(null);
  assert.equal(missing.ok, false);
});

test('probe returns abort/timeout error when fetch is aborted', async () => {
  const abortingFetch = (url, options) => new Promise((_, reject) => {
    setImmediate(() => {
      const err = new Error('aborted');
      err.name = 'AbortError';
      reject(err);
    });
  });
  const r = await probeAnthropic({ apiKey: 'sk-ant-test' }, abortingFetch);
  assert.equal(r.ok, false);
  assert.match(r.error, /timeout|aborted/i);
});
