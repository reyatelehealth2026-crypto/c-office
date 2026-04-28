import { bus } from '../state.js';
import { PERSONAS } from '../mapping/personas.js';
import { readInventory, writeInventory } from '../store/inventory.js';

// ── Static catalogs ──────────────────────────────────────────────────────────
// Skills are equipped per-persona; items are shared in the party inventory.
// `effect` is consumed by the Adventure-mode frontend to modify damage/ATB/MP.

export const SKILL_CATALOG = [
  {
    id: 'double-edge', name: 'ช่างโค้ดไว',
    desc: '+25% พลังงานสำหรับงาน Edit และ Write',
    cost: 500, tier: 'common',
    effect: { dmgMultByTool: { Edit: 1.25, Write: 1.25 } },
  },
  {
    id: 'haste', name: 'เร่งจังหวะ',
    desc: 'เกจทำงานของเอเจนท์เร็วขึ้น 30%',
    cost: 700, tier: 'common',
    effect: { atbBoost: 1.30 },
  },
  {
    id: 'mana-spring', name: 'แหล่งพลังงาน',
    desc: 'ฟื้น MP แรงขึ้น 50% และใช้พลังช้าลง 30%',
    cost: 400, tier: 'common',
    effect: { mpRegenMult: 1.5, mpDrainMult: 0.7 },
  },
  {
    id: 'iron-will', name: 'ใจนิ่ง',
    desc: 'HP สูงสุด +50 และทน error event ได้ดีขึ้น',
    cost: 600, tier: 'common',
    effect: { hpBonus: 50 },
  },
  {
    id: 'sharp-eye', name: 'ตาไว',
    desc: 'ติดคริติคอลง่ายขึ้น ลด threshold จาก 400 เหลือ 250',
    cost: 800, tier: 'rare',
    effect: { critThreshold: 250 },
  },
  {
    id: 'rare-talent', name: 'พรสวรรค์หายาก',
    desc: '+50% พลังงานสำหรับ Task / Agent call',
    cost: 1500, tier: 'rare',
    effect: { dmgMultByTool: { Task: 1.5, Agent: 1.5 } },
  },
  {
    id: 'lucky-coin', name: 'เหรียญนำโชค',
    desc: 'รางวัลทองเพิ่ม 30% ทั้งทีม',
    cost: 1000, tier: 'rare',
    effect: { goldMult: 1.3 },
  },
  {
    id: 'overload', name: 'ระเบิดพลัง',
    desc: 'โจมตีแรกใส่บอสแรงขึ้น 2 เท่า',
    cost: 2200, tier: 'epic',
    effect: { firstStrikeMult: 2.0 },
  },
];

export const ITEM_CATALOG = [
  { id: 'hp-potion',     name: 'HP Potion',     desc: 'Restore 50 HP to a party member.',  cost: 50  },
  { id: 'mp-potion',     name: 'MP Potion',     desc: 'Restore 50 MP to a party member.',  cost: 80  },
  { id: 'phoenix-down',  name: 'Phoenix Down',  desc: 'Revive a fallen party member.',     cost: 300 },
  { id: 'token-elixir',  name: 'Token Elixir',  desc: '2x damage for the next 30 seconds.', cost: 250 },
];

const SKILL_BY_ID = new Map(SKILL_CATALOG.map((s) => [s.id, s]));
const ITEM_BY_ID  = new Map(ITEM_CATALOG.map((i)  => [i.id, i]));

const AGENT_PRICE_BY_RARITY = { SSR: 900, SR: 620, R: 360, N: 180 };
const AGENT_BY_ID = new Map(PERSONAS.map((p) => [p.id, p]));

const TIER_VICTORY_GOLD = {
  'Whisper Imp':      200,
  'Wandering Wraith': 500,
  'Iron Tyrant':      1200,
  'World Eater':      3000,
};

// ── Runtime cache (hydrated lazily from disk) ────────────────────────────────

let cache = null;

async function load() {
  if (!cache) cache = await readInventory();
  return cache;
}

async function persist() {
  cache = await writeInventory(cache);
  bus.emit('inventory', cache);
  return cache;
}

function badRequest(msg) {
  const err = new Error(msg);
  err.statusCode = 400;
  return err;
}

// ── Public API ───────────────────────────────────────────────────────────────

