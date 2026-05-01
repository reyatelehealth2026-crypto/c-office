import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const RUN_REAL_E2E = process.env.C_OFFICE_REAL_PROVIDER_E2E === '1';

async function waitForJson(url, timeoutMs = 20_000) {
  const started = Date.now();
  let lastError = null;
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return response.json();
      lastError = new Error(`${response.status} ${response.statusText}`);
    } catch (error) {
      lastError = error;
    }
    await delay(300);
  }
  throw lastError || new Error(`Timed out waiting for ${url}`);
}

async function postJson(url, body, timeoutMs = 150_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const json = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(json.error || json.output || `${response.status} ${response.statusText}`);
    }
    return json;
  } finally {
    clearTimeout(timer);
  }
}

test('real Claude and Codex providers answer through the notes dispatch API', { skip: !RUN_REAL_E2E, timeout: 360_000 }, async () => {
  const port = 18_000 + Math.floor(Math.random() * 10_000);
  const tempDir = mkdtempSync(path.join(tmpdir(), 'c-office-provider-e2e-'));
  const notesPath = path.join(tempDir, 'notes.json');
  const baseUrl = `http://127.0.0.1:${port}`;

  const server = spawn(process.execPath, ['server/index.js'], {
    cwd: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
    env: {
      ...process.env,
      PORT: String(port),
      HOST: '127.0.0.1',
      C_OFFICE_NOTES_PATH: notesPath,
      C_OFFICE_PROVIDER_TIMEOUT_MS: process.env.C_OFFICE_PROVIDER_TIMEOUT_MS || '150000',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });

  let output = '';
  server.stdout.on('data', (buffer) => { output += buffer.toString('utf8'); });
  server.stderr.on('data', (buffer) => { output += buffer.toString('utf8'); });

  try {
    const providers = await waitForJson(`${baseUrl}/api/notes/providers`);
    const available = new Set(providers.providers.filter((provider) => provider.available).map((provider) => provider.name));
    assert.equal(available.has('claude'), true, 'Claude CLI must be available');
    assert.equal(available.has('codex'), true, 'Codex CLI must be available');
    assert.equal(available.has('echo'), false, 'demo echo provider must not be exposed');

    for (const provider of ['claude', 'codex']) {
      const note = await postJson(`${baseUrl}/api/notes`, {
        title: `Provider e2e ${provider}`,
        body: 'Answer with one short sentence. Include the exact marker C_OFFICE_REAL_REPLY.',
        tag: 'test',
        agentId: 'orchestra',
      });

      const result = await postJson(`${baseUrl}/api/notes/${note.id}/dispatch`, {
        provider,
        agentId: 'orchestra',
        message: `Provider ${provider}: reply with one short sentence and include C_OFFICE_REAL_REPLY.`,
      }, 180_000);

      assert.equal(result.ok, true, `${provider} dispatch should succeed`);
      assert.equal(result.provider, provider);
      assert.match(result.output || '', /C_OFFICE_REAL_REPLY/i, `${provider} should return the requested marker`);

      const saved = await waitForJson(`${baseUrl}/api/notes/${note.id}`);
      const agentMessage = saved.messages.findLast((message) => message.role === 'agent' && message.provider === provider);
      assert.ok(agentMessage, `${provider} agent reply should be saved to the note`);
      assert.match(agentMessage.content || '', /C_OFFICE_REAL_REPLY/i);
      assert.doesNotMatch(agentMessage.content || '', /templated reply|built-in demo|Echo/i);
      assert.doesNotMatch(agentMessage.content || '', /Cloudflare|startup remote plugin sync|analytics-events|<html/i);
    }
  } catch (error) {
    error.message += `\n\nServer output:\n${output.slice(-4000)}`;
    throw error;
  } finally {
    server.kill();
  }
});
