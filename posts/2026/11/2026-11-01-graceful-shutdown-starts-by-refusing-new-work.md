---
title: "Graceful Shutdown Starts by Refusing New Work"
date: "2026-11-01"
updated: "2026-11-01"
slug: "graceful-shutdown-starts-by-refusing-new-work"
description: "A shutdown handler cannot drain work that the service continues to admit. Make admission close first, account for propagation time, then spend the remaining deadline on work already in flight."
summary: "Graceful shutdown is an admission-control protocol, not just a signal handler. Stop accepting new requests or leases before draining active work, and budget for routing lag, long-lived connections, and the hard termination deadline."
tags: [reliability, distributed systems, infrastructure, developer tooling, software architecture]
author: "vabs"
status: "published"
canonical_url: "https://my-slops.github.io/Blog/posts/2026/11/graceful-shutdown-starts-by-refusing-new-work/"
license: "MIT"
audience: "general"
reading_time: "7 min"
---

## TL;DR

A process that has received a termination signal is already too late to decide whether it should take one more job. If it keeps admitting work while it waits for active requests to finish, its drain set can grow until the platform's hard deadline ends the process anyway.

Treat graceful shutdown as a short admission-control protocol:

1. stop accepting new work;
2. make that fact visible to the router or queue consumer;
3. finish, hand off, or safely abandon the work already owned; and
4. enforce a deadline for the entire sequence.

Closing a listener is useful, but it is not the whole protocol. Load-balancer propagation, keep-alive connections, WebSockets, background leases, and lifecycle hooks all decide whether a process still receives work after it has begun to drain.

## A drain that keeps filling is not a drain

Consider a service receiving a rolling restart. Its signal handler stops the HTTP server and waits for active requests:

```ts
process.on("SIGTERM", async () => {
  await server.close();
  await waitForActiveRequests();
  process.exit(0);
});
```

That looks reasonable until the service sits behind a load balancer with persistent connections. A request already routed to the process may arrive after `SIGTERM`; a client may reuse an existing connection; a queue worker may claim another message between signal delivery and the next polling loop. If the handler still starts the work, the number of active operations can rise while the shutdown clock runs down.

The failure is often blamed on an insufficient grace period. Sometimes the timeout really is too short. More often, the service has not defined a reliable point at which it stops becoming responsible for new work.

