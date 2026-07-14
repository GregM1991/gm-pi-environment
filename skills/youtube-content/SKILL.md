---
name: youtube-content
description: Fetches YouTube captions/transcripts and turns their text into summaries, timestamped chapters, notable quotes, X/Twitter threads, or blog posts. Use when a user supplies a YouTube watch, youtu.be, Shorts, embed, or live URL (or a video ID) and asks for the transcript or a text-based analysis of the video's spoken content. This skill does not inspect video frames or audio.
license: MIT (see LICENSE)
compatibility: Python 3.9+ with internet access; uv is recommended for isolated dependency execution. No YouTube API credentials are required.
metadata:
  source-repository: https://github.com/NousResearch/hermes-agent
  source-commit: 861d69c7bba8d2ea6a1cd170e989c901c74d32d1
---

# YouTube Content

Fetch captions published by YouTube, then transform the transcript text into the format the user requests.

> **Capability boundary:** this is transcript analysis only. It does **not** download or inspect video frames, images, music, tone of voice, or other audio. Do not claim visual or audio observations. If the user needs those, explain that this skill cannot provide them.

## Setup

The helper requires Python 3.9+ and is tested against the pinned dependency `youtube-transcript-api==1.2.4`. It needs ordinary network access to YouTube, but no API key, account credentials, `yt-dlp`, ffmpeg, Whisper, or multimodal model.

First resolve the directory containing this `SKILL.md` to an absolute path. Use the absolute skill path reported when Pi loaded this file, take its parent directory, and assign it once for the current shell. Do not assume the user's working directory is the skill directory.

```bash
# Replace this value with the absolute parent directory of the loaded SKILL.md.
SKILL_DIR="/absolute/path/to/youtube-content"
test -f "$SKILL_DIR/SKILL.md"
```

Prefer `uv` for an isolated, reproducible invocation. Check that it exists, then let `uv` provide the pinned package without changing the repository or the user's global Python environment:

```bash
uv --version
uv run --no-project --with 'youtube-transcript-api==1.2.4' \
  python "$SKILL_DIR/scripts/fetch_transcript.py" --help
```

`uv` may populate its normal package cache, but `--no-project` prevents it from creating or changing a project environment. Do not run an unpinned `pip install` or silently install into the user's active interpreter.

If `uv` is unavailable, ask the user before creating an isolated virtual environment at a location they choose. A reproducible fallback is:

```bash
python3 -m venv /chosen/path/youtube-content-venv
/chosen/path/youtube-content-venv/bin/python -m pip install 'youtube-transcript-api==1.2.4'
/chosen/path/youtube-content-venv/bin/python \
  "$SKILL_DIR/scripts/fetch_transcript.py" --help
```

On Windows, use the virtual environment's `Scripts/python.exe` path.

## Fetch Captions

The script accepts watch URLs, `youtu.be` links, Shorts, embeds, live URLs, and raw 11-character IDs.

```bash
# Structured JSON: metadata, selection details, segments, and full text
uv run --no-project --with 'youtube-transcript-api==1.2.4' \
  python "$SKILL_DIR/scripts/fetch_transcript.py" "YOUTUBE_URL"

# Add a timestamped_text field to JSON
uv run --no-project --with 'youtube-transcript-api==1.2.4' \
  python "$SKILL_DIR/scripts/fetch_transcript.py" "YOUTUBE_URL" --timestamps

# Plain transcript text
uv run --no-project --with 'youtube-transcript-api==1.2.4' \
  python "$SKILL_DIR/scripts/fetch_transcript.py" "YOUTUBE_URL" --format text

# Timestamped transcript text
uv run --no-project --with 'youtube-transcript-api==1.2.4' \
  python "$SKILL_DIR/scripts/fetch_transcript.py" "YOUTUBE_URL" --format timestamped

# Preferred languages in descending priority
uv run --no-project --with 'youtube-transcript-api==1.2.4' \
  python "$SKILL_DIR/scripts/fetch_transcript.py" "YOUTUBE_URL" --language tr,en
```

The default requested language is explicitly `en`. If none of the requested languages is present, the script deliberately selects the first available caption track (manual tracks precede generated tracks in the pinned library). This is recorded as `selection.strategy: "any_available_fallback"`; it is not inferred from an omitted language argument. Use `--strict-language` to fail instead. JSON always reports the actual `language_name`, `language_code`, and `is_generated`. Text modes report the selected language and fallback status on stderr while leaving stdout pipe-friendly.

