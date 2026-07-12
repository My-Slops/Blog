---
title: "Secret Rotation Is an Availability Exercise"
date: "2026-07-12"
updated: "2026-07-12"
created_at: "2026-07-12T10:00:00-04:00"
published_at: "2026-07-12T10:00:00-04:00"
scheduled_at: "2026-07-12T10:00:00-04:00"
slug: "secret-rotation-is-an-availability-exercise"
description: "Rotating a credential safely requires old and new material to coexist long enough for every verifier and client to cross the boundary."
summary: "Design rotation as a staged compatibility change: introduce, distribute, verify adoption, then retire. Replacing a secret in one step is an outage strategy."
tags: [security, operations, reliability]
author: "vabs"
status: "published"
canonical_url: "https://my-slops.github.io/Blog/posts/2026/07/secret-rotation-is-an-availability-exercise/"
license: "MIT"
audience: "general"
reading_time: "5 min"
---

“Rotate the key” sounds like one operation. In a running system it is a compatibility release with two populations: processes that have learned the new credential and processes that still need the old one.

If the verifier stops accepting the old key before every client has adopted the new one, the security change becomes an availability incident. If it accepts both forever, the rotation has not reduced exposure. The difficult part is choosing and observing the overlap window.

## Prefer staged state over replacement

For a signing key, publish the new public key while continuing to verify signatures made by the old key. Start signing new tokens with the new key. Monitor which key IDs clients present. Retire the old key only after the maximum token lifetime, clock-skew allowance, cache lifetime, and observed straggler window have elapsed.

```text
T0: distribute key B; verify A and B
T1: issue new artifacts with B
T2: confirm no valid clients require A
T3: revoke A
```

Database passwords and third-party API credentials need the same pattern where providers permit it: create a second credential, update consumers progressively, prove health, then revoke the first. A single mutable secret value is convenient until one deployment misses a reload or a long-running worker keeps the old value in memory.

## Make ownership observable

Record which key version each deployment or request uses. A rotation dashboard that only says “secret changed” cannot tell you whether a background consumer is still depending on the retiring material. For services that cannot report version IDs, use a carefully bounded canary revocation before final removal.

Some compromises demand immediate revocation, and the overlap strategy changes. That is not an argument against staged rotation; it is a reason to design an emergency path separately and accept its availability trade-off consciously.

## References

- [AWS Secrets Manager: Rotate secrets](https://docs.aws.amazon.com/secretsmanager/latest/userguide/rotating-secrets.html) documents managed rotation and version stages.
- [NIST SP 800-57 Part 1 Rev. 5](https://csrc.nist.gov/pubs/sp/800/57/pt1/r5/final) covers cryptographic key management and lifecycle concerns.

## Final take

Rotation succeeds when nothing notices the new secret except the audit trail. That requires compatibility, observability, and a real retirement step.

## Changelog

- 2026-10-04T19:56:51-04:00: Recovered the 2026-07-12 scheduled slot. The retained run started but had no tool activity, result, or publishable source.
