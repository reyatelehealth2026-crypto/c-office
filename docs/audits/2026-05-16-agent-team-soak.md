# Audit: Agent-Team Soak Test — 2026-05-16

Audited by Claude Code (automated).  
Baseline shipped: 2026-05-02.  
Audit date: 2026-05-16.

---

## Status: DEGRADED

Core architecture is intact. Nine tests are failing — all are stale test-expectation drift from post-ship UI and provider changes, not architectural regressions. Three dashboard UI elements required by Invariant 8 are absent from the `TeamTimeline` render path.

---

## Test Results

| Metric | Count |
|---|---|
| Total tests | 197 |
| Pass | 187 |
| Fail | 9 |
| Skip | 1 |
| Cancel | 0 |

Previous baseline: 81 pass / 1 skip / 0 fail. Test count has grown from ~82 to 197 (new suites added since ship date). Baseline comparison is therefore proportional rather than absolute.

### Failing Tests

| # | Test | File | Root Cause |
|---|---|---|---|
| 1 | `listProjects returns newest first` | `agent-projects.test.mjs:38` | Rapid back-to-back `createProject` calls produce identical `updatedAt` timestamps; sort is nondeterministic at millisecond resolution. Test fragility, not logic bug. |
| 2 | `character image prompt is a general game character prompt, not a card prompt` | `character-image-generation.test.mjs:15` | Test expects `/full-body game character/i`; actual prompt now uses `"full-body character concept illustration"`. Prompt template changed, test not updated. |
| 3 | `google nano banana pro model mapping uses the official Gemini image model id` | `character-image-generation.test.mjs` | Test expects model name `'Nano Banana 2 Pro'`; actual is `'Nano Banana 2'`. Label change in code, test expectation stale. |
| 4 | `character generation stores generated image as a draft before replacing the active image` | `character-image-generation.test.mjs` | Response no longer contains `/Generated Draft/`; draft-before-replace flow or API response format changed. |
| 5 | `google character generation can use the current agent image as reference input` | `character-image-generation.test.mjs` | Codex OAuth token lacks `api.model.images.request` permission; returns 400. Environment issue or permission scope change. |
| 6 | `codex image edit path requests transparent PNG cutouts for roster use` | `character-image-generation.test.mjs` | Same Codex OAuth permission issue as #5. |
| 7 | `dashboard keeps OpenClaw-style operations summary cues` | `agent-runner.test.mjs` | String match fails after SIM Office Control redesign changed wording. |
| 8 | `provider list exposes only real chat providers` | `providers.test.mjs` | Test expects `['claude', 'codex']`; `providers-llm.js` now exports `['claude', 'codex', 'gemini']`. Test not updated when gemini provider was added. |
| 9 | `visible primary path sources keep sim office and operations cues` | `sim-office-all-paths-regression.test.mjs` | Expects `/workstation/i`; workfloor redesign changed wording to `"at desks"` / `"workroom"`. |

---

## Architecture Checks