export function getCatalog() {
  return {
    skills: SKILL_CATALOG,
    items: ITEM_CATALOG,
    agents: PERSONAS.map((p) => ({
      id: p.id,
      name: p.name,
      role: p.role,
      rarity: p.rarity,
      cost: AGENT_PRICE_BY_RARITY[p.rarity] || 300,
    })),
  };
}

export async function getInventory() {
  return await load();
}

function partyHasGoldMult() {
  return cache && Object.values(cache.skills || {}).some((list) => list.includes('lucky-coin'));
}

export async function grantGold(amount, source = 'reward') {
  await load();
  const baseAmount = Math.max(0, Math.round(Number(amount) || 0));
  if (baseAmount === 0) return { granted: 0, total: cache.gold, source };
  const mult = partyHasGoldMult() ? 1.3 : 1.0;
  const granted = Math.round(baseAmount * mult);
  cache.gold += granted;
  await persist();
  return { granted, total: cache.gold, source };
}

export async function grantVictory(tierName) {
  const base = TIER_VICTORY_GOLD[tierName] ?? 200;
  return await grantGold(base, `victory:${tierName}`);
}

export async function buy({ type, id, personaId } = {}) {
  await load();
  if (type === 'agent') {
    const agent = AGENT_BY_ID.get(id || personaId);
    if (!agent) throw badRequest(`Unknown agent: ${id || personaId}`);
    cache.ownedAgents = Array.isArray(cache.ownedAgents) ? cache.ownedAgents : ['orchestra'];
    if (cache.ownedAgents.includes(agent.id)) throw badRequest(`${agent.name} is already owned`);
    const cost = AGENT_PRICE_BY_RARITY[agent.rarity] || 300;
    if (cache.gold < cost) throw badRequest(`Not enough gold (need ${cost}, have ${cache.gold})`);
    cache.gold -= cost;
    cache.ownedAgents = [...cache.ownedAgents, agent.id];
    return await persist();
  }
  if (type === 'skill') {
    const skill = SKILL_BY_ID.get(id);
    if (!skill) throw badRequest(`Unknown skill: ${id}`);
    if (!personaId) throw badRequest('personaId is required when buying a skill');
    const owned = cache.skills[personaId] || [];
    if (owned.includes(id)) throw badRequest(`${personaId} already owns ${skill.name}`);
    if (cache.gold < skill.cost) throw badRequest(`Not enough gold (need ${skill.cost}, have ${cache.gold})`);
    cache.gold -= skill.cost;
    cache.skills[personaId] = [...owned, id];
    return await persist();
  }
  if (type === 'item') {
    const item = ITEM_BY_ID.get(id);
    if (!item) throw badRequest(`Unknown item: ${id}`);
    if (cache.gold < item.cost) throw badRequest(`Not enough gold (need ${item.cost}, have ${cache.gold})`);
    cache.gold -= item.cost;
    cache.items[id] = (cache.items[id] || 0) + 1;
    return await persist();
  }
  throw badRequest('type must be "skill" or "item"');
}

export async function unequipSkill({ personaId, id } = {}) {
  await load();
  const owned = cache.skills[personaId] || [];
  if (!owned.includes(id)) throw badRequest(`${personaId} does not own ${id}`);
  cache.skills[personaId] = owned.filter((s) => s !== id);
  // Refund 30% of the original cost
  const skill = SKILL_BY_ID.get(id);
  if (skill) cache.gold += Math.round(skill.cost * 0.3);
  return await persist();
}

export async function useItem({ id, personaId } = {}) {
  await load();
  const have = cache.items[id] || 0;
  if (have <= 0) throw badRequest(`No ${id} in inventory`);
  cache.items[id] = have - 1;
  if (cache.items[id] === 0) delete cache.items[id];
  await persist();
  return { used: id, target: personaId, remaining: cache.items[id] || 0 };
}

// ── Bus listeners (decoupled rewards from state.js) ──────────────────────────
// state.js emits these on task completion / token usage; we convert to gold.

bus.on('reward.task', ({ personaId, taskId } = {}) => {
  // Base reward per completed Task: 100 gold (Lucky Coin multiplies inside grantGold).
  grantGold(100, `task:${taskId || personaId || ''}`).catch(() => {});
});

bus.on('reward.usage', ({ tokens } = {}) => {
  // Passive earn: 1 gold per 1000 tokens (caps at the reward path's natural limits).
  const base = Math.floor((Number(tokens) || 0) / 1000);
  if (base > 0) grantGold(base, 'tokens').catch(() => {});
});