For analysis, fetch JSON with `--timestamps` first. Preserve its language and generation metadata in the answer when fallback occurred or caption accuracy matters.

## Workflow

1. **Clarify the output.** Identify the requested language and whether the user wants a transcript, summary, chapters, quotes, thread, or blog post. If no transformation is specified, produce a concise summary.
2. **Fetch structured captions.** Run the helper in JSON mode with `--timestamps`. Do not install missing tools globally.
3. **Validate the result.** Confirm the command succeeded, `segment_count` is nonzero, and `language_code` is suitable. Tell the user when `used_any_available_fallback` is true. Treat generated captions as potentially less accurate.
4. **Chunk long transcripts.** Follow the long-transcript procedure below rather than truncating content.
5. **Transform only transcript evidence.** Do not invent speaker identity, visuals, demonstrations, or uncaptioned material. Distinguish the speaker's claims from established facts.
6. **Verify.** Check coverage, deduplicate overlap, confirm timestamps against source segments, and match the requested format and length.

## Long-Transcript Procedure

When the derived transcript exceeds about 50,000 characters (or will not fit comfortably in the current context):

1. Split on segment boundaries into approximately 35,000–40,000-character chunks.
2. Include roughly 1,500–2,000 characters of overlap, retaining each chunk's first and last timestamps. Never split a caption segment.
3. For each chunk, record a compact evidence note: time range, topics, claims, examples, candidate quotes, and unresolved references to earlier/later material.
4. Merge the chunk notes in chronological order. Remove duplicated material from overlaps and resolve cross-chunk references.
5. Create the final output from the merged notes. For chapters and quotes, verify every chosen timestamp against the original JSON segments, not only the intermediate summaries.

Do not summarize only the first chunks or silently omit the ending. If the transcript is too large to process completely, state the coverage limitation.

## Transformations

- **Summary:** Cover the central subject, main claims or steps, supporting examples, and conclusion. Prefer a short overview unless the user requests depth.
- **Chapters:** Detect meaningful topic changes, not fixed time intervals. Use the start timestamp of the first supporting segment and a descriptive title, optionally followed by one sentence.
- **Quotes:** Quote caption text faithfully and include timestamps. Captions are not an authoritative verbatim record; label generated-caption quotes or paraphrase uncertain passages instead of presenting them as exact.
- **Thread:** Produce numbered, standalone posts within the user's requested platform limit (default to 280 characters for X). Preserve the argument's order and avoid unsupported hype.
- **Blog post:** Create a title, introduction, coherent sections, takeaways, and source link. Attribute claims to the speaker/video rather than adopting them as facts.

## Error Handling

The JSON error shape is `{"error": {"type": "...", "message": "..."}}` and the process exits nonzero.

- `invalid_input` / `invalid_video_id`: ask for a supported YouTube URL or exact 11-character ID.
- `transcripts_disabled` / `no_transcript` / `empty_transcript`: explain that usable captions are not available. Do not fall back to audio transcription because that is outside this skill.
- `language_unavailable`: report the requested language. Without `--strict-language`, the script already attempts a deliberate any-available-language fallback.
- `video_unavailable`: the video may be private, removed, age-restricted, region-restricted, or otherwise unplayable; ask the user to verify access.
- `request_blocked`: YouTube rejected this network request. Report it rather than repeatedly retrying or requesting user credentials.
- `dependency_missing`: use the pinned isolated setup above; do not mutate the user's global environment.
- `fetch_failed`: preserve the concise error, retry once only if it appears transient, then report the failure.

## Source and License

This is a Pi-compatible adaptation of the public MIT-licensed `youtube-content` bundled skill from [NousResearch/hermes-agent](https://github.com/NousResearch/hermes-agent), original path `skills/media/youtube-content`, pinned source commit [`861d69c7bba8d2ea6a1cd170e989c901c74d32d1`](https://github.com/NousResearch/hermes-agent/tree/861d69c7bba8d2ea6a1cd170e989c901c74d32d1/skills/media/youtube-content). See [LICENSE](LICENSE) for the upstream copyright and MIT terms.

This independent adaptation is not endorsed by, sponsored by, or affiliated with Nous Research.
