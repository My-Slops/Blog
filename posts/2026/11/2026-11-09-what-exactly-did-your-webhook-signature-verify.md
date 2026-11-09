---
title: "What Exactly Did Your Webhook Signature Verify?"
date: "2026-11-09"
updated: "2026-11-09"
slug: "what-exactly-did-your-webhook-signature-verify"
description: "A webhook signature verifies a defined representation, not whichever object an application reconstructs after parsing. Make the signed input, its transformation boundary, and verification order explicit."
summary: "Verify the exact signature base before JSON parsing, logging middleware, or proxy transformations can reinterpret it. Then parse and validate the verified bytes as a separate step; an object that looks the same is not necessarily the message that was signed."
tags: [security, event systems, API design, reliability, developer tooling]
author: "vabs"
status: "published"
canonical_url: "https://my-slops.github.io/Blog/posts/2026/11/what-exactly-did-your-webhook-signature-verify/"
license: "MIT"
audience: "general"
reading_time: "7 min"
---

## TL;DR

Webhook handlers often make one object do two jobs: it is treated as the thing that was signed and as the parsed event the application will use. Those are not the same thing.

Most provider-specific webhook schemes sign the request body as received. An HTTP Message Signature instead defines a canonical signature base from selected HTTP components. Either way, the verifier must reconstruct the exact input that the signing contract specifies. Parsing JSON, serializing it again, normalizing headers, or letting a proxy rewrite a covered component before verification can make a different message look like the same event.

Keep the boundary explicit:

1. obtain the raw representation or the specified signature components;
2. verify that representation before parsing or side effects;
3. parse and validate the verified content; and
4. separately decide whether the valid event is fresh, deduplicated, and allowed to act.

The first step is not plumbing. It is the authentication contract.

## One JavaScript object can come from many messages

Consider two request bodies:

```json
{"amount": 1.0, "note": "café"}
```

```json
{"note":"caf\u00e9","amount":1}
```

For an application that parses either body into a JavaScript value, they may be equivalent: the same keys, number, and text. Their byte sequences are different. Whitespace, member order, numeric spelling, and escape form have all changed.

That distinction is exactly what a body HMAC exposes. If the sender signed the first sequence, a receiver that does this has changed the verification problem:

```ts
const event = JSON.parse(request.body.toString("utf8"));
const reconstructed = Buffer.from(JSON.stringify(event), "utf8");

verifyHmac(reconstructed, request.headers["x-provider-signature"]);
```

It is no longer checking what the sender signed. It is checking a new serialization chosen by the receiver's runtime. `JSON.stringify` chooses its own whitespace, numeric, and escape formatting, and cannot recover formatting that parsing discarded. A signature failure in this arrangement is not a cryptography problem. It is a lost-input problem.

GitHub's webhook guidance says to ensure that payloads and headers are not modified before verification, including by a proxy or load balancer. That advice is broader than one framework quirk: the receiver has to preserve the thing its signing scheme calls the payload. [GitHub's validation guidance](https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries)

## The signed input must be named

"Verify the webhook signature" is underspecified until the contract answers what was signed. Common choices are different protocols, not interchangeable implementation details:

| Contract shape | Verifier needs | A change that can invalidate verification |
| --- | --- | --- |
| Provider HMAC over request-body bytes | The body bytes supplied to the application, in the encoding the provider specifies | JSON parser runs first; body is decoded and re-encoded; an intermediary changes the body |
| HTTP Message Signature | The listed request components and the standard's signature-base construction | A covered path, authority, or header value is reconstructed differently |
| Signature over a canonical event format | The exact canonicalization algorithm and input object | Sender and receiver use different canonicalization versions or defaults |

The third option can be legitimate, but only if canonicalization is actually part of the public protocol. "We parse JSON, then stringify it" is not a canonicalization standard; it is an accidental dependency on two implementations making the same choices forever.

