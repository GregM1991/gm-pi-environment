# BYOS episode contract

Use this branch when the supplied script is authoritative. Podcraft performs TTS, MP3 production, storage, and delivery without creating or revising the content. This document is the operational cache; consult the source anchors only when the package scripts are missing, observed output violates this contract, or Podcraft has changed.

## Inputs

Required:

- existing series slug;
- title: 1–200 characters after trimming;
- script file: 1–200,000 characters after trimming.

Defaults:

- voice: `af_sky`;
- environment: `.env.production`, then `.env`.

Use `--allow-duplicate` only when the user explicitly authorizes another copy. Duplicate identity is series + title + exact trimmed script + voice.

## Create

Use JSON mode as the stable result contract:

```bash
cd "$PODCRAFT_ROOT"
bun run episode:create-byos -- \
  --series <series-slug> \
  --title "<title>" \
  --script-file <script-file> \
  --voice <voice-id> \
  --json
```

The command runs synchronously. Stdout must contain exactly one JSON object; operational logs belong on stderr.

## Result

Success requires exit code `0` and JSON containing:

- `status: "ready"`;
- non-null `episodeId`;
- `error: null`;
- episode, audio, and RSS URLs.

Preserve the entire JSON object on failure. A failure after database creation may still carry episode ID, status, error, and artifact URLs. A missing series or invalid input has nullable artifact fields and creates no episode.

## Source anchors

Relative to `PODCRAFT_ROOT`:

- `package.json:18-19` — canonical episode scripts.
- `README.md:86-99` — BYOS purpose, usage, limits, JSON, and duplicate contract.
- `scripts/create-byos-episode.ts:151-188` — input validation and duplicate identity.
- `scripts/create-byos-episode.ts:189-220` — synchronous ready gate, result schema, and flags.
- `scripts/create-byos-episode.ts:231-260` — environment selection and JSON stdout isolation.
- `scripts/create-byos-episode.ts:263-272` — stable JSON failure output.
