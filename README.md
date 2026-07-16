# gm-pi-environment

Personal source of truth for Pi setup across machines for moi.

This repo contains shared Pi skills, personal extensions, and portable config so I can try keep track of the ever moving landscape.

## Contents

- `skills/` — shared skills that should be available everywhere Pi is used.
- `extensions/` — personal Pi extensions folded into this environment package.
- `prompts/` — shared prompt templates.
- `config/pi/AGENTS.md` — global Pi agent instructions.
- `config/pi/settings.base.json` — portable global Pi settings and standard packages. Machine-specific models and other overrides belong in the local overlay described below.
- `config/pi/mcp.json` — portable MCP config. Machine-specific servers and credentials belong in the local overlay described below.
- `bin/bootstrap.sh` — install/apply this environment, merge optional machine-local configuration, and reconcile packages.
- `bin/empty-system-skills-dir.sh` — keep `~/.agents/skills` as a local-only scratch dir by emptying it after backup.

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

The repository copy is canonical for package-provided extensions, skills, and prompts. Do not also load workspace or `~/.agents/skills` copies with the same names.

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

- `worker` — `openai-codex/gpt-5.6-sol` with `low` thinking.
- `reviewer` — `openai-codex/gpt-5.6-sol` with `high` thinking.

These user-scope `subagents.agentOverrides` apply to every Pi project after bootstrap unless a project `.pi/settings.json` or an explicit per-run override takes precedence. The Matt auto-loop also names these builtin roles and requires `context: "fresh"` for both.

The auto-loop parent is the current Pi session, not another named subagent. For an economical orchestrator with stronger worker/reviewer children, launch a dedicated parent with `pi --model provider/model:thinking` and keep child role pins in the machine-local settings overlay. A machine-local `defaultModel` changes every new parent session, not only auto mode; Pi currently has no command/phase-specific model setting. See [Auto-loop orchestrator model selection](docs/investigations/auto-loop-orchestrator-model-selection.md) for configuration, precedence, evidence, and the capability gap.

## Local-only resources

Mindspace prompts and other machine-specific prompts may remain in `~/.pi/agent/prompts`. Shared prompts belong in this repository.

### Local-only skills

After migration, `~/.agents/skills` is intentionally kept as a per-system scratch/override directory. Shared skills belong in this repo under `skills/`.

Avoid placing same-named skills in `~/.agents/skills`, because Pi will report collisions and only one copy will win. When a name exists in both places, remove the local copy and use this repository as the source of truth.
