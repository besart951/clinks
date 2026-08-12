# ADR 0005: Reset baseline and explicit composition

Status: Accepted

## Decision

The first deployment discards transitional databases and uses `000001_schema.sql` plus `000002_languages.sql` as its complete baseline. Migration files are applied transactionally under an advisory lock and recorded with checksums.

Google Wire is removed. The API and worker use readable direct composition roots. SMTP exists only in worker `run`; worker `healthcheck` remains database-only.

The PostgreSQL adapter is composed once as a `Store`. Deep application modules receive it only through their consumer-owned ports; HTTP receives the modules independently and has no aggregate administration facade.

## Consequences

The baseline is intentionally not upgrade-compatible with earlier development schemas. The `clinks.v1` Connect contract is also intentionally breaking. Generated Go and TypeScript bindings are committed, while frontend wrapper/view migration remains separate. Persistence behavior remains local to one adapter without widening application seams.
