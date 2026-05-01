// Skill co-occurrence graph (Phase 5.3)
//
// When a run succeeds and uses recalled skills [A, B, C], increment edge
// weights for every pair: (A,B), (A,C), (B,C). Skills with strong edges
// are "compose-able" — when the planner recalls A, we also surface B and C
// with composedScore = edge_weight(A,N) * A.score.
//
// Persisted at ~/.c-office/skills/_graph.json (uses COFFICE_SKILLS_DIR env).
// Schema:
//   {
//     nodes: { [skillId]: { usageCount: number } },
//     edges: { [a__b]: number }    // canonical key: lower id first
//   }

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { recallSkills, listSkills } from './skills.js';

const SKILLS_DIR =
  process.env.COFFICE_SKILLS_DIR || path.join(os.homedir(), '.c-office', 'skills');

const MAX_COMPOSED = 5;    // max total skills returned by composedRecall
const MIN_EDGE_WEIGHT = 1; // edges below this weight are ignored when composing

// ── File path ─────────────────────────────────────────────────────────────

function graphPath() {
  return path.join(SKILLS_DIR, '_graph.json');
}

// ── Persistence helpers ───────────────────────────────────────────────────

function ensureDir() {
  try {
    fs.mkdirSync(SKILLS_DIR, { recursive: true });
  } catch {
    /* best effort */
  }
}

function loadGraph() {
  try {
    const raw = fs.readFileSync(graphPath(), 'utf8');
    const parsed = JSON.parse(raw);
    return {
      nodes: (typeof parsed.nodes === 'object' && parsed.nodes !== null) ? parsed.nodes : {},
      edges: (typeof parsed.edges === 'object' && parsed.edges !== null) ? parsed.edges : {},
    };
  } catch {
    return { nodes: {}, edges: {} };
  }
}

function saveGraph(graph) {
  ensureDir();
  try {
    fs.writeFileSync(graphPath(), JSON.stringify(graph, null, 2), { mode: 0o600 });
  } catch {
    /* best effort */
  }
}

// ── Canonical edge key (lexicographic lower id first) ────────────────────

function edgeKey(idA, idB) {
  return idA < idB ? `${idA}__${idB}` : `${idB}__${idA}`;
}

// ── Neighbours lookup ─────────────────────────────────────────────────────

function neighboursOf(skillId, graph) {
  const result = [];
  for (const [key, weight] of Object.entries(graph.edges)) {
    if (weight < MIN_EDGE_WEIGHT) continue;
    const dunder = key.indexOf('__');
    if (dunder === -1) continue;
    const a = key.slice(0, dunder);
    const b = key.slice(dunder + 2);
    if (a === skillId) result.push({ id: b, weight });
    else if (b === skillId) result.push({ id: a, weight });
  }
  return result.sort((x, y) => y.weight - x.weight);
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Record co-occurrence for a set of skill ids from a successful run.
 * Increments node usageCount for each skill and edge weight for every pair.
 *
 * The first argument is the run id; it is accepted for future audit-log
 * integration (Phase 4 TODO) but not currently used internally.
 *
 * @param {string} _runId     - run id (reserved for future use)
 * @param {string[]} skillIds - ids of skills that were recalled and used
 */
export function recordSkillCoOccurrence(_runId, skillIds) {
  if (!Array.isArray(skillIds) || skillIds.length === 0) return;
  const ids = [...new Set(skillIds.filter((id) => typeof id === 'string' && id.length > 0))];
  if (ids.length === 0) return;

  const graph = loadGraph();

  for (const id of ids) {
    const node = graph.nodes[id] || { usageCount: 0 };
    graph.nodes[id] = { ...node, usageCount: (node.usageCount || 0) + 1 };
  }

  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const key = edgeKey(ids[i], ids[j]);
      graph.edges[key] = (graph.edges[key] || 0) + 1;
    }
  }

  saveGraph(graph);
}

/**
 * Composed recall: wraps recallSkills() and adds graph-composed neighbours.
 *
 * Algorithm:
 *   1. Call recallSkills(goal, opts) — these are "direct" results.
 *   2. For each direct skill S with score s:
 *        a. Find 1-hop neighbours N with composedScore = edge_weight(S,N) * s.
 *        b. For each 1-hop neighbour N, find 2-hop neighbours M with
 *           composedScore = edge_weight(N,M) * edge_weight(S,N) * s.
 *   3. Deduplicate (direct wins over composed). Sort composed by score desc.
 *   4. Return direct + composed, capped at MAX_COMPOSED.
 *
 * @param {string} goal
 * @param {object} [opts]  - forwarded to recallSkills (e.g. { projectId })
 * @returns {Array}        - skill objects in same shape as recallSkills output
 */
export function composedRecall(goal, opts = {}) {
  const direct = recallSkills(goal, opts);
  if (direct.length === 0) return [];

  const graph = loadGraph();
  const listOpts = opts.projectId !== undefined ? { projectId: opts.projectId } : {};
  const allSkills = listSkills(listOpts);
  const skillById = Object.fromEntries(allSkills.map((s) => [s.id, s]));

  // Seed seen map with direct results (always highest priority)
  const seen = new Map(); // skillId → { skill, score, source }
  for (const skill of direct) {
    seen.set(skill.id, { skill, score: skill.score || 1, source: 'direct' });
  }

  // 1-hop and 2-hop expansion from each direct result
  for (const directSkill of direct) {
    const directScore = directSkill.score || 1;
    const hop1 = neighboursOf(directSkill.id, graph);

    for (const { id: hop1Id, weight: w1 } of hop1) {
      const composed1Score = w1 * directScore;
      if (!seen.has(hop1Id)) {
        const s = skillById[hop1Id];
        if (s) seen.set(hop1Id, { skill: s, score: composed1Score, source: 'composed' });
      }

      // 2-hop expansion
      const hop2 = neighboursOf(hop1Id, graph);
      for (const { id: hop2Id, weight: w2 } of hop2) {
        if (!seen.has(hop2Id)) {
          const s = skillById[hop2Id];
          if (s) {
            seen.set(hop2Id, { skill: s, score: w2 * w1 * directScore, source: 'composed' });
          }
        }
      }
    }
  }

  const composedResults = [...seen.values()]
    .filter((e) => e.source === 'composed')
    .sort((a, b) => b.score - a.score)
    .map((e) => e.skill);

  return [...direct, ...composedResults].slice(0, MAX_COMPOSED);
}

/**
 * Return the current graph object (for tests and debugging).
 * @returns {{ nodes: object, edges: object }}
 */
export function getGraph() {
  return loadGraph();
}

/**
 * Return the absolute path to the graph file (for tests).
 * @returns {string}
 */
export function graphFilePath() {
  return graphPath();
}
