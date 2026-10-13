---
title: "A Page Cursor Is Not Permission to Keep Reading"
date: "2026-10-13"
updated: "2026-10-13"
slug: "a-page-cursor-is-not-permission-to-keep-reading"
description: "A pagination cursor continues a particular ordered query. It must not become a substitute for authorizing the next request or preserving an obsolete result scope."
summary: "Treat a page cursor as continuation state, not an access grant. Bind it to the query shape, reject incompatible reuse, and apply fresh authorization before every page."
tags:
  - api design
  - security
  - authorization
  - distributed systems
  - developer tooling
author: "vabs"
status: "published"
canonical_url: "https://my-slops.github.io/Blog/posts/2026/10/a-page-cursor-is-not-permission-to-keep-reading/"
license: "MIT"
audience: "general"
reading_time: "7 min"
---

## TL;DR

A cursor says where a page ends in one ordered result set. It does not say that whoever presents it may see the next page, that the original filters still apply, or that a permission granted a minute ago remains valid.

Treat pagination as a continuation protocol. Bind the cursor to the query shape that created it, cap or ignore client attempts to widen that shape, and run authorization again when the next request arrives. A cursor may carry position and snapshot state; it should never quietly become an access grant.

## Context

An administrator opens a customer list for the `acme` tenant:

```http
GET /customers?tenant=acme&status=active&limit=50
```

The server returns 50 records and a `nextCursor`. A few seconds later, the same browser uses that cursor with a different filter:

```http
GET /customers?tenant=globex&status=active&cursor=eyJsYXN0SWQiOiI1MCJ9
```

If the server treats the cursor as only `lastId = 50`, it has lost the meaning of the request that produced it. It may now continue through another tenant's customer list. The same mistake can appear without an attacker: an agent changes a search filter between calls but reuses the old cursor; a user loses a role halfway through a long export; or an endpoint accepts an old cursor after the sort semantics changed in a deployment.

