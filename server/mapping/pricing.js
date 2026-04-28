// Per-million-token pricing (USD). Numbers are conservative public list prices;
// override via CLAUDE_PRICE_OVERRIDES env later if needed.
const PRICES = {
  'claude-opus-4-7':       { in: 15, out: 75, cacheRead: 1.5,  cacheWrite: 18.75 },
  'claude-opus-4-6':       { in: 15, out: 75, cacheRead: 1.5,  cacheWrite: 18.75 },
  'claude-sonnet-4-6':     { in: 3,  out: 15, cacheRead: 0.30, cacheWrite: 3.75 },
  'claude-haiku-4-5':      { in: 1,  out: 5,  cacheRead: 0.10, cacheWrite: 1.25 },
  'claude-haiku-4-5-20251001': { in: 1, out: 5, cacheRead: 0.10, cacheWrite: 1.25 },
};
const DEFAULT = { in: 3, out: 15, cacheRead: 0.30, cacheWrite: 3.75 };

export function priceFor(model) {
  if (!model) return DEFAULT;
  if (PRICES[model]) return PRICES[model];
  if (model.includes('opus')) return PRICES['claude-opus-4-7'];
  if (model.includes('haiku')) return PRICES['claude-haiku-4-5'];
  return DEFAULT;
}

export function costUsd(model, usage = {}) {
  const p = priceFor(model);
  const inT  = usage.input_tokens || 0;
  const outT = usage.output_tokens || 0;
  const crT  = usage.cache_read_input_tokens || 0;
  const cwT  = usage.cache_creation_input_tokens || 0;
  return (inT * p.in + outT * p.out + crT * p.cacheRead + cwT * p.cacheWrite) / 1_000_000;
}
