# gm-pi-environment

Personal source of truth for Pi setup across machines for moi.

This repo contains shared Pi skills, personal extensions, and portable config so I can try keep track of the ever moving landscape.

## Contents

- `skills/` — shared skills that should be available everywhere Pi is used.
- `extensions/` — personal Pi extensions folded into this environment package.
- `prompts/` — shared prompt templates.
- `references/` — shared reference docs used by prompts, skills, and agents.
- `config/pi/AGENTS.md` — global Pi agent instructions.
- `config/pi/settings.base.json` — portable global Pi settings, excluding machine-local extension paths, `pi-mono-ask-user-question`, generated state, and the local Ollama provider.
- `config/pi/mcp.json` — portable MCP config.
- `bin/bootstrap.sh` — install/apply this environment on a machine.
- `bin/empty-system-skills-dir.sh` — keep `~/.agents/skills` as a local-only scratch dir by emptying it after backup.

## Install locally during development

```bash
pi install /home/gm/workspace/pi-environment
```

## Install from git on another machine

```bash
git clone <repo-url> ~/workspace/pi-environment
~/workspace/pi-environment/bin/bootstrap.sh
```

## Local-only skills

After migration, `~/.agents/skills` is intentionally kept as a per-system scratch/override directory. Shared skills belong in this repo under `skills/`.

Avoid placing same-named skills in `~/.agents/skills`, because Pi will report collisions and only one copy will win.
