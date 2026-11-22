---
title: "A Foreign Key Does Not Keep Data in the Right Tenant"
date: "2026-11-21"
updated: "2026-11-21"
slug: "a-foreign-key-does-not-keep-data-in-the-right-tenant"
description: "Foreign keys preserve relationships between stored records. They do not prove that the principal making a request may traverse those relationships."
summary: "Use foreign keys to keep tenant-owned records internally consistent, but make authorization scope part of every object lookup and write predicate. A valid relationship can still be a cross-tenant data leak."
tags: [security, databases, data modeling, authorization, software engineering]
author: "vabs"
status: "published"
canonical_url: "https://my-slops.github.io/Blog/posts/2026/11/a-foreign-key-does-not-keep-data-in-the-right-tenant/"
license: "MIT"
audience: "general"
reading_time: "9 min"
---

## TL;DR

A foreign key answers a storage question: does the referenced row exist, and does this relationship satisfy the schema? It does not answer an access question: may this authenticated principal read, change, export, or attach that row?

That distinction is easy to lose in a multi-tenant application. A `document.project_id` foreign key can be perfectly valid while a handler has loaded the document by an attacker-controlled ID from another tenant. The database has protected referential integrity; the application has still leaked the document.

Keep the two jobs separate:

1. use constraints to prevent contradictory tenant relationships in stored data;
2. resolve a caller's authorized tenant or resource scope before loading an object; and
3. keep that scope in every read and write predicate, including background paths.

Row-level security can make the third rule harder to forget, but it does not turn a foreign key into authorization. It also has its own bypass and deployment rules.

## A valid row can belong to the wrong request

Imagine a project-management product with two tenants. A document belongs to a project; a project belongs to a tenant.

```text
document d_42 → project p_red → tenant acme
document d_77 → project p_blue → tenant globex
```

The schema has all the ordinary constraints:

```sql
create table tenants (
  id uuid primary key
);

create table projects (
  id uuid primary key,
  tenant_id uuid not null references tenants(id),
  unique (id, tenant_id)
);

create table documents (
  id uuid primary key,
  tenant_id uuid not null references tenants(id),
  project_id uuid not null,
  foreign key (project_id, tenant_id)
    references projects (id, tenant_id)
);
```

The composite foreign key is useful. It prevents a document from claiming tenant `globex` while pointing at a project stored under `acme`. It keeps a redundant tenant column honest enough to make partitioning, indexing, retention, and scoped queries practical.

Now consider an authenticated Acme member calling this handler:

```ts
const document = await db.document.findUnique({
  where: { id: request.params.documentId },
});

if (!document) return reply.code(404).send();

return reply.send(document);
```

The query can return `d_77` without violating any constraint. `d_77` still has a real project, its project still has a real tenant, and both keys match. The fault is not corrupt data. The fault is that the query asks for *a document with this ID*, while the product promised *a document with this ID that this caller may read*.

