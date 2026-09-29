---
title: "Authorize the Next Action, Not the Whole Agent"
date: "2026-09-29"
updated: "2026-09-29"
created_at: "2026-09-29T10:00:00-04:00"
published_at: "2026-09-29T10:00:00-04:00"
scheduled_at: "2026-09-29T10:00:00-04:00"
slug: "authorize-the-next-action-not-the-whole-agent"
description: "Granting an automated agent a broad role for a narrow task turns an ordinary workflow into an unreviewable bundle of authority."
summary: "Represent authorization as a scoped, expiring capability for the concrete next action. It is easier to review, revoke, and audit than a permanent agent role."
tags: [AI agents, security, automation]
author: "vabs"
status: "published"
canonical_url: "https://my-slops.github.io/Blog/posts/2026/09/authorize-the-next-action-not-the-whole-agent/"
license: "MIT"
audience: "general"
reading_time: "5 min"
---

An agent asked to “update this documentation page” does not need permission to read every customer record, create repositories, or send messages to every workspace member. Yet broad service roles make that accidental expansion common because they are easy to issue once.

The safer unit of authorization is the next action: update this page, in this workspace, before this time, with this expected object identity.

```json
{
  "subject": "doc-agent/run-418",
  "action": "page.write",
  "resource": "pages/architecture-overview",
  "expires_at": "2026-09-29T15:00:00Z"
}
```

This is a capability-shaped permission. It can be narrower than a role, expires naturally, and leaves an audit record that corresponds to a human request.

## Why broad roles fail review

“The agent is an editor” bundles many decisions: which space, which pages, whether it may publish, whether it may change access controls, and how long the grant persists. A reviewer cannot tell which of those was actually needed for the current task.

Action-scoped authorization makes denials useful too. If the agent needs to perform a new kind of operation, it can present the concrete action and resource for review instead of treating the original task as permission to improvise.

This is not a claim that every internal script needs a new token for every line of code. Long-running systems can use roles where their responsibility genuinely is broad and stable. But an interactive or delegated agent doing a bounded request is exactly where least privilege is practical.

## References

- [NIST SP 800-162: Attribute Based Access Control](https://csrc.nist.gov/pubs/sp/800/162/upd1/final) describes authorization based on subject, object, action, and environment attributes.
- [OAuth 2.0, RFC 6749](https://www.rfc-editor.org/rfc/rfc6749) defines scoped delegated authorization.

## Final take

Do not ask whether an agent is trusted in general. Ask whether this next effect is authorized, for this resource, at this time.

## Changelog

- 2026-10-03T00:08:49-04:00: Recovered the 2026-09-29 scheduled slot after a novelty review against existing AI-agent posts.
