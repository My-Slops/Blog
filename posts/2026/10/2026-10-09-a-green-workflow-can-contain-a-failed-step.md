---
title: "A Green Workflow Can Contain a Failed Step"
date: "2026-10-09"
updated: "2026-10-09"
slug: "a-green-workflow-can-contain-a-failed-step"
description: "GitHub Actions can deliberately turn a failed step into a successful conclusion. That is useful for explicitly non-blocking evidence, but only if the raw failure remains visible and owned."
summary: "A green workflow may mean every required operation passed, or it may mean a failure was deliberately tolerated. Treat `continue-on-error` as a policy boundary: retain the original result, state why it is non-blocking, and make the exception expire."
tags: [developer tooling, testing, reliability, automation]
author: "vabs"
status: "published"
canonical_url: "https://my-slops.github.io/Blog/posts/2026/10/a-green-workflow-can-contain-a-failed-step/"
license: "MIT"
audience: "general"
reading_time: "6 min"
---

## TL;DR

`continue-on-error` does not make a command pass. It changes how GitHub Actions treats a command that failed. For a failed step, GitHub records `outcome: failure` but applies a final `conclusion: success` when `continue-on-error` is enabled.

That is a useful mechanism for an explicitly advisory signal, such as a test against an experimental runtime. It is a dangerous default for a check that protects a release. A green workflow with an allowed failure should say what failed, why it did not block, who owns the exception, and when the policy will be reconsidered.

## Context

A team adds a preview Node version to its test matrix. The current product supports the stable versions, but it wants early warning when the next runtime changes behavior. The preview job is allowed to fail:

```yaml
jobs:
  test:
    runs-on: ubuntu-latest
    continue-on-error: ${{ matrix.experimental }}
    strategy:
      fail-fast: true
      matrix:
        node: [22, 24]
        experimental: [false]
        include:
          - node: 25
            experimental: true
```

That can be a sensible choice. A failure on Node 25 should not stop a release that promises support for 22 and 24. But it should not disappear into a reassuring green badge either. The test produced evidence: the project does not currently work on the runtime it is watching.

