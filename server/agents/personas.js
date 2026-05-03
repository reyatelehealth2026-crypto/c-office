// Server-side persona registry for the agent execution layer.
//
// NOTE: This module is currently dead code — the live runtime reads personas
// directly from server/store/agents.js (which seeds from server/mapping/personas.js).
// It is kept here so any future code path that still imports
// `AGENT_REGISTRY`, `DELEGATE_TOOL`, or `getPersonaConfig` keeps working,
// and so the legacy ids (orchestra/echo/vex/...) still resolve via the
// alias map exported from server/mapping/personas.js.

import { PERSONAS, PERSONAS_BY_ID, resolveLegacyId } from '../mapping/personas.js';

function configFor(persona) {
  return {
    name: persona.name,
    role: persona.role || null,
    model: persona.provider === 'claude' ? 'claude-sonnet-4-6' : null,
    tools: Array.isArray(persona.toolsAllowed) ? [...persona.toolsAllowed] : [],
    systemPrompt: persona.systemPrompt || null,
  };
}

// Build an id-keyed registry from the canonical PERSONAS list. Each entry
// surfaces the systemPrompt, tools, and display name straight off the
// persona record — no parallel SHARED_TONE block to drift out of sync.
export const AGENT_REGISTRY = Object.fromEntries(
  PERSONAS.map((p) => [p.id, configFor(p)]),
);

// Atlas is the conductor and cannot delegate to itself, so it is excluded
// from the delegate enum.
export const DELEGATE_TOOL = {
  name: 'delegate',
  description: 'Delegate a self-contained instruction to a specialist persona. Returns their output.',
  input_schema: {
    type: 'object',
    properties: {
      persona: {
        type: 'string',
        enum: ['scout', 'scribe', 'forge', 'vector', 'pulse', 'warden', 'relay', 'oracle'],
        description: 'Persona id (not display name).',
      },
      instruction: {
        type: 'string',
        description: 'Self-contained instruction. Include any context the persona needs.',
      },
      depends_on: {
        type: 'string',
        description: 'Optional: previous tool_use_id this delegation builds on.',
      },
    },
    required: ['persona', 'instruction'],
  },
};

/**
 * Look up a persona config by id. Accepts both new ids and legacy aliases
 * (orchestra → atlas, vex → warden, ...). Returns null when unknown.
 */
export function getPersonaConfig(id) {
  if (!id) return null;
  const resolved = resolveLegacyId(id);
  if (AGENT_REGISTRY[resolved]) return AGENT_REGISTRY[resolved];
  const persona = PERSONAS_BY_ID.get(resolved);
  return persona ? configFor(persona) : null;
}
