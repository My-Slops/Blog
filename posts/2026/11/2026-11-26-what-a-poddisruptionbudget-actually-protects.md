---
title: "What a PodDisruptionBudget Actually Protects"
date: "2026-11-26"
updated: "2026-11-26"
slug: "what-a-poddisruptionbudget-actually-protects"
description: "A PodDisruptionBudget limits a defined class of voluntary pod evictions. It is not an availability guarantee against node failure, resource pressure, direct deletion, or a rollout that leaves too little capacity to recover."
summary: "Treat a PodDisruptionBudget as a coordination contract for voluntary evictions: choose it from the workload's real recovery and quorum needs, observe its available-disruption state, and build availability separately through placement, capacity, and resource policy."
tags: [kubernetes, reliability, infrastructure, deployment, operations]
author: "vabs"
status: "published"
canonical_url: "https://my-slops.github.io/Blog/posts/2026/11/what-a-poddisruptionbudget-actually-protects/"
license: "MIT"
audience: "general"
reading_time: "8 min"
---

## TL;DR

A Kubernetes `PodDisruptionBudget` (PDB) does not promise that a workload will stay available. It limits a particular class of *voluntary eviction* so that planned operations such as a node drain do not take more ready Pods than the application says it can lose at once.

That is useful, but narrower than many dashboards and runbooks imply. A node failure, resource-pressure eviction, an application rollout, a direct Pod deletion, or too little cluster capacity can still put the workload below the number in its budget. Those events also change whether a later drain is permitted.

Treat the PDB as a coordination contract between the application owner and the system doing an eviction. Build actual availability with replicas placed across independent failure domains, enough spare capacity to replace one, credible readiness, and an application that can tolerate a process disappearing. Then test a drain while the workload is already degraded—not only when every replica is green.

## The budget applies to a path, not to every way a Pod can disappear

Suppose an API has three replicas and can continue serving with two. This budget expresses one sensible constraint:

```yaml
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: checkout-api
spec:
  maxUnavailable: 1
  selector:
    matchLabels:
      app: checkout-api
```

When an actor uses the Kubernetes eviction API, the disruption controller can allow one ready Pod to be evicted and refuse a second one until replacement capacity becomes healthy. `kubectl drain` normally uses that API, which is why a PDB is valuable during a planned node upgrade or scale-down.

