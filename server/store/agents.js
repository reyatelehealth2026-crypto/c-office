import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { PERSONAS, LEGACY_ID_ALIASES } from '../mapping/personas.js';

const DEFAULT_DATA_DIR = path.join(os.homedir(), '.c-office');

function agentsFile() {
  return process.env.C_OFFICE_AGENTS_PATH || path.join(DEFAULT_DATA_DIR, 'agents.json');
}

function ensureDir(file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
}

function slug(value, fallback = 'agent') {
  const text = String(value || '').trim().toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return text || `${fallback}-${Date.now().toString(36)}`;
}

function initials(name) {
  const parts = String(name || 'Agent').trim().split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'AG';
}

function inferCategory(agent) {
  const text = `${agent.category || ''} ${agent.role || ''} ${agent.name || ''}`.toLowerCase();
  if (/growth|marketing|sales|commerce|social|seo/.test(text)) return 'growth';
  if (/build|code|engineer|dev|frontend|backend|forge/.test(text)) return 'forge';
  if (/research|intel|analyst|data|insight/.test(text)) return 'intel';
  if (/content|write|scribe|mentor|knowledge|course/.test(text)) return 'scriptorium';
  if (/visual|studio|design|video|game|creative/.test(text)) return 'studio';
  if (/ops|devops|sre|orchestr|project|workflow/.test(text)) return 'ops';
  return 'general';
}

function normalizeAgent(input = {}, index = 0) {
  const name = String(input.name || input.id || `Agent ${index + 1}`).trim();
  const id = slug(input.id || name, 'agent');
  const role = String(input.role || 'Configurable AI Agent').trim();
  const provider = String(input.provider || 'claude').trim().toLowerCase();
  const toolsAllowed = Array.isArray(input.toolsAllowed)
    ? [...new Set(input.toolsAllowed.map(String).map((tool) => tool.trim()).filter(Boolean))]
    : [];
  const color = String(input.color || input.accent || '#00f0ff').trim();
  const gradient = String(input.gradient || `linear-gradient(155deg, ${color}, #8b5cf6)`).trim();
  const avatar = String(input.avatar || input.avatarInitials || initials(name)).trim();
  const enabled = input.enabled !== false;
  return {
    ...input,
    id,
    name,
    role,
    avatar,
    avatarInitials: input.avatarInitials || avatar.slice(0, 3).toUpperCase(),
    image: input.image || (String(input.avatar || '').startsWith('/') ? input.avatar : input.image),
    color,
    gradient,
    category: String(input.category || inferCategory({ ...input, name, role })).trim(),
    provider,
    systemPrompt: String(input.systemPrompt || `You are ${name}. ${role}. Answer clearly and work only with allowed tools when tools are provided.`).trim(),
    enabled,
    toolsAllowed,
    level: Number.isFinite(input.level) ? Math.max(1, Math.floor(input.level)) : 1,
    exp: Number.isFinite(input.exp) ? Math.max(0, Math.floor(input.exp)) : 0,
    reward: Number.isFinite(input.reward) ? Math.max(0, Math.floor(input.reward)) : 0,
    progress: Number.isFinite(input.progress) ? Math.max(0, Math.min(100, Math.floor(input.progress))) : 0,
    status: ['busy', 'active', 'idle', 'offline'].includes(input.status) ? input.status : 'idle',
  };
}

function seedAgents() {
  return PERSONAS.map((persona) => normalizeAgent({
    ...persona,
    avatar: persona.avatarInitials,
    color: persona.color || persona.rarityColor || '#00f0ff',
    provider: persona.provider || 'claude',
    enabled: true,
    toolsAllowed: persona.toolsAllowed || [],
    systemPrompt: persona.systemPrompt || `You are ${persona.name}. ${persona.role}. Use your specialty to help complete the selected task.`,
  }));
}

function readRaw() {
  const file = agentsFile();
  ensureDir(file);
  if (!fs.existsSync(file)) {
    const seeded = seedAgents();
    fs.writeFileSync(file, JSON.stringify({ agents: seeded }, null, 2) + '\n');
    return seeded;
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    const list = Array.isArray(parsed) ? parsed : parsed.agents;
    return Array.isArray(list) ? list : seedAgents();
  } catch {
    return seedAgents();
  }
}

function writeRaw(agents) {
  const file = agentsFile();
  ensureDir(file);
  const normalized = normalizeAgents(agents);
  fs.writeFileSync(file, JSON.stringify({ agents: normalized }, null, 2) + '\n');
  return normalized;
}

