# gm-pi-environment

Personal source of truth for Pi setup across machines for moi.

This repo contains personal Pi extensions and portable config so I can try keep track of the ever moving landscape. General-purpose skills come from [`GregM1991/skills`](https://github.com/GregM1991/skills).

## Contents

- `extensions/` — personal Pi extensions folded into this environment package, including first-class `fd` and `rg` search tools.
- `prompts/` — shared prompt templates.
- `config/pi/AGENTS.md` — global Pi agent instructions.
- `config/pi/settings.base.json` — portable global Pi settings and standard packages. Machine-specific models and other overrides belong in the local overlay described below.
- `config/pi/mcp.json` — portable MCP config. Machine-specific servers and credentials belong in the local overlay described below.
- `bin/bootstrap.sh` — install/apply this environment, merge optional machine-local configuration, and reconcile packages.

## Install from GitHub

For dogfooding the shared package resources only:

```bash
pi install git:github.com/GregM1991/gm-pi-environment
```

For a full machine bootstrap that also applies `config/pi/AGENTS.md`, `mcp.json`, and `settings.base.json`:

```bash
git clone https://github.com/GregM1991/gm-pi-environment.git ~/workspace/pi-environment
~/workspace/pi-environment/bin/bootstrap.sh
```

`bootstrap.sh` registers the GitHub package by default and reconciles configured packages with `pi update --extensions`. During local development, install the working tree directly:

```bash
PI_ENV_PACKAGE_SOURCE="$HOME/workspace/pi-environment" "$HOME/workspace/pi-environment/bin/bootstrap.sh"
```

This repository is canonical for its package-provided extensions and prompts. It does not ship general-purpose skills.

Install the canonical general-purpose skill library separately:

```bash
npx skills add GregM1991/skills --all -g
```

The Skills CLI installs it under `~/.agents/skills`. Use `npx skills update` for ongoing updates.

## Machine-local configuration

Pi has no separate machine-local layer for global settings, so `bootstrap.sh` provides one. Before writing the live Pi configuration, it deep-merges these optional files over the repository bases:

- `~/.config/gm-pi-environment/settings.local.json`
- `~/.config/gm-pi-environment/mcp.local.json`

Override their directory with `PI_ENV_LOCAL_CONFIG_DIR`. Objects are merged recursively; arrays replace the base array and must contain the complete desired value. For example, a machine that also exposes Claude models can provide the full model cycle locally:

```json
{
  "enabledModels": [
    "openai-codex/gpt-5.4",
    "openai-codex/gpt-5.4-mini",
    "openai-codex/gpt-5.5",
    "openai-codex/gpt-5.6-luna",
    "openai-codex/gpt-5.6-sol",
    "openai-codex/gpt-5.6-terra",
    "anthropic/claude-haiku-4-5",
    "anthropic/claude-opus-4-6",
    "anthropic/claude-sonnet-4-6"
  ]
}
```

Keep credentials and machine-specific MCP servers in `mcp.local.json`; do not commit them. The bootstrap validates both base and overlay JSON before changing live files, backs up existing files, and preserves Pi's generated `lastChangelogVersion` setting.

## Global subagent role policy

`config/pi/settings.base.json` pins the builtin Pi subagent roles used across projects and workflows:

- `worker` — `openai-codex/gpt-5.6-sol` with `high` thinking.
- `reviewer` — `openai-codex/gpt-5.6-sol` with `high` thinking.

These user-scope `subagents.agentOverrides` apply to every Pi project after bootstrap unless a project `.pi/settings.json` or an explicit per-run override takes precedence. The Matt auto-loop also names these builtin roles and requires `context: "fresh"` for both.

The auto-loop parent is the current Pi session, not another named subagent. For an economical orchestrator with stronger worker/reviewer children, launch a dedicated parent with `pi --model provider/model:thinking` and keep child role pins in the machine-local settings overlay. A machine-local `defaultModel` changes every new parent session, not only auto mode; Pi currently has no command/phase-specific model setting. See [Auto-loop orchestrator model selection](docs/investigations/auto-loop-orchestrator-model-selection.md) for configuration, precedence, evidence, and the capability gap.

## File search tools

The `file-search` extension registers `fd` (file discovery) and `rg` (content search) as model tools. It prefers system binaries (`fd`/`fdfind` and `rg`), then cached package binaries, and otherwise downloads verified official releases on supported macOS/Linux arm64/x64 systems.

## Nested context breadcrumbs

The `context-breadcrumbs` extension wraps `pi-context-breadcrumbs` so user-level settings can define the default breadcrumb filenames for every Pi project. The portable configuration loads only `AGENTS.md` and `AGENTS.override.md`; project `.pi/settings.json` or `.pi/context-breadcrumbs.json` files can still override that default.

## Local-only resources

Mindspace prompts and other machine-specific prompts may remain in `~/.pi/agent/prompts`. Shared prompts belong in this repository.

### Skills

`GregM1991/skills` is the single canonical source for general-purpose skills on all machines. The Skills CLI manages those skills in `~/.agents/skills`.

Keep project-specific skills in the target project's `.pi/skills/` directory. Avoid duplicate names across skill locations because Pi keeps only the first skill it finds.
