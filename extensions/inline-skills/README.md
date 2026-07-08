# inline-skills

Personal Pi package for using skill commands inline anywhere in a chat message.

Pi normally expands `/skill:name` only when it appears at the beginning of the editor. This extension lets you mention skills in the middle of a prompt and still have their `SKILL.md` instructions loaded for that turn.

## Syntax

Use this form anywhere in your message:

```text
#diagnose
```

Native leading `/skill:name` and `/skills:name` prompts are still handled by Pi itself when they appear at the start of the editor.

Multiple inline skills are supported in the same message:

```text
Can you fix this using #diagnose and #testing-philosophy?
```

## Autocomplete

The extension adds autocomplete for inline skill references. Type `#` anywhere in the editor to show all skills, or continue typing to filter them:

```text
#
#diag
```

## Install

From the shared environment package:

```bash
pi install git:github.com/GregM1991/gm-pi-environment
```

Local development install from this checkout:

```bash
pi install /home/gm/workspace/pi-environment
```

## Notes

- Native leading `/skill:name ...` prompts are left untouched and handled by Pi itself.
- Inline references load currently discovered skills. If you add new skill files while Pi is running, reload Pi first so they are discoverable.
