---
title: "An Artifact Digest Cannot Explain Runtime Behavior"
date: "2026-10-28"
updated: "2026-10-28"
slug: "an-artifact-digest-cannot-explain-runtime-behavior"
description: "An image digest identifies the artifact that started, not the configuration, flag result, or policy revision that changed what it did. Incident records need a bounded runtime receipt alongside build provenance."
summary: "Keep artifact provenance, but record the non-secret configuration sources, revisions, and rollout state that materially affect each deployment. Otherwise an incident can identify the binary and still be unable to explain its behavior."
tags: [release-engineering, reliability, operations, deployment, developer tooling]
author: "vabs"
status: "published"
canonical_url: "https://my-slops.github.io/Blog/posts/2026/10/an-artifact-digest-cannot-explain-runtime-behavior/"
license: "MIT"
audience: "general"
reading_time: "7 min"
---

## TL;DR

An artifact digest can answer a crucial incident question: *which bytes did this process start from?* It cannot, by itself, explain why those bytes allowed a new workflow, sent traffic to a different backend, rejected a request, or applied a different retention rule.

Runtime behavior also depends on configuration and decisions that may change independently of the artifact: deployment parameters, mounted settings, feature-flag evaluations, policy bundles, and selected dependency endpoints. Keep build provenance for the artifact, then attach a small, non-secret runtime receipt to the deployment. It should identify the material configuration sources and their revisions, how they reached the process, and the rollout state that made them effective.

## Context

An incident begins with a sudden jump in failed report exports. The service image digest has not changed since yesterday. The team concludes that the rollout cannot be involved and starts looking for a dependency outage.

An hour later, someone notices that the reporting limit was raised through a ConfigMap. Half of the pods read it through environment variables and still have the old value. The other half mount it as a volume and received the new value after their local kubelet refreshed it. A feature flag also routed a small cohort to the new export path.

The image digest was still useful evidence. It established that all pods began with the same executable artifact. It just did not establish that they were running under the same conditions.