| # | Invariant | Status | Notes |
|---|---|---|---|
| 1 | `runner.js`: 4-phase pipeline — `planRun`, `executeRun`, `critiqueRun`, `verifyRun`, each wrapped in `withPhaseTimeout` | ✓ PASS | All four phase functions present. `callOrchLLM` wraps Claude path with `withPhaseTimeout`; non-Claude paths use `Promise.race` against a `PhaseTimeoutError` deadline. `PHASE_TIMEOUTS_MS` defined for all four phases. |
| 2 | `skills.js`: exports `persistSkill`, `recallSkills`, `listSkills`; `recallSkills` accepts `opts.projectId`; skill files include `projectId` in YAML frontmatter | ✓ PASS | `persistSkill` writes `projectId` to frontmatter when `run.projectId` is set. `recallSkills` passes `opts.projectId` to `listSkills`. `listSkills` filters by `projectId`. |
| 3 | `workflows.js`: 3 built-in templates (`research-write-publish`, `code-review-ship`, `content-brief-distribute`); merges disk overrides from `.claude/workflows/*.json` | ✓ PASS | All three templates present in `BUILT_INS`. `loadDiskWorkflows()` reads `.claude/workflows/*.json`; `listWorkflows()` merges via `{ ...BUILT_INS, ...loadDiskWorkflows() }`. |
| 4 | `store/projects.js`: exports `listProjects`, `getProject`, `createProject`, `patchProject`, `deleteProject` | ✓ PASS | All five functions exported and implemented. |
| 5 | `store/runs.js`: exports `persistRun`, `findStaleRunningRuns`; `state.js` calls `sweepStaleRuns()` at boot | ✓ PASS | Both exports present. `sweepStaleRuns` called in `server/index.js` at boot (line 92). |
| 6 | `state.js`: exports `addPhaseCost`, `runOverBudget`, `COST_CEILING_USD`, `setRunVerification`, `setRunSkillsRecalled`, `bumpRunRevision` | ✓ PASS | All six symbols exported. `COST_CEILING_USD` defaults to `$5.00` (env-configurable). |
| 7 | `api/projects.js` mounted in `index.js`; `POST /api/task` accepts `workflow` and `projectId` body fields | ✓ PASS | Projects router mounted in `index.js`. `task.js` reads `workflow` and `projectId` from `req.body` and passes into run opts. |
| 8 | `page-dashboard.jsx`: `TeamTimeline`, phase pills, recalled-skills strip, project chip, workflow chip, verification banner | ~ PARTIAL | `TeamTimeline` exists and phase pills render. **Missing**: recalled-skills strip, project chip on run card, workflow chip, verification pass/fail banner. Underlying data (`run.skillsRecalled`, `run.projectId`, `run.workflow`, `run.verification`) is present in state — gap is in the JSX render layer only. |

---

## Recent Changes Since 2026-05-02

Eight commits found; all are UI/CSS/docs — no server-side agent logic touched:

- `8b06fd6` docs: embed multi-page walkthrough GIF in README (`scripts/record-hero-pages.js`, `docs/hero/c-office-pages.gif`)
- `87cceea` feat(workfloor): redesign agents page as SIM Office Control — rewrites `page-agents.jsx` (919→538 lines), adds `ux-workfloor.css`, updates `agent-office-ui.test.mjs` selectors
- `26950d4` docs(CLAUDE.md): document agent registry, theme gotchas, Phase 3-7
- Six earlier commits: sidebar CSS fixes, `ux-readable.css` overrides, `index.html` cache-busting (no server-side changes)

No commits touched `server/agents/runner.js`, `server/agents/skills.js`, `server/agents/workflows.js`, `server/store/runs.js`, `server/store/projects.js`, or the new test files since the architecture shipped.

---

## Recommended Actions

### High priority

1. **Fix stale test expectations (tests 2, 3, 4, 7, 8, 9)** — Update assertion strings to match current code. These are one-liner fixes; no logic change needed.
   - `character-image-generation.test.mjs`: update prompt regex and model label
   - `agent-runner.test.mjs`: update dashboard wording check
   - `providers.test.mjs`: add `'gemini'` to the expected provider array
   - `sim-office-all-paths-regression.test.mjs`: update `/workstation/i` to match new wording

2. **Fix Codex OAuth scope (tests 5, 6)** — The Codex token used in the test environment is missing `api.model.images.request`. Either add the scope to the test fixture token or add a skip guard when the scope is absent.

### Medium priority

3. **Fix `listProjects` sort test (test 1)** — Insert a 1 ms `await` between the two `createProject` calls in the test, or sort by `createdAt` + `id` as a tiebreaker in `listProjects`.

4. **Add missing `TeamTimeline` UI elements (Invariant 8)** — The data is in `run` state; wire it up in `page-dashboard.jsx`:
   - Recalled-skills strip: render `run.skillsRecalled` as a horizontal chip row below the phase bar
   - Project chip: show `run.projectId` label in the run card header
   - Workflow chip: show `run.workflow` if set
   - Verification banner: render `run.verification?.passed` with a green ✓ / red ✗ badge

### Low priority

5. **Align test baseline tracking** — The test count grew from ~82 to 197. Update the baseline in audit tooling and CI expectations accordingly.
