# Phase 5 — Self-improvement: Implementation Notes

## Decisions made (user was offline)

### 5.1 Plan critique

**Decision: export `critiquePlan` from runner.js**
The spec says "new helper in runner.js" without specifying visibility. Exporting it enables direct testing without mocking the full pipeline.

**Decision: local structural checks run before the LLM call**
Cycle detection and unknown-persona checks are deterministic and free. If local checks flag HIGH issues the LLM is still called (it may find role-fit or merge issues) but local flags are unconditionally elevated to REWRITE regardless of the LLM verdict.

**Decision: workflow plans skip critique**
Workflow plans are pre-validated templates authored by humans. Critiquing them is noise. The `planFromTemplate` path bypasses `critiquePlan` entirely.

**Decision: critique tokens fold into `phaseCosts.plan`**
The spec says "phaseCosts.plan should include the critique tokens." We call `addPhaseCost(runId, 'plan', ...)` for the original plan call, the critique call, and the optional rewrite call. The dashboard plan-phase cost therefore reflects total pre-execution planning spend.

### 5.2 Persona auto-tune suggestions

**Decision: stats key format is `<personaId>::<projectId>` and `<personaId>::global`**
A flat JSON object with string keys is easier to inspect and debug than a nested structure, and avoids a schema migration step.

**Decision: `FAILURE_THRESHOLD` is exported**
Tests assert on the value. Exporting avoids magic numbers in test files.

**Decision: `generateSuggestion` is idempotent (skips if file already exists)**
Prevents re-generating on every server restart. The user deletes the file manually to request a fresh suggestion.

**Decision: `generateSuggestion` fires asynchronously inside `recordPersonaOutcome`**
Called with `.catch(() => {})` so it never blocks the runner pipeline.

**Decision: LLM uses `claude-haiku-4-5` for suggestions**
A one-paragraph addendum is a lightweight task. Haiku is cost-effective per the project performance guidelines.

**Decision: UI chip not implemented in `components.jsx`**
The spec says show a chip in TeamTimeline. `public/components.jsx` is in the pre-session uncommitted files list and must not be touched. The `GET /api/persona-tuning` route is wired so the frontend can query suggestions when that restriction is lifted.

### 5.3 Skill graph

**Decision: graph stored in `~/.c-office/skills/_graph.json`**
Exactly as specified. The underscore prefix prevents `listSkills()` from attempting to parse it as a skill file (the function filters by `.md` extension).

**Decision: no in-memory graph cache**
Every call reads/writes the file directly. This matches the stateless pattern in `skills.js` and is critical for test isolation (each test resets the file via `fs.unlinkSync`).

**Decision: function exported as `recordSkillCoOccurrence` not `recordSkillCo-occurrence`**
The spec uses a hyphen which is not a valid JavaScript identifier character. CamelCase is the correct ESM form.

**Decision: `MAX_COMPOSED = 5`**
Raw `recallSkills` caps at `MAX_SKILLS_RECALLED = 3`. Adding up to 2 hops of composed neighbours brings the total to at most 5, which keeps the planner context manageable.

## Files created / modified

| File | Change |
|------|--------|
| `server/agents/runner.js` | Added `critiquePlan()`, `rewritePlan()`, cycle/unknown-persona detection; wired plan critique in `runPipeline`; added `composedRecall` (5.3) and `recordPersonaOutcome` (5.2) wiring; fixed duplicate `GATE_TIMEOUT_MS` block from Phase 4 |
| `server/agents/skills.js` | Removed duplicate `degradeSkill` (Phase 5.1 stub vs Phase 4 implementation); fixed syntax errors (literal newlines) introduced by the concurrent Phase 4 agent |
| `server/agents/persona-tune.js` | New module (5.2) |
| `server/agents/skill-graph.js` | New module (5.3) |
| `server/index.js` | Added `GET /api/persona-tuning` route |
| `test/plan-critique.test.mjs` | New tests for 5.1 |
| `test/persona-tune.test.mjs` | New tests for 5.2 |
| `test/skill-graph.test.mjs` | New tests for 5.3 |
| `docs/phase5-future-integration.md` | Integration notes for Phase 4 |
| `docs/phase5-notes.md` | This file |

## Pre-existing test failures not introduced by Phase 5

Three tests in the suite fail that are not related to Phase 5 work:

- `app no longer loads or routes scene and adventure modes`
- `loaded interaction surfaces dispatch inline without opening scene overlays`
- `language-specific *-reviewer agents route to Sentinel (vex)`

These tests live in `test/no-scene-mode.test.mjs` and `test/persona-routing.test.mjs`, which are untracked files added by the concurrent Phase 4 agent. They fail on the clean `cfa8f74` commit as well (verified by stashing Phase 5 changes and re-running them). They are not regressions from Phase 5.
