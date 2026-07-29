# ADR 0003: Append-only audit events

## Status

Accepted

## Decision

Security and administrative events are written to `audit_events`. The table rejects `UPDATE` and `DELETE` at database level. Writes attached to a state-changing persistence operation use the same PostgreSQL transaction; session events are appended after their validated action.

## Consequences

Audit retention is unlimited. The Super-Admin dashboard receives paginated, backend-localized descriptions. Export and read-access auditing are deliberately outside this slice.
