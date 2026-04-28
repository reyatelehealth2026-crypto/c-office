// HTTP surface for the credential store + OAuth flows.
//
// Routes:
//   GET  /auth/anthropic/connect       — imports ~/.claude/.credentials.json (no browser hop)
//   GET  /auth/google/start            — PKCE start
//   GET  /auth/google/callback         — PKCE finish
//   GET  /api/auth/status              — { anthropic: {...}, google: {...}, replicate: {...}, openai: {...} }
//   POST /api/auth/token               — { provider, token, clientId? } paste-token / set client_id
//   POST /api/auth/disconnect          — { provider }
//
// `auth.status` SSE event is emitted on every state change so the Settings UI
// updates without refresh.

import { Router } from 'express';
import { bus } from '../state.js';
import { getCreds, setCreds, clearCreds } from '../auth/credentials.js';
import * as anthropic from '../auth/anthropic.js';
import * as google from '../auth/google.js';

const PASTE_PROVIDERS = new Set(['replicate', 'openai']);

async function broadcastStatus() {
  bus.emit('auth.status', await statusSnapshot());
}

async function statusSnapshot() {
  const replicate = await getCreds('replicate');
  const openai = await getCreds('openai');
  return {
    anthropic: await anthropic.statusOf(),
    google: await google.statusOf(),
    replicate: { connected: !!replicate?.apiKey, mode: 'api-key' },
    openai: { connected: !!openai?.apiKey, mode: 'api-key' },
  };
}

const router = Router();

router.get('/auth/anthropic/connect', async (req, res) => {
  const r = await anthropic.connectFromClaudeLogin();
  if (!r.ok) return res.status(400).send(r.message || 'Anthropic connect failed');
  await broadcastStatus();
  res.redirect('/#/settings');
});

router.get('/auth/google/start', google.startAuth);
router.get('/auth/google/callback', async (req, res) => {
  await google.handleCallback(req, res);
  broadcastStatus().catch(() => {});
});

router.get('/api/auth/status', async (req, res) => {
  res.json(await statusSnapshot());
});

router.post('/api/auth/token', async (req, res) => {
  const { provider, token, clientId } = req.body || {};
  if (!provider) return res.status(400).json({ error: 'provider required' });

  if (provider === 'anthropic' && token) {
    const r = await anthropic.setApiKey(token);
    if (!r.ok) return res.status(400).json({ error: r.reason });
  } else if (provider === 'google') {
    if (clientId) await google.setClientId(clientId);
    if (token) await google.setApiKey(token);
    if (!clientId && !token) return res.status(400).json({ error: 'token or clientId required' });
  } else if (PASTE_PROVIDERS.has(provider)) {
    if (!token) return res.status(400).json({ error: 'token required' });
    await setCreds(provider, { apiKey: token });
  } else {
    return res.status(400).json({ error: 'unknown provider' });
  }
  await broadcastStatus();
  res.json({ ok: true });
});

router.post('/api/auth/disconnect', async (req, res) => {
  const { provider } = req.body || {};
  if (!provider) return res.status(400).json({ error: 'provider required' });
  if (provider === 'anthropic') await anthropic.disconnect();
  else if (provider === 'google') await google.disconnect();
  else await clearCreds(provider);
  await broadcastStatus();
  res.json({ ok: true });
});

export default router;
export { statusSnapshot };
