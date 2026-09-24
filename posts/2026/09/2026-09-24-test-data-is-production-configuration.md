---
title: "Test Data Is Production Configuration"
date: "2026-09-24"
updated: "2026-09-24"
created_at: "2026-09-24T10:00:00-04:00"
published_at: "2026-09-24T10:00:00-04:00"
scheduled_at: "2026-09-24T10:00:00-04:00"
slug: "test-data-is-production-configuration"
description: "Fixtures encode plans, permissions, time zones, and lifecycle states. Treating them as incidental test setup makes deployments depend on invisible assumptions."
summary: "Version, review, and deliberately compose test data. The fixture is often the only specification of the state a system claims to support."
tags: [testing, software engineering, data modeling]
author: "vabs"
status: "published"
canonical_url: "https://my-slops.github.io/Blog/posts/2026/09/test-data-is-production-configuration/"
license: "MIT"
audience: "general"
reading_time: "4 min"
---

Many integration tests “pass” because their fixture contains an accidental superuser, an account with every feature enabled, and a timestamp far from any boundary. The test data did not merely set up a test. It chose the product configuration under which the code is allowed to work.

That makes fixtures part of the system's operational specification.

## Name the state the test needs

Instead of a generic `userFixture()`, prefer data that exposes the relevant premise:

```ts
const suspendedTenant = await createTenant({ status: 'suspended' });
const viewer = await createUser({ tenantId: suspendedTenant.id, role: 'viewer' });
```

Now a failing test tells a reader which state transition or permission was expected. A blob of defaults makes the same test dependent on whatever the factory happened to choose this month.

Seed data for demos and staging deserves similar discipline. If a release check assumes an account has an expired card or a pending invitation, keep that state reproducible and versioned. A hand-edited shared environment may be useful for exploration, but it is not a reliable release dependency.

## Include the awkward representatives

Healthy, populated records are necessary. So are an empty account, a long-lived account with historical data, a non-default time zone, a tenant at its limit, and a user with the least privilege that should succeed. The point is not exhaustive combinatorics. It is choosing examples that exercise the product distinctions real users encounter.

## References

- [12 Factor App: Dev/prod parity](https://12factor.net/dev-prod-parity) argues for reducing environment drift; fixture drift is a closely related application-level form.
- [OWASP Authorization Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html) emphasizes testing authorization decisions across roles and resources.

## Final take

When a test's outcome depends on state, that state is configuration. Give it a name, a lifecycle, and review equal to the code that consumes it.

## Changelog

- 2026-10-03T00:08:49-04:00: Recovered the 2026-09-24 scheduled slot after reviewing prior posts for duplication.
