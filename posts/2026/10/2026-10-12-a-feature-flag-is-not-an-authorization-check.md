---
title: "A Feature Flag Is Not an Authorization Check"
date: "2026-10-12"
updated: "2026-10-12"
slug: "a-feature-flag-is-not-an-authorization-check"
description: "A feature flag can decide whether to expose a path. It cannot decide whether a particular caller may perform the protected action."
summary: "Use flags to control rollout and product exposure, but authorize the requested action at the service boundary on every request. A hidden button, targeted flag, or disabled client route is not a permission check."
tags:
  - feature flags
  - security
  - api design
  - reliability
  - developer tooling
author: "vabs"
status: "published"
canonical_url: "https://my-slops.github.io/Blog/posts/2026/10/a-feature-flag-is-not-an-authorization-check/"
license: "MIT"
audience: "general"
reading_time: "6 min"
---

## TL;DR

A feature flag answers a rollout question: should this code path be exposed for this evaluation context? Authorization answers a different question: may this authenticated subject perform this action on this resource now?

Those answers can both depend on a user, a tenant, and a plan. That superficial similarity is why teams sometimes let a flag stand in for a permission check. Then an operator disables a button, a client sends the request directly, and the server performs an operation it was supposed to protect.

Use a flag to decide whether to offer or progressively release a capability. Enforce authorization at the protected operation, for every entry point, regardless of the flag value.

## Context

Suppose an application is rolling out bulk export to a few organizations. The frontend evaluates `bulk-export` and hides the action unless the flag is on. The service also evaluates the flag before starting an export:

```ts
if (!flags.booleanValue("bulk-export", false, { tenantId })) {
  return response.status(404).end();
}

return startExport(request.body);
```

That is an exposure control. It can be useful: the team can turn a new path on for two tenants, observe load, and turn it off quickly. But it says nothing about whether the current user can export this particular dataset.

An employee may call the endpoint directly. A background worker may bypass the browser entirely. A stale mobile client may still have the old route. A flag provider may return its supplied default while unavailable. None of those facts should turn `startExport` into a permission decision.

