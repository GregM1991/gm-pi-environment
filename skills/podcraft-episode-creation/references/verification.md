# Episode verification contract

Apply this after a creation attempt returns an episode ID or delivery URLs. Generation, delivery, and listening quality are separate gates. Consult the source anchors only when returned URLs or route behavior contradict this contract.

## Production gate

Pass only when the final status is `ready`, the episode ID is non-null, the duration is positive, and no saved error remains.

For a failed episode, preserve the ID and classify the observed stage when evidence permits:

1. script generation;
2. audio generation;
3. FFmpeg processing;
4. storage or finalization;
5. delivery.

Use Podcraft's existing retry path after correcting the cause. Creation commands are not retry commands.

## Delivery gates

Prefer URLs returned by BYOS JSON. For generated output, derive them from Podcraft's configured public base URL:

- episode: `<base>/episodes/<episode-id>`;
- audio: `<base>/api/episodes/<episode-id>/audio`;
- series RSS: `<base>/api/feed/<series-slug>`.

Verify:

```bash
curl -fsS -o /dev/null <episode-url>
curl -fsS -D - -o /dev/null -H 'Range: bytes=0-0' <audio-url>
curl -fsS <rss-url>
```

Pass the audio gate only when the range request returns partial content with a valid `Content-Range`. Pass the RSS gate only when the feed contains the episode ID or its audio enclosure URL.

## Human gate

Report these as pending until a person evaluates them:

- intelligibility and pronunciation;
- pacing and voice suitability;
- factual or curricular correctness when applicable;
- whether the episode achieved its intended listener outcome.

Mechanical success never implies a passed human gate.

## Source anchors

Relative to `PODCRAFT_ROOT`:

- `AGENTS.md:59-75` — pipeline stages, terminal states, and saved errors.
- `README.md:125-147` — RSS and public base URL contract.
- `app/routes.ts:3-17` — health, feed, audio, and episode routes.
- `scripts/create-byos-episode.ts:205-217` — stable success/failure URL schema.
