import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const DATA_DIR = path.join(os.homedir(), '.c-office');
const INV_FILE = path.join(DATA_DIR, 'inventory.json');

const DEFAULT_INVENTORY = { gold: 1600, ownedAgents: ['orchestra'], skills: {}, items: {} };

async function ensureStore() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    await fs.access(INV_FILE);
  } catch {
    await fs.writeFile(INV_FILE, JSON.stringify(DEFAULT_INVENTORY, null, 2) + '\n');
  }
}

function normalize(raw) {
  const inv = (raw && typeof raw === 'object') ? raw : {};
  const gold = Number.isFinite(inv.gold) ? Math.max(0, Math.floor(inv.gold)) : 0;
  const skills = {};
  const rawSkills = inv.skills && typeof inv.skills === 'object' ? inv.skills : {};
  for (const [personaId, list] of Object.entries(rawSkills)) {
    if (Array.isArray(list)) skills[personaId] = [...new Set(list.filter((s) => typeof s === 'string'))];
  }
  const items = {};
  const rawItems = inv.items && typeof inv.items === 'object' ? inv.items : {};
  for (const [itemId, qty] of Object.entries(rawItems)) {
    const n = Number.isFinite(qty) ? Math.max(0, Math.floor(qty)) : 0;
    if (n > 0) items[itemId] = n;
  }
  const ownedAgents = Array.isArray(inv.ownedAgents)
    ? [...new Set(inv.ownedAgents.filter((id) => typeof id === 'string'))]
    : ['orchestra'];
  if (!ownedAgents.includes('orchestra')) ownedAgents.unshift('orchestra');
  return { gold, ownedAgents, skills, items };
}

export async function readInventory() {
  await ensureStore();
  try {
    const raw = await fs.readFile(INV_FILE, 'utf8');
    return normalize(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_INVENTORY };
  }
}

export async function writeInventory(inv) {
  await ensureStore();
  const data = normalize(inv);
  const tmp = `${INV_FILE}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(data, null, 2) + '\n');
  await fs.rename(tmp, INV_FILE);
  return data;
}

export const inventoryStoreInfo = { dataDir: DATA_DIR, invFile: INV_FILE };
