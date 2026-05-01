// Persona auto-tune suggestions (Phase 5.2)
//
// Tracks per-persona outcome stats across runs:
//   { successCount, failureCount, criticHighCount, verifyFailCount }
//
// Persisted at ~/.c-office/personas-stats.json (env: COFFICE_PERSONA_STATS_PATH).
//
// After FAILURE_THRESHOLD (5) failures on the same persona within a project,
// a one-paragraph system-prompt addendum (NOT a rewrite) is generated and stored
// at ~/.c-office/persona-tuning/<personaId>__<projectId>.md.
//
// The user applies the suggestion manually — c-office never auto-mutates the persona.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { query } from '@anthropic-ai/claude-agent-sdk';

const DATA_DIR = process.env.COFFICE_DATA_DIR || path.join(os.homedir(), '.c-office');
const STATS_PATH =
  process.env.COFFICE_PERSONA_STATS_PATH || path.join(DATA_DIR, 'personas-stats.json');
const TUNING_DIR =
  process.env.COFFICE_PERSONA_TUNING_DIR || path.join(DATA_DIR, 'persona-tuning');

export const FAILURE_THRESHOLD = 5;

// ── Persistence helpers ────────────────────────────────────────────────────

function ensureTuningDir() {
  try {
    fs.mkdirSync(TUNING_DIR, { recursive: true });
  } catch {
    /* best effort */
  }
}