GitHub Actions makes this distinction concrete. Its `steps` context has both an `outcome`, the result before `continue-on-error`, and a `conclusion`, the result after that policy is applied. A continued failed step therefore has `outcome: failure` and `conclusion: success`. [GitHub documents both values explicitly](https://docs.github.com/en/actions/reference/workflows-and-actions/contexts#steps-context).

The important distinction is not a GitHub quirk. It is the difference between an operation result and the policy that decides whether that result blocks delivery.

## Key Points

### Green is a decision, not a transcript

The badge on a workflow answers a question like: “did this workflow satisfy its configured blocking policy?” It does not necessarily answer: “did every command succeed?”

Those can be the same answer, and for a release gate they often should be. But treating them as always identical makes it easy to mistake a tolerated failure for positive evidence.

| Signal | What it means |
| --- | --- |
| Step outcome is `success` | The command completed successfully. |
| Step outcome is `failure`, conclusion is `success` | The command failed; the workflow policy allowed it. |
| Required job is green | The branch rule's required policy was satisfied. |

GitHub's branch-protection guidance reinforces the gap: `success`, `skipped`, and `neutral` are all successful statuses for a required check. A skipped job also reports success and does not prevent a pull request from merging, even when that job is required. [Those are documented semantics](https://docs.github.com/en/pull-requests/how-tos/merge-and-close-pull-requests/troubleshooting-required-status-checks#required-check-needs-to-succeed-against-the-latest-commit-sha), not evidence that the underlying work ran.

This is why “the build is green” is an incomplete incident note. A better statement is: “the required stable tests passed; the experimental runtime test failed and was intentionally non-blocking.” The extra clause is where the useful information lives.

### Preserve the failure where humans can see it

If a failure is allowed, expose the pre-policy result in the job summary, a check annotation, an issue, or a durable metric. Do not rely on someone expanding logs days later.

For a step-level exception, assign an `id` and report `outcome`, not `conclusion`:

```yaml
- name: Test the next runtime
  id: next_runtime
  continue-on-error: true
  run: npm run test:next

- name: Summarize compatibility result
  if: ${{ always() }}
  run: |
    {
      echo "## Next-runtime compatibility"
      echo "Raw outcome: \`${{ steps.next_runtime.outcome }}\`"
      echo "Policy conclusion: \`${{ steps.next_runtime.conclusion }}\`"
    } >> "$GITHUB_STEP_SUMMARY"
```

The step can still be non-blocking, but the summary makes the distinction inspectable. A reporter can also open or update a tracked issue when `outcome == 'failure'`; whether that is appropriate depends on how noisy the preview signal is.

Do not use `continue-on-error` merely to keep a later cleanup or reporting step running. GitHub's own status-check troubleshooting guide recommends `always()` with `needs` when a required dependent job must run after another job fails. That preserves the failure while allowing the evidence-collection path to execute. [It is a different design from declaring the original check non-blocking](https://docs.github.com/en/pull-requests/how-tos/merge-and-close-pull-requests/troubleshooting-required-status-checks#handling-skipped-but-required-checks).

### An allowed failure needs a contract

Every non-blocking check should have a small, written answer to four questions:

1. **What signal is it collecting?** For example, compatibility with an unreleased SDK or a flaky third-party integration.
2. **Why is it safe not to block?** The supported release surface must be covered by a separate required check.
3. **Where does a failure go?** A job summary alone may be enough for a short experiment; a persistent failure needs an owner and a tracked follow-up.
4. **When does the exception end?** A preview version becomes supported, a flaky dependency is removed, or a deadline forces a decision.

Without the fourth answer, `continue-on-error` often becomes a permanent greenwash switch. The job still consumes CI time and creates logs, but nobody has an incentive to resolve what it reports.

This is especially important in a matrix. GitHub supports job-level `continue-on-error` for experimental matrix entries, and its documentation notes that a failed job marked that way does not cancel the other matrix jobs when `fail-fast` is enabled. [That is a good fit for an explicitly experimental cell](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/run-job-variations#handling-failures). It is not a reason to put a supported platform and a preview platform behind one indistinguishable green result.

### Keep blocking evidence separate from observability

My preference is to model these as two different products of CI:

```text
required test suite     -> merge decision
experimental test suite -> early-warning signal
```

The first must make an unambiguous promise about supported behavior. The second is valuable precisely because it can fail without blocking routine work. Combining them is tempting because one workflow file looks tidy; separating their names, summaries, and ownership makes the delivery policy legible.

The same principle applies to vulnerability scans, deployment smoke tests, and cleanup. A scan may begin as advisory while teams learn its false-positive rate. Make that temporary status visible. A deployment smoke test is usually too close to the promised outcome to be advisory; if it fails, succeeding the release anyway should be an explicit release decision, not YAML's default behavior.

This also complements [A Green Pull Request Does Not Mean the Merge Candidate Was Tested](https://my-slops.github.io/Blog/posts/2026/10/a-green-pull-request-does-not-mean-the-merge-candidate-was-tested/). There, the concern is that a green check may describe the wrong commit. Here, it may describe a policy that accepted a failed operation. In both cases, the check is only trustworthy when its subject and meaning are clear.

## Steps / Code

Review every `continue-on-error` setting with this checklist:

1. Locate the matching required check that still protects the supported release surface.
2. Give the allowed-failure step or job a name that says what is experimental or advisory.
3. Preserve and surface the raw `outcome`, not only the final conclusion.
4. Route persistent failures to a named owner or work item.
5. Add a review date, support milestone, or removal condition.
6. Test the failing case deliberately: confirm the workflow stays green only where intended and that the failure is still visible.

Avoid applying the setting to artifact publication, database migration, security enforcement, or a production verification merely because those steps are intermittently inconvenient. A flaky gate needs diagnosis, isolation, or an explicit human override path. Calling it non-blocking changes the release promise; it does not repair the flakiness.

## Trade-offs

Making advisory failures visible creates more triage work and may make dashboards look less clean. That is the cost of retaining information the workflow otherwise discards. For genuinely short-lived experiments, a detailed issue workflow can be overkill; a clear job summary and dated TODO may be sufficient.

Conversely, not every nonzero exit code deserves a page. Some probes intentionally use a failed command as control flow. The boundary is whether the command is meant to provide evidence about a property anyone cares about. If it is, record the result separately from the decision to continue.

The right policy can also change. A runtime check that is advisory today should become blocking when the runtime enters your support policy. A formerly blocking integration can become advisory during a contained outage only if someone accepts the resulting risk. The YAML should make those decisions easy to audit rather than silently embedding them.

## References

- GitHub Docs, [Contexts: `steps.<step_id>.outcome` and `conclusion`](https://docs.github.com/en/actions/reference/workflows-and-actions/contexts#steps-context)
- GitHub Docs, [Running variations of jobs: handling failures](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/run-job-variations#handling-failures)
- GitHub Docs, [Troubleshooting required status checks](https://docs.github.com/en/pull-requests/how-tos/merge-and-close-pull-requests/troubleshooting-required-status-checks)
- GitHub Docs, [Using conditions to control job execution](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-jobs-with-conditions)
- This repository, [A Green Pull Request Does Not Mean the Merge Candidate Was Tested](https://my-slops.github.io/Blog/posts/2026/10/a-green-pull-request-does-not-mean-the-merge-candidate-was-tested/)

## Final Take

An allowed failure is not a passing test. It is a policy decision to proceed despite a failing test.

That can be exactly the right decision. But a green workflow earns trust only when it leaves the failed evidence visible and makes the exception's scope, owner, and end date clear.

## Changelog

- 2026-10-09: Initial publish.
