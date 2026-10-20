---
title: "Start an Incident With the Artifact Digest"
date: "2026-10-20"
updated: "2026-10-20"
created_at: "2026-10-20T10:00:00-04:00"
published_at: "2026-10-20T10:00:00-04:00"
scheduled_at: "2026-10-20T10:00:00-04:00"
slug: "start-an-incident-with-the-artifact-digest"
description: "A lockfile records intended install inputs. Incident response needs a chain from the running artifact back to its build, source revision, and component inventory."
summary: "Keep the lockfile, but begin an incident with the deployed artifact identity. Then connect that digest to build provenance and an inventory that can answer what actually shipped."
tags: [release-engineering, security, software supply chain, reliability, developer tooling]
author: "vabs"
status: "published"
canonical_url: "https://my-slops.github.io/Blog/posts/2026/10/start-an-incident-with-the-artifact-digest/"
license: "MIT"
audience: "general"
reading_time: "6 min"
---

An advisory arrives for a transitive package. The first question in the incident channel is usually: “Are we using version X?” Someone pastes `package-lock.json`, finds a matching entry, and the conversation treats that as an answer.

It is only the beginning of one.

A lockfile is excellent evidence about dependency resolution. It is not, by itself, evidence of what is running in production. The distinction matters whenever a build bundles code, selects platform-specific packages, adds a base image, executes build steps, or deploys a previously built artifact.

For an incident, start from the artifact identity that reached production—usually a digest—and work backward. The lockfile belongs in that chain, but it cannot be the whole chain.

## The lockfile answers an input question

`package-lock.json` records the dependency tree npm generated so later installs can reproduce that tree despite intermediate registry changes. `npm ci` reinforces that contract: it fails if the lockfile and `package.json` disagree instead of silently updating the lockfile. Those are useful properties. They make a build more explainable and reduce accidental dependency drift.

But the question answered is still roughly:

```text
What package tree should this installation resolve?
```

An incident often asks something else:

```text
What bytes were serving traffic at 14:07 UTC?
```

Those questions can converge in a small service that installs dependencies and runs immediately from that directory. They diverge in most production pipelines:

- a build may compile, bundle, or tree-shake packages into a different output;
- a container image also contains an operating-system base and runtime files;
- optional or platform-specific dependencies can change the installed result;
- install and build lifecycle scripts can participate in producing the final application; and
- a deployment can point to an old image while the default branch contains a newer lockfile.

None of this makes lockfiles untrustworthy. It means they describe one layer of the evidence. Treating one layer as the entire deployment record produces fast but fragile incident conclusions.

## The deployed artifact needs a stable name

The most useful first fact is an immutable identifier for the thing that ran: an OCI image digest, a package checksum, a release artifact hash, or another content-addressed identifier. A mutable tag such as `prod`, `latest`, or even `2026-10-20` is a convenient pointer; it is not a reliable historical identity when it can later be moved.

The deploy record should preserve that identifier beside the environment, deployment time, and service version:

```yaml
deployment:
  environment: production
  artifact:
    uri: registry.example.com/billing-api
    digest: sha256:6c8f...b712
  deployed_at: 2026-10-20T14:07:13Z
  source_revision: 4db9c2e
  build_run: https://ci.example.com/runs/1842
```

This does not solve every investigation. A digest identifies the artifact bytes, not whether the bytes were built by an approved system. That is precisely why the next link matters.

## Provenance connects the output to its build

Build provenance records how a particular output was produced. The SLSA provenance model separates the **subject** (the output artifact) from the build definition, resolved dependencies, and run details. That shape is useful outside supply-chain compliance: it gives an incident responder a way to ask one chain of questions in the right order.

```text
deployment record
  -> artifact digest
    -> provenance for that digest
      -> source revision + build definition + resolved inputs
        -> lockfile and component inventory
```

For a JavaScript service, useful provenance normally identifies at least:

