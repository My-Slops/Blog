---
title: "The Tool-Scope Contract for LLM Agents"
date: "2026-03-20"
updated: "2026-03-20"
slug: "the-tool-scope-contract-for-llm-agents"
description: "A practical pattern for reducing prompt-injection blast radius in tool-using agents by declaring explicit tool scope, approval gates, and default-deny behavior."
canonical_url: "https://my-slops.github.io/Blog/posts/2026/03/2026-03-20-the-tool-scope-contract-for-llm-agents/"
summary: "Prompt injection is not just a model problem; it is a system-boundary problem. A Tool-Scope Contract limits what the agent can do, where instructions are trusted, and when human approval is required."
tags:
  - ai agents
  - security
  - prompt injection
  - engineering
  - editorial workflow
author: "vabs"
status: "published"
---

## TL;DR

If your LLM agent can call tools, the key security question is not “can we block all prompt injection?” but “what is the worst thing an injected prompt can make the system do?”

A **Tool-Scope Contract** is a lightweight control layer with three rules:
1. **Default deny**: no tool call unless explicitly allowed by task policy.
2. **Least privilege inputs/outputs**: tools get only the minimum fields needed.
3. **Approval gates for high-impact actions**: destructive/external actions require human confirmation.

This does not eliminate prompt injection, but it sharply reduces blast radius.

## Context

Yesterday’s Source-Lock method focused on writing reliability. Today’s layer is system reliability: what happens when models are connected to external data and real actions.

Current guidance from security and risk standards converges on the same theme:
- OWASP lists prompt injection as a top LLM risk, including direct and indirect attacks and unauthorized tool usage.
- Microsoft’s Prompt Shields documentation treats hidden instructions in third-party content as first-class attack paths and highlights interception points.
- NIST AI RMF and the Generative AI Profile emphasize operational risk management rather than one-shot “silver bullet” defenses.

The practical takeaway: treat agent behavior as a **policy-enforced workflow**, not pure model judgment.

## Key Points

### 1) Prompt injection is a boundary failure, not only a prompt failure

If instructions and untrusted content are mixed, the model may treat hostile text as authority. Even strong prompting cannot guarantee perfect separation.

So the control plane must live outside prose prompts:
- explicit trust zones (system policy vs user input vs retrieved content),
- explicit tool authorization,
- explicit execution constraints.

### 2) Define a Tool-Scope Contract per task type

Each task should have a short policy object:
- allowed tools,
- allowed parameter schemas,
- disallowed side effects,
- escalation rules.

Example:
- “Summarize docs” task may read URLs and local files,
- but cannot send messages, mutate repositories, or run shell commands.

If a task requests out-of-scope behavior, fail closed and ask for approval.

### 3) Add approval gates where reversibility is low

Use human confirmation for actions that are:
- destructive (delete, overwrite, force-push),
- external (email/message/send money),
- privileged (secrets, production changes).

This gives you a reliable stop point when model confidence and real-world risk diverge.

### 4) Validate tool arguments, not just model intent

Even if intent looks benign, argument payloads can be harmful.

Minimum checks:
- strict schema validation,
- path/domain allowlists,
- length and character constraints,
- explicit blocking of ambiguous wildcards.

This blocks many accidental and adversarial misuse paths before execution.

### 5) Log policy decisions as first-class telemetry

Store:
- requested action,
- policy decision (allow/deny/escalate),
- reason code,
- actor (model/human).

These logs make postmortems and policy iteration far easier than inspecting model text alone.

## Steps / Code

### 12-minute Tool-Scope Contract pass

```text
Minute 0-2: List all tools an agent can call for this workflow
Minute 2-4: Mark each tool as read-only, write, external, or destructive
Minute 4-6: Set default-deny + explicit allowlist by task type
Minute 6-8: Add schema/path/domain validation to allowed tools
Minute 8-10: Add human approval for high-impact categories
Minute 10-12: Add decision logging (allow/deny/escalate + reason)
```

### Minimal policy sketch

```json
{
  "task": "summarize_external_articles",
  "default": "deny",
  "allow": {
    "web_fetch": { "domains": ["docs.example.com", "nist.gov", "owasp.org"] },
    "read": { "paths": ["/workspace/notes/"] }
  },
  "escalate": ["message.send", "exec", "delete"],
  "deny": ["secrets.read", "repo.force_push"]
}
```

### Ship rule

```text
If an action is out of scope and no human approval exists:
DENY, log reason, and return a safe alternative.
```

## Trade-offs

### Costs

1. Extra engineering overhead to define and maintain policies.
2. More user friction on high-impact actions due to approval prompts.
3. Initial false denies while policy coverage matures.

### Benefits

1. Lower blast radius from direct/indirect prompt injection.
2. Better operational auditability and incident response.
3. Clearer team ownership of risk decisions.
4. More predictable agent behavior in production.

## References

- OWASP GenAI, *LLM01:2025 Prompt Injection*: https://genai.owasp.org/llmrisk/llm01-prompt-injection/
- OWASP Cheat Sheet, *LLM Prompt Injection Prevention*: https://cheatsheetseries.owasp.org/cheatsheets/LLM_Prompt_Injection_Prevention_Cheat_Sheet.html
- Microsoft Learn, *Prompt Shields in Microsoft Foundry*: https://learn.microsoft.com/en-us/azure/foundry/openai/concepts/content-filter-prompt-shields
- NIST, *AI Risk Management Framework (AI RMF 1.0)*: https://doi.org/10.6028/NIST.AI.100-1
- NIST, *AI RMF: Generative AI Profile*: https://doi.org/10.6028/NIST.AI.600-1

## Final Take

You probably won’t “solve” prompt injection at the model layer alone.

But you can make it much less dangerous by treating tool use as a contract: default deny, minimal scope, and explicit human gates for high-impact moves.

That is a practical security posture you can apply today without waiting for perfect models.

## Changelog

- 2026-03-20: Initial publish with Tool-Scope Contract pattern for tool-using LLM agents.
