# AGENTS.md — Repository Instructions for AI & Autonomous Agents

Before changing this repository, read [docs/security.md](docs/security.md), [docs/architecture.md](docs/architecture.md), and [codestyle.md](codestyle.md).

## Go skills

- For any Go code, `go.mod`, or Go design/review/debugging work, use the installed [`spf13/go-skills`](https://github.com/spf13/go-skills) `go` skill.
- Also use the collection's specialized skill when the task concerns Cobra/Viper, specification review, release engineering, Wails, or fileflow/pathologize.
- This repository's instructions and linked architecture, security, and code-style documents take precedence over general skill guidance. Preserve the flat server package layout and consumer-owned interfaces described in `docs/architecture.md`.

## Non-negotiable rules

- Application and domain behavior in the root `server` package has no infrastructure imports.
- Every query for tenant-scoped data runs in a transaction which sets LOCAL app.current_tenant.
- Generate persistent entity IDs with Google UUIDv7.
- The backend localizes every domain and validation error using the request locale. Clients render the returned human-readable message and never translate error keys.
- Define small interfaces where they are consumed; do not create a central ports package.
- Keep secrets in .env only. Do not hard-code bootstrap credentials.

## Quality gate

Before handoff, run formatting, tests, and a build. Check for dead code, long methods, duplicated branches, primitive IDs where a domain type is appropriate, and infrastructure leakage into the domain.
