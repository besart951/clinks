# ADR 0002: Global identities and tenant memberships

## Status

Accepted

## Decision

Users are global identities. `tenant_memberships` assigns active tenant roles, and a non-super-admin Session has exactly one active Tenant. An active-tenant change validates a Membership and rotates the cookie session. Super Administrators stay global and cannot hold Memberships.

## Consequences

Users can access multiple Tenants without duplicate identities. Tenant authorization is based on Membership, and tenant-scoped queries run in `WithTenantTx`. Global authorization is read only from `users.global_role`. The reset baseline contains no compatibility Tenant or Role columns on `users`.
