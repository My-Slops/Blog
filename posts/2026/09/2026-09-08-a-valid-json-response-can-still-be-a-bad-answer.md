---
title: "A Valid JSON Response Can Still Be a Bad Answer"
date: "2026-09-08"
updated: "2026-09-08"
slug: "a-valid-json-response-can-still-be-a-bad-answer"
description: "Structured output prevents malformed responses, but it can also pressure a model to fill a schema when the evidence does not support an answer. Design an explicit honest outcome instead."
summary: "A response schema proves the shape of an answer, not whether an answer should be given. Include explicit states for missing evidence, ambiguity, and refusal so a valid object can also be an honest one."
tags:
  - ai agents
  - api design
  - reliability
  - evals
  - developer tooling
author: "vabs"
status: "published"
canonical_url: "https://my-slops.github.io/Blog/posts/2026/09/a-valid-json-response-can-still-be-a-bad-answer/"
license: "MIT"
audience: "general"
reading_time: "6 min"
---

## TL;DR

Structured output is a major improvement over asking a model to "return JSON." It can guarantee that required keys exist, enums are valid, and downstream code receives the shape it expects.

But a schema only constrains *form*. It cannot establish that the input contains enough evidence for the requested conclusion. If every schema-shaped response looks like success, the model is under pressure to populate fields even when the request is ambiguous, out of scope, or unsupported by the supplied material.

Treat "I cannot determine this from the available evidence" as a first-class response state. A useful schema represents an answer *and* the legitimate reasons not to manufacture one.

## Context

Consider an internal policy assistant that must return a recommendation and supporting citations:

```json
{
  "recommendation": "approve | reject",
  "citations": ["source-id"]
}
```

This is pleasant for a UI. It is also a trap. A request may concern a policy that was not retrieved, contain two contradictory documents, or ask a question the policy does not answer. Yet the only representable outcomes are `approve` and `reject`.

At that point, parsing succeeds even when the application has failed. A model can emit valid JSON, use an allowed enum, and provide plausible-looking source IDs while still giving the reader a conclusion the evidence cannot carry.

OpenAI's Structured Outputs documentation makes the boundary unusually clear. The feature enforces a supplied JSON Schema, but the documentation separately warns that structured responses can still contain mistakes. It specifically recommends defining how the model should handle input that cannot produce a valid response; otherwise, the model may try to satisfy the schema by hallucinating. That is not a quirk of one API. It is a design warning: a type-safe answer is not automatically an epistemically safe answer.

## Key Points

### A parser cannot validate a conclusion

Schema validation can answer questions such as:

- Is `recommendation` one of the allowed values?
- Is every `citation` a string?
- Did the response include the fields a consumer requires?

It cannot answer whether a cited document actually supports the recommendation, whether the corpus was complete, or whether the user asked an unanswerable question. Those are evidence and product questions.

This distinction is easy to lose because a successful parse is such a useful operational signal. It means the renderer will not crash and the workflow can proceed. It should not mean that the business action is safe to take.

