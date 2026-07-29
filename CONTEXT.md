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
The active relationship between one User and one Tenant. It carries the Tenant Role `ROLE_TENANT_ADMIN` or `ROLE_USER`.
_Avoid_: tenant user

**Super Administrator**:
A global User with `ROLE_SUPER_ADMIN` in the global identity role, no Membership, and access to the platform administration and Audit Log.
_Avoid_: tenant administrator

**Session**:
A short-lived, HttpOnly browser session for one User. A non-super-administrator Session carries exactly one active Tenant.
_Avoid_: access token, login token

**Invitation**:
A single-use, expiring request for a specific email address to join a Tenant with a Tenant Role.
_Avoid_: registration link

**Application Scope**:
One of `shared`, `admin`, `planer_link`, or `infra_link`. A Translation Bundle resolves `shared` first and lets its application-specific scope override matching keys.

**Translation Override**:
A text supplied by a Super Administrator for one Language, Application Scope, and key. It explicitly overlays the source-controlled product translation and can add a text for a custom key.

**Audit Event**:
An append-only, sanitized record of a security-relevant or administrative action. It may name an actor and Tenant but never contains a password, hash, or token.

## Relationships

- A User may have active Memberships in multiple Tenants.
- A Tenant has zero or more Memberships.
- A Session represents one User and, unless that User is a Super Administrator, one active Tenant selected from its Memberships.
- An Invitation creates or activates exactly one Membership once accepted.
- A Super Administrator has no Tenant Membership.
- A Language has zero or more scoped Translations.
- A Translation Bundle contains shared Translations plus the selected Application Scope.
- A Translation Bundle starts with the source-controlled German product catalog and applies Translation Overrides for its default and requested Language.
- Audit Events are never updated or deleted.
- `users.global_role` is the sole source for global authorization. Legacy `users.tenant_id` and `users.role` are compatibility data only during the transition release.

## Example dialogue

> **Developer:** "May a user switch from Tenant A to Tenant B by changing a request header?"
> **Domain expert:** "No. The server validates an active Membership, rotates the protected Session, and only then selects Tenant B as the RLS context."

## Flagged ambiguities

- "Admin" is ambiguous: a **Super Administrator** is global; a **Tenant Administrator** is a Membership with `ROLE_TENANT_ADMIN`.