Kubernetes makes this distinction visible. A readiness failure removes a Pod from the EndpointSlices for matching Services, but Pod termination and endpoint updates occur concurrently. A terminating endpoint is reported as not ready for compatibility; consumers that need to drain connections must understand the `serving` and `terminating` EndpointSlice conditions. [Kubernetes Pod lifecycle](https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle/) [EndpointSlices](https://kubernetes.io/docs/concepts/services-networking/endpoint-slices/)

In other words, removing a process from discovery is necessary, but it cannot be treated as proof that no more work will reach it. The process still needs a local refusal point.

## Close admission before you wait

For a request-serving process, put an admission gate immediately before work becomes owned. It should reject new work once draining starts and track work that entered before that boundary:

```ts
class AdmissionGate {
  private accepting = true;
  private active = 0;

  enter(): (() => void) | null {
    if (!this.accepting) return null;
    this.active += 1;
    return () => { this.active -= 1; };
  }

  beginDrain() {
    this.accepting = false;
  }

  get activeCount() {
    return this.active;
  }
}

const gate = new AdmissionGate();

app.post("/exports", async (req, res) => {
  const leave = gate.enter();
  if (!leave) {
    return res.status(503).set("Retry-After", "5").json({
      error: "server_draining"
    });
  }

  try {
    res.json(await createExport(req.body));
  } finally {
    leave();
  }
});

process.on("SIGTERM", async () => {
  gate.beginDrain();
  await waitUntil(() => gate.activeCount === 0, { timeoutMs: 20_000 });
  await server.close();
});
```

This is illustrative, not a concurrency primitive to copy unchanged. In a multithreaded process, `enter` and `beginDrain` need an atomic or locked implementation. In a fleet, each replica has its own local gate and the load balancer needs its own drain behavior. The important invariant is simpler: an operation is either admitted before the drain boundary and counted, or it is refused. It must not slip into an uncounted middle state.

The response to a refused request depends on the contract. A retryable, idempotent read can return a fast `503` with meaningful retry guidance. A user-visible mutation may need to return an operation ID, route the intent to a durable queue, or reject it so the client can retry against a healthy replica. Do not quietly accept a request and hope a process about to exit gets far enough to record it.

This is adjacent to [Starting a Job Is Not the Same as Finishing It](https://my-slops.github.io/Blog/posts/2026/10/starting-a-job-is-not-the-same-as-finishing-it/), but it addresses an earlier boundary: whether this instance should start the job at all.

## Queues have an admission gate too

HTTP is only one source of new work. A worker that keeps fetching messages until the process dies has the same problem, even if it has no public listener.

On drain, a worker should stop claiming new messages first. The remaining policy is domain-specific:

| Work already owned | Possible shutdown policy |
| --- | --- |
| Short, idempotent task | Finish before the deadline, then acknowledge it. |
| Durable job with a lease | Finish only if the lease and remaining deadline make that safe; otherwise release or allow a deliberate handoff. |
| Non-idempotent external effect | Persist the attempt state and use a recovery protocol; do not let a second worker guess whether the first call happened. |
| Long-running stream or session | Notify it separately and give it its own bounded close path. |

“Stop polling” is not sufficient when a consumer prefetches messages or already owns leases. Count those reservations as in-flight work. If another worker may take over after a lease expires, the handoff protocol must tolerate a delayed original worker or ensure that it cannot continue the effect after losing ownership. This is the same reason a retry needs an identity, not merely a delay; [Retries Need an Identity Before They Need Backoff](https://my-slops.github.io/Blog/posts/2026/05/retries-need-an-identity-before-they-need-backoff/) covers that recovery boundary.

The useful shutdown metric is therefore not just process uptime. Record at least the time draining began, rejected admissions, active requests, owned queue items, and how many items finished, were handed off, or were cut off by the deadline. Without those numbers, a clean exit code can hide work that was repeatedly accepted and abandoned during deploys.

## The grace period is one budget, not two

One common Kubernetes pattern is a long `preStop` sleep followed by application shutdown. It can help allow routing changes to propagate, but it is easy to accidentally budget the time twice.

Kubernetes documents that the Pod termination grace-period countdown begins **before** a `PreStop` hook runs. The hook must finish before the termination signal is sent, and both the hook and the process's normal exit consume the same overall budget. A hook that uses most of the grace period leaves the application little time to drain; a hook that hangs can lead to forced termination. [Container lifecycle hooks](https://kubernetes.io/docs/concepts/containers/container-lifecycle-hooks/)

Think in a single timeline:

```text
termination begins
  → advertise not-ready / stop claiming work
  → allow routing propagation and reject late arrivals locally
  → finish or hand off counted work
  → close listeners and remaining connections
  → hard kill at the platform deadline
```

The durations are policy, not magic constants. They depend on connection behavior, the maximum useful request duration, lease semantics, and the platform's deadline. What matters is that their sum fits. If the platform grants 30 seconds, spending 25 seconds sleeping before signal delivery is a decision to give the process roughly five seconds to do everything else.

Application-server helpers do not remove this accounting. For example, Go's `Server.Shutdown` first closes listeners and then waits for active connections to become idle, but it does not close or wait for hijacked connections such as WebSockets; those need a separate notification and close policy. [Go `net/http` documentation](https://pkg.go.dev/net/http#Server.Shutdown) That is a precise example of the broader rule: every channel that can admit or retain work needs an explicit drain path.

## Test a deploy under traffic, not only a handler in isolation

A unit test that invokes the signal handler and observes a clean exit proves very little about production drainage. The interesting failures are races across boundaries:

```text
Given: a request arrives after the instance reports itself unavailable
When: it reaches an existing connection anyway
Then: the local admission gate rejects it without creating an untracked job

Given: a worker has prefetched three messages when drain begins
When: the deadline leaves only one safe completion window
Then: the other two messages have an explicit release or recovery outcome

Given: a WebSocket is still open at shutdown
When: the regular HTTP server drains
Then: the session receives its own close signal and cannot keep the process alive forever

Given: a lifecycle hook uses part of the platform grace period
When: the application receives its termination signal
Then: the remaining budget is sufficient for its documented drain policy
```

Run the test through the actual router, worker runtime, and deployment controller when possible. The question is not merely whether the process gets `SIGTERM`. It is whether each producer of new work sees the same decision to stop.

## Trade-offs

Refusing work during a drain can create short retry spikes, and an aggressively conservative gate can reduce capacity during frequent deployments. Long-running work may need a dedicated worker pool, a durable operation model, or connection migration rather than a larger termination grace period.

For very small services with no persistent connections and only fast, idempotent requests, closing the listener may be enough in practice. The added machinery is justified when work can survive the request, when queues prefetch, when side effects are non-idempotent, or when deployment overlap is routine.

The goal is not to guarantee that no request ever sees a restart. Distributed routing has propagation delay and clients can be late. The goal is narrower and more useful: a process that has decided to leave should not keep accepting obligations it cannot reliably discharge.

## References

- Kubernetes, [Pod lifecycle: readiness and termination flow](https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle/)
- Kubernetes, [EndpointSlice conditions](https://kubernetes.io/docs/concepts/services-networking/endpoint-slices/)
- Kubernetes, [Container lifecycle hooks](https://kubernetes.io/docs/concepts/containers/container-lifecycle-hooks/)
- Go, [`net/http` `Server.Shutdown`](https://pkg.go.dev/net/http#Server.Shutdown)
- This repository, [Starting a Job Is Not the Same as Finishing It](https://my-slops.github.io/Blog/posts/2026/10/starting-a-job-is-not-the-same-as-finishing-it/)
- This repository, [Retries Need an Identity Before They Need Backoff](https://my-slops.github.io/Blog/posts/2026/05/retries-need-an-identity-before-they-need-backoff/)

## Final Take

Graceful shutdown is not the code that runs after a process has stopped taking responsibility. It is the policy that makes that responsibility stop growing.

Close admission first. Count what remains. Spend one shared deadline on the work already owned. Everything else is cleanup.

## Changelog

- 2026-11-01: Initial publication on graceful shutdown as an admission-control protocol.
