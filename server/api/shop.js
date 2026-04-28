import {
  getCatalog,
  getInventory,
  buy,
  unequipSkill,
  useItem,
  grantVictory,
} from '../orchestration/shop.js';

export default async function shopRoute(req, res) {
  try {
    if (req.method === 'GET') {
      const inventory = await getInventory();
      return res.json({ catalog: getCatalog(), inventory });
    }

    if (req.method === 'POST' && req.path.endsWith('/buy')) {
      const inventory = await buy(req.body || {});
      return res.json({ ok: true, inventory });
    }

    if (req.method === 'POST' && req.path.endsWith('/unequip')) {
      const inventory = await unequipSkill(req.body || {});
      return res.json({ ok: true, inventory });
    }

    if (req.method === 'POST' && req.path.endsWith('/use')) {
      const result = await useItem(req.body || {});
      return res.json({ ok: true, ...result });
    }

    if (req.method === 'POST' && req.path.endsWith('/grant-victory')) {
      const tier = (req.body || {}).tier;
      if (!tier) return res.status(400).json({ error: 'tier is required' });
      const reward = await grantVictory(tier);
      return res.json({ ok: true, ...reward });
    }

    return res.status(405).json({ error: 'method not allowed' });
  } catch (e) {
    return res.status(e.statusCode || 500).json({ error: e.message || String(e) });
  }
}
