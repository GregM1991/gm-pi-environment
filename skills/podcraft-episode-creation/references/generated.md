# Generated episode contract

Use this branch when Podcraft owns script research and writing. This document is the operational cache; consult the source anchors only when the package scripts are missing, observed output violates this contract, or Podcraft has changed.

## Inputs

Required:

- existing series slug;
- topic: 1–1,000 characters after trimming;
- exactly one nonempty summary source: `--summary-file` or stdin;
- summary: at most 50,000 characters after trimming.

Defaults:

- length: `medium`;
- voice: `af_sky`;
- environment: `.env.production`, then `.env`.

Optional overrides: `--length short|medium|long|auto`, `--voice`, `--persona-id`, `--image-url`, and `--env-file`.

## Create

Prefer a summary file so the exact submitted source remains inspectable:

```bash
cd "$PODCRAFT_ROOT"
bun run episode:create -- \
  --series <series-slug> \
  --topic "<topic>" \
  --summary-file <summary-file>
```

Append optional flags only for resolved overrides. The CLI validates the source, loads the environment, checks the series, creates one episode, and runs the generation pipeline synchronously.

## Result

Require exit code `0` and reported status `ready`. Preserve these reported fields when present:

- series title and slug;
- episode number and ID;
- topic, status, and voice;
- audio path and duration;
- saved error.

A missing series is a pre-creation failure. Report the available-series list emitted by the CLI and create no episode.

## Source anchors

Relative to `PODCRAFT_ROOT`:

- `package.json:18-19` — canonical episode scripts.
- `README.md:59-84` — generated CLI usage, defaults, and optional flags.
- `scripts/create-generated-episode.ts:20-86` — topic, summary, length, voice, and source limits.
- `scripts/create-generated-episode.ts:117-137` — environment selection.
- `scripts/create-generated-episode.ts:159-202` — exact arguments and source loading.
- `scripts/create-generated-episode.ts:219-253` — series check, creation, and synchronous generation.
- `scripts/create-generated-episode.ts:255-295` — result fields and success criterion.
