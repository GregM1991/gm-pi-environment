# Context Breadcrumbs

Global wrapper for [`pi-context-breadcrumbs`](https://github.com/esynr3z/pi-context-breadcrumbs).

The upstream extension reads project-local configuration only. This wrapper applies the user-level `context-breadcrumbs.includeFilenames` value from `~/.pi/agent/settings.json` as the upstream default before registering the extension. A project can still override that default through `.pi/settings.json` or `.pi/context-breadcrumbs.json`.

The Pi Environment default loads only:

- `AGENTS.md`
- `AGENTS.override.md`

It excludes compatibility `CLAUDE.md` pointer files to avoid redundant breadcrumb messages.

## Verification

```bash
bun run check
bun test
```