function normalizeAgents(list) {
  const seen = new Set();
  return (Array.isArray(list) ? list : []).map((agent, index) => {
    let normalized = normalizeAgent(agent, index);
    if (seen.has(normalized.id)) {
      normalized = { ...normalized, id: `${normalized.id}-${index + 1}` };
    }
    seen.add(normalized.id);
    return normalized;
  });
}

export function listAgentsSync({ includeDisabled = true } = {}) {
  const agents = normalizeAgents(readRaw());
  return includeDisabled ? agents : agents.filter((agent) => agent.enabled !== false);
}

export function getAgentSync(id) {
  const key = slug(id || '');
  const aliased = LEGACY_ID_ALIASES[key] || key;
  const agents = listAgentsSync();
  return agents.find((agent) => agent.id === aliased) || agents.find((agent) => agent.id === key) || null;
}

export function createAgent(input = {}) {
  const current = listAgentsSync();
  const normalized = normalizeAgent(input, current.length);
  if (current.some((agent) => agent.id === normalized.id)) {
    const err = new Error(`agent already exists: ${normalized.id}`);
    err.statusCode = 409;
    throw err;
  }
  writeRaw([...current, normalized]);
  return normalized;
}

export function updateAgent(id, patch = {}) {
  const key = slug(id || '');
  const current = listAgentsSync();
  const index = current.findIndex((agent) => agent.id === key);
  if (index < 0) return null;
  const next = [...current];
  next[index] = normalizeAgent({ ...current[index], ...patch, id: current[index].id }, index);
  writeRaw(next);
  return next[index];
}

export function deleteAgent(id) {
  const key = slug(id || '');
  const aliased = LEGACY_ID_ALIASES[key] || key;
  const current = listAgentsSync();
  const target = current.find((agent) => agent.id === aliased) || current.find((agent) => agent.id === key);
  if (!target) return false;
  if (target.deletable === false) {
    const err = new Error(`agent ${target.id} is locked and cannot be deleted`);
    err.statusCode = 403;
    throw err;
  }
  const next = current.filter((agent) => agent.id !== target.id);
  writeRaw(next);
  return true;
}

export function resolveAgentIdSync(value, fallback = 'atlas') {
  const raw = String(value || '').trim();
  const norm = slug(raw);
  const aliased = LEGACY_ID_ALIASES[norm] || norm;
  const aliasedFallback = LEGACY_ID_ALIASES[fallback] || fallback;
  const agents = listAgentsSync();
  const direct = agents.find((agent) =>
    agent.id === aliased ||
    agent.id === norm ||
    agent.name.toLowerCase() === raw.toLowerCase() ||
    slug(agent.name) === norm ||
    slug(agent.avatarInitials) === norm
  );
  if (direct) return direct.id;
  const enabled = agents.filter((agent) => agent.enabled !== false);
  if (agents.some((agent) => agent.id === aliasedFallback)) return aliasedFallback;
  if (agents.some((agent) => agent.id === fallback)) return fallback;
  return enabled[0]?.id || agents[0]?.id || aliasedFallback;
}

export function mapAgentSync(subagentType, sessionKind) {
  if (sessionKind === 'interactive' || !subagentType) return resolveAgentIdSync('atlas');
  const raw = String(subagentType || '').trim();
  const norm = slug(raw);
  const aliased = LEGACY_ID_ALIASES[norm] || norm;
  const agents = listAgentsSync({ includeDisabled: false });
  const direct = agents.find((agent) =>
    agent.id === aliased ||
    agent.id === norm ||
    slug(agent.name) === norm ||
    slug(agent.role).includes(norm) ||
    norm.includes(agent.id)
  );
  if (direct) return direct.id;

  const roleMatch = agents.find((agent) => {
    const haystack = `${agent.name} ${agent.role} ${agent.category} ${agent.tagline || ''}`.toLowerCase();
    return norm.split('-').filter((part) => part.length > 2).some((part) => haystack.includes(part));
  });
  return roleMatch?.id || resolveAgentIdSync('atlas');
}

export function getAgentPromptSync(id) {
  const agent = getAgentSync(id) || getAgentSync(resolveAgentIdSync(id));
  if (!agent) return null;
  return agent.systemPrompt || `You are ${agent.name}. ${agent.role}.`;
}

export const agentStoreInfo = { get file() { return agentsFile(); } };
