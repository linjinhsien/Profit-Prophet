---
inclusion: manual
description: Handoff protocol reference for cross-stage transitions
---

# Pipeline Handoff Protocol

## Handoff Format

When completing a stage, produce a handoff summary using this structure:

```markdown
## Handoff: Stage N → Stage N+1

**From**: [Role completing work]
**To**: [Role receiving work]
**Branch**: [feature branch name]
**Date**: [ISO 8601 timestamp]

### Completed Deliverables
- [ ] [artifact 1 — path or description]
- [ ] [artifact 2 — path or description]

### Decisions Made
- [Decision 1]: [rationale]
- [Decision 2]: [rationale]

### Known Issues / Tech Debt
- [Issue 1]: [severity, suggested fix]

### Inputs for Next Stage
- [What the next role needs to know]
- [Any blockers or dependencies]

### Acceptance Criteria Verification
- [ ] [criteria 1] — PASS/FAIL
- [ ] [criteria 2] — PASS/FAIL
```

## Stage-Specific Handoff Checklists

### Stage 1 → Stage 2 (PM → Architect + Dev)

- [ ] Requirements document complete with acceptance criteria
- [ ] Task breakdown created and prioritized
- [ ] Dependencies identified
- [ ] Non-functional requirements specified (latency, throughput, availability)
- [ ] Stakeholder sign-off on scope

### Stage 2 → Stage 3 (Architect + Dev → QA)

- [ ] Architecture decision records committed
- [ ] Code complete with unit tests passing
- [ ] API contracts documented (OpenAPI or equivalent)
- [ ] Test environment instructions documented
- [ ] Known limitations documented

### Stage 3 → Stage 4 (QA → CloudOps)

- [ ] All test cases pass (unit, integration, e2e)
- [ ] No critical or high severity bugs open
- [ ] Security scan clean (no critical findings)
- [ ] Performance benchmarks within acceptable range
- [ ] Test report committed

### Stage 4 → Stage 5 (CloudOps → Review Gate)

- [ ] Infrastructure deployed successfully
- [ ] Health checks passing
- [ ] Monitoring and alerting configured
- [ ] Rollback procedure documented and tested
- [ ] Deployment runbook committed

### Stage 5 → Stage 6 (Review Gate → Compliance Audit)

- [ ] Architecture review approved
- [ ] Test coverage meets threshold (≥ 80%)
- [ ] Requirements verification complete
- [ ] No open blockers from review
- [ ] Release candidate tagged

## Reject Protocol

When a gate rejects:
1. Document the specific failure reason
2. Identify the responsible stage
3. Create a fix task with clear acceptance criteria
4. Route back to the responsible role
5. Re-run the gate after fix is applied

## Escalation

If a handoff is blocked for > 1 iteration:
1. Escalate to PM for re-prioritization
2. Document the blocker in the issue tracker
3. Consider scope reduction or alternative approach
