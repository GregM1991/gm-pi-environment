# ADR 0002: Repo conventions config

## Status

Accepted

## Context

The Matt workflow extension injects repo-specific base context into phase prompts: tracker conventions, toolchain guidance, and workflow-doc hints. Before this decision those hints came only from detection, such as `bun.lock` or hardcoded docs paths.

Repos need a durable, repo-agnostic way to state these conventions explicitly without changing extension code.

## Decision

Add a sibling config file at `.pi/matt-conventions.json` with required `version: 1`.

The file describes repo conventions rather than extension routing behavior. It sits next to `.pi/matt-skill-routes.json` but has an independent schema.

Version 1 supports optional sections:

- `tracker`: GitHub Issues tracker type plus labels doc path.
- `toolchain`: runtime name plus optional `test`, `check`, and `build` commands.
- `docs`: workflow doc path plus optional extra context docs.

Load semantics:

- No config file: use current per-section detection fallback. This is never an error.
- Config file exists and is valid: explicit section values win. Omitted sections fall back to detection for that section only.
- Config file exists and is invalid: hard stop every command that injects `baseContext()`. The extension notifies formatted diagnostics and does not send the phase prompt.

Validation is strict: JSON parsing, version checking, unknown-field rejection at every level, supported enum values, and repo-relative doc path checks. Referenced docs must exist on disk.

## Consequences

Positive:

- Repos can record conventions explicitly and portably.
- Skill routing can evolve separately from conventions.
- A broken conventions file fails loudly instead of silently sending wrong prompts.
- Partial config stays ergonomic because omitted sections keep existing detection behavior.

Negative:

- Repos may now have two `.pi/matt-*` config files to discover and scaffold.
- Commands that use base context need a shared conventions validation preflight.

## Alternatives considered

### Extend `.pi/matt-skill-routes.json`

This would keep one file to scaffold and discover, but it would couple unrelated schemas: issue-skill routing and repo convention hints. Future changes to one surface could force migrations for the other.

### Keep detection only

Detection is zero-config, but cannot express custom paths, non-Bun runtimes, or preferred verification commands reliably.
