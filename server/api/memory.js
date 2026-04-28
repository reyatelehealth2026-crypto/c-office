import { scanMemory } from '../watchers/memory.js';

let cache = null;
let cachedAt = 0;
const TTL_MS = 30_000;

export default async function memoryRoute(req, res) {
  if (!cache || Date.now() - cachedAt > TTL_MS) {
    cache = await scanMemory();
    cachedAt = Date.now();
  }
  res.json(cache);
}
