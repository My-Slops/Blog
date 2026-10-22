---
title: "A CI Event Is a Trust Boundary"
date: "2026-10-22"
updated: "2026-10-22"
created_at: "2026-10-22T10:00:00-04:00"
published_at: "2026-10-22T10:00:00-04:00"
scheduled_at: "2026-10-22T10:00:00-04:00"
slug: "a-ci-event-is-a-trust-boundary"
description: "Changing a GitHub Actions trigger can change which code, tokens, secrets, and artifacts meet in one job. Treat that choice as a security boundary, not a workflow convenience."
summary: "A pull-request workflow and a privileged pull-request workflow may look nearly identical in YAML, but they make opposite trust decisions. Keep contributed code and privileged effects in separate planes, and treat handoffs between them as untrusted input."
tags: [github actions, security, automation, developer tooling, software supply chain]
author: "vabs"
status: "published"
canonical_url: "https://my-slops.github.io/Blog/posts/2026/10/a-ci-event-is-a-trust-boundary/"
license: "MIT"
audience: "general"
reading_time: "7 min"
---

A pull request needs an integration test that reads a private package registry. Someone changes the trigger from `pull_request` to `pull_request_target`, adds a checkout of the pull request head, and calls the same test command as before.

The diff can be only a few lines. It can also let a first-time contributor's `package.json`, `Makefile`, test fixture, or build script run with repository credentials.

That is not an unfortunate GitHub Actions corner case. The event name is part of the security design. It decides the relationship among the workflow definition, the code being handled, the token, the secrets, the cache, and the runner. **A CI event is a trust boundary.**

## The innocent-looking substitution

