---
title: "Delegation Should Shrink Authority"
date: "2026-10-16"
updated: "2026-10-16"
slug: "delegation-should-shrink-authority"
description: "A delegated agent needs enough authority for its assigned effect, not a copy of its parent agent's credentials or access surface."
summary: "Treat a subagent task as routing information, not authorization. Mint a short-lived, audience-bound grant for the exact downstream action and retain who acted on whose behalf."
tags:
  - ai agents
  - security
  - api design
  - reliability
  - developer tooling
author: "vabs"
status: "published"
canonical_url: "https://my-slops.github.io/Blog/posts/2026/10/delegation-should-shrink-authority/"
license: "MIT"
audience: "general"
reading_time: "7 min"
---

## TL;DR

Giving a subagent a task does not give it permission to do everything its parent could do. A task packet says *what work to attempt*. It is not a bearer credential, a blank approval, or a reason to forward the parent's broad API token.

When one agent delegates, make the downstream authority narrower: bind it to the intended service, action, resource, lifetime, and—when it matters—the approved input or preview. Record both the user whose work is being done and the agent that actually performed the call.

This is not ceremony for its own sake. It prevents an implementation detail such as parallel research, a specialist reviewer, or a recovery worker from quietly becoming the most privileged component in the workflow.

## Context

Consider a support agent that is allowed to resolve a refund after a human approves one order. It delegates to a billing subagent with an instruction like this:

```text
Refund order ord_4821 for $48.00 after confirming the payment is settled.
```

The convenient implementation is to pass the parent agent's service token along with the instruction. That token may also search all customer records, issue arbitrary refunds, export reports, or modify account access. The subagent only needs one narrow ability, but it receives the whole control plane.

Nothing has gone wrong yet. That is why this failure mode survives review. The initial task is correct, the subagent is well intentioned, and the broad token makes the happy path easy. The problem appears when the subagent follows untrusted text, retries against a different endpoint, expands a search, is reused for another task, or logs the token where a debugging tool can recover it.

The parent should delegate an effect, not its identity. That means the child gets something closer to:

```json
{
  "subject": "customer_91",
  "actor": "refund-subagent/run-775",
  "action": "refund.create",
  "resource": "orders/ord_4821",
  "amount": "48.00 USD",
  "audience": "https://billing.example.internal",
  "expires_at": "2026-10-16T15:05:00Z",
  "approval_id": "apr_982"
}
```

That is a policy shape, not a universal token format. Its value is in the missing powers: it cannot list customers, send email, change the amount, or redeem the grant at a different service.

## Key Points

### A task describes intent; a grant authorizes an effect

Agent systems often carry one object from planner to worker: a prompt, JSON task, or queue message. It may contain a target, a natural-language rationale, and a suggested sequence of tools. That makes it useful routing information. It does not establish that the worker is entitled to perform every operation it can infer from the text.

The distinction matters most when task content changes along the way. A planner may say “update the incident page”; a worker may discover an attachment saying “also invite the executive group.” The worker can use the task to understand the requested work, but authorization must come from a separate, enforceable decision about the concrete action and resource.