Cursor pagination is often introduced as a database-performance improvement. It is also a contract about *which list* is being continued. The JSON:API cursor-pagination profile makes that explicit: pagination applies to an ordered result list, and a partially ordered client sort needs a stable, unique tie-breaker before it can be paginated reliably. The GraphQL Cursor Connections specification likewise defines a cursor as an opaque value passed back to continue after an edge. Neither property gives a cursor permission to read a resource. [JSON:API Cursor Pagination](https://jsonapi.org/profiles/ethanresnick/cursor-pagination/) [GraphQL Cursor Connections Specification](https://relay.dev/graphql/connections.htm)

## Key Points

### Position is only one part of the continuation

`after=customer-50` is enough information only if every other part of the result set is fixed elsewhere. In a real API, a page is usually defined by more than its last record:

| Continuation input | Why it belongs to the same query contract |
| --- | --- |
| Endpoint and resource type | `customers` and `invoices` cannot share a position. |
| Filters and search terms | `status=active` is a different list from `status=archived`. |
| Tenant or workspace | This is a disclosure boundary, not a convenience filter. |
| Sort and tie-breaker | A cursor position is meaningless if the relative order can change arbitrarily. |
| Field projection or include mode | A page that adds sensitive history may have a different authorization and cost surface. |
| Snapshot/version, when promised | This determines whether the caller is continuing a live list or a consistent view. |

There are two workable designs. The server can store this state under a random cursor ID, or it can put a compact, integrity-protected representation of the state in an opaque token. In either case, the server—not a client-decoded JSON object—must decide what state is authoritative.

Opaque does not mean encrypted, secret, or authorized. Base64 is merely an encoding. A signed token can prevent tampering with its contents, but it cannot make a caller eligible for data they cannot currently read. Conversely, a server-side token avoids exposing internal fields but still needs authorization checks when it is redeemed.

### The next request needs a fresh access decision

The correct question on page two is not “was this cursor issued to someone who had access?” It is “may this requester retrieve these records under the current policy?”

That distinction matters whenever permissions change, a session is reused, or a cursor is copied to another client. OWASP recommends validating permissions on every request, rather than trusting that an earlier route or UI action already did so. A paginated endpoint is not an exception merely because it looks like a continuation of the previous request. [OWASP Authorization Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html)

The handler should derive the caller's allowed scope first, then apply the cursor's position inside that scope:

```ts
type CursorState = {
  endpoint: "customers.list";
  queryHash: string;
  order: ["created_at", "id"];
  after: { createdAt: string; id: string };
  snapshotId?: string;
  expiresAt: string;
};

async function listCustomers(request: Request) {
  const subject = await requireSubject(request);
  const allowedTenants = await policy.allowedTenants(subject, "customer.read");
  const requestedQuery = normalizeCustomerQuery(request.url);

  const cursor = request.url.searchParams.get("cursor");
  const state = cursor ? await cursors.verify<CursorState>(cursor) : undefined;

  if (state && state.queryHash !== hash(requestedQuery.withoutCursor())) {
    throw badRequest("cursor does not match this query");
  }

  const page = await customers.query({
    ...requestedQuery,
    tenantIds: intersect(requestedQuery.tenantIds, allowedTenants),
    after: state?.after,
    snapshotId: state?.snapshotId,
    order: ["created_at", "id"],
  });

  return page;
}
```

The details are illustrative. In many APIs, accepting an arbitrary `tenant` parameter and intersecting it with allowed tenants is less clear than rejecting a requested tenant the caller cannot access. Some APIs put a single authorized workspace in the route and do not accept a tenant filter at all. The important ordering is not negotiable: authorize the current caller, validate the continuation against the request, and only then use the cursor position.

This is the pagination counterpart to [A Feature Flag Is Not an Authorization Check](https://my-slops.github.io/Blog/posts/2026/10/a-feature-flag-is-not-an-authorization-check/). A token produced by a legitimate earlier flow is still not a permission decision for the present request.

### Do not let a cursor silently change the query

There are two defensible API shapes. Pick one and make it explicit.

**Server-owned continuation.** The first response returns a `next` link or cursor whose stored state includes all filters, sort, and page-size policy. The follow-up request supplies only that continuation. This is straightforward for exports and internal tools because clients cannot accidentally pair an old cursor with new filters.

**Client-repeated query.** The client repeats its filters and sort, and the server checks that their normalized form matches the cursor's bound query identity. This can make links easier to inspect and supports deliberate pagination controls, but it needs canonicalization. `status=active&tag=a&tag=b` and the same tags in the reverse order should either normalize identically or be rejected predictably.

Do not take a third path by accepting both a cursor and arbitrary new filters, then choosing whichever source is convenient. That produces hard-to-debug omissions even when it does not disclose data. An agent that follows a `nextCursor` after revising “open incidents” to “all incidents” may truthfully receive a page, but it has no clear reason to believe that page is the next page of either query.

This matters for negative conclusions too. [An Empty Search Result Is Not Evidence That Nothing Exists](https://my-slops.github.io/Blog/posts/2026/10/an-empty-search-result-is-not-evidence-that-nothing-exists/) argues that filters, permissions, and pagination bounds are part of what an empty result means. A mismatched cursor hides the same qualifiers behind an apparently ordinary page request.

### Snapshots solve consistency, not authorization

Some endpoints promise that every page belongs to one point-in-time view. That can be important for a report, billing export, or reconciliation process. The JSON:API profile permits a server to encode a client or session identifier in a cursor when it needs to return a consistent snapshot across requests.

That is useful, but a snapshot is still not a durable right to its contents. If a user loses access to a workspace between pages, the server has a policy choice:

- deny the next page entirely;
- return only the subset still authorized, with explicit semantics for gaps; or
- allow a short, documented export lease that was authorized up front and is revocable by design.

The first option is often safest for interactive browsing. The third can be reasonable for a regulated export workflow, but it is a deliberate authorization product feature, not an incidental effect of cursor expiration. If the product needs that behavior, name the export operation, its owner, scope, retention, cancellation rule, and audit record. Do not smuggle it into a URL parameter.

Likewise, cursor expiry should describe a technical boundary, not disguise a policy decision. An expired cursor might mean that its snapshot was released, its signing key rotated, its ordering changed, or the server has intentionally bounded retained state. Return an actionable error such as “restart this list from the first page” rather than quietly switching to a new live query at the old position.

## Steps / Code

Review a cursor endpoint with these tests:

1. Request page one as a user allowed to read workspace A, then attempt page two with the same cursor as a user allowed only to workspace B. It must not reveal A's records.
2. Reuse a cursor with one altered filter, sort, include mode, or page size. Verify the API either rejects it or applies the documented server-owned continuation unchanged.
3. Revoke the original caller's access between pages. Confirm the next request follows the chosen current-authorization policy.
4. Insert rows with equal sort values between requests. Verify the unique tie-breaker prevents arbitrary reordering or duplication caused by an incomplete sort.
5. Redeem an expired or malformed cursor. Verify the response does not fall back to an unbounded first page or leak cursor internals.
6. Run the same cases through every entry point: browser, SDK, agent tool, export worker, and copied `next` link.

For agent tools, consider returning a server-created `nextPage` handle rather than asking the model to recreate filters while carrying an old cursor in prose. The tool runtime should preserve the originating task's workspace and result limits, then stop when a page changes the user's requested scope. That reduces accidental query drift; it does not remove the server's obligation to authorize each call.

## Trade-offs

Binding cursors more tightly makes them less portable. A support engineer may not be able to paste one customer's cursor into another environment to reproduce a bug, and a changed filter may require restarting a list. Those are usually good failures: the API is refusing to pretend that two result sets are interchangeable.

Fresh authorization also makes long scans less tidy. A revoked permission can cause an export to fail on page 400, and dynamic row-level policy can produce fewer results than an earlier count suggested. If completion of a fixed report is a product requirement, use an explicit report or export operation with a stated authorization lease and audit trail. Do not make an opaque continuation token accidentally carry that responsibility.

Not every cursor needs a durable snapshot. For a live activity feed, allowing new events to appear while a user pages may be exactly right. The requirement is to specify the behavior and maintain a deterministic order, not to promise impossible immutability. The JSON:API profile itself notes that result lists may change between requests; snapshotting is a special choice for the cases that need it.

## References

- JSON:API, [Cursor Pagination profile](https://jsonapi.org/profiles/ethanresnick/cursor-pagination/)
- GraphQL Cursor Connections Specification, [Cursors and connection pagination](https://relay.dev/graphql/connections.htm)
- OWASP Cheat Sheet Series, [Authorization Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html)
- This repository, [A Feature Flag Is Not an Authorization Check](https://my-slops.github.io/Blog/posts/2026/10/a-feature-flag-is-not-an-authorization-check/)
- This repository, [An Empty Search Result Is Not Evidence That Nothing Exists](https://my-slops.github.io/Blog/posts/2026/10/an-empty-search-result-is-not-evidence-that-nothing-exists/)

## Final Take

A cursor should continue a list, not inherit the authority that first exposed the list.

Bind it to the endpoint, query, order, and any promised snapshot. On every page, make a new authorization decision for the caller in front of you. That keeps pagination from turning a small performance feature into an undocumented access-control mechanism.

## Changelog

- 2026-10-13: Initial publication.
