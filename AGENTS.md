# Repository Instructions

## Purpose and Source of Truth

- This repository is the canonical, portable Pi environment for shared skills, extensions, prompts, themes, references, and base configuration.
- Install and register this Pi package from `git:github.com/GregM1991/gm-pi-environment`, not from a local cloned repository path. Use the clone for editing and publishing only.
- Read `README.md` before changing installation, bootstrap, package-loading, or machine-local configuration behavior.
- Keep shared resources here. Do not create duplicate same-named copies in `~/.agents/skills` or another Pi load path.
- `config/pi/AGENTS.md` is the global instruction file copied into a user's Pi directory by `bin/bootstrap.sh`; this root `AGENTS.md` contains contributor instructions for this repository. Do not conflate their roles.

## Repository Layout

- `skills/<name>/SKILL.md` — reusable shared skills and their colocated references/scripts.
- `extensions/<name>/` — Pi extensions. Follow each extension's `README.md` and `package.json`.
- `extensions/matt-workflow-pi-extension/augmentations/` — local Matt workflow policy.
- `extensions/matt-workflow-pi-extension/vendor/mattpocock-skills/` — upstream-owned vendored content; treat it as read-only.
- `prompts/`, `themes/`, and `references/` — package-provided resources declared by the root `package.json`.
- `config/pi/` — portable base Pi configuration. Machine-specific values belong in local overlays, not this repository.
- `docs/adr/` — durable architecture decisions.

## Implementation Conventions

- Use TypeScript ES modules for extensions and follow the nearest extension's existing Pi API patterns.
- Keep extension entry points at `extensions/<name>/index.ts` so the root `pi.extensions` glob continues to discover them.
- Keep tests colocated as `*.test.ts`; update or add behavior-focused tests when extension behavior changes.
- Keep skills focused and self-contained. Put reusable instructions in `SKILL.md`, and resolve referenced relative files from the skill directory.
- Prefer local workflow changes under Matt `augmentations/`; do not hand-edit vendored Matt skills.
- Refresh vendored Matt content only through the extension's sync scripts, then inspect `SOURCE.json` and the resulting diff.
- Record significant, durable architecture changes in `docs/adr/` and update relevant README files when user-facing commands or setup change.

## Verification

Run checks for every affected area; there is no root aggregate test script.

```bash
# Shell scripts
bash -n bin/*.sh

# Matt workflow extension
(cd extensions/matt-workflow-pi-extension && bun run check && bun test)

# Auto-rename extension
(cd extensions/auto-rename-session && bun run check && bun test)

# Extensions with syntax checks only
(cd extensions/inline-skills && bun run check)
(cd extensions/zed-bell && bun run check)
```

For a vendored Matt refresh, preview before applying:

```bash
(cd extensions/matt-workflow-pi-extension && bun run sync:matt-skills:dry-run)
```

Run the smallest relevant command while iterating, then all checks for the areas changed before finishing.

## Configuration and Safety Boundaries

- Never commit credentials, auth state, generated Pi runtime state, `.env*`, or machine-local `*.local.json` files.
- Keep machine-specific settings and MCP servers in the overlays documented in `README.md`; arrays replace base arrays during bootstrap merges.
- Do not run `bin/bootstrap.sh` unless the user explicitly asks: it backs up and rewrites live Pi configuration, installs this package, and updates extensions.
- Do not run `bin/empty-system-skills-dir.sh` unless explicitly asked: it backs up and removes entries from the configured system skills directory.
- Do not manually edit `package-lock.json` or generated/vendor files. Regenerate them only through the command responsible for the underlying change.
- Do not commit changes unless the user explicitly requests a commit.
