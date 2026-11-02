---
title: "A Health Endpoint Is Not a Dependency Dashboard"
date: "2026-11-02"
updated: "2026-11-02"
slug: "a-health-endpoint-is-not-a-dependency-dashboard"
description: "A shared dependency can be unhealthy while a process is still alive and some requests remain useful. Keep liveness, traffic readiness, and dependency diagnosis as separate signals so a brownout does not become a restart or routing storm."
summary: "Do not turn every database, cache, or vendor failure into one Boolean health result. Use probes to express local recovery and traffic admission; expose downstream condition separately, then degrade or reject requests according to their actual dependency."
tags: [reliability, infrastructure, distributed systems, developer tooling, operations]
author: "vabs"
status: "published"
canonical_url: "https://my-slops.github.io/Blog/posts/2026/11/a-health-endpoint-is-not-a-dependency-dashboard/"
license: "MIT"
audience: "general"
reading_time: "7 min"
---

## TL;DR

When a database, cache, or vendor API has a bad five minutes, it is tempting to make `/health` return `500`. That single response is often wired to three very different consequences: restarting a process, removing it from service discovery, and alarming an operator.

Those consequences should not share a Boolean.

Keep three questions separate:

1. **Is this process making local progress?** That is a liveness question.
2. **Should this replica receive the traffic it claims to handle?** That is a readiness question.
3. **Which downstream capabilities are currently impaired?** That is a diagnostic question.

An unavailable dependency may make a particular request impossible while leaving cached reads, static responses, cancellation endpoints, and error handling useful. If every replica marks itself unhealthy—or worse, restarts—because of the same shared failure, the health check can turn a partial outage into a less observable, less recoverable one.

## One endpoint, three incompatible actions

Imagine an API that uses PostgreSQL for writes and a cache for product pages. Its only probe does this:

```ts
app.get("/health", async (_req, res) => {
  await database.query("SELECT 1");
  await cache.ping();
  res.sendStatus(200);
});
```

Now PostgreSQL is slow. If this endpoint drives a liveness probe, Kubernetes can restart every otherwise-running API container. If it drives readiness, every replica can be removed from the Service. If an external monitor consumes it, the monitor correctly reports a dependency incident—but it has no way to distinguish that from a wedged process.

The code did not discover a single condition called “health.” It compressed several facts into one answer and let each consumer assign its own consequence.

