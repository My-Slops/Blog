---
title: "Daily Schedules Have Two Different Meanings"
date: "2026-11-08"
updated: "2026-11-08"
slug: "daily-schedules-have-two-different-meanings"
description: "A job that runs every 24 hours and a job that runs at 09:00 local time have different contracts. Model cadence and civil-time schedules separately, then decide what a skipped or repeated local time means."
summary: "Do not hide a scheduling decision inside a cron string or a duration. Separate elapsed-time cadence from wall-clock intent, retain the IANA time zone for civil schedules, and make daylight-saving gap and overlap behavior explicit and testable."
tags: [distributed systems, reliability, developer tooling, scheduling]
author: "vabs"
status: "published"
canonical_url: "https://my-slops.github.io/Blog/posts/2026/11/daily-schedules-have-two-different-meanings/"
license: "MIT"
audience: "general"
reading_time: "7 min"
---

## TL;DR

“Run daily” is ambiguous until someone states whether the promise is about a clock or elapsed time.

A report promised every morning at 09:00 in Montréal should continue to appear at 09:00 when the UTC offset changes. Its interval is occasionally 23 or 25 hours. A cache refresh that must happen every 24 elapsed hours should keep its interval; its local clock time will move when the offset changes. Neither behavior is a bug. Treating them as the same schedule is.

Store and configure them differently. A civil-time schedule needs a recurrence, an IANA time-zone ID, and a policy for local times that do not occur or occur twice. An elapsed-time schedule needs a starting instant and a duration. Test both through a zone transition, and give each planned occurrence a stable identity before it reaches a queue.

## The word “daily” hides a product decision

Consider two jobs:

| Job | What its owner actually expects |
| --- | --- |
| Send a regional sales digest | It arrives at 09:00 where the sales team works. |
| Refresh a cache lease | No more than 24 elapsed hours pass between refreshes. |

Both may begin life as `0 9 * * *` or `every 24 hours`. That is where the similarity ends.

For the digest, keeping the local wall-clock time is the promise. In a zone that moves its clocks forward, the corresponding UTC instant moves one hour earlier; when clocks move back, it moves one hour later. The delay between two runs is not always 24 hours.

For the refresh, elapsed time is the promise. The next run is calculated from a previous instant plus 86,400 seconds. When the local offset changes, an observer may see it run at 08:00 one day and 09:00 the next. That is correct for a cadence, even if it would be wrong for a human-facing report.