HTTP Message Signatures make this precision visible. RFC 9421 specifies an ordered signature base from named components and their canonicalized values, and says the verifier must fail if a covered component cannot be resolved. It also warns that HTTP intermediaries can combine repeated field values differently, which can make signer and verifier observe different signature-base values. [RFC 9421, sections 2.1 and 2.5](https://www.rfc-editor.org/rfc/rfc9421.html#section-2.5)

The useful lesson applies even if a provider sends a simple `X-Provider-Signature` header: do not invent normalization rules after the fact. Write down which bytes or components are authenticated, where they are captured, and which intermediary transformations are permitted before that point.

## Verify before the convenient middleware runs

The safest shape is usually a narrow route that receives a raw body, checks it, and only then turns it into an event object. In Express, that means placing a raw parser on the signed route before a catch-all JSON parser consumes the stream:

```ts
import crypto from "node:crypto";
import express from "express";

const app = express();

app.post(
  "/webhooks/invoices",
  express.raw({ type: "application/json", limit: "256kb" }),
  async (req, res) => {
    const signature = req.header("x-provider-signature");
    if (!signature || !hasExpectedHmac(req.body, signature, process.env.WEBHOOK_SECRET!)) {
      return res.sendStatus(401);
    }

    // Parsing happens only after the byte-level contract has succeeded.
    const event = JSON.parse(req.body.toString("utf8"));
    await handleVerifiedEvent(event);
    res.sendStatus(204);
  },
);

app.use(express.json()); // Other routes can use ordinary JSON parsing.

function hasExpectedHmac(body: Buffer, suppliedHex: string, secret: string) {
  if (!/^[a-fA-F0-9]{64}$/.test(suppliedHex)) return false;
  const expected = crypto.createHmac("sha256", secret).update(body).digest();
  const supplied = Buffer.from(suppliedHex, "hex");
  return supplied.length === expected.length && crypto.timingSafeEqual(supplied, expected);
}
```

The code is illustrative. A real provider may prefix the signature with an algorithm label, sign a timestamp plus body, rotate among multiple secrets, or use a different encoding. Parse those details exactly as that provider documents. The structural rule remains: `req.body` must be the representation the sender's algorithm expects, not a value recovered from a later convenience layer.

There is a tempting workaround: make the global JSON parser preserve a copy of the raw body. That can be appropriate when the framework guarantees that the copy is captured before any mutation. It also expands the set of routes retaining arbitrary request data in memory and logs, so use per-route size limits and avoid recording raw payloads by default. A signature mismatch needs diagnostic metadata such as provider, key ID, content length, and a correlation ID—not a customer record copied into an error log.

## Proxies are part of the verification boundary

An application may never see the same HTTP representation that arrived at its public edge. A CDN, API gateway, load balancer, service mesh, or framework adapter can decompress a body, rewrite a path, normalize headers, or produce a new request to an upstream service.

This does not automatically make webhook verification impossible. It means the team must choose where verification happens and which representation that location can reliably observe.

For a provider HMAC over body bytes, either preserve the required body all the way to the application or verify at the trusted edge and forward an authenticated result over a separately protected internal channel. For an HTTP Message Signature, use the standard's defined component rules and take special care with covered fields that an intermediary may rewrite. Do not verify a signature at the edge and then forward only a Boolean such as `verified: true` from an untrusted request header; the application must know which trusted component asserted the result and bind it to the forwarded request.

If an architecture relies on an edge verifier, give its handoff an identity and an audit trail:

```text
edge receipt
  delivery_id: 9d2c
  signature: valid under key kid_2026_04
  verified_body_digest: sha-256:...
  forwarded_to: billing-webhook-v3
```

The downstream service can then reject a receipt that is missing, expired, addressed to another route, or does not match the body it received. This is not a replacement for transport security between services. It is a way to avoid converting "the edge checked something" into an untestable assumption.

## Test representation changes on purpose

Most webhook tests sign a fixture and immediately send the same fixture through the handler. That proves the happy path but not the boundary. Add cases where the object would look unchanged after parsing:

```text
Given: a signature for {"amount":1.0,"note":"café"}
When: the receiver gets {"note":"caf\u00e9","amount":1} with that signature
Then: verification fails before JSON parsing or side effects

Given: a valid signed body
When: a global JSON parser runs before the webhook route
Then: the integration test demonstrates whether raw bytes are still available

Given: a signature that covers a timestamp and path
When: a reverse proxy changes the externally visible path
Then: the signer and verifier use the documented component values or the request is rejected

Given: a valid signed delivery is replayed
When: the receiver has already committed its delivery identity
Then: it does not repeat the side effect
```

The first three tests protect the signature contract. The last one protects a different contract: how the application handles a message that is authentic and unmodified but no longer new. [A Signed Webhook Is Not a Freshness Guarantee](https://my-slops.github.io/Blog/posts/2026/10/a-signed-webhook-is-not-a-freshness-guarantee/) covers that second problem. Keeping the tests separate makes failures easier to diagnose: either the receiver did not reconstruct the signed representation, or it accepted the representation but made the wrong event-processing decision.

## Trade-offs

Raw-body capture costs memory, complicates generic middleware, and makes observability more sensitive. A route that accepts a 20 MB signed upload has different limits and streaming needs from a small JSON webhook. Some systems may reasonably terminate verification at a dedicated gateway rather than teaching every application runtime how to preserve request bytes.

Nor should every API invent a bespoke canonical JSON signature scheme. If a provider already defines a body-signing contract, match it. If the system needs portable HTTP-level signatures, use a published protocol with explicit component rules. The costly option is the half-specified middle: parsing first, reconstructing later, and calling whatever remains "the signed payload."

Signature verification also does not validate the event's business meaning. After authentication, validate the schema, authorize any effect, deduplicate delivery or event identities, and apply the ordering or replay policy the domain needs. A precise byte boundary is necessary evidence, not a complete webhook safety program.

## References

- GitHub Docs, [Validating webhook deliveries](https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries)
- IETF, [RFC 9421: HTTP Message Signatures](https://www.rfc-editor.org/rfc/rfc9421.html)
- This repository, [A Signed Webhook Is Not a Freshness Guarantee](https://my-slops.github.io/Blog/posts/2026/10/a-signed-webhook-is-not-a-freshness-guarantee/)
- This repository, [A Webhook Retry Must Not Become a New Snapshot](https://my-slops.github.io/Blog/posts/2026/10/a-webhook-retry-must-not-become-a-new-snapshot/)

## Final Take

A webhook signature does not authenticate an abstract JSON object. It authenticates a representation defined by a protocol.

Capture that representation at a deliberate boundary, verify it before parsing, and make any proxy or canonicalization rule part of the written contract. Then the familiar next questions—whether this delivery is fresh, ordered, and safe to apply—can be answered on evidence that actually belongs to the sender.

## Changelog

- 2026-11-09: Initial publication on signed representations and webhook verification boundaries.
