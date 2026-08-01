---
inclusion: manual
description: "FAQ and usage guide for the multi-role pipeline steering pack"
---

# Multi-Role Pipeline — FAQ & Usage Guide

## What is this?

A Kiro steering pack that provides a structured delivery pipeline. An agent switches roles at each stage, following role-specific constraints and producing defined artifacts.

## How do I use it?

### Starting a new feature

1. `PIPELINE.md` is auto-loaded — you always know where you are
2. Start at Stage 1: reference `#agent.PM` in your prompt
3. Complete PM deliverables → handoff to Stage 2
4. Reference `#agent.Architect` for design, then `#agent.Full-stack-dev` for build
5. Continue through all stages

### Activating a role

Type `#agent.PM`, `#agent.Architect`, `#agent.Full-stack-dev`, `#agent.QA`, `#agent.CloudOps`, or `#agent.Compliance-auditor` in your prompt.

### Skipping stages

For small fixes (e.g., typo fix), you can skip directly to the relevant stage. The pipeline is guidance, not a prison. Use judgment:
- Bug fix: Dev → QA → Deploy
- Hotfix: Dev → Deploy (with post-deploy QA)
- Docs only: no pipeline needed

## Common Questions

### Q: Do I need to follow all 6 stages for every change?

No. The pipeline is for **feature development**. Use your judgment:
- **Full pipeline**: new features, major refactors, security-sensitive changes
- **Partial pipeline**: bug fixes (Dev + QA + Deploy), config changes (CloudOps only)
- **No pipeline**: documentation updates, comment fixes

### Q: What if a gate rejects my work?

Follow the reject target in the pipeline table. Fix the issue, then re-submit to the rejecting gate. Don't skip the re-validation.

### Q: Can one person play multiple roles?

Yes. In solo development, you play all roles sequentially. The value is in the **checklists and handoff criteria** — they ensure nothing is missed, even when you're wearing all hats.

### Q: How does this work with Git branching?

- Each feature gets a branch (e.g., `003-multi-role-pipeline`)
- All stages work on the same feature branch
- Merge to `main` only after Stage 6 (Audit) passes
- Use PRs for review gates

### Q: Where do artifacts go?

| Role | Artifacts Location |
|---|---|
| PM | `docs/requirements/`, GitHub Issues |
| Architect | `docs/architecture.md`, `docs/adr/`, `docs/api/` |
| Dev | `src/`, `cdk/`, `tests/` |
| QA | `tests/`, `docs/test-reports/` |
| CloudOps | `docs/runbooks/`, CloudWatch Dashboards |
| Compliance | `docs/compliance/` |

### Q: What's always loaded vs. manual?

- **Always loaded** (`inclusion: always`): `PIPELINE.md` and `SECURITY-RULES.md` — you always have pipeline awareness and security constraints
- **Manual** (`inclusion: manual`): Role files and handoff protocol — loaded on-demand when you activate a role with `#`

### Q: How does this relate to the existing .kiro/specs?

Specs define **what to build** (requirements, design, tasks). This pipeline defines **how to build it** (process, roles, quality gates). They complement each other:
1. Use specs to define the feature
2. Use this pipeline to execute the delivery

## Troubleshooting

### "I'm stuck between stages"

Reference `#PIPELINE-HANDOFF` for the exact checklist. If you can't complete a checklist item, that's a blocker — document it and escalate.

### "The security rules conflict with what I need to do"

Security rules are non-negotiable. If you believe a rule should be relaxed for a specific case, document the rationale and route to Compliance Auditor for risk acceptance.

### "I need a role not listed here"

The six roles cover the core delivery pipeline. For specialized needs:
- Database design → Architect
- DevOps/CI → CloudOps
- UX/UI design → PM (requirements) + Dev (implementation)
- Security testing → QA + Compliance Auditor