OpenFeature describes flag evaluation as resolving a typed value from a flag key, a supplied default, and optional evaluation context. That context can drive targeting, overrides, and fractional rollout; it is not an authorization verdict. [OpenFeature's provider specification](https://openfeature.dev/specification/sections/providers/) makes this API boundary explicit. OWASP's authorization guidance makes the complementary point: permission checks belong on the server-side operation and must not rely on client-side controls. [Authorization Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html)

## Key Points

### A shared input does not make two controls interchangeable

Both systems may inspect `tenantId`, subscription plan, region, or user role. They still make different decisions.

| Control | Question | Typical outcome when it says no |
| --- | --- | --- |
| Feature flag | Should this capability be exposed or rolled out here? | Hide the UI, avoid a new code path, or use an older product behavior. |
| Authorization | May this principal do this action to this resource? | Deny the request before reading protected data or causing an effect. |

Consider a paid-reporting flag targeted to `tenantId`. It can decide whether the product is ready to expose reporting to that tenant. It cannot tell whether the current employee is an administrator, whether the requested report belongs to the tenant, or whether an export is allowed under a legal hold.

Conversely, a valid permission does not require a flag to be enabled. An administrator might be allowed to export records as an established product capability even while a redesigned export workflow is in a limited rollout. Mixing those decisions tends to create brittle rules such as “flag on implies permission,” which fail as soon as either product eligibility or access policy changes independently.

### Put the flag outside the permission boundary

The service can use a flag to select an implementation or decide whether to advertise a capability. The handler that performs the protected operation should still verify the authenticated subject, requested action, resource, tenant, and relevant business constraints.

```ts
async function createExport(request: Request, response: Response) {
  const subject = requireAuthenticatedSubject(request);
  const report = await reports.find(request.body.reportId);

  if (report.tenantId !== subject.tenantId) {
    return response.status(404).end();
  }

  const permitted = await policy.allows({
    subject,
    action: "report.export",
    resource: report,
  });

  if (!permitted) {
    return response.status(403).end();
  }

  const useNewDelivery = flags.booleanValue(
    "new-export-delivery",
    false,
    { tenantId: subject.tenantId },
  );

  return response.status(202).json(
    await exports.start({ report, requestedBy: subject.id, useNewDelivery }),
  );
}
```

The order is intentional. The policy check protects the operation. The flag only chooses between authorized behaviors. In a real system, the lookup itself may need to be authorization-scoped so that an identifier does not reveal whether another tenant has a report. The example is illustrative, not a universal response-code recipe.

Centralizing the authorization decision also protects alternate paths: a scheduled job, an API client, a legacy screen, or a new route added later. OWASP recommends validating permissions on every request and treating UI checks only as a usability improvement, not as the decisive control. [Authorization Decisions and Output Handling](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Decisions_And_Output_Handling_Cheat_Sheet.html)

### Defaults reveal the risk of mixing the systems

Feature flags commonly have a fallback value. OpenFeature specifies that a flag evaluation receives a default value, and its no-op provider returns that supplied default. That is a sensible availability feature for rollout behavior: a team can choose whether an unavailable flag service should preserve an old path or suppress a new one. [Flag Evaluation API](https://openfeature.dev/specification/sections/flag-evaluation/)

It is not a safe way to decide access. A fallback of `true` can grant a path because the control plane is unavailable. A fallback of `false` can lock out legitimate users during a provider outage. Neither is an authorization policy; both are an accidental dependency between access and a deployment service.

If a policy decision service is remote, treat its timeout and staleness rules as authorization design. Decide whether a cached decision is fresh enough, make the failure mode explicit, and deny protected operations when there is no valid decision. OWASP's authorization patterns guidance calls out stale policy data and recommends denying protected operations when a valid decision is unavailable. [Authorization Patterns](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Patterns_Cheat_Sheet.html)

### Test the bypass, not just the button

The revealing test is not “does the button disappear when the flag is off?” It is “can a caller still invoke the protected endpoint, and does the service apply the same policy?”

```ts
it("denies an export when a caller bypasses a visible flagged route", async () => {
  flags.booleanValue.mockReturnValue(true);
  policy.allows.mockResolvedValue(false);

  const response = await request(app)
    .post("/exports")
    .set("Authorization", tokenFor({ tenantId: "acme", role: "viewer" }))
    .send({ reportId: "report-42" });

  expect(response.status).toBe(403);
  expect(exports.start).not.toHaveBeenCalled();
});
```

Add the inverse test too: an authorized caller should retain access through the stable supported path even if an unrelated new-experience flag is off. That catches a common regression where a rollout condition quietly becomes part of the access rule.

## Steps / Code

Review each flagged capability at two boundaries:

1. State what the flag controls: UI exposure, traffic percentage, implementation selection, experiment cohort, or cost containment.
2. State the protected action and resource separately.
3. Locate the server-side enforcement point for that action, including background and API paths.
4. Test a direct request from an authenticated but unauthorized principal with both flag values.
5. Decide how flag-provider outages affect rollout behavior without changing the authorization decision.
6. Log the authorization decision and the evaluated flag separately. A denied operation and a disabled rollout are different operational facts.

This is particularly important for agent tools. A flag can enable a new tool or choose a safer implementation, but it must not grant the model authority to execute the tool against a resource it is otherwise forbidden to touch. [Authorize the Next Action, Not the Whole Agent](https://my-slops.github.io/Blog/posts/2026/09/authorize-the-next-action-not-the-whole-agent/) argues for keeping that authority attached to a concrete action and resource.

## Trade-offs

Separate checks create some duplication. The product may need a flag rule and an authorization rule that both mention a tenant or role, and their different owners need a clear contract. That is not needless ceremony: rollout eligibility and access rights really are different sources of truth.

For harmless presentation details, such as a new color treatment, a server-side authorization check adds nothing. For a capability that reads protected data, creates a resource, triggers a paid operation, or changes a durable setting, it is mandatory. The useful question is not whether a feature is behind a flag. It is whether bypassing the flag would expose an operation that needs protection.

Feature flags also remain valuable after this separation. They reduce blast radius, enable experiments, and can stop *future* traffic from using a problematic path. They just cannot compensate for a missing permission check or reverse an effect that already happened. [A Feature Flag Does Not Undo an Irrevocable Change](https://my-slops.github.io/Blog/posts/2026/09/a-feature-flag-does-not-undo-an-irrevocable-change/) covers that second limitation.

## References

- OWASP Cheat Sheet Series, [Authorization Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html)
- OWASP Cheat Sheet Series, [Authorization Decisions and Output Handling](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Decisions_And_Output_Handling_Cheat_Sheet.html)
- OWASP Cheat Sheet Series, [Authorization Patterns](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Patterns_Cheat_Sheet.html)
- OpenFeature, [Provider and flag-value resolution specification](https://openfeature.dev/specification/sections/providers/)
- OpenFeature, [Evaluation Context specification](https://openfeature.dev/specification/sections/evaluation-context/)
- This repository, [A Feature Flag Does Not Undo an Irrevocable Change](https://my-slops.github.io/Blog/posts/2026/09/a-feature-flag-does-not-undo-an-irrevocable-change/)

## Final Take

A feature flag can say “not yet,” “only for this cohort,” or “use the old implementation.” It cannot say “this caller is allowed.”

Keep rollout controls and permission enforcement separate. Then an old client, a direct API request, a provider outage, or a new integration path cannot turn a product toggle into an authorization bypass.

## Changelog

- 2026-10-12: Initial publication.