OWASP classifies this family of mistake as insecure direct object reference: an object reference plus a missing object-level authorization check. Its recommended structural pattern is to look up an object through a dataset already related to the current user, rather than from the whole table. [OWASP's IDOR prevention guidance](https://cheatsheetseries.owasp.org/cheatsheets/Insecure_Direct_Object_Reference_Prevention_Cheat_Sheet.html)

An unguessable UUID makes blind enumeration less convenient. It does not repair this query. IDs appear in links, logs, browser history, exports, support tickets, and integration payloads; more importantly, access control must remain correct once a caller knows a valid ID.

## Make the authorization scope reach the query

The safe query is not defined by a particular ORM method. It is defined by the fact that the lookup is constrained by authority established before the lookup.

For a product where a session belongs to exactly one active tenant, that can look like this:

```ts
const subject = await requireAuthenticatedSubject(request);
const tenant = await requireActiveTenantMembership(subject, request);

const document = await db.document.findFirst({
  where: {
    id: request.params.documentId,
    tenantId: tenant.id,
  },
});

if (!document) return reply.code(404).send();
return reply.send(document);
```

The exact `404` versus `403` policy is product-specific. Many systems intentionally return `404` when an object is outside the caller's visible scope, so the response does not become an existence oracle. What matters here is earlier: the broad lookup never happens.

Some systems have a more interesting access model. A consultant may belong to several tenants; a document may be shared to a partner; an administrator may have an audited cross-tenant role. In that case, do not lie to the model with a single `tenant_id = session.tenant_id` check. Query through the actual grant or membership relation:

```ts
const document = await db.document.findFirst({
  where: {
    id: request.params.documentId,
    project: {
      tenant: {
        memberships: {
          some: { userId: subject.id, status: "active" },
        },
      },
    },
  },
});
```

That example is illustrative: a real policy may also inspect an action, a project role, a legal hold, or a purpose-specific grant. The important design choice is that ownership and access are distinct relations. A document can be owned by one tenant and visible to a carefully defined set of principals. Adding `tenant_id` to a table does not express that second relation by itself.

This is the database analogue of [not treating a feature flag as an authorization check](https://my-slops.github.io/Blog/posts/2026/10/a-feature-flag-is-not-an-authorization-check/). A foreign key, like a flag, can be useful input to a policy. Neither is the policy decision.

## Constraints still do important work

It would be a mistake to take the wrong lesson and remove tenant information from constraints. Authorization bugs are easier to detect and contain when the database refuses impossible ownership shapes.

Suppose an API creates a document from both a `projectId` in the URL and a `tenantId` copied from a request body. With only independent foreign keys, it can store a document whose tenant and project disagree. A later correct-looking filter on `documents.tenant_id` may expose it under Globex even though its project navigation points to Acme.

The composite constraint above rejects that contradiction at write time. Another design can omit the duplicate tenant column and always derive tenant ownership through `project_id`; that reduces denormalization but can make the most important queries and indexes less direct. Either choice can be sound. The invariant must be explicit:

```text
If a document has tenant T, its project belongs to T.
```

The foreign key enforces that *stored-data* invariant. The access rule is different:

```text
The request's principal may perform action A on this document now.
```

It depends on a principal, an action, dynamic membership, and sometimes request context. A database constraint cannot infer that rule from two stored IDs. OWASP's multi-tenant guidance makes the same separation: establish tenant context early, treat opaque identifiers as defense in depth rather than access control, and apply authorization checks to tenant-scoped operations. [OWASP Multi-Tenant Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Multi_Tenant_Security_Cheat_Sheet.html)

## Writes need the same scope

Teams often scope the read used to render an edit form, then lose the scope on the update endpoint or asynchronous worker. That turns a correct screen into a partial defense.

This update has the same problem as the first lookup:

```ts
await db.document.update({
  where: { id: request.params.documentId },
  data: { title: request.body.title },
});
```

Prefer an update whose predicate carries the permitted scope, then distinguish "not updated" from other failures deliberately:

```ts
const result = await db.document.updateMany({
  where: {
    id: request.params.documentId,
    tenantId: tenant.id,
  },
  data: { title: request.body.title },
});

if (result.count !== 1) return reply.code(404).send();
```

An ORM's APIs differ, and a business policy may require a separate permission query or optimistic-concurrency condition. Do not copy `updateMany` as a universal recipe. Preserve the property that matters: the authorization boundary and mutation predicate agree about which row is eligible to change.

Apply the same question to less obvious paths:

- an export worker loading `documentId` from a queue;
- a webhook handler resolving an external reference;
- an object-storage download endpoint turning a key into a file record;
- a search indexer reading rows after a tenant's membership changed; and
- an administrative repair script.

Background work often has a service identity with broad database access. That can be appropriate, but it means the job payload must carry an explicit, validated scope or the worker must reconstruct one from durable policy data. "The web request checked it earlier" is not a durable authorization contract for a job that may run hours later.

## Row-level security is a backstop, not a shortcut

PostgreSQL row-level security (RLS) can enforce a per-row predicate for normal `SELECT`, `INSERT`, `UPDATE`, and `DELETE` access after it is enabled. With RLS enabled and no applicable policy, PostgreSQL uses default deny. [PostgreSQL row-security documentation](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)

That makes RLS a strong defense-in-depth option for an application that can reliably set a trusted tenant or subject context for each transaction. It can protect a newly added query path from a missing `tenant_id` predicate.

But RLS is neither automatic nor universal:

- table owners normally bypass it unless it is forced, and superusers and `BYPASSRLS` roles bypass it;
- policies are table-specific, so a protected `documents` table does not automatically protect every joined table, view, function, or storage metadata table; and
- PostgreSQL documents that referential-integrity checks bypass RLS so constraints can maintain data integrity.

Those facts are not a defect. They show the different responsibilities clearly. Referential integrity has to answer whether a relationship is valid even when a row-security policy hides a row; authorization has to answer what a particular principal may do. Treat an RLS policy, the connection role, the mechanism that supplies tenant context, and migration/worker identities as one tested system—not as a switch that makes application authorization disappear.

## Test the boundary with a real second tenant

An authorization test with a single tenant can only prove that the happy path works. Create a second tenant and use real object IDs from both sides:

```text
Given: member A belongs to Acme and document G belongs to Globex
When: member A requests, edits, exports, and deletes G by its valid ID
Then: each operation is denied or returns the product's indistinguishable-not-found response
And: no document read, mutation, or queued export is produced for G
And: any denial audit record contains no document content

Given: a document is created for project P under tenant Acme
When: the caller supplies tenant Globex
Then: the write is rejected by application validation or the composite foreign key

Given: a job retries after A's membership is removed
When: the job resolves its target
Then: it re-evaluates the documented authority model rather than assuming the old request remains valid
```

The last case deserves a product decision. Some jobs are intentionally authorized at submission time and must finish despite later membership changes; others must honor revocation before delivery. The test should assert the chosen rule. It should never silently fall back to "the ID was valid."

## Trade-offs

Scoping every query can feel repetitive. Complex sharing rules can make joins slower and query code harder to read. RLS adds policy migrations, role discipline, and a new failure mode when a privileged maintenance path unexpectedly sees no rows. Denormalizing `tenant_id` onto child tables adds an invariant that must be maintained.

Those costs buy something concrete: an object ID ceases to be an implicit bearer credential. The alternative centralizes trust in human memory—every present and future query author must remember an invisible tenant filter—and that is a poor security boundary.

For a single-tenant product, none of this machinery is necessary. For a multi-tenant product with public identifiers, internal tools, queues, or agent-accessible APIs, I would make authorized scope a first-class input at the data-access layer. Use constraints to reject impossible data, use policy to decide access, and let neither masquerade as the other.

## References

- OWASP Cheat Sheet Series, [Insecure Direct Object Reference Prevention](https://cheatsheetseries.owasp.org/cheatsheets/Insecure_Direct_Object_Reference_Prevention_Cheat_Sheet.html)
- OWASP Cheat Sheet Series, [Multi-Tenant Security](https://cheatsheetseries.owasp.org/cheatsheets/Multi_Tenant_Security_Cheat_Sheet.html)
- PostgreSQL, [Row Security Policies](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)
- This repository, [A Feature Flag Is Not an Authorization Check](https://my-slops.github.io/Blog/posts/2026/10/a-feature-flag-is-not-an-authorization-check/)
- This repository, [The Cache Key Is a Privacy Boundary](https://my-slops.github.io/Blog/posts/2026/08/the-cache-key-is-a-privacy-boundary/)

## Final Take

Foreign keys preserve the shape of data. They do not carry the authority of the person who supplied an ID.

In a multi-tenant system, query and mutate through an authorized scope, and use database constraints to ensure that the rows inside that scope cannot contradict each other. A relation can be valid, indexed, and perfectly consistent—and still belong to someone else.

## Changelog

- 2026-11-21: Initial publication on tenant-scoped data access and referential integrity.
