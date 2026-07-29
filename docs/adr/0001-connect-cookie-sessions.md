# ADR 0001: Connect-RPC with HttpOnly cookie sessions

## Status

Accepted

## Decision

Connect-RPC is the sole public application transport. `/healthz` and `/readyz` are the only plain HTTP endpoints. Browser sessions use an HMAC-signed JWT in an HttpOnly, `SameSite=Lax` cookie. The TypeScript client always uses `credentials: include` and gets its identity via `GetSession`.

## Consequences

Tokens cannot leak through localStorage or application state. Mutating browser calls must pass the configured Origin check. The server localizes every Connect error before returning it.