function loadStats() {
  try {
    const raw = fs.readFileSync(STATS_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

function saveStats(stats) {
  try {
    fs.mkdirSync(path.dirname(STATS_PATH), { recursive: true });
    fs.writeFileSync(STATS_PATH, JSON.stringify(stats, null, 2), { mode: 0o600 });
  } catch {
    /* best effort */
  }
}

// ── Stat key helpers ───────────────────────────────────────────────────────

function globalKey(personaId) {
  return `${personaId}::global`;
}

function projectKey(personaId, projectId) {
  return `${personaId}::${projectId}`;
}

function emptyStats() {
  return { successCount: 0, failureCount: 0, criticHighCount: 0, verifyFailCount: 0 };
}

function incrementStat(stats, key, field) {
  const entry = stats[key] || emptyStats();
  return { ...stats, [key]: { ...entry, [field]: (entry[field] || 0) + 1 } };
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Record an outcome for a persona after a run completes.
 *
 * @param {object} opts
 * @param {string} opts.personaId   - persona id (e.g. 'nyx')
 * @param {string} [opts.projectId] - project scoping (omit for global-only)
 * @param {'success'|'failure'|'critic-high'|'verify-fail'} opts.outcome
 */
export function recordPersonaOutcome({ personaId, projectId, outcome }) {
  if (!personaId || !outcome) return;

  const fieldMap = {
    'success':     'successCount',
    'failure':     'failureCount',
    'critic-high': 'criticHighCount',
    'verify-fail': 'verifyFailCount',
  };
  const field = fieldMap[outcome];
  if (!field) return;

  let stats = loadStats();
  stats = incrementStat(stats, globalKey(personaId), field);
  if (projectId) {
    stats = incrementStat(stats, projectKey(personaId, projectId), field);
  }
  saveStats(stats);

  // Trigger suggestion generation asynchronously when threshold is met.
  if (projectId && field === 'failureCount') {
    const entry = (stats[projectKey(personaId, projectId)] || emptyStats());
    if (entry.failureCount >= FAILURE_THRESHOLD) {
      // Fire-and-forget — never blocks the runner pipeline.
      generateSuggestion(personaId, projectId).catch(() => { /* best effort */ });
    }
  }
}

/**
 * Get the current stats for a persona.
 * Returns global stats; if projectId is given, also includes a `projectScoped` field.
 *
 * @param {string} personaId
 * @param {string} [projectId]
 * @returns {{ successCount, failureCount, criticHighCount, verifyFailCount, projectScoped? }}
 */
export function getPersonaStats(personaId, projectId) {
  if (!personaId) return emptyStats();
  const stats = loadStats();
  const global = stats[globalKey(personaId)] || emptyStats();
  if (!projectId) return global;
  const scoped = stats[projectKey(personaId, projectId)] || emptyStats();
  return { ...global, projectScoped: scoped };
}

/**
 * List all pending tuning suggestions as an array of metadata objects.
 *
 * @returns {Array<{ personaId: string, projectId: string|null, path: string, createdAt: string|null }>}
 */
export function listPendingSuggestions() {
  ensureTuningDir();
  let files;
  try {
    files = fs.readdirSync(TUNING_DIR).filter((f) => f.endsWith('.md'));
  } catch {
    return [];
  }
  return files.map((f) => {
    const stem = f.slice(0, -3);
    const sep = stem.indexOf('__');
    const personaId = sep !== -1 ? stem.slice(0, sep) : stem;
    const projectId = sep !== -1 ? stem.slice(sep + 2) : null;
    let createdAt = null;
    try {
      const stat = fs.statSync(path.join(TUNING_DIR, f));
      createdAt = stat.mtime.toISOString();
    } catch { /* best effort */ }
    return { personaId, projectId, path: path.join(TUNING_DIR, f), createdAt };
  });
}

/**
 * Generate and persist a one-paragraph addendum suggestion for a persona/project pair.
 * Idempotent: skips generation if the file already exists.
 *
 * @param {string} personaId
 * @param {string} projectId
 * @returns {Promise<string|null>} absolute path to the suggestion file, or null on error
 */
export async function generateSuggestion(personaId, projectId) {
  ensureTuningDir();
  const filename = `${personaId}__${projectId}.md`;
  const filePath = path.join(TUNING_DIR, filename);

  if (fs.existsSync(filePath)) return filePath;

  const stats = getPersonaStats(personaId, projectId);
  const scoped = stats.projectScoped || emptyStats();

  const prompt = [
    `You are helping improve an AI agent persona named "${personaId}".`,
    `In project "${projectId}", this persona has the following outcome stats:`,
    `  successCount:    ${scoped.successCount}`,
    `  failureCount:    ${scoped.failureCount}`,
    `  criticHighCount: ${scoped.criticHighCount}`,
    `  verifyFailCount: ${scoped.verifyFailCount}`,
    ``,
    `Write a single paragraph (3-5 sentences) to APPEND to this persona's system prompt.`,
    `Address the failure patterns. Do NOT rewrite the existing prompt — only add new guidance.`,
    `Plain prose only. No headers, no JSON, no preamble.`,
  ].join('\n');

  let suggestionText = '';
  try {
    for await (const message of query({
      prompt,
      options: {
        model: 'claude-haiku-4-5',
        maxTurns: 1,
        systemPrompt: 'You are a concise prompt engineer. Write only the requested addendum paragraph.',
        permissionMode: 'dontAsk',
      },
    })) {
      if (message.type === 'assistant') {
        const content = message?.message?.content;
        if (Array.isArray(content)) {
          suggestionText += content
            .filter((b) => b?.type === 'text')
            .map((b) => b.text || '')
            .join('\n');
        }
      }
    }
  } catch {
    suggestionText = [
      `[Suggestion could not be generated — LLM unavailable.]`,
      ``,
      `Review the failure pattern for persona "${personaId}" manually:`,
      `  failures: ${scoped.failureCount}, critic-high: ${scoped.criticHighCount}, verify-fail: ${scoped.verifyFailCount}`,
    ].join('\n');
  }

  const header = [
    `# Persona Tuning Suggestion`,
    ``,
    `**Persona:** ${personaId}`,
    `**Project:** ${projectId}`,
    `**Generated:** ${new Date().toISOString()}`,
    `**Trigger:** ${scoped.failureCount} failures (threshold: ${FAILURE_THRESHOLD})`,
    ``,
    `## Suggested system-prompt addendum`,
    ``,
    `> Append the paragraph below to the persona's system prompt.`,
    `> Do NOT replace the existing prompt.`,
    `> Apply manually via the Agents settings panel.`,
    ``,
  ].join('\n');

  try {
    fs.writeFileSync(filePath, header + suggestionText.trim() + '\n', { mode: 0o600 });
    return filePath;
  } catch {
    return null;
  }
}

/** Return the tuning directory path (for route registration and tests). */
export function tuningDir() {
  return TUNING_DIR;
}

/** Return the stats file path (for tests). */
export function statsPath() {
  return STATS_PATH;
}
