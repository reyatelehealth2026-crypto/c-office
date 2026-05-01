// Live connection probes — run a minimal real API call per provider and
// report back { ok, latencyMs, model?, modelCount?, error?, hint? }.
//
// Each probe accepts an optional `fetchImpl` (defaults to globalThis.fetch)
// so tests can inject a stub without real network.

const TIMEOUT_MS = 8000;

async function fetchWithTimeout(fetchImpl, url, options = {}) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
  try {
    return await fetchImpl(url, { ...options, signal: ac.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function timed(fn) {
  const start = Date.now();
  try {
    const result = await fn();
    return { ...result, latencyMs: Date.now() - start };
  } catch (e) {
    return {
      ok: false,
      error: e?.name === 'AbortError' ? `timeout after ${TIMEOUT_MS}ms` : (e?.message || String(e)),
      latencyMs: Date.now() - start,
    };
  }
}

export async function probeAnthropic(creds, fetchImpl = globalThis.fetch) {
  const key = creds?.apiKey;
  const access = creds?.accessToken;
  if (!key && !access) return { ok: false, error: 'no credentials stored', latencyMs: 0 };
  return timed(async () => {
    if (access) {
      // OAuth tokens (from `claude login`) require the Messages API + OAuth
      // beta header — the public /v1/models endpoint rejects them.
      // Use /v1/messages/count_tokens which is FREE and not subject to the
      // tighter Messages-API rate limits, while still exercising the same
      // auth + model availability check.
      const r = await fetchWithTimeout(fetchImpl, 'https://api.anthropic.com/v1/messages/count_tokens', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${access}`,
          'anthropic-version': '2023-06-01',
          'anthropic-beta': 'oauth-2025-04-20',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          messages: [{ role: 'user', content: 'ping' }],
        }),
      });
      if (r.status === 401) return { ok: false, error: 'unauthorized — OAuth token rejected', hint: 'run `claude login` again to refresh', mode: 'oauth' };
      if (r.status === 403) return { ok: false, error: 'forbidden — OAuth scope insufficient', hint: 'ensure the OAuth client allows Messages API', mode: 'oauth' };
      if (r.status === 429) return { ok: false, error: 'rate-limited (429)', hint: 'wait a minute then retry — your key is healthy, just throttled', mode: 'oauth' };
      if (!r.ok) {
        const txt = await r.text().catch(() => '');
        return { ok: false, error: `HTTP ${r.status}`, hint: txt.slice(0, 160), mode: 'oauth' };
      }
      const j = await r.json().catch(() => ({}));
      return { ok: true, model: 'claude-sonnet-4-6', inputTokens: j.input_tokens, mode: 'oauth' };
    }
    // API-key path — free /v1/models call.
    const r = await fetchWithTimeout(fetchImpl, 'https://api.anthropic.com/v1/models', {
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    });
    if (r.status === 401) return { ok: false, error: 'unauthorized — key invalid or expired', hint: 're-login or paste a fresh sk-ant-... key', mode: 'api-key' };
    if (r.status === 403) return { ok: false, error: 'forbidden — region or scope restriction', hint: 'check the key has Messages API access', mode: 'api-key' };
    if (!r.ok) return { ok: false, error: `HTTP ${r.status}`, mode: 'api-key' };
    const j = await r.json().catch(() => ({}));
    const ids = (j?.data || []).map((m) => m.id);
    const top = ids.find((id) => id.includes('opus')) || ids.find((id) => id.includes('sonnet')) || ids[0];
    return { ok: true, model: top || null, modelCount: ids.length, mode: 'api-key' };
  });
}

export async function probeOpenAI(creds, fetchImpl = globalThis.fetch) {
  if (!creds?.apiKey) return { ok: false, error: 'no API key stored', latencyMs: 0 };
  return timed(async () => {
    const r = await fetchWithTimeout(fetchImpl, 'https://api.openai.com/v1/models', {
      headers: { 'Authorization': `Bearer ${creds.apiKey}` },
    });
    if (r.status === 401) return { ok: false, error: 'unauthorized — key invalid', hint: 'paste a fresh sk-... key' };
    if (!r.ok) return { ok: false, error: `HTTP ${r.status}` };
    const j = await r.json().catch(() => ({}));
    return { ok: true, modelCount: (j?.data || []).length };
  });
}

export async function probeGoogle(creds, fetchImpl = globalThis.fetch) {
  const key = creds?.apiKey;
  const access = creds?.accessToken;
  if (!key && !access) return { ok: false, error: 'no credentials stored', latencyMs: 0 };
  return timed(async () => {
    let url;
    const headers = {};
    if (access) {
      url = 'https://generativelanguage.googleapis.com/v1beta/models';
      headers['Authorization'] = `Bearer ${access}`;
    } else {
      url = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`;
    }
    const r = await fetchWithTimeout(fetchImpl, url, { headers });
    if (r.status === 401 || r.status === 403) return { ok: false, error: 'unauthorized', hint: 'check the API key / OAuth scope (need generativelanguage.googleapis.com)' };
    if (!r.ok) return { ok: false, error: `HTTP ${r.status}` };
    const j = await r.json().catch(() => ({}));
    const names = (j?.models || []).map((m) => m.name || m.displayName);
    const top = names.find((n) => n && n.includes('imagen'))
      || names.find((n) => n && n.includes('gemini'))
      || names[0];
    return { ok: true, model: top || null, modelCount: names.length };
  });
}

export async function probeReplicate(creds, fetchImpl = globalThis.fetch) {
  if (!creds?.apiKey) return { ok: false, error: 'no API token stored', latencyMs: 0 };
  return timed(async () => {
    const r = await fetchWithTimeout(fetchImpl, 'https://api.replicate.com/v1/account', {
      headers: { 'Authorization': `Token ${creds.apiKey}` },
    });
    if (r.status === 401) return { ok: false, error: 'unauthorized — token invalid', hint: 'paste a fresh r8_... token' };
    if (!r.ok) return { ok: false, error: `HTTP ${r.status}` };
    const j = await r.json().catch(() => ({}));
    return { ok: true, account: j?.username || j?.name || null };
  });
}

export async function probeCodex(creds) {
  if (!creds) return { ok: false, error: 'no Codex credentials (run `codex login`)', latencyMs: 0 };
  const hasToken = !!(creds.accessToken || creds.apiKey);
  return {
    ok: hasToken,
    latencyMs: 0,
    hint: hasToken ? 'local Codex auth file present' : 'run `codex login` first',
  };
}

export const PROBE_BY_PROVIDER = {
  anthropic: probeAnthropic,
  openai: probeOpenAI,
  google: probeGoogle,
  replicate: probeReplicate,
  codex: probeCodex,
};