Cloud Scheduler documents this distinction bluntly: it evaluates cron schedules on wall-clock time, so daylight-saving changes can make executions irregular; it recommends UTC when a job needs a precise cadence. [Its scheduling guide](https://cloud.google.com/scheduler/docs/configuring/cron-job-schedules) is describing a semantic choice, not an implementation quirk.

The first review question should therefore be: **what must remain invariant when the UTC offset changes?** If the answer is a local clock reading, use civil time. If the answer is elapsed time, use a duration or an instant-based recurrence. Do not use a scheduler’s default zone as a substitute for answering the question.

## A zone is not a fixed offset

For a civil schedule, `UTC-05:00` is not enough information. It says which offset applied at one moment, not which civil-time rules should apply on a later date. Keep an IANA identifier such as `America/Toronto` or `Europe/Paris` with the schedule.

That identifier matters beyond the familiar spring and fall transitions. The IANA Time Zone Database is periodically updated when political bodies change boundaries, offsets, or daylight-saving rules. [IANA’s time-zone documentation](https://www.iana.org/time-zones) describes it as the data software uses to calculate the local offset for a location. A precomputed future offset can become stale; a named zone lets a scheduler resolve the occurrence using current rules.

This is not an argument to schedule everything in local time. UTC is usually better for a system maintenance cadence, an expiry calculation, or a cross-region protocol that has no human clock promise. It is an argument to make a human clock promise with a named civil-time zone rather than an offset copied from the day it was created.

The iCalendar specification makes the same distinction. For a fixed local event, it represents a local date-time with a `TZID`; an unqualified local value is a *floating* time, which different recipients can interpret at different actual times. [RFC 5545 §3.3.5](https://datatracker.ietf.org/doc/html/rfc5545#section-3.3.5) treats the time-zone reference as part of the meaning, not display metadata.

## The transition policy is part of the schedule

Most scheduled jobs avoid trouble simply by running at a time such as 09:00. The trouble becomes unavoidable when a recurrence lands inside the time-zone transition itself.

In a spring-forward transition, a local time can be missing. A job defined as “every day at 02:30” may have no 02:30 that day. In a fall-back transition, a local time can occur twice. “Run at 01:30” can refer to two distinct instants.

There is no neutral default. Pick a policy that fits the job:

| Schedule kind | Missing local time | Repeated local time |
| --- | --- | --- |
| Human reminder | Move forward, skip, or ask—depending on the product promise | Usually deliver once; record which occurrence was chosen. |
| Financial or regulatory cutoff | Avoid transition hours; if unavoidable, define the rule with the business owner | Avoid transition hours; if unavoidable, define first, second, or both explicitly. |
| Maintenance cadence | Prefer an instant-based duration instead | Prefer an instant-based duration instead. |

RFC 5545 chooses concrete compatibility behavior for its zoned local values: a repeated local time refers to the first occurrence, while a nonexistent time is interpreted using the pre-gap offset, effectively moving the example `02:30` to `03:30`. [RFC 5545 §3.3.5](https://datatracker.ietf.org/doc/html/rfc5545#section-3.3.5) Those choices can be reasonable interoperability defaults. They are not automatically the right policy for payroll, medication reminders, or a daily business cutoff.

The important operational requirement is not a particular answer. It is that the answer is visible in the schedule definition and in the run record. “The library did something sensible” is difficult to audit after an unexpected duplicate or omission.

## Keep the two contracts in different shapes

Avoid an overloaded field such as `frequency: "daily"`. It invites a future caller to supply a duration where a wall-clock value was intended, or to apply the host machine’s zone accidentally.

This illustrative shape makes the decision explicit:

```ts
type CivilSchedule = {
  kind: "civil";
  rule: "daily";
  localTime: "09:00";
  timeZone: "America/Toronto";
  gap: "skip" | "shift_forward" | "reject";
  overlap: "first" | "second" | "both" | "reject";
};

type CadenceSchedule = {
  kind: "cadence";
  everySeconds: 86_400;
  anchor: "2026-11-08T14:00:00Z";
};
```

The implementation can use a managed scheduler, a calendar library, or a database query; the types are not prescribing a particular technology. They enforce a useful boundary: a cadence has an anchor instant but no local time, while a civil schedule has a local time and named zone but no claim that adjacent runs are exactly 86,400 seconds apart.

When expanding a civil schedule, resolve one local date-time at a time with the configured policy. Do not calculate the first UTC instant and repeatedly add 24 hours. That turns a wall-clock schedule into a cadence without anyone choosing it.

Likewise, do not recover a cadence’s next due time by formatting the prior instant in local time, incrementing the calendar date, and parsing it again. That changes the elapsed-time contract at a transition. Keep the instant arithmetic on the instant path.

## The scheduled occurrence needs its own identity

Once a scheduler turns intent into a run, downstream queues need to know which occurrence they are handling. A job ID alone is not enough: the same job has many expected runs, and a delayed message from yesterday can arrive beside today’s run.

For a civil schedule, a useful occurrence key includes the job, its intended local date and time, the named zone, and—where the time repeats—the chosen occurrence. For a cadence, use the planned instant. For example:

```text
civil: digest/acme | 2026-11-01T01:30 | America/Toronto | second
cadence: cache-refresh/acme | 2026-11-01T06:30:00Z
```

Persist that key before or atomically with enqueueing, and make consumers deduplicate on it. A retry of the same occurrence should not become a second digest. A late message for a prior occurrence should not masquerade as the current run merely because it arrived after the clock changed.

This complements the archive’s advice that [Retries Need an Identity Before They Need Backoff](https://my-slops.github.io/Blog/posts/2026/05/retries-need-an-identity-before-they-need-backoff/). The schedule determines what logical operation exists; the occurrence key lets the rest of the system preserve that distinction under retries, duplicate delivery, and delay.

## Test an offset change as a contract test

Testing a cron parser against an ordinary Tuesday is not enough. Add fixtures around a real transition in every zone that matters, and assert the business promise rather than an incidental timestamp.

For a civil schedule, test that the local clock invariant survives the transition:

```text
Given: daily 09:00 in America/Toronto
When: the zone's UTC offset changes
Then: each normal-day occurrence resolves to 09:00 local time
And: the planned UTC instant changes as required by the zone rule
```

For a cadence, assert the opposite invariant:

```text
Given: a schedule every 86,400 seconds
When: the zone's UTC offset changes
Then: adjacent planned instants remain 86,400 seconds apart
And: the displayed local clock time may change
```

Then add the awkward cases: a missing local time, both instances of a repeated local time, a retry after the next occurrence has been enqueued, and an update to the time-zone data. Test the recorded occurrence identity as well as the trigger time. A scheduler can launch at the intended instant and still be wrong if the queue cannot distinguish the two 01:30 runs.

## Trade-offs

Civil-time scheduling requires a time-zone-data update path, a policy for gaps and overlaps, and more careful tests. That is real complexity. It belongs in the system that promised a human time in a place.

Cadence scheduling is simpler but can look surprising in a local dashboard. Explain the contract in the UI and runbook instead of “fixing” the displayed hour. A system can also have both: calculate a customer report from a civil schedule, while trigger polling or stale-work recovery uses elapsed-time deadlines.

Not every local-time use case needs an individual user’s zone. A company may define a report in one business zone; a globally coordinated operation may deliberately define its day in UTC. The requirement is to name that choice and retain it with the schedule, rather than inheriting the deployment host’s current setting.

## References

- IETF, [RFC 5545: iCalendar DATE-TIME](https://datatracker.ietf.org/doc/html/rfc5545#section-3.3.5)
- IANA, [Time Zone Database](https://www.iana.org/time-zones)
- Google Cloud, [Cron job format and time zone](https://cloud.google.com/scheduler/docs/configuring/cron-job-schedules)
- This repository, [A Date Is Not a Timestamp](https://my-slops.github.io/Blog/posts/2026/10/a-date-is-not-a-timestamp/)
- This repository, [Retries Need an Identity Before They Need Backoff](https://my-slops.github.io/Blog/posts/2026/05/retries-need-an-identity-before-they-need-backoff/)

## Final Take

The phrase “daily job” does not define a schedule. It names a question: should the next run preserve a clock reading, or preserve elapsed time?

Answer that question in the data model. Keep civil schedules tied to named zones and explicit transition policies; keep cadences tied to instants and durations. Once the two contracts are separate, daylight-saving changes stop being mysterious scheduler failures and become ordinary, testable behavior.

## Changelog

- 2026-11-08: Initial publication on separating wall-clock and elapsed-time schedules.
