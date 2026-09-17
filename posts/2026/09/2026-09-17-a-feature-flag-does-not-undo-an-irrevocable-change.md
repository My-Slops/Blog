---
title: "A Feature Flag Does Not Undo an Irrevocable Change"
date: "2026-09-17"
updated: "2026-09-17"
created_at: "2026-09-17T10:00:00-04:00"
published_at: "2026-09-17T10:00:00-04:00"
scheduled_at: "2026-09-17T10:00:00-04:00"
slug: "a-feature-flag-does-not-undo-an-irrevocable-change"
description: "Turning off a feature changes future behavior; it does not reverse data migrations, outbound messages, or externally visible side effects already performed."
summary: "Use flags to limit exposure, but design a compensating action for every irreversible side effect. A toggle is not a rollback plan."
tags: [feature flags, deployment, reliability]
author: "vabs"
status: "published"
canonical_url: "https://my-slops.github.io/Blog/posts/2026/09/a-feature-flag-does-not-undo-an-irrevocable-change/"
license: "MIT"
audience: "general"
reading_time: "4 min"
---

Feature flags are good at stopping new traffic from entering code. They are bad at reversing a statement that has already left your system.

If a rollout sends invoices, migrates a customer's stored preference, or creates a cloud resource, disabling the flag prevents the next execution. It does not delete the invoice, restore the old preference, or reliably find every resource created while the flag was enabled.

## Separate exposure from compensation

For every flagged workflow, make two decisions:

1. What future behavior does the flag gate?
2. What compensating action exists for an effect already committed?

```text
flag off       -> stop issuing new invitations
compensation   -> revoke unaccepted invitations by campaign ID
not possible   -> disclose that accepted invitations require manual handling
```

The campaign ID is important. Compensation needs an identity that separates rollout effects from ordinary work. “Delete all invitations created today” is not a rollback; it is a broad new incident.

Some effects are intentionally irreversible. An email may be delivered; a ledger entry may need a correcting entry rather than deletion. The right plan can be to stop, account for the affected set, and communicate. Pretending the flag returned the world to its prior state only delays that work.

## References

- [Martin Fowler: Feature Toggles](https://martinfowler.com/articles/feature-toggles.html) describes flags as a release technique with operational costs.
- [AWS Well-Architected: Change management](https://docs.aws.amazon.com/wellarchitected/latest/operational-excellence-pillar/ops_mit_change_management.html) discusses reversible changes and rollback planning.

## Final take

A flag is a brake on future execution. A rollback is a separate design for the past.

## Changelog

- 2026-10-03T00:08:49-04:00: Recovered the 2026-09-17 scheduled slot; no retained completed editorial decision existed.
