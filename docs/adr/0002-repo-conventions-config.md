# ADR 0002: Repo conventions config

## Status

Accepted

## Context

The Matt workflow extension injects repo-specific base context into phase prompts: tracker conventions, toolchain guidance, and workflow-doc hints. Before this decision those hints came only from detection, such as `bun.lock` or hardcoded docs paths.

Repos need a durable, repo-agnostic way to state these conventions explicitly without changing extension code.

## Decision

Add a sibling config file at `.pi/matt-conventions.json` with required `version: 1` or `version: 2`.

The file describes repo conventions rather than extension routing behavior. It sits next to `.pi/matt-skill-routes.json` but has an independent schema.

Version 1 remains unchanged and supports optional sections:

- `tracker`: GitHub Issues tracker type plus labels doc path.
- `toolchain`: runtime name plus optional `test`, `check`, `build`, and `aiGate` commands.
- `docs`: workflow doc path plus optional extra context docs.

Version 2 adds delivery policy without changing the existing sections' fallback behavior:

- `tracker.requiredChecks`: a required, non-empty, duplicate-free list whenever the v2 tracker section is configured.
- `architecture.recapPrimitivesPath`: an optional reference to the owner-curated recap-primitive map.

Load semantics:

- No config file: use current per-section detection fallback. This is never an error.
- Config file exists and is valid: explicit section values win. Omitted sections fall back to detection for that section only.
- Config file exists and is invalid: hard stop every command that injects `baseContext()`. The extension notifies formatted diagnostics and does not send the phase prompt.

Validation is strict: JSON parsing, version checking, unknown-field rejection at every level, supported enum values, required-check list validation, and repo-relative doc path checks. Referenced docs, including a configured recap-primitive map, must exist on disk.

Delivery callers resolve required-check policy through the configuration Module's public Interface. Native GitHub required policy takes precedence when available. Otherwise v2 `tracker.requiredChecks` is authoritative. If neither exists, resolution returns an explicit hard-stop result; callers must not infer policy from observed checks. Version 1 repositories continue to load normally, but do not supply configured delivery policy.

## Consequences

Positive:

- Repos can record conventions and delivery policy explicitly and portably.
- Existing version 1 repositories retain their current load and per-section fallback behavior.
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