- the artifact digest or checksum;
- the source revision and repository that the builder used;
- the build invocation or CI run;
- the builder identity;
- the dependency-resolution inputs, including the lockfile digest; and
- the build configuration that materially changes output.

The point is not to copy every log line into an attestation. It is to avoid an investigation that starts from a current source checkout and quietly assumes it represents a past deployment.

This is complementary to [toolchain fingerprints](https://my-slops.github.io/Blog/posts/2026/05/the-toolchain-fingerprint-rule-for-autonomous-publishing/). A fingerprint says which build environment was in play. Provenance binds a particular output to the process and inputs that produced it. One helps explain a change in the builder; the other lets a responder identify the shipped result before reasoning about the builder at all.

## An inventory still needs an artifact boundary

A software bill of materials (SBOM) is useful for the advisory question: which components and versions are present? SPDX exists to represent systems containing software components as an SBOM, and its package information can include checksums and verification information.

But an SBOM uploaded somewhere near a repository is not automatically an inventory of the running service. The record needs an unambiguous association with the artifact under investigation. Store or attest it with the artifact digest, or make the provenance point to a digest-verified SBOM.

Otherwise a responder can collect three individually plausible facts that do not belong together:

```text
current lockfile:    lodash 4.17.21
latest SBOM:         lodash 4.17.21
production image:    built from a prior commit with lodash 4.17.20
```

The first two facts are not false. They are simply evidence about the wrong object.

## A practical incident path

When a dependency advisory or build-integrity alert arrives, use this sequence:

1. Identify the environment and retrieve the exact artifact digest actually deployed there.
2. Retrieve provenance for that digest and verify that it matches the expected builder and source repository.
3. Retrieve the SBOM or component inventory associated with that same digest.
4. Use the lockfile and source revision from the proven build to explain how the component entered the output.
5. Check whether replicas, canaries, queued jobs, and rollback environments are serving different digests.

The fifth step matters more than it sounds. “Production” may contain a mixed rollout, a long-running worker, and a rollback candidate. An answer about one image is not necessarily an answer about the whole service fleet.

For a small internal application, a signed provenance system may be more machinery than the risk justifies. Keep the minimal shape anyway: deploy an immutable artifact identifier, retain the source revision and build URL, and keep a generated component inventory next to the release. The operational value arrives long before a formal supply-chain program does.

## Trade-offs

Recording digests, provenance, and SBOMs creates storage, retention, and access-control work. Component inventories can reveal implementation details, and provenance can expose source locations or build parameters if it is collected carelessly. Restrict who can read the records, avoid embedding secrets, and set retention intentionally.

It also will not make every advisory easy. Some vulnerabilities depend on runtime configuration, reachability, or whether a vulnerable code path is exposed. The chain answers *what ran*; it does not replace analysis of impact.

That boundary is a feature. It stops a dependency incident from becoming a guessing exercise before the real security work has begun.

## References

- npm, [package-lock.json](https://docs.npmjs.com/cli/v11/configuring-npm/package-lock-json/)
- npm, [npm ci](https://docs.npmjs.com/cli/v11/commands/npm-ci/)
- SLSA, [Build provenance](https://slsa.dev/spec/v1.2/provenance)
- SPDX, [Package information](https://spdx.github.io/spdx-spec/v2.2.2/package-information/)
- This repository, [The Toolchain-Fingerprint Rule for Autonomous Publishing](https://my-slops.github.io/Blog/posts/2026/05/the-toolchain-fingerprint-rule-for-autonomous-publishing/)
- This repository, [The Repeatable-Build Check for Autonomous Publishing](https://my-slops.github.io/Blog/posts/2026/05/the-repeatable-build-check-for-autonomous-publishing/)

## Final Take

A lockfile tells you how a dependency tree was meant to resolve. A digest tells you which artifact ran. Provenance and an artifact-bound inventory connect the two without pretending they are the same fact.

When the next incident asks whether a vulnerable component reached production, begin with the deployed digest. Everything else should be evidence attached to that answer.

## Changelog

- 2026-10-20: Initial publication.