This is the delegated version of [authorizing the next action rather than the whole agent](https://my-slops.github.io/Blog/posts/2026/09/authorize-the-next-action-not-the-whole-agent/). The additional question is not merely *what may happen next?* It is *which actor may make that call, using which credential, at which service?*

### Forwarding a parent token breaks the boundary exactly where it is needed

A parent token is usually broad because the parent coordinates several possible paths. It may read the order, obtain approval, invoke billing, update the ticket, and notify the customer. A billing subagent should not inherit that whole set merely because the parent might need it later.

Forwarding a bearer token also removes a useful enforcement point. The downstream service sees the parent identity, not the delegated worker or the particular approval that led to the call. An audit record can say that the parent issued a refund, but not whether a receipt-checking worker, a retry worker, or an unrelated code path actually made the request.

OAuth's token-exchange specification exists for this kind of boundary: a service can exchange one token for another token appropriate for a downstream service, including a more narrowly scoped token. It also defines an `act` claim for expressing the current actor in a delegated call. That does not make OAuth mandatory for an agent runtime, but it is a useful reminder that delegation and impersonation are security semantics, not prompt metadata. [RFC 8693](https://www.rfc-editor.org/rfc/rfc8693.html)

### Scope alone is not enough; bind the recipient too

`refund.create` is a helpful scope. It does not tell a token which billing service, tenant, or API should accept it. A token accepted by multiple services can turn a narrow authorization into a reusable credential.

OAuth resource indicators address this separate dimension. A client can name the protected resource for which it wants a token, allowing the authorization server to apply audience restrictions. The RFC specifically warns that a token with multiple audiences can be used by any one of them against the others, requiring a high degree of trust. [RFC 8707](https://www.rfc-editor.org/rfc/rfc8707.html)

For an internal agent platform, the equivalent may be a service name rather than an OAuth `resource` parameter. The design principle is the same:

```text
worker identity + permitted action + exact resource + intended recipient + expiry
```

If the worker has to call a different API, it should ask the coordinator for a new grant. Do not make a token portable merely to avoid one extra exchange.

### Preserve the actor chain, but do not make it a permission amplifier

An incident review needs to answer more than “which token made this call?” It needs the chain: which user request started the work, which parent delegated it, which subagent called the tool, and which approval covered the result.

Keep those facts in an append-only audit record or signed grant. But do not inspect the chain and union every historical actor's permissions. RFC 8693 makes an analogous distinction: the current actor and the token's top-level claims are relevant to access-control decisions; earlier nested actors are informational history.

That yields a clean rule for agent systems:

- use the current grant to decide permission;
- use the chain to explain provenance; and
- never use provenance alone to recover a privilege that the current grant does not carry.

This avoids a common confused-deputy shape: “the original requester was an administrator” becomes an excuse for a low-trust helper to execute an administrative action outside the resource or time that was actually approved.

## Steps / Code

Start with a coordinator that issues a small, single-purpose delegation rather than distributing its session credential. The code is illustrative; a production implementation must sign grants, authenticate the caller, and persist the approval and idempotency records.

```ts
type DelegationGrant = {
  grantId: string;
  subject: string; // the user or tenant whose work is being done
  actor: string; // the specific worker run
  parentRunId: string;
  audience: "billing-api";
  action: "refund.create";
  orderId: string;
  amountCents: number;
  approvalId: string;
  expiresAt: string;
};

async function delegateRefund(input: {
  parentRunId: string;
  workerRunId: string;
  orderId: string;
  amountCents: number;
  approvalId: string;
}) {
  await approvals.assertCovers(input.approvalId, {
    action: "refund.create",
    orderId: input.orderId,
    amountCents: input.amountCents,
  });

  return grants.issue({
    subject: "customer_91",
    actor: `refund-subagent/${input.workerRunId}`,
    parentRunId: input.parentRunId,
    audience: "billing-api",
    action: "refund.create",
    orderId: input.orderId,
    amountCents: input.amountCents,
    approvalId: input.approvalId,
    expiresAt: "2026-10-16T15:05:00Z",
  });
}
```

At the billing boundary, verify the entire grant rather than trusting the worker's natural-language task:

```text
Reject unless:
  - the grant issuer and signature are valid;
  - audience is this billing API;
  - action is refund.create;
  - the order and amount match the request;
  - the grant is unexpired and unused, or uses the same idempotency key;
  - the approval still covers this exact effect; and
  - the caller identity matches the delegated actor.
```

Exercise the negative cases, not just one successful refund:

1. Give the worker a grant for order `ord_4821`; ensure it cannot refund `ord_4822`.
2. Send the grant to the notification API; ensure its audience is rejected.
3. Retry the same request; ensure the idempotency record returns the original result rather than issuing another refund.
4. Let the grant expire before execution; ensure the worker must obtain a fresh decision instead of using the parent's old credential.
5. Replace the worker identity; ensure a different subagent cannot replay the grant.
6. Query the audit trail; ensure it names the user, parent run, current worker, approval, and resulting external operation.

## Trade-offs

Per-delegation grants add a coordinator, token issuance, and a verification path to every boundary. That can be excessive for a tightly contained in-process helper that has no network credentials and cannot reach any protected service on its own. In that design, pass an opaque capability handle and keep enforcement in the parent process rather than pretending every function call needs OAuth.

There is also a risk of making grants so granular that routine work stalls on needless exchanges. The right unit is not necessarily one token per line of code. It is the smallest useful unit that can be independently reviewed, bounded, and revoked: perhaps one import job, one approved batch, or one ticket update.

The stronger claim is narrower: do not give a delegated component more durable authority than the effect it was asked to carry out. If the worker discovers a new target, a larger amount, another recipient, or another service, that is a new request—not a reason to reuse a convenient parent token.

## References

- IETF, [RFC 8693: OAuth 2.0 Token Exchange](https://www.rfc-editor.org/rfc/rfc8693.html)
- IETF, [RFC 8707: Resource Indicators for OAuth 2.0](https://www.rfc-editor.org/rfc/rfc8707.html)
- IETF, [RFC 9700: Best Current Practice for OAuth 2.0 Security](https://www.rfc-editor.org/rfc/rfc9700.html)
- This repository, [Authorize the Next Action, Not the Whole Agent](https://my-slops.github.io/Blog/posts/2026/09/authorize-the-next-action-not-the-whole-agent/)
- This repository, [Capability Leaks Are How Writing Agents Become Ops Risk](https://my-slops.github.io/Blog/posts/2026/03/capability-leaks-are-how-writing-agents-become-ops-risk/)

## Final Take

Delegation is not permission cloning.

Let a task tell a worker where to help. Let a narrow, expiring, recipient-bound grant tell it what it may actually do. The resulting system is easier to parallelize, easier to revoke, and far easier to explain when something crosses a boundary it should not have crossed.

## Changelog

- 2026-10-16: Initial publication on authority attenuation for delegated agent work.