The important qualifier is *when an actor uses the eviction API*. Kubernetes explicitly distinguishes voluntary disruptions from involuntary ones, and warns that not every voluntary action is constrained by a PDB. Deleting a Pod or Deployment directly can bypass it. A Deployment or StatefulSet rolling out a new Pod template also counts unavailable Pods toward the budget, but its controller is not throttled by the PDB in the way a drain is. [Kubernetes' disruption documentation](https://kubernetes.io/docs/concepts/workloads/pods/disruptions/) makes both boundaries explicit.

This is not a defect. Kubernetes cannot turn a local eviction check into a global availability guarantee. A node can disappear, a kernel can panic, or an operator can apply a destructive change. A PDB is deliberately a cooperation mechanism for actors that ask permission to evict; it is not a force field around matching Pods.

## A healthy replica and a protected replica are different things

The PDB controller currently counts a Pod as healthy when its `Ready` condition is `True`. Its status exposes the calculation:

```text
currentHealthy:       3
desiredHealthy:       2
disruptionsAllowed:   1
```

For the three-replica example, this means a voluntary eviction is permitted *now*. It does not mean two replicas will remain able to satisfy a user-visible request under every failure. `Ready` is an application-defined routing signal. It can be too optimistic, too pessimistic, or simply unrelated to a dependency needed by one particular operation.

More importantly, the calculation starts from the current state. If a separate incident has already made one replica unready, the same budget generally reports zero allowed disruptions. A node drain that used to be routine now stalls—not because the PDB caused the incident, but because it refuses to spend capacity the workload no longer has.

That is a useful refusal. It turns “we are about to make an already degraded service worse” into an observable scheduling problem. It is not useful if a team reads `minAvailable: 2` as proof that two replicas are available. The object declares the minimum it will cooperate to preserve during eligible evictions; its status reports a momentary controller view of readiness.

Inspect the status during maintenance rather than only the manifest in Git:

```sh
kubectl get pdb checkout-api
kubectl get pdb checkout-api -o yaml
kubectl get pods -l app=checkout-api -o wide
```

`ALLOWED DISRUPTIONS=0` is not automatically an error. It can be the correct state when the workload is already at its availability floor. But it should alter the plan: restore capacity, add a node, defer maintenance, or explicitly accept a wider outage. Repeatedly retrying the drain changes none of those conditions.

## Failures still spend the capacity a drain needs

The most expensive misunderstanding is treating a PDB as a replacement for failure-domain design.

Imagine all three Pods above happen to land on the same node. The PDB can politely serialize a planned eviction from that node. It cannot keep the node's failure from removing all three at once. The same issue appears when replicas share one zone, one overloaded autoscaling pool, one fragile dependency, or one shortage of schedulable capacity.

Kubernetes documents this limitation directly: a PDB cannot guarantee that its specified number of Pods will always be up, because a node hosting a Pod can fail while the workload is already at the budget's minimum. The documentation recommends replication and, for stronger availability, spreading replicas across racks or zones with anti-affinity or topology-aware placement. [The PDB task guide](https://kubernetes.io/docs/tasks/run-application/configure-pdb/) is unusually clear here.

Resource pressure is another important counterexample. When the kubelet evicts Pods to reclaim memory, disk, inode, or process-ID resources, it does not respect a PDB or the Pod's normal `terminationGracePeriodSeconds`. A hard node-pressure eviction can use no grace period at all. [Kubernetes' node-pressure eviction documentation](https://kubernetes.io/docs/concepts/scheduling-eviction/node-pressure-eviction/) describes that behavior because preserving node stability takes priority over the coordination policy for a planned drain.

So the availability design must answer questions the PDB cannot:

- Can a replacement Pod schedule when one node is drained or lost, or is the cluster already full?
- Are replicas placed so that the failure domain the service claims to survive does not contain all of them?
- Do resource requests reflect normal and burst usage well enough to avoid avoidable node pressure?
- Does `Ready` mean the replica can serve the traffic counted in the availability claim?
- Does the application handle a process loss without duplicating or abandoning work it owns?

Those are different controls with different owners. A PDB is strongest when it makes their gaps visible during a planned operation rather than concealing them.

## Zero is a maintenance policy, not a high-availability setting

An understandable reaction to risk is this:

```yaml
spec:
  maxUnavailable: 0
```

For a single-replica stateful service, that can be an honest request: do not evict this Pod without talking to the application owner. Kubernetes explicitly presents that as a coordination option, with the expectation that an operator will arrange downtime and remove or adjust the budget when the work is ready.

It is not a way to upgrade a single instance into a highly available service. With no replacement, no quorum, and no independent failure domain, there is no availability reserve for the PDB to preserve. The immediate operational consequence is more concrete: a `kubectl drain` targeting that Pod cannot complete through normal eviction while the zero-disruption policy applies.

The same trade-off exists at larger scale. A budget that permits no voluntary loss while the cluster has no spare placement capacity can turn a routine node upgrade into a blocked drain. Kubernetes' own drain example reaches exactly that state: the first eviction succeeds, its replacement remains Pending because the cluster is full, and the next eviction is refused. [The disruption guide's walkthrough](https://kubernetes.io/docs/concepts/workloads/pods/disruptions/) is worth reading as a capacity-planning example, not merely an explanation of PDB syntax.

My preference is to choose a budget from a failure calculation and make the resulting maintenance behavior explicit. A three-member quorum system may accept `maxUnavailable: 1`; a frontend with ten replicas may need a percentage chosen from its actual load headroom. Neither number is a generic best practice. It is a statement about what work the system can still do while a replacement starts.

## Decide what an unhealthy Pod should do to a drain

An unhealthy Pod adds one more policy choice. By default, a running Pod that is not ready is protected from eviction when the application is already disrupted. The rationale is reasonable: leaving it alone gives it a chance to recover. The operational downside is that a CrashLooping Pod can block node maintenance precisely when operators most want to remove it.

Current Kubernetes supports `unhealthyPodEvictionPolicy` on a PDB. `IfHealthyBudget` is the default; `AlwaysAllow` permits eviction of running, unhealthy Pods even when the healthy budget is not met. The field is stable, but the correct value is still a product decision:

```yaml
spec:
  maxUnavailable: 1
  unhealthyPodEvictionPolicy: AlwaysAllow
  selector:
    matchLabels:
      app: checkout-api
```

`AlwaysAllow` can free a blocked drain from a Pod that will not recover. It can also remove a Pod that might have become useful before a replacement is ready. Use it only after deciding whether the application prefers recovery opportunity or maintenance progress in that failure mode. [Kubernetes documents both policies and their implications](https://kubernetes.io/docs/tasks/run-application/configure-pdb/#unhealthy-pod-eviction-policy).

Do not let this setting become a way to hide an unhealthy deployment. Alert on sustained `disruptionsAllowed: 0`, unready replicas, Pending replacements, and node-drain duration. The point is to make the conflict between safety and progress visible early enough to resolve it deliberately.

## Test the state you will drain from

A validation that only drains a node while every replica is ready proves the easiest case. Exercise the boundary conditions in a non-production cluster that resembles the real placement and capacity model:

```text
Given: a workload with the intended replica count and PDB
And: one selected Pod is deliberately unready or unavailable
When: a node holding another selected Pod is drained through the eviction API
Then: the drain is blocked or progresses exactly as the stated policy expects
And: the runbook identifies the safe operator action
```

Also test a replacement that cannot schedule, a slow startup, and a node-loss simulation if the platform offers one. Inspect whether replicas were genuinely spread across the failure domain the service claims to survive. A PDB selector that matches the right labels does not prove any of that.

There are workloads for which no PDB is appropriate. A restartable batch Job may be better served by its Job controller creating a replacement. A best-effort internal service may accept a temporary interruption rather than block cluster maintenance. Conversely, a quorum store can need both a PDB and a carefully designed operational procedure. The deciding question is not “does this workload have Pods?” It is “which planned eviction is safe, given the recovery behavior and capacity we actually have?”

## Final Take

A PodDisruptionBudget is a small but valuable promise: an eligible eviction must not spend more ready capacity than the workload has declared it can spare.

Keep that promise narrow. Pair it with replica placement, capacity headroom, resource discipline, meaningful readiness, and a tested drain procedure. Then a blocked eviction is not surprising Kubernetes behavior; it is evidence that the system has reached the availability boundary it claimed to protect.

## References

- Kubernetes, [Disruptions](https://kubernetes.io/docs/concepts/workloads/pods/disruptions/)
- Kubernetes, [Specifying a Disruption Budget for your Application](https://kubernetes.io/docs/tasks/run-application/configure-pdb/)
- Kubernetes, [Node-pressure eviction](https://kubernetes.io/docs/concepts/scheduling-eviction/node-pressure-eviction/)
- This repository, [Graceful Shutdown Starts by Refusing New Work](https://my-slops.github.io/Blog/posts/2026/11/graceful-shutdown-starts-by-refusing-new-work/)
- This repository, [A Health Endpoint Is Not a Dependency Dashboard](https://my-slops.github.io/Blog/posts/2026/11/a-health-endpoint-is-not-a-dependency-dashboard/)

## Changelog

- 2026-11-26: Initial publication on PodDisruptionBudgets as voluntary-eviction coordination rather than availability guarantees.
