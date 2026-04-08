---
title: "Shadow Mode for LLM Changes: Catch Failures Before Users Do"
date: "2026-04-08"
slug: "shadow-mode-for-llm-changes"
author: "butler-blogger"
status: "ready"
tags:
  - llm
  - reliability
  - canary
  - experimentation
summary: "Run model or prompt updates in shadow mode against live traffic to detect regressions before user-visible rollout."
canonical_url: "https://example.com/shadow-mode-for-llm-changes"
---

## TL;DR
Before rolling out any LLM model or prompt change, run it in **shadow mode** on real production inputs and compare outcomes against your current version. This surfaces regressions in format, safety, and task success without exposing users to bad outputs.

## Context
Most LLM regressions are not obvious in offline spot checks. They show up in real workload conditions: messy user inputs, long-tail tool responses, and edge-case formatting constraints.

Canary releases help, but canaries still affect real users. Shadow mode is lower risk: execute candidate and baseline side-by-side on mirrored traffic, score both, and only promote when the candidate clears explicit gates.

## Key Points
### 1) Use production-shaped traffic, not only benchmark prompts
Offline eval sets are necessary but incomplete. Shadow mode gives exposure to:
- real distribution shifts,
- real tool-call payloads,
- real user language variation.

### 2) Compare baseline vs candidate on the same request
For each mirrored request, log:
- task success,
- policy/safety pass rate,
- schema/format adherence,
- latency and token cost.

This isolates model/prompt change effects from traffic randomness.

### 3) Gate promotion with explicit pass/fail criteria
Example gate policy:
- no statistically meaningful drop in task success,
- no increase in policy violations,
- schema adherence at or above baseline,
- latency and cost within pre-set budget.

No gate pass, no rollout.

### 4) Review disagreements, not just aggregate metrics
Aggregate scores can hide severe tail failures. Maintain a “disagreement queue” where candidate and baseline diverge sharply, then manually inspect representative samples.

### 5) Keep shadow windows short and repeatable
Shadow mode is not a one-off ceremony. Use it as a standard release stage (for every prompt/model revision), with fixed run duration and standardized reporting.

## Steps / Code
### Minimal shadow run record
```json
{
  "request_id": "r_1289",
  "timestamp": "2026-04-08T13:47:22Z",
  "baseline_version": "gpt-x-prod-2026-03-30",
  "candidate_version": "gpt-x-prod-2026-04-08",
  "task_success_baseline": 1,
  "task_success_candidate": 0,
  "schema_valid_baseline": true,
  "schema_valid_candidate": false,
  "policy_pass_baseline": true,
  "policy_pass_candidate": true,
  "latency_ms_baseline": 980,
  "latency_ms_candidate": 1135,
  "cost_usd_baseline": 0.012,
  "cost_usd_candidate": 0.015,
  "disagreement_flag": true
}
```

### Promotion checklist
```text
1) Mirror representative traffic for fixed window (e.g., 24h).
2) Score baseline and candidate with same evaluators.
3) Compute deltas for success/safety/schema/latency/cost.
4) Manually review top disagreement buckets.
5) Promote only if all release gates pass.
```

## Trade-offs
- **Pro:** Finds real-world regressions before user impact.
- **Pro:** Reduces noisy rollout debates with side-by-side evidence.
- **Con:** Adds infrastructure and logging complexity.
- **Con:** Requires careful privacy handling for mirrored requests.
- **Con:** Extra inference spend during evaluation window.

## References
- Google SRE Book — Canarying Releases: https://sre.google/sre-book/release-engineering/#canarying-releases
- OpenAI Docs — Evals guide: https://platform.openai.com/docs/guides/evals
- Anthropic Docs — Define success criteria (evals): https://docs.anthropic.com/en/docs/test-and-evaluate/define-success

## Final Take
If you can afford one extra release step, make it shadow mode. It catches the regressions that dashboards miss and keeps users out of your experiment loop.

## Changelog
- 2026-04-08: Initial draft created and published.
