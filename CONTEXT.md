# Clinks

Clinks is a multi-tenant platform with a global super-administration and separate
web applications for planning and infrastructure workflows.

## Language

**Tenant**:
An isolated customer organization. Tenant-owned data is always accessed in its tenant RLS context.
_Avoid_: customer, account

**User**:
A global authenticated identity. A User may have zero or more active **Memberships**.
_Avoid_: account

**Membership**:
The relationship between one User and one Tenant. It references an editable Tenant Role and is retained with `inactive` status instead of being deleted.
_Avoid_: tenant user

**Super Administrator**:
A global User with the `super_administrator` Global Role, no Membership, and access to the platform administration and Audit Log.
_Avoid_: tenant administrator

**Session**:
A short-lived, HttpOnly browser session for one User. A non-super-administrator Session carries exactly one active Tenant.
_Avoid_: access token, login token

**Invitation**:
A single-use, expiring request for a specific email address to join a Tenant with a Tenant Role.
_Avoid_: registration link

**Tenant Role**:
A Tenant-owned named set of Permissions. Every Tenant starts with protected Administrator and User Roles; other Roles are editable.
_Avoid_: global role, fixed role

**Permission**:
A stable capability such as `user.manage` or `role.read` granted through a Tenant Role.

**Application Scope**:
One of `shared`, `admin`, `planer_link`, or `infra_link`. A Translation Bundle resolves `shared` first and lets its application-specific scope override matching keys.

**Translation Override**:
A text supplied by a Super Administrator for one Language, Application Scope, and key. It explicitly overlays the source-controlled product translation and can add a text for a custom key.

**Audit Event**:
An append-only, sanitized record of a security-relevant or administrative action. It may name an actor and Tenant but never contains a password, hash, or token.

## Relationships

- A User may have active Memberships in multiple Tenants.
- A Tenant has Administrator and User Roles plus zero or more custom Roles.
- A Session represents one User and, unless that User is a Super Administrator, one active Tenant selected from its Memberships.
- An Invitation creates or activates exactly one Membership once accepted.
- A Super Administrator has no Tenant Membership.
- A Language has zero or more scoped Translations.
- A Translation Bundle contains shared Translations plus the selected Application Scope.
- A Translation Bundle starts with the source-controlled German product catalog and applies Translation Overrides for its default and requested Language.
- Audit Events are never updated or deleted.
- `users.global_role` is the sole source for global authorization. Tenant authorization comes only from Membership → Tenant Role → Permissions.
- Administrator and User Roles cannot be renamed, deleted, or assigned different Permissions.
- Administrator Membership mutations are serialized per Tenant; deactivating or demoting the final active Administrator Membership is rejected transactionally even under concurrency.
- Mutable managed records carry a revision; stale writes are rejected.
- Managed lists are filtered, sorted, and keyset-paginated in PostgreSQL; cursors are bound to the complete normalized query.

## Example dialogue

> **Developer:** "May a user switch from Tenant A to Tenant B by changing a request header?"
> **Domain expert:** "No. The server validates an active Membership, rotates the protected Session, and only then selects Tenant B as the RLS context."

## Flagged ambiguities

- "Admin" is ambiguous: a **Super Administrator** is global; a **Tenant Administrator** is an active Membership whose Role kind is `administrator`.