This is the gap between a **build record** and a **runtime receipt**. Build provenance answers how an artifact was produced. SLSA describes provenance as verifiable information about where, when, and how an artifact was produced. [SLSA provenance](https://slsa.dev/spec/v1.2/provenance) is a strong model for that chain. Deployment investigation asks one more question: *what material inputs were in force when this particular replica handled traffic?*

The answer should not be a dump of every environment variable or a copy of every secret. It should be a deliberate, access-controlled identity record for the inputs that can explain a change in behavior.

## Key Points

### The same artifact can honestly produce different behavior

Configuration is not a footnote to deployment. It is executable behavior selected outside the build. A payment service can use one artifact digest while its behavior varies with a region allowlist, a policy revision, an API endpoint, a concurrency limit, an experiment assignment, or a certificate bundle.

This matters in both directions:

- a new artifact can behave as expected because the old configuration remains in force;
- an unchanged artifact can change behavior because one runtime input advances; and
- a fleet can be mixed even when every pod reports the same image tag or digest.

The familiar advice to record the effective configuration at startup is valuable, but an incident also needs an identity that can be followed back to its source. [An Environment Variable Is a Deployment-Time API](https://my-slops.github.io/Blog/posts/2026/10/an-environment-variable-is-a-deployment-time-api/) explains why configuration has callers and compatibility requirements. Here, the additional requirement is historical evidence: a responder needs to distinguish the configuration that is effective *now* from the one that was effective on an affected replica at 14:07 UTC.

### Record references and revisions, not secret values

A runtime receipt should be narrow enough to be safe in an incident system and precise enough to compare two deployments. For example:

```json
{
  "deploymentId": "dep_01J9C4",
  "service": "reporting-api",
  "environment": "production",
  "artifact": {
    "image": "registry.example.com/reporting-api",
    "digest": "sha256:6c8f...b712"
  },
  "runtimeInputs": [
    {
      "kind": "config_map",
      "reference": "reporting-settings-v42",
      "contentDigest": "sha256:14ab...e2d1",
      "delivery": "pod_env_at_start"
    },
    {
      "kind": "policy_bundle",
      "reference": "authorization/policy",
      "revision": "git:0a21f9d"
    },
    {
      "kind": "feature_flag",
      "key": "async-export-v2",
      "variant": "treatment",
      "provider": "flags-prod",
      "resolutionReason": "TARGETING_MATCH"
    }
  ],
  "observedAt": "2026-10-28T14:07:13Z"
}
```

The values are illustrative. The important distinction is between a reference that helps someone find the source and a revision, variant, or digest that identifies the material input actually used.

Never put raw secrets in a receipt merely to make it reproducible. A secret's version identifier, key ID, rotation epoch, or a protected opaque handle can be enough to show that two replicas used different credentials. Keep the actual secret in its secret-management boundary. Kubernetes makes the related distinction for ConfigMaps: they are intended for non-confidential data, while confidential data needs a Secret or another suitable protection. [Its ConfigMap documentation](https://kubernetes.io/docs/concepts/configuration/configmap/) states this explicitly.

Some inputs do not need recording. An HTTP connection-pool limit may be material to a latency incident but irrelevant to a tax calculation. A request ID is useful for tracing but does not define deployment behavior. Choose the fields from the failure modes the service promises to investigate, not from a wish to serialize the whole process.

### Name how an input becomes effective

An input's revision alone does not settle whether a process used it. Configuration delivery has semantics.

Kubernetes is a good concrete example. A ConfigMap mounted as a volume is eventually updated; the delay includes the kubelet sync period and cache propagation. A ConfigMap consumed as environment variables is not automatically updated and needs a pod restart. A `subPath` mount does not receive ConfigMap updates. Those are three different runtime contracts for a setting that may have the same ConfigMap name. [Kubernetes documents the distinction](https://kubernetes.io/docs/concepts/configuration/configmap/#mounted-configmaps-are-updated-automatically).

That means this is incomplete:

```text
config: reporting-settings, updated at 14:00
```

For a behavior-changing setting, the receipt or deployment record needs enough information to make the propagation model visible:

```text
config: reporting-settings-v42
delivery: pod_env_at_start
effective_after: pod restart
```

or:

```text
config: reporting-settings
delivery: watched_volume
effective_after: kubelet propagation plus application reload
```

Neither form promises instant fleet convergence. That is exactly why the distinction belongs in the record. [Revocation Is a Latency Requirement](https://my-slops.github.io/Blog/posts/2026/10/revocation-is-a-latency-requirement/) makes the same broader point for authorization decisions: a source-of-truth update and an enforced new decision are different events.

### Feature-flag outcomes are runtime evidence, not deployment metadata

Feature flags complicate a deployment receipt because their effective value can depend on request context. Two requests handled by the same process can legitimately take different paths.

Do not log every evaluation context; it may contain user identifiers or sensitive attributes. Instead retain bounded information at the decision boundary when a flag materially changes an outcome: flag key, provider, variant or value class, evaluation reason, and an opaque cohort or rule revision when the provider supplies one. OpenFeature's provider specification defines resolution details including a returned value, an optional variant, a reason such as `TARGETING_MATCH`, `CACHED`, or `STALE`, and optional flag metadata. [OpenFeature's provider specification](https://openfeature.dev/specification/sections/providers/) is a useful portable shape for this evidence.

The receipt for a deployment should state which flag provider and static configuration the process loaded. A request trace or operation record should carry the particular flag result when it changes a user-visible decision. Combining the two scopes causes trouble:

| Evidence | Useful question it answers |
| --- | --- |
| Deployment receipt | Which artifact and startup/runtime inputs could this replica use? |
| Request or operation trace | Which flag, policy, or routing decision affected this request? |
| Audit record | Who authorized a protected action and under which policy? |

A feature flag is still not an authorization decision. [A Feature Flag Is Not an Authorization Check](https://my-slops.github.io/Blog/posts/2026/10/a-feature-flag-is-not-an-authorization-check/) covers that boundary. Capturing a flag result makes a decision explainable; it does not make the decision permissible.

### Prefer immutable named inputs for rollout-critical changes

Mutable names invite post-incident ambiguity. `reporting-settings` can name different content next week. A digest or revision gives a responder a stable comparison point. For configuration that must roll out atomically with a deployment, use a versioned input name or immutable revision and put that name in the workload specification.

Kubernetes supports immutable ConfigMaps: once marked immutable, their data cannot be changed; replacing them requires deleting and recreating the object, and Kubernetes recommends recreating pods that use the old mount. [That mechanism](https://kubernetes.io/docs/concepts/configuration/configmap/#immutable-configmaps) is not mandatory for every setting, but it illustrates a useful design: a rollout-critical configuration change should have an identity that does not silently move under a running workload.

Live-reload settings are still appropriate for some operations. A rate limit, temporary endpoint failover, or emergency allowlist may need to change without a full deploy. Give those settings an explicit propagation promise, record the observed revision where it affects a request, and test the mixed-revision period. Do not pretend they are deployment constants merely because they are stored in the same configuration system.

## Steps / Code

Start with a short inventory of runtime inputs that can materially change behavior:

1. List artifact selection, startup configuration, policy sources, feature flags, endpoint/routing choices, and externally loaded model or rules bundles.
2. For each one, write its stable reference, its revision or content identity, whether it is secret, and how it becomes effective.
3. Emit a redacted deployment receipt when a replica starts or a deployment is promoted. Link it to the artifact digest, deployment ID, and environment.
4. Add request-level evidence only for inputs whose dynamic result changes a consequential user outcome.
5. During a rollout, compare receipts across replicas. A same-digest fleet with different input identities is a mixed runtime, not a single deployment.
6. Test an incident query: given a time, service, and request or operation ID, can an operator recover the artifact and all material non-secret inputs without reading current configuration by accident?

The receipt must be truthful about its boundary. A startup record cannot prove a setting that an application hot-reloads later. A per-request trace cannot prove which configuration a background job used before it was retried. Model the input at the scope where it actually becomes effective.

## Trade-offs

More identity records mean more storage, access-control work, and operational vocabulary. They can also create a false sense of reproducibility: having the same image, ConfigMap digest, and flag variant may still not recreate a third-party dependency response, live database state, or a user's input.

That is a reason to be precise, not to give up. A deployment receipt identifies material conditions; it does not claim to be a complete replay system. For a small service with one static configuration file, an artifact digest plus a configuration commit may be enough. For a multi-tenant agent service with dynamic policy and flags, the evidence needs to be split across deployment, request, and audit scopes.

The cost is worthwhile when a behavior-changing input can advance without changing the container image. In that world, an artifact digest tells an investigator where to begin, not where to stop.

## References

- SLSA, [Provenance](https://slsa.dev/spec/v1.2/provenance)
- Kubernetes, [ConfigMaps](https://kubernetes.io/docs/concepts/configuration/configmap/)
- Kubernetes, [Mounted ConfigMaps are updated automatically](https://kubernetes.io/docs/concepts/configuration/configmap/#mounted-configmaps-are-updated-automatically)
- OpenFeature, [Provider specification](https://openfeature.dev/specification/sections/providers/)
- This repository, [Start an Incident With the Artifact Digest](https://my-slops.github.io/Blog/posts/2026/10/start-an-incident-with-the-artifact-digest/)
- This repository, [An Environment Variable Is a Deployment-Time API](https://my-slops.github.io/Blog/posts/2026/10/an-environment-variable-is-a-deployment-time-api/)
- This repository, [Revocation Is a Latency Requirement](https://my-slops.github.io/Blog/posts/2026/10/revocation-is-a-latency-requirement/)

## Final Take

An artifact digest is necessary evidence. It is not a complete explanation of runtime behavior.

Keep the digest and its build provenance. Then record the few non-secret configuration, policy, and rollout inputs that can make the same bytes act differently. When a deployment is mixed, the incident record should say so before the investigation turns into a comparison between today's settings and yesterday's outage.

## Changelog

- 2026-10-28: Initial publication on recording runtime-input identity alongside artifact provenance.
