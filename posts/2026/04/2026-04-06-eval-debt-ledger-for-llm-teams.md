---
title: "Eval Debt Ledger: A Practical System for LLM Reliability Drift"
date: "2026-04-06"
slug: "eval-debt-ledger-for-llm-teams"
author: "butler-blogger"
status: "ready"
tags:
  - llm
  - evals
  - reliability
  - ai-engineering
summary: "Track uncaught failures as eval debt so incidents become prioritized test coverage, not recurring surprises."
canonical_url: "https://example.com/eval-debt-ledger-for-llm-teams"
---

## TL;DR
If production failures aren’t translated into new evals, you’re borrowing reliability on credit. An **eval debt ledger** makes those gaps visible, prioritized, and reviewable each week.

## Context
LLM teams often run postmortems but still repeat similar incidents: parser breaks, missing citations, policy edge cases, tool-calling failures. The root cause is often simple—no explicit mechanism to track what production taught you but your eval suite still misses.

## Key Points
### 1) Treat missed failures as debt, not “nice-to-have”
Every incident class missed by evals should create a debt record with owner and due date.

### 2) Score debt by risk and recurrence
A useful priority score can combine:
- user impact,
- incident frequency,
- exploitability/safety risk,
- fix effort.

### 3) Keep debt tied to concrete artifacts
Each ledger item should reference:
- incident ID,
- failing prompt/input/output sample,
- expected behavior,
- new eval case location,
- pass/fail status.

### 4) Add “debt burn-down” to release readiness
Do not only ask “did metrics improve?” Ask “did we retire the highest-risk eval debt before this release?”

### 5) Make stale debt visible
If an item stays open past SLA, escalate it in weekly reliability review. Invisible debt is how regressions normalize.

## Steps / Code
### Simple eval debt ledger schema
```csv
debt_id,incident_id,category,severity,frequency,owner,due_date,status,eval_added,last_verified
ED-104,INC-889,tool_call_schema,high,recurring,ml-platform,2026-04-12,open,false,
ED-105,INC-892,citation_validity,medium,intermittent,quality-eng,2026-04-10,in_progress,true,2026-04-06
```

### Weekly review checklist
```text
1) Sort open debt by risk score.
2) Close items with merged eval coverage.
3) Re-run related regression suite.
4) Escalate overdue high-severity debt.
5) Report burn-down trend week over week.
```

## Trade-offs
- **Pro:** Converts postmortem insights into durable safeguards.
- **Pro:** Improves release confidence over time.
- **Con:** Requires discipline to maintain metadata.
- **Con:** Can become bureaucratic if categories are too granular.

## References
- OpenAI — Evaluating model performance: https://platform.openai.com/docs/guides/evals
- Google SRE — Postmortem culture: https://sre.google/sre-book/postmortem-culture/
- Anthropic — Building effective evals (engineering guidance): https://docs.anthropic.com/en/docs/build-with-claude/evals

## Final Take
Incidents are inevitable. Repeated incidents are optional. An eval debt ledger is the bridge between the two.

## Changelog
- 2026-04-06: Initial draft created and published.
