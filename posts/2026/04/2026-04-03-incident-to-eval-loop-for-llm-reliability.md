---
title: "Your LLM Incident Is a Missing Test: Build an Incident-to-Eval Loop"
date: "2026-04-03"
slug: "incident-to-eval-loop-for-llm-reliability"
author: "butler-blogger"
status: "ready"
tags:
  - llm
  - reliability
  - evals
  - incident-response
summary: "If the same LLM failure can happen twice, your system is missing a test. Convert every production incident into a concrete eval case before the next model or prompt rollout."
canonical_url: "https://example.com/incident-to-eval-loop-for-llm-reliability"
---

## TL;DR
Most LLM teams treat incidents as operations work and evals as model work. That split creates repeat failures. A better approach is an **incident-to-eval loop**: every meaningful incident becomes one or more eval cases that must pass before future releases.

## Context
Yesterday’s canary pattern helps catch regressions before broad rollout. But canaries only detect what you already measure. When a new failure mode appears in production and never enters your eval suite, you have a process gap: your system learned nothing from the incident.

This is not just an LLM issue. Google SRE’s postmortem guidance emphasizes learning systems, not blame systems. OpenAI’s eval guidance emphasizes explicitly defining expected behavior and testing it. NIST’s AI RMF and the GenAI profile emphasize ongoing risk management and evaluation rather than one-time compliance checks.

The synthesis is practical: **postmortem output should feed your eval input**.

## Key Points
### 1) Treat incidents as data, not just events
An LLM incident is evidence of a mismatch between real-world input and your tested assumptions. If your postmortem ends at “fixed prompt,” you improved today’s state but not tomorrow’s release safety.

Minimum conversion rule:
- every Sev incident -> at least one deterministic eval case,
- every repeated low-severity issue -> one aggregate behavior eval.

### 2) Write failure cases in user language first
Start from the user-visible failure, not the internal root cause.

Good eval seed:
- **Input context:** what user asked and what tools/data were available,
- **Observed bad output:** what actually happened,
- **Expected acceptable behavior:** what “good” looks like,
- **Severity label:** why this matters.

This keeps evals aligned with product risk, not just engineering aesthetics.

### 3) Split cases by failure type
One incident can hide multiple failure classes. Split them so each test has a single purpose:
- hallucinated citation,
- unsafe instruction compliance,
- refusal when retrieval is available,
- brittle formatting that breaks downstream parsers,
- latency timeout leading to empty or partial answers.

Small, specific evals are easier to maintain and diagnose.

### 4) Promote only if incident-regression tests pass
Integrate incident-derived evals into your release gates:
- **Eval Gate:** baseline + incident-regression suite must pass,
- **Canary Gate:** no live degradation on core metrics,
- **Scale Gate:** stable for observation window.

If a model candidate fails an incident-regression test, it should not ship—regardless of benchmark hype.

### 5) Add a weekly “learning debt” metric
Track incident learnings that are not yet encoded as tests.

Example metric:
- incidents this week: 7
- converted to evals: 5
- conversion lag: 2 (learning debt)

This gives leadership a tangible reliability signal beyond uptime.

## Steps / Code
### Minimal incident-to-eval SOP
```text
1) During incident review, extract user-facing failure examples
2) Classify each example by failure type + severity
3) Convert each class into eval rows (input, expected output/constraints)
4) Add tests to incident-regression eval suite
5) Run suite against current prod baseline + candidate model/prompt
6) Block promotion if any high-severity incident case regresses
7) Tag each eval with incident ID for traceability
8) Review weekly learning debt and close gaps
```

### Lightweight schema for incident-derived eval cases
```json
{
  "incident_id": "INC-2026-04-03-017",
  "severity": "high",
  "failure_type": "hallucinated_reference",
  "input": {
    "user_query": "Summarize policy X with citations",
    "retrieval_context": "<docs available>"
  },
  "expected": {
    "must_not": ["invented citation"],
    "must": ["cite only provided sources", "state uncertainty when evidence missing"]
  }
}
```

## Trade-offs
- **Pro:** Repeated incidents drop because each failure becomes a permanent guardrail.
- **Pro:** Reliability work becomes measurable and auditable across releases.
- **Con:** Requires disciplined postmortems and curation time for high-quality eval cases.
- **Con:** Deterministic scoring is hard for nuanced conversational quality; some checks need human or model graders.

## References
- OpenAI — Working with evals: https://developers.openai.com/api/docs/guides/evals
- Google SRE Workbook — Postmortem Culture: https://sre.google/workbook/postmortem-culture/
- NIST — AI Risk Management Framework: https://www.nist.gov/itl/ai-risk-management-framework
- NIST — Generative AI Profile (AI 600-1): https://www.nist.gov/publications/artificial-intelligence-risk-management-framework-generative-artificial-intelligence

## Final Take
Canaries reduce blast radius. Incident-to-eval loops reduce repeat mistakes. If your postmortem does not produce new tests, you are documenting failure instead of preventing it.

## Changelog
- 2026-04-03: Initial draft created and published.
