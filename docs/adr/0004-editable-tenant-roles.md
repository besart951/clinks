# ADR 0004: Editable Tenant Roles with protected defaults

Status: Accepted

## Decision

Tenant authorization is modeled as Membership → Role → Permissions. Every Tenant is provisioned transactionally with:

- Administrator: protected, all Permissions.
- User: protected, `tenant.read`, `user.read`, and `project.read`.

Custom Roles may be created, renamed, assigned Permissions, and deleted. Protected Roles cannot be renamed, deleted, or assigned different Permissions. A Membership is deactivated instead of deleted. Changing a Membership invalidates the affected User's sessions and emits an Audit Event in the same transaction. The final active Administrator cannot be demoted or deactivated.

## Consequences

Global authorization remains solely on `User.GlobalRole`. Tenant permissions are always reloaded and are never copied into JWT claims. Cross-aggregate membership guarantees belong in the PostgreSQL transaction, with application checks providing clear intent before persistence.