Kubernetes deliberately gives the probe types different semantics. Repeated liveness failure restarts the container. A readiness failure leaves the container running but removes the Pod from matching Service endpoints. A startup probe delays liveness and readiness checks until startup succeeds. [Kubernetes documents those distinct behaviors](https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle/#container-probes), including a warning that incorrectly implemented liveness probes can cause cascading failures under load.

That difference is a design cue: choose the signal for the recovery action it is allowed to trigger, not for how reassuring its name sounds.

## Make the probe's promise narrow

For many request-serving processes, a useful split looks like this:

| Signal | What a success means | What a failure should cause |
| --- | --- | --- |
| `livez` | The process can run this local handler and is not in a known unrecoverable state. | Restart only when a restart can plausibly repair the local failure. |
| `readyz` | This replica has completed local initialization and may accept the traffic its route policy assigns it. | Stop routing new general traffic to this replica while it recovers or drains. |
| dependency status | A named dependency was reachable and met its own narrow check at a timestamp. | Alert, diagnose, or change request-level behavior; do not automatically restart every caller. |

The names are conventional, not magic. A process with a corrupted local configuration may genuinely be unready. A consumer that cannot safely process any message without a credential refresh may be unready too. The point is that the response should describe an action the platform can safely take.

Here is illustrative pseudocode for an API whose cache is optional for some routes:

```ts
app.get("/livez", (_req, res) => {
  // Reaching this handler proves only a small local progress property.
  res.sendStatus(200);
});

app.get("/readyz", (_req, res) => {
  if (!appState.booted || appState.draining || !appState.routeTableLoaded) {
    return res.sendStatus(503);
  }
  res.sendStatus(200);
});

app.get("/health/dependencies", (_req, res) => {
  // Last checked asynchronously; this endpoint does not fan out on every probe.
  res.json({
    database: dependencyState.database,
    cache: dependencyState.cache,
    checkedAt: dependencyState.checkedAt,
  });
});

app.get("/products/:id", async (req, res) => {
  const cached = await cache.get(req.params.id).catch(() => null);
  if (cached) return res.json(cached);

  const product = await database.findProduct(req.params.id);
  res.json(product);
});
```

This is not an argument for a trivial liveness endpoint that can never fail. A real process might detect a deadlocked worker pool, an event loop that has stopped progressing, a corrupted local state machine, or an internal watchdog timeout. It is an argument against making a remote dependency failure look like evidence that restarting this process is the repair.

It also does not mean that readiness should always ignore dependencies. During startup, an application may need a schema check, a credential, or a required local snapshot before it can truthfully accept any traffic. The useful question is concrete: **does withdrawing or restarting this one replica improve the outcome, or does it only remove capacity while the shared dependency remains down?**

## A shared failure should not make every replica disappear

Suppose a payment provider starts timing out. A checkout service still needs to authenticate users, validate carts, display an honest payment-unavailable message, and accept a cancellation request for a previously created order. Taking every checkout replica out of readiness does not repair the provider. It can remove the control paths that help users and operators understand the incident.

Request-level policy is usually the better home for that decision:

```text
provider timeout
  → bound the call with a deadline
  → stop retrying requests that can no longer be useful
  → return a specific, retryable payment-unavailable result
  → preserve the order or operation identity for reconciliation
  → continue serving routes that do not require the provider
```

That policy can still be strict. If a request cannot be fulfilled without the provider, fail it quickly and truthfully. Do not queue an unbounded pile of doomed requests merely to keep readiness green. The distinction is between rejecting the affected *operation* and declaring the entire *process* beyond service.

This is closely related to [Admission Control Is the Third Guardrail for AI Agents](https://my-slops.github.io/Blog/posts/2026/03/admission-control-is-the-third-guardrail-for-ai-agents/): fail or defer work before it consumes capacity without a plausible outcome. It is also the operational counterpart to [Graceful Shutdown Starts by Refusing New Work](https://my-slops.github.io/Blog/posts/2026/11/graceful-shutdown-starts-by-refusing-new-work/). In both cases, traffic admission is a deliberate policy, not a side effect of a generic health check.

## Do not make probes part of the outage load

The first code sample has another flaw: every probe performs live dependency work. With enough Pods and a short probe period, a fragile database or vendor API receives a steady stream of synthetic traffic exactly while it is failing. Slow checks can also occupy the same connection pools, executors, or DNS path that ordinary requests need.

Prefer a bounded pattern:

1. Run a dependency check asynchronously at a controlled rate, with a short timeout and no unbounded retry loop.
2. Record the result with a timestamp and error class.
3. Let the probe expose the last known diagnostic state without triggering a new fan-out call.
4. Use the request path's own deadline, fallback, and error contract to decide whether a particular request can proceed.

There are exceptions. A small system may reasonably test a dependency directly in readiness because it has one request type, a few replicas, and no useful degraded behavior. The probe still needs a timeout and a deliberate failure threshold. Kubernetes notes that readiness probes run throughout a container's lifecycle and may be executed more frequently while a container is not ready, so their load and failure behavior belong in capacity planning. [Kubernetes probe configuration](https://kubernetes.io/docs/tasks/configure-pod-container/configure-liveness-readiness-startup-probes/#configure-probes)

The mistake is not checking dependencies. It is treating an arbitrary aggregation of checks as a universally safe restart and routing instruction.

## Test the consequence, not only the endpoint

A unit test that expects `/health` to return `503` when Redis is down proves almost nothing about the system's incident behavior. Test the action connected to each signal:

```text
Given: the payment provider is timing out
When: a checkout request needs a charge
Then: it gets a bounded, explicit failure without retrying past its deadline
And: status and cancellation routes remain available
And: the Pods are not restarted solely because the provider is unavailable

Given: a replica loses a required local configuration artifact
When: its readiness probe runs
Then: the replica is removed from new traffic until it recovers
And: other healthy replicas continue serving

Given: the process stops making local progress
When: its liveness threshold is exceeded
Then: a restart occurs
And: the restart does not create duplicated effects for work already owned

Given: the application is loading a large local model at boot
When: startup takes longer than normal request handling
Then: the startup probe protects it from premature liveness failure
And: liveness becomes strict after initialization
```

The last case is why startup probes exist. Kubernetes runs them only during startup and holds back liveness and readiness until they have succeeded; the design lets teams keep a fast liveness check after a slow but legitimate initialization. [Kubernetes probe concepts](https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle/#container-probes)

Also observe the control loop. At minimum, record probe transitions, restarts, endpoint removals, dependency error rates, and which request capabilities were degraded. A graph showing every Pod “unhealthy” without the dependency's state invites the wrong repair. A graph showing one provider down, checkout writes rejected, cached catalog reads healthy, and zero restart churn gives an operator a usable model.

## Trade-offs

Multiple signals require more documentation and more deliberate dashboards. A dependency status endpoint can leak internal topology or tenant information if exposed casually, so protect it and keep user-facing error details safe. Route-level degradation also means product teams must decide what a useful partial response is instead of hiding behind a full-service `503`.

Some services truly have an all-or-nothing contract. If no request has a correct outcome without a particular database, a readiness failure may be the honest choice. Even then, liveness should generally remain about whether the local container can recover by being restarted. A shared database outage is rarely repaired by repeatedly restarting every client.

The right health model is therefore not “always stay ready.” It is “make each automatic reaction earn the evidence it consumes.”

## References

- Kubernetes, [Container probes: liveness, readiness, and startup](https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle/#container-probes)
- Kubernetes, [Configure liveness, readiness, and startup probes](https://kubernetes.io/docs/tasks/configure-pod-container/configure-liveness-readiness-startup-probes/)
- This repository, [Admission Control Is the Third Guardrail for AI Agents](https://my-slops.github.io/Blog/posts/2026/03/admission-control-is-the-third-guardrail-for-ai-agents/)
- This repository, [Graceful Shutdown Starts by Refusing New Work](https://my-slops.github.io/Blog/posts/2026/11/graceful-shutdown-starts-by-refusing-new-work/)

## Final Take

A health endpoint should not be a dashboard flattened into `200` or `500`.

Let liveness ask whether this process needs recovery. Let readiness decide whether this replica should receive work. Let dependency status explain what is impaired. When those answers are separate, a shared outage stays a shared outage instead of becoming a synchronized restart and routing failure.

## Changelog

- 2026-11-02: Initial publication on separating local process probes from downstream dependency diagnosis.