The [Two-Anchor Pattern for Long-Context Prompts](https://my-slops.github.io/Blog/posts/2026/03/2026-03-25-the-two-anchor-pattern-for-long-context-prompts/) makes a related point for grounded answers: a final claim without supporting evidence should be treated as unverified. Structured output makes that status easier to carry through software, but only if the schema gives it somewhere to go.

### Model the outcome before the payload

For many applications, the root object should describe the result state before it describes the requested data. Here is illustrative TypeScript for the same policy assistant:

```ts
type PolicyResult = {
  status: "answered" | "insufficient_evidence" | "ambiguous";
  recommendation: "approve" | "reject" | null;
  citations: Array<{ sourceId: string; excerpt: string }>;
  missingEvidence: string[];
};
```

The important detail is not the exact names. It is that `recommendation` can be `null` for a valid reason, while the reason is visible to both the UI and the calling workflow.

An `answered` result still needs citations. An `insufficient_evidence` result can name the missing policy, date range, or record. An `ambiguous` result can ask the user to disambiguate instead of silently choosing an interpretation. Each is a useful, schema-valid response.

Do not hide these cases in a free-form `notes` field. If the application must render a follow-up prompt, avoid a write, or route a task to a human, the state belongs in a field the program can branch on.

### Keep provider-level exceptions separate from task-level outcomes

There are at least two kinds of "no answer," and they should not be collapsed.

1. A **provider or safety refusal** says the model will not fulfill the request. OpenAI documents refusals as a distinct response condition that may not follow the response schema.
2. A **task-level insufficiency** says the system is willing to help but lacks the information required to do so honestly. That should normally be a schema-valid application outcome.

The consumer needs to handle both. A refusal might display a safe alternative or end the interaction. Insufficient evidence might trigger retrieval, ask for a document, or send the task to review. Treating both as `null` makes observability and recovery needlessly vague.

This is also where structured output and tool policy meet. The [Tool-Scope Contract](https://my-slops.github.io/Blog/posts/2026/03/2026-03-20-the-tool-scope-contract-for-llm-agents/) limits what an agent may do; a response schema should say what the agent may *claim* when it cannot do enough. One is a permission boundary. The other is an honest-result boundary.

### Test the empty answer on purpose

Most schema tests use happy-path examples: a clear request, a complete document set, and an obvious conclusion. Those tests can demonstrate reliable parsing while completely missing the behavior users see at the edges.

Add cases where an answer would be harmful or invented:

```text
- The required source is absent from retrieved context.
- Two authoritative sources conflict.
- The request uses an undefined term.
- The model receives a task that belongs to another workflow.
- The only available evidence is older than the question permits.
```

For each case, assert both the response shape and the application behavior after it. Does the UI explain what is missing? Does a downstream workflow stop instead of treating `null` as an approval? Is the insufficient-evidence rate observable by agent version and retrieval configuration?

That last check matters. A growing rate may signal a retrieval regression or a legitimate change in user requests. A near-zero rate can also be suspicious if the application routinely handles uncertain questions. An honest-state metric needs interpretation, but it is much more informative than a parse-success rate alone.

This belongs beside the [eval-first workflow](https://my-slops.github.io/Blog/posts/2026/04/2026-04-01-eval-first-llm-workflow/). Evaluate whether the system chooses the correct state, not merely whether it produced a well-formed object.

## Steps / Code

### A response schema with an honest branch

This JSON Schema is simplified pseudocode. It illustrates a stable root object with a state field; adapt it to the subset and SDK your provider supports.

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": ["status", "recommendation", "citations", "missingEvidence"],
  "properties": {
    "status": {
      "type": "string",
      "enum": ["answered", "insufficient_evidence", "ambiguous"]
    },
    "recommendation": {
      "type": ["string", "null"],
      "enum": ["approve", "reject", null]
    },
    "citations": {
      "type": "array",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": ["sourceId", "excerpt"],
        "properties": {
          "sourceId": { "type": "string" },
          "excerpt": { "type": "string" }
        }
      }
    },
    "missingEvidence": {
      "type": "array",
      "items": { "type": "string" }
    }
  }
}
```

Then put behavioral constraints in the prompt and evals, rather than assuming the schema expresses all business logic:

```text
Return status=answered only when the supplied sources support the recommendation.
If essential evidence is absent, return status=insufficient_evidence,
recommendation=null, and name what is missing.
If the question has multiple reasonable meanings, return status=ambiguous
and explain the needed clarification in missingEvidence.
```

The application should still validate citations against the retrieved source set when that matters. A model selecting an allowed string is not proof that the string names a real or relevant document.

## Trade-offs

Adding explicit non-success states makes the consuming code and UI more complex. A team that only needs to display a draft may choose a simpler design. But that simplicity is expensive when the response drives a decision, a customer-facing assertion, or a tool action: the ambiguity moves from an explicit field into improvised downstream behavior.

There is also a failure mode in the opposite direction. A model can overuse `insufficient_evidence` when instructions are too cautious or retrieval is weak. Do not treat the new state as proof of safety. Review it with representative evals and production samples, just as you would review overly confident answers.

Finally, a response schema cannot replace ordinary validation. Check authorizations in code, verify references where they affect a decision, and handle incomplete responses and provider-level refusals. Structured output narrows one class of failure. It does not certify the entire workflow.

## References

- OpenAI, [Structured model outputs](https://developers.openai.com/api/docs/guides/structured-outputs)
- This repository, [The Two-Anchor Pattern for Long-Context Prompts](https://my-slops.github.io/Blog/posts/2026/03/2026-03-25-the-two-anchor-pattern-for-long-context-prompts/)
- This repository, [The Tool-Scope Contract for LLM Agents](https://my-slops.github.io/Blog/posts/2026/03/2026-03-20-the-tool-scope-contract-for-llm-agents/)
- This repository, [Stop Prompt-Tuning Blind: An Eval-First Workflow for Reliable LLM Apps](https://my-slops.github.io/Blog/posts/2026/04/2026-04-01-eval-first-llm-workflow/)

## Final Take

The point of structured output is not to make every response look complete. It is to make every response legible to software.

Give the system a schema-valid way to say that it lacks evidence, needs clarification, or cannot form a recommendation. Then a successful parse means something useful: the application received not just valid JSON, but a state it knows how to handle without pretending uncertainty is success.

## Changelog

- 2026-09-08: Initial publish.
