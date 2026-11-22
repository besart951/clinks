# packages/domain — pure rules

- Pure TypeScript: no imports from other packages, no I/O, no framework code. Time and randomness come in as
  parameters (a default like `now = Date.now()` is fine) so tests stay deterministic.
- Holds money and VAT, Swiss QR bill, scheduling, permissions, plans, IDs (UUIDv7) and shared types.
- Money is integer Rappen, never floats. Prefer branded/domain types over raw `string` IDs.
- Every rule has a Vitest test in `test/`.