For a forked pull request, GitHub normally treats the contributor's code as untrusted. With the usual repository settings, a `pull_request` workflow has a read-only `GITHUB_TOKEN` and does not receive other secrets. GitHub's event documentation also notes that repository settings can deliberately relax those restrictions, so they are a default to understand rather than a guarantee to assume. [Events that trigger workflows](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#pull_request) and [workflow syntax](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#changing-the-permissions-for-a-forked-repository) describe those rules.

`pull_request_target` solves a different problem. It runs the workflow from the base repository's default branch in an elevated trust context, which makes it useful for actions such as applying labels or posting an authenticated status. GitHub documents that it receives the base repository's token and has access to repository and organization secrets.

The dangerous move is to combine that privileged context with code from the pull request:

```yaml
# Do not use this shape for untrusted pull requests.
on: pull_request_target

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
        with:
          ref: ${{ github.event.pull_request.head.sha }}
      - run: npm test
```

`actions/checkout` does not execute code by itself. The next command often does. `npm test` may load a script from the checkout; installation can run lifecycle scripts; a test runner can consume attacker-controlled configuration. GitHub calls this a common **pwn request** shape and explicitly says that privileged workflows should not check out, build, or run untrusted pull-request code. [Its security guide for `pull_request_target`](https://docs.github.com/en/actions/reference/security/securely-using-pull_request_target) is unusually direct on this point.

The important review question is not, “Does this job use a secret?” It is, “Can any data controlled by this event become executable before the secret-bearing step finishes?” That includes more than an obvious `run: ./script.sh`.

## Separate execution from repository effects

Most repositories need two kinds of pull-request automation. They should usually be separate jobs or workflows with a visible trust boundary between them.

### Plane one: evaluate contributed code

Use the ordinary pull-request event for linting, tests, and builds of contributed code. Give it no secrets and only the permissions it needs to report its result.

```yaml
name: PR checks
on: pull_request

permissions:
  contents: read

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - uses: actions/setup-node@v4
        with:
          node-version: 24
      - run: npm ci
      - run: npm test
```

This is not a promise that the code is harmless. It is an acknowledgement that it may be hostile, so the environment must be expendable and unable to reach credentials or production-adjacent systems. A self-hosted runner deserves particular skepticism: a read-only GitHub token does not protect network access, mounted files, Docker sockets, or credentials left on the machine.

### Plane two: perform a narrow trusted effect

If the repository needs to add a label, write a comment, or update a check, use a privileged workflow that handles pull-request metadata but does not execute pull-request content.

```yaml
name: PR triage
on:
  pull_request_target:
    types: [opened, reopened, synchronize]

permissions:
  pull-requests: write
  contents: read

jobs:
  label:
    runs-on: ubuntu-latest
    steps:
      - name: Apply default label
        env:
          GH_TOKEN: ${{ github.token }}
          PR: ${{ github.event.pull_request.number }}
        run: gh pr edit "$PR" --add-label needs-review
```

The second workflow uses the base branch's reviewed workflow code and operates on an identifier from the event. It never checks out the contributor's repository, downloads its build artifact, or interpolates a title, branch name, or comment into a shell command. The distinction is more valuable than the exact YAML: **privileged automation may inspect untrusted data, but it must not mistake that data for a program.**

## Approval changes who reviewed the change, not what the runner can execute

A tempting compromise is “we only run the privileged workflow after approval.” That can be sensible for a deliberately designed human gate, but approval is not a general sanitizer for a repository checkout.

Approval answers a social question: did an authorized person decide this contribution may proceed? It does not make every transitive tool invocation, dependency hook, test fixture, or generated file safe to execute with long-lived credentials. It also has a time dimension: a pull request can change after a review, and the approval needs to be bound to the reviewed commit and the exact action it authorizes.

This is the same distinction behind [A Feature Flag Is Not an Authorization Check](https://my-slops.github.io/Blog/posts/2026/10/a-feature-flag-is-not-an-authorization-check/). A control that makes a path visible or convenient is not automatically the control that grants a particular effect. If privileged execution of contributed code is truly unavoidable, define a separate, commit-bound approval process, use isolated ephemeral compute, minimize credentials, and document why the ordinary untrusted plane cannot do the job. Treat it as an exception with an owner, not a replacement trigger copied into every workflow.

## An artifact is not a safe bridge by default

Splitting workflows does not make every handoff safe. A common pattern runs tests on `pull_request`, uploads an artifact, then uses `workflow_run` to download it and post a privileged comment or publish a result. The receiving workflow can have access to secrets and a write token.

The producer can also have created the artifact. GitHub explicitly warns that artifacts uploaded by another workflow must be treated as untrusted data when the source can be a forked pull request. Downloading a report is not automatically dangerous; executing it, extracting it into a privileged working directory, or trusting fields inside it to select a command can be.

Use a narrow, declarative handoff instead. For example, an untrusted test can emit a fixed-format JSON result with a schema version, commit SHA, and bounded test names. The trusted workflow should validate that shape, bind the result to the expected pull request and commit, and render it as data. It should not download an archive and invoke a contributor-supplied `publish.sh` because the archive came from a job called “test.”

```text
untrusted job:
  execute PR code
  -> produce: { schema: 1, sha: <expected>, passed: true, suites: [...] }

trusted job:
  verify schema, size limits, and expected SHA
  -> use fixed repository code to post a status
```

The boundary is about provenance *and* interpretation. A digest can show which bytes arrived. It cannot make their contents trustworthy or decide which parser, command, or destination is safe. That is a useful complement to [Start an Incident With the Artifact Digest](https://my-slops.github.io/Blog/posts/2026/10/start-an-incident-with-the-artifact-digest/): identify the artifact that ran, then also preserve the trust context in which it was allowed to run.

## Review a workflow as a chain of authority

When a CI change introduces a new event, a secret, or a checkout reference, trace this short chain:

1. **Who can cause this event?** A maintainer push, an external contributor, a bot, a comment author, or another workflow are different principals.
2. **Which workflow definition runs?** Is it reviewed base-branch YAML or code supplied by the contribution?
3. **What code or data enters the runner?** Include repositories, artifacts, caches, dependency manifests, configuration, branch names, and comments.
4. **What can it reach?** List token scopes, secrets, network routes, cloud identities, shared caches, and runner-local state.
5. **Where can untrusted input become an instruction?** Shell interpolation, dynamic matrices, package scripts, build configuration, artifact extraction, and `git fetch` all deserve scrutiny.
6. **What is the smallest trusted effect?** Prefer a fixed command against an explicit identifier over a general build, deploy, or script runner.

The chain should make accidental authority expansion awkward. A change from `pull_request` to `pull_request_target` ought to trigger the same level of review as adding a production credential, because that is often what it functionally does.

## Trade-offs

Two planes add maintenance. Tests that genuinely require private dependencies or authenticated integration endpoints may need a sanitized mirror, an internal-only test path, or a tightly governed exception. Treating artifacts as untrusted means more validation code and sometimes less convenient reports.

Those costs are real. So is the alternative: letting any pull request choose what runs in the same process that holds the credential for your package registry, cloud account, or repository. The right answer is not that every repository needs an elaborate security platform. It is that a trigger change deserves a threat-model question before it becomes a three-line workaround.

## References

- GitHub Docs, [Securely using `pull_request_target`](https://docs.github.com/en/actions/reference/security/securely-using-pull_request_target)
- GitHub Docs, [Events that trigger workflows: pull requests from forks](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#pull_request)
- GitHub Docs, [Workflow syntax: changing permissions for forked repositories](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#changing-the-permissions-for-a-forked-repository)
- GitHub Docs, [`GITHUB_TOKEN`](https://docs.github.com/en/actions/concepts/security/github_token)
- This repository, [A Feature Flag Is Not an Authorization Check](https://my-slops.github.io/Blog/posts/2026/10/a-feature-flag-is-not-an-authorization-check/)
- This repository, [Start an Incident With the Artifact Digest](https://my-slops.github.io/Blog/posts/2026/10/start-an-incident-with-the-artifact-digest/)

## Final Take

CI configuration is executable security policy. A trigger does not merely decide when automation runs; it changes what the automation is trusted to run beside.

Keep untrusted contributions in an environment built to execute them safely. Keep privileged workflows focused on small, fixed effects. And when information crosses between those planes, validate it as untrusted input rather than promoting it because a workflow produced it.

## Changelog

- 2026-10-22: Initial publication.
