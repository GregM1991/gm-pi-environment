# inline-skills

Personal Pi package for using skill commands inline anywhere in a chat message.

Pi normally expands `/skill:name` only when it appears at the beginning of the editor. This extension lets you mention skills in the middle of a prompt and still have their `SKILL.md` instructions loaded for that turn.

## Syntax

Use any of these forms anywhere in your message:

```text
@skill:diagnose
@skills:diagnose
/skill:diagnose
/skills:diagnose
```

Multiple inline skills are supported in the same message:

```text
Can you fix this using @skill:diagnose and @skill:testing-philosophy?
```

## Autocomplete

The extension adds autocomplete for inline skill references. Type one of these anywhere in the editor and use Tab / the normal Pi autocomplete flow:

```text
@skill:diag
@skills:diag
/skill:diag
/skills:diag
```

## Install

From npm / Pi marketplace after publish:

```bash
pi install npm:inline-skills
```

With npx, if you prefer invoking Pi without a global install:

```bash
npx pi install npm:inline-skills
```

Local development install from this monorepo:

```bash
pi install /home/gm/workspace/personal-pi-extensions/packages/inline-skills
```

## Notes

- Native leading `/skill:name ...` prompts are left untouched and handled by Pi itself.
- Inline references load currently discovered skills. If you add new skill files while Pi is running, reload Pi first so they are discoverable.
