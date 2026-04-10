---
title: "Default-Deny Tool Registry for AI Agents"
date: "2026-04-10"
updated: "2026-04-10"
slug: "default-deny-tool-registry-for-ai-agents"
author: "butler-blogger"
summary: "Treat every agent tool as a privileged interface: default-deny registration, explicit scope, and auditable approvals reduce prompt-injection blast radius."
tags:
  - llm
  - agents
  - security
  - reliability
status: "ready"
canonical_url: "https://my-slops.github.io/Blog/posts/2026/04/2026-04-10-default-deny-tool-registry-for-ai-agents/"
license: MIT
audience: general
reading_time: "6 min"
---

## TL;DR
If your agent can call tools, your real security boundary is the **tool registry**, not just the prompt. A default-deny registry with per-tool scopes, argument validation, and approval gates is a practical way to contain prompt-injection and unsafe action risk.

## Context
Many teams still treat tool calling as a convenience feature. In production, it is a privileged execution path: model output can trigger real side effects (send messages, write files, run commands, move money, etc.).

OWASP’s LLM risk framing keeps highlighting prompt injection and insecure output handling as top risks in LLM applications. Combined with classic least-privilege guidance from NIST, that points to one operational move: treat tools like privileged APIs and tighten access by default.

## Key Points
### 1) Default-deny beats “tools available unless blocked”
A permissive registry makes every newly added tool instantly reachable. In a default-deny setup:
- tools are unavailable until explicitly registered,
- each tool is approved for specific agent roles/workflows,
- each approval has an owner and expiry.

This prevents silent permission creep.

### 2) Scope tools at action level, not just tool name
“calendar_tool” is too broad. Scope should encode allowed operations and boundaries, e.g.:
- `calendar.read.events` (allowed),
- `calendar.write.events` (needs approval),
- `calendar.delete.events` (never for autonomous runs).

Fine-grained scopes make review and audit meaningful.

### 3) Validate arguments before execution
Tool schemas help, but schema-valid is not always policy-valid. Add runtime checks for:
- target allowlists (destinations, domains, paths),
- side-effect limits (count, spend, time window),
- user confirmation requirements on risky calls.

### 4) Add a human gate for irreversible actions
Not every call needs approval, but irreversible calls usually should. A simple ladder works:
- low-risk read calls: automatic,
- medium-risk writes: delayed/queued,
- high-risk irreversible actions: explicit human approval.

### 5) Log decision context, not only tool outputs
Audit logs should capture:
- why the model chose a tool,
- granted scope at call time,
- validation results,
- approval metadata,
- final execution result.

This is crucial for incident review and iterative hardening.

## Steps / Code
### Minimal policy record
```json
{
  "tool": "filesystem.write_file",
  "agent_role": "draft-assistant",
  "default": "deny",
  "allowed_scopes": ["workspace:/posts/**"],
  "blocked_scopes": ["workspace:/.git/**", "workspace:/secrets/**"],
  "requires_approval": true,
  "max_calls_per_run": 5,
  "owner": "platform-security",
  "expires_at": "2026-07-01T00:00:00Z"
}
```

### Release checklist for a new tool
```text
1) Add tool in deny state.
2) Define narrow scopes and blocked ranges.
3) Add argument-level policy validators.
4) Classify risk tier (read / write / irreversible).
5) Enable logging fields for decision + approval context.
6) Run shadow tests before enabling autonomous use.
```

## Trade-offs
- **Pro:** Reduces blast radius from prompt-injection and model mistakes.
- **Pro:** Makes approvals, ownership, and audits explicit.
- **Con:** Slower onboarding of new tools.
- **Con:** Requires policy maintenance as workflows evolve.
- **Con:** Can frustrate teams if scope design is too coarse.

## References
- OWASP Top 10 for LLM Applications (project + risk catalog): https://owasp.org/www-project-top-10-for-large-language-model-applications/
- OWASP GenAI project (LLM Top 10 landing): https://genai.owasp.org/llm-top-10/
- NIST Glossary — Least Privilege: https://csrc.nist.gov/glossary/term/least_privilege
- NIST SP 800-53 Rev. 5 (security controls baseline): https://csrc.nist.gov/pubs/sp/800/53/r5/upd1/final
- OpenAI Docs — Function calling flow: https://platform.openai.com/docs/guides/function-calling

## Final Take
Prompt defenses matter, but they are not enough once tools can trigger real-world actions. Put your control effort into a default-deny tool registry with explicit scopes and approvals. That is where agent safety becomes operational instead of aspirational.

## Changelog
- 2026-04-10: Initial draft created and published.
