# ADR 0006: PostgreSQL keyset pagination for managed lists

Status: Accepted

## Decision

Every managed list executes normalized search, typed filters, explicit sorting, and `LIMIT + 1` keyset pagination in PostgreSQL. Sorts use indexed values plus stable entity IDs or natural compound keys as tie-breakers. Opaque versioned cursors contain the sort position and a fingerprint of the complete normalized filter, sort, and direction.

## Consequences

HTTP adapters map transport values but never load complete managed collections or mutate slices for pagination. There are no total counts. Reusing a cursor after changing any filter or sort returns a localized validation error.
