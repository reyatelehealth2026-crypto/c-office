# Phase 4 — Quality + Governance: Design Notes

Decisions made autonomously (user offline). Recorded here per task instruction.

## 4.1 Eval Harness

### Grader model choice
The default grader uses `claude-haiku-4-5` (not Sonnet) to keep grading cost low.
Grading is a simple 0-1 scoring task that does not need full Sonnet capability.
Override at any time by calling `setGraderFn(fn)` before a run or in tests.

### Tag-overlap threshold
`findMatchingEval` requires overlap of more than 1 content word (at least 2).
Single-word overlaps produce too many false positives for short goals.
Exact match (case-insensitive) is always tried first before tag-overlap.

### Eval store location
`COFFICE_EVALS_DIR` defaults to `~/.c-office/evals/`. Grades live under
`~/.c-office/evals/grades/`. The sub-directory is created lazily on first write.
File mode: 0o600, consistent with all other c-office persistent stores.

### Grader is injectable (not hardcoded)
`setGraderFn(null)` restores the default SDK grader. This keeps tests
dependency-free (no API key needed) while the production path uses real Claude.

---

## 4.2 Skill Versioning

### Frontmatter field name: `degradedCount` (not `degradeCount`)
The spec says `degradedCount`. An earlier partial implementation in the codebase
used `degradeCount` (without the `d`). Phase 4 standardises on `degradedCount`
to match the spec exactly and rewrites the function accordingly.

### Fork threshold
3 strikes (`DEGRADE_THRESHOLD = 3`) before a fork is spawned, matching the spec:
"After 3 strikes, fork the skill."

### Version suffix scheme
Forked skills get a `_v2` suffix (incrementing to `_v3`, `_v4`, etc. if multiple
forks already exist for the same base id). Deterministic and scannable on disk.

### `recallSkills` skips superseded skills
Skills with `supersededBy` set are filtered out of recall results. The full
`listSkills()` still returns them for audit/history purposes.

### Fork trigger location in runner.js
The fork is spawned in the success path of `runPipeline` when the completed run
recalled a skill that is now at or above the degrade threshold but not yet
superseded. This is the earliest point we have a verified better trajectory.

---

## 4.3 Approval Gates

### Gate wait mechanism: Promise-based, not poll-based
The spec suggested "poll-based wait every 2s". A Promise-based approach was
chosen instead: simpler, zero-latency on approval, no timer drift. The 30-minute
timeout uses a single `setTimeout` per gate rather than repeated polling.
`registerGateResolver` stores `{resolve, reject}` keyed by runId.

### Gate check location
`requiresApproval(opts, phase)` reads `workflow.requiresApproval` (from the
workflow template JSON) OR `opts.requiresApproval` (passed directly to
`runOrchestrator`). Callers can require approval without a named workflow.

### Workflow template extension
Workflow templates can now declare:
```json
{ "requiresApproval": ["execute", "verify", "final"] }
```
Any subset of those three phase names is valid. The field is optional and
defaults to no gates (backward-compatible with all existing workflows).

### Gate resolver cleanup
After `approveRunPhase` or `rejectRunPhase` fires the resolver is removed from
the Map, so a second HTTP call is a silent no-op and does not double-resolve.

---

## 4.4 Audit Trail

### File location
`COFFICE_AUDIT_DIR` defaults to `~/.c-office/audit/`. One `.jsonl` file per run,
named `<runId>.jsonl`. File mode 0o600, consistent with all other stores.

### Decision points wired into runner.js
- `plan-emitted` — planner produced a valid plan
- `plan-template` — workflow template loaded (planner skipped)
- `delegation-start` — each tool_use delegation to a specialist
- `delegation-result` — each tool_result back from a specialist
- `critique-done` — critic returned severity
- `verify-done` — verifier returned pass/fail
- `gate-pending` — pipeline paused at an approval gate
- `gate-approved` — gate cleared via HTTP POST
- `gate-rejected` — gate rejected via HTTP POST
- `budget-exceeded` — cost ceiling hit during a phase
- `run-done` — run completed successfully
- `run-failed` — run ended with an error

`plan-error` scratchpad entries are NOT duplicated into the audit log; they
represent system failures rather than pipeline decisions.

### `GET /api/task/:id/audit` returns raw JSONL as text/plain
Callers can stream-parse or grep the response. An empty string (not 404) is
returned when no audit file exists yet (e.g. run still in `plan` phase before
any decision has been recorded).
