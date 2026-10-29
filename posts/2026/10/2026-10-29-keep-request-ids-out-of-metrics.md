---
title: "Keep Request IDs Out of Metrics"
date: "2026-10-29"
updated: "2026-10-29"
slug: "keep-request-ids-out-of-metrics"
description: "Metric dimensions are a deliberately bounded set of questions a dashboard can answer. Request-specific diagnostics belong in traces and logs, not in labels that silently create a new series for every call."
summary: "A metric label is not a convenient debug field. Give metrics small, intentional vocabularies; carry request IDs and raw errors in traces or logs; and treat a cardinality limit as a warning that a breakdown may no longer be complete."
tags: [observability, reliability, developer tooling, ai agents]
author: "vabs"
status: "published"
canonical_url: "https://my-slops.github.io/Blog/posts/2026/10/keep-request-ids-out-of-metrics/"
license: "MIT"
audience: "general"
reading_time: "6 min"
---

## TL;DR

Metrics are for repeatedly answering a small set of operational questions. A label is an axis in that question set, not a spare column for whatever would help debug the current request.

`method`, `route`, and a normalized outcome can make a request metric useful. A request ID, raw URL, user ID, conversation ID, or error message usually makes it unbounded. The result is not merely a higher bill. It can consume collector memory, slow queries, obscure the aggregate an alert depends on, or push data into an overflow bucket that cannot answer the original breakdown.

Keep the dimension vocabulary intentional and bounded. Put per-request evidence in traces and logs, then connect it back to the metric through exemplars or correlation rather than turning every request into its own time series.

## Context

An agent service adds a counter while investigating tool failures:

```text
agent_tool_calls_total{
  tool="calendar.search",
  outcome="failed",
  request_id="req_8c1…",
  error="upstream returned 503 after 12.4 seconds"
}
```

The code looks useful. A dashboard can show the failing request and its exact error without another lookup.

It also changes the storage model. If `request_id` changes for every call, each call produces a different label set. If the error includes a varying timeout, host name, or user-provided value, it creates more variants. The counter no longer describes a handful of repeatable operational categories; it approaches one series per event.

