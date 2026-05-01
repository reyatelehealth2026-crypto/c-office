# Phase 5 — Future Integration with Phase 4

This file documents where Phase 5 self-improvement features would naturally
connect to Phase 4 governance features once both branches are merged.

Phase 5 was built in isolation from Phase 4 (branched from `main` at `cfa8f74`)
as required by the output contract. Phase 4 code is NOT assumed to exist here.

## 5.1 Plan critique + Phase 4.4 Audit log

**Current state:** `critiquePlan()` appends `kind: 'plan-critique'` and
`kind: 'plan-rewrite'` entries to the run scratchpad only.

**Future integration:** Phase 4.4 adds `appendAudit(runId, kind, payload)` that
writes append-only JSONL to `~/.c-office/audit/<runId>.jsonl`. Once merged,
`critiquePlan` should emit:

```js
// TODO: call when Phase 4 audit module is available
appendAudit(runId, 'plan-critique', { verdict, issues });
appendAudit(runId, 'plan-rewrite', { stepCount: plan.length });
```

This gives operators a persistent, queryable record of every plan rejection
and rewrite — useful for tuning the critique prompt over time.

## 5.2 Persona auto-tune + Phase 4.4 Audit log

**Current state:** `recordPersonaOutcome` tracks failures at run level only
(run status, critique severity, verify pass/fail). It cannot distinguish which
persona caused the failure versus which was a bystander in a failed run.

**Future integration:** Phase 4.4 audit entries include per-delegation outcome
records (`delegation-result` with `ok: true|false`). Once merged,
`recordPersonaOutcome` could be called per-delegation from the audit stream
for finer-grained failure attribution:

```js
// TODO: wire when Phase 4 audit consumer is available
if (entry.kind === 'delegation-result' && !entry.payload.ok) {
  recordPersonaOutcome({
    personaId: entry.payload.persona,
    projectId: run.projectId,
    outcome: 'failure',
  });
}
```

## 5.3 Skill graph + Phase 4.2 Skill versioning

**Current state:** `recordSkillCoOccurrence` fires on successful runs regardless
of whether recalled skills were degraded or forked. A forked `skill_X_v2`
accumulates graph edges independently of the original `skill_X`.

**Future integration:** Phase 4.2 adds `forkSkill()` which sets `supersededBy`
on the original skill. The graph's `composedRecall` could propagate edges from
original to fork on first use:

```js
// TODO: add when Phase 4 skill versioning is merged
// In composedRecall, after finding a composed neighbour:
const fork = skillById[neighbour.supersededBy];
const effectiveSkill = fork || neighbour;
```

## 5.2 Persona auto-tune + Phase 4.3 Approval gates

**Current state:** `generateSuggestion` fires automatically after 5 failures.
No human-in-the-loop step precedes the LLM call.

**Future integration:** Phase 4.3 adds `registerGateResolver`. A future option
could emit a `gate-pending` event so the operator reviews the failure stats
before the suggestion is generated, preventing spurious suggestions during
noisy exploratory development phases.