Prometheus makes the consequence explicit: every unique combination of label key-value pairs is a new time series, and it cautions against unbounded labels such as user IDs and email addresses. [Its data model](https://prometheus.io/docs/concepts/data_model/) also notes that changing even one label value creates a new series.

That rule matters for agent systems because agent telemetry is unusually tempting to enrich. A tool invocation has a task ID, turn number, model name, target object, tenant, policy decision, raw arguments, provider error, and trace ID. Most of those can be valuable evidence. They are not all dimensions that should be aggregated indefinitely.

## Key Points

### Decide what a metric can group by before emitting it

For each label, write down the question it is meant to answer and its allowed values. For a tool-call counter, a useful design might be:

```text
agent_tool_calls_total{
  tool="calendar.search|calendar.create|docs.find",
  outcome="success|denied|timeout|upstream_error",
  mode="read|write"
}
```

That metric can answer practical questions:

- Which tool is failing?
- Is the failure a policy denial, a timeout, or a downstream error?
- Are write tools behaving differently from read tools?

Those label sets have an understandable upper bound. Add `region` only if operations genuinely needs the regional breakdown; add `tenant_tier` only if it has a fixed, governed vocabulary. A metric can have several labels without being a problem. The problem is accepting a dimension whose values are controlled by traffic, customers, or the detailed text of failures.

Prometheus's naming guidance gives the right mental model: labels differentiate characteristics of the thing being measured, and a `sum()` or `avg()` over the dimensions should normally remain meaningful. A value that identifies a single event is not a characteristic for this purpose; it is a pointer to a different evidence system.

### Normalize a reason; retain the original somewhere else

This is the bad split:

```text
tool_failure_total{error="gateway timeout after 10.002s"}
tool_failure_total{error="gateway timeout after 10.118s"}
tool_failure_total{error="gateway timeout after 10.305s"}
```

This is usually the useful one:

```text
tool_failure_total{dependency="calendar", reason="timeout"}
```

The normalized label supports an alert and a trend. The unabridged error—along with the request ID, downstream status, retry history, and safely redacted argument context—belongs on the corresponding trace or structured log.

Do not solve the problem by hashing the raw value. A hash hides the text but does not bound its cardinality; one novel error still becomes one novel label value. Bucket or classify at the metric boundary instead. If the classification is too lossy to investigate an incident, improve the trace or log record rather than adding detail back into the metric.

This division also makes ownership clearer. A metric should tell an on-call engineer *which class of behavior changed*. A trace should explain *what happened to one representative request*. [Agent Tool Calls Need Traces, Not Just Logs](https://my-slops.github.io/Blog/posts/2026/08/agent-tool-calls-need-traces-not-just-logs/) describes how that request-level evidence follows a tool call across an agent workflow.

### A cardinality cap protects the process, not the dashboard's meaning

Some teams discover high cardinality only after an OpenTelemetry SDK cap is reached and assume the cap made the metric safe. It made one failure mode less catastrophic; it did not guarantee that all queries still mean what they appeared to mean.

The OpenTelemetry metrics specification recommends a configurable cardinality limit, with a default of 2,000 metric points when no limit is configured. Its recent operational guidance explains the important behavior: when a stream overflows, additional measurements can be combined into an overflow point without their original measurement attributes. A total can remain accurate while a query filtered by `outcome="timeout"` undercounts.

That is worse than an obvious crash for many alerting paths. A dashboard can stay green-looking while the dimension that would reveal a production problem has been folded away.

Monitor cardinality-limit or overflow signals from the SDK and backend. More importantly, treat the first overflow as a schema review:

1. Which attribute combinations were expected to be bounded?
2. Which input introduced unexpected values?
3. Does the affected alert rely on a breakdown that may now be incomplete?
4. Should a label be removed, normalized, or moved to a trace/log attribute?

Raising the limit can be valid when the dimension is both necessary and demonstrably bounded. It is not the default repair for an unreviewed `user_id` or raw-path attribute.

### Model the cross-product, not each label in isolation

Labels multiply. A route label with 30 values is harmless by itself. So are five HTTP methods, three result classes, and ten regions. Together they define up to 4,500 combinations before considering tenant, version, or a new feature variant.

The upper bound need not be exact, but it should be an intentional estimate:

```text
tool (12) × outcome (6) × mode (2) × region (5) = 720 possible series
```

That calculation exposes a common mistake in agent telemetry. `agent_version` can be a bounded deployment attribute, but putting it on every measurement multiplies every other dimension during a rolling upgrade. If rollout comparison is needed, include it deliberately and account for concurrent versions. If it is only needed to investigate a particular request, record it on the trace instead.

The same caution applies to a low-cardinality label whose values are poorly governed. `operation` is bounded only if it uses route templates or a registry. If it quietly receives `/accounts/42`, `/accounts/43`, and arbitrary search strings, it is a raw URL with a more reassuring name.

## Steps / Code

Use this small review before adding a metric label:

1. State the exact dashboard, alert, or capacity question that needs the dimension.
2. List its permitted values and who controls them. If the answer is "any customer" or "the current request," it is not a metric label without a deliberate bucketing design.
3. Estimate the product of all label vocabularies, including temporary overlap during deploys and active feature variants.
4. Choose a normalized failure taxonomy such as `timeout`, `rate_limited`, `denied`, `invalid_request`, and `upstream_error`; keep detailed causes in traces or structured logs.
5. Add a test or instrumentation check that raw paths, IDs, prompts, and error strings cannot reach the metric attributes.
6. Verify that alerts using a label breakdown have a response when that breakdown is absent, capped, or overflowed.

For trace correlation, do not copy a trace ID into every metric point. If the telemetry stack supports exemplars, use them to attach sampled trace context to representative measurements while preserving the metric's aggregation dimensions. OpenTelemetry's metrics guidance recommends exemplars for this correlation because trace IDs as metric attributes create the very cardinality explosion they are meant to help investigate.

## Trade-offs

Bounded labels make ad hoc investigation less convenient. An engineer cannot always find the one bad customer from a metrics query alone. That is an acceptable limitation when the complementary trace and log paths are searchable, retained for an appropriate window, and access-controlled.

There are exceptions. A per-tenant SLO may justify a tenant dimension when the active set, aggregation temporality, resource budget, and overflow behavior are explicitly designed and monitored. The decision should start with the operational requirement, not with the fact that an SDK happens to accept the attribute. In most systems, a tenant tier, cohort, or named allowlist is a safer first dimension than every tenant ID.

Metrics also cannot replace audit records. A count of `mode="write"` requests is useful for detecting a trend; it is not evidence of which object changed or whether an action was authorized. Keep those facts in the system designed to retain them.

## References

- Prometheus, [Metric and label naming](https://prometheus.io/docs/practices/naming/#labels)
- Prometheus, [Data model](https://prometheus.io/docs/concepts/data_model/)
- OpenTelemetry, [Metric cardinality limits in OpenTelemetry](https://opentelemetry.io/blog/2026/cardinality-limits-in-opentelemetry/)
- OpenTelemetry, [Metrics SDK: cardinality limits](https://opentelemetry.io/docs/specs/otel/metrics/sdk/#cardinality-limits)
- OpenTelemetry, [.NET metric best practices](https://opentelemetry.io/docs/languages/dotnet/metrics/best-practices/)
- This repository, [Agent Tool Calls Need Traces, Not Just Logs](https://my-slops.github.io/Blog/posts/2026/08/agent-tool-calls-need-traces-not-just-logs/)
- This repository, [A Tool Error Is an Instruction to Your Agent](https://my-slops.github.io/Blog/posts/2026/09/a-tool-error-is-an-instruction-to-your-agent/)

## Final Take

A metric label is a long-lived promise about the dimensions an operator can aggregate. Make that promise small enough to keep.

Use labels for bounded categories that drive decisions. Use traces and logs for the request-specific evidence that explains one case. When a label value is unique to the event, putting it in a metric does not make observability richer; it moves the investigation into the most expensive and least suitable data structure.

## Changelog

- 2026-10-29: Initial publication.
