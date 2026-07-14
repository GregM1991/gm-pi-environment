#!/usr/bin/env python3
"""Fetch captions for a YouTube video.

Requires youtube-transcript-api==1.2.4. This helper reads caption text exposed by
YouTube; it does not download or inspect video frames or audio.
"""

import argparse
import json
import re
import sys
from collections.abc import Mapping, Sequence
from typing import Any, Optional
from urllib.parse import parse_qs, urlparse

DEPENDENCY = "youtube-transcript-api==1.2.4"
DEFAULT_LANGUAGES = ("en",)
VIDEO_ID_RE = re.compile(r"^[A-Za-z0-9_-]{11}$")
YOUTUBE_HOSTS = {
    "youtube.com",
    "www.youtube.com",
    "m.youtube.com",
    "music.youtube.com",
    "youtube-nocookie.com",
    "www.youtube-nocookie.com",
}
SHORT_HOSTS = {"youtu.be", "www.youtu.be"}


class DependencyMissingError(RuntimeError):
    """Raised when the pinned transcript dependency is unavailable."""


class LanguageUnavailableError(RuntimeError):
    """Raised when strict language selection cannot find a requested language."""


class NoAvailableTranscriptError(RuntimeError):
    """Raised when YouTube returns no caption tracks."""


class EmptyTranscriptError(RuntimeError):
    """Raised when the selected caption track contains no usable text."""


def extract_video_id(url_or_id: str) -> str:
    """Return an 11-character ID from a supported YouTube URL or raw ID.

    Supported URL routes are watch, youtu.be, shorts, embed, and live.
    """
    value = url_or_id.strip()
    if VIDEO_ID_RE.fullmatch(value):
        return value

    # Accept common pasted URLs without an explicit scheme.
    if value.lower().startswith(
        ("youtube.com/", "www.youtube.com/", "m.youtube.com/", "youtu.be/")
    ):
        value = "https://" + value

    parsed = urlparse(value)
    if parsed.scheme not in {"http", "https"}:
        raise ValueError("expected a YouTube URL or an 11-character video ID")

    host = (parsed.hostname or "").lower().rstrip(".")
    candidate: Optional[str] = None

    if host in SHORT_HOSTS:
        candidate = parsed.path.lstrip("/").split("/", 1)[0]
    elif host in YOUTUBE_HOSTS:
        path_parts = [part for part in parsed.path.split("/") if part]
        if path_parts and path_parts[0] == "watch":
            candidate = parse_qs(parsed.query).get("v", [None])[0]
        elif len(path_parts) >= 2 and path_parts[0] in {"shorts", "embed", "live"}:
            candidate = path_parts[1]
    else:
        raise ValueError("URL host is not a supported YouTube host")

    if candidate and VIDEO_ID_RE.fullmatch(candidate):
        return candidate
    raise ValueError("could not find a valid 11-character video ID in the input")


def format_timestamp(seconds: float) -> str:
    """Convert seconds to M:SS or H:MM:SS, flooring fractional seconds."""
    total = max(0, int(seconds))
    hours, remainder = divmod(total, 3600)
    minutes, secs = divmod(remainder, 60)
    if hours:
        return f"{hours}:{minutes:02d}:{secs:02d}"
    return f"{minutes}:{secs:02d}"


def _metadata(item: Any, name: str, default: Any = None) -> Any:
    if isinstance(item, Mapping):
        return item.get(name, default)
    return getattr(item, name, default)


def _normalize_languages(languages: Optional[Sequence[str]]) -> list[str]:
    normalized = [str(code).strip() for code in (languages or DEFAULT_LANGUAGES)]
    normalized = [code for code in normalized if code]
    if not normalized:
        raise ValueError("at least one non-empty language code is required")
    return normalized


def _clean_text(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


def fetch_transcript(
    video_id: str,
    languages: Optional[Sequence[str]] = None,
    *,
    allow_any_language: bool = True,
    api: Any = None,
) -> dict[str, Any]:
    """Fetch a transcript and return normalized segments plus selection metadata.

    The default request is explicitly English. If none of the requested languages
    exists and ``allow_any_language`` is true, the first caption track reported by
    the API is selected deliberately. The library lists manually created tracks
    before generated tracks.
    """
    requested_languages = _normalize_languages(languages)

    if api is None:
        try:
            from youtube_transcript_api import YouTubeTranscriptApi
        except ImportError as exc:
            raise DependencyMissingError(
                f"Missing dependency {DEPENDENCY}. Use the isolated setup in SKILL.md."
            ) from exc
        api = YouTubeTranscriptApi()

    transcript_list = api.list(video_id)
    available = list(transcript_list)
    if not available:
        raise NoAvailableTranscriptError("No caption tracks are available for this video.")

    used_fallback = False
    try:
        selected = transcript_list.find_transcript(requested_languages)
    except Exception as exc:
        # Do not mask network/parser failures as language misses.
        if type(exc).__name__ != "NoTranscriptFound":
            raise
        if not allow_any_language:
            available_codes = [str(_metadata(track, "language_code", "unknown")) for track in available]
            raise LanguageUnavailableError(
                "None of the requested languages is available "
                f"({', '.join(requested_languages)}); available: {', '.join(available_codes)}."
            ) from exc
        selected = available[0]
        used_fallback = True

    fetched = selected.fetch()
    segments = []
    for snippet in fetched:
        segments.append(
            {
                "text": str(_metadata(snippet, "text", "")),
                "start": float(_metadata(snippet, "start", 0.0)),
                "duration": float(_metadata(snippet, "duration", 0.0)),
            }
        )

    clean_texts = [_clean_text(segment["text"]) for segment in segments]
    clean_texts = [text for text in clean_texts if text]
    if not clean_texts:
        raise EmptyTranscriptError("The selected caption track contains no usable text.")

    language_name = str(
        _metadata(fetched, "language", _metadata(selected, "language", "Unknown"))
    )
    language_code = str(
        _metadata(fetched, "language_code", _metadata(selected, "language_code", "unknown"))
    )
    is_generated = bool(
        _metadata(fetched, "is_generated", _metadata(selected, "is_generated", False))
    )
    duration_seconds = max(
        (segment["start"] + segment["duration"] for segment in segments),
        default=0.0,
    )
    full_text = " ".join(clean_texts)
    timestamped_text = "\n".join(
        f"{format_timestamp(segment['start'])} {_clean_text(segment['text'])}"
        for segment in segments
        if _clean_text(segment["text"])
    )

    return {
        "video_id": video_id,
        "language_name": language_name,
        "language_code": language_code,
        "is_generated": is_generated,
        "selection": {
            "requested_languages": requested_languages,
            "strategy": "any_available_fallback" if used_fallback else "requested_language",
            "used_any_available_fallback": used_fallback,
        },
        "segment_count": len(segments),
        "duration_seconds": duration_seconds,
        "duration": format_timestamp(duration_seconds),
        "segments": segments,
        "full_text": full_text,
        "timestamped_text": timestamped_text,
    }


def _error_details(exc: Exception) -> tuple[str, str]:
    if isinstance(exc, DependencyMissingError):
        return "dependency_missing", str(exc)
    if isinstance(exc, LanguageUnavailableError):
        return "language_unavailable", str(exc)
    if isinstance(exc, NoAvailableTranscriptError):
        return "no_transcript", str(exc)
    if isinstance(exc, EmptyTranscriptError):
        return "empty_transcript", str(exc)

    error_name = type(exc).__name__
    known_errors = {
        "TranscriptsDisabled": (
            "transcripts_disabled",
            "Captions are disabled or unavailable for this video.",
        ),
        "NoTranscriptFound": (
            "language_unavailable",
            "No captions matched the requested languages.",
        ),
        "VideoUnavailable": ("video_unavailable", "The video is private, removed, or unavailable."),
        "VideoUnplayable": ("video_unavailable", "The video cannot be played in this context."),
        "AgeRestricted": ("video_unavailable", "The video is age-restricted."),
        "InvalidVideoId": ("invalid_video_id", "YouTube rejected the video ID as invalid."),
        "RequestBlocked": (
            "request_blocked",
            "YouTube blocked the transcript request from this network.",
        ),
        "IpBlocked": (
            "request_blocked",
            "YouTube blocked the transcript request from this network.",
        ),
    }
    return known_errors.get(error_name, ("fetch_failed", str(exc) or error_name))


def _emit_error(error_type: str, message: str, *, json_output: bool) -> None:
    if json_output:
        print(json.dumps({"error": {"type": error_type, "message": message}}, ensure_ascii=False))
    else:
        print(f"Error [{error_type}]: {message}", file=sys.stderr)


def _parse_language_arg(value: Optional[str]) -> list[str]:
    if value is None:
        return list(DEFAULT_LANGUAGES)
    languages = [code.strip() for code in value.split(",") if code.strip()]
    if not languages:
        raise ValueError("--language must contain at least one language code")
    return languages


def _output_mode(args: argparse.Namespace, parser: argparse.ArgumentParser) -> tuple[str, bool]:
    if args.format and args.text_only:
        parser.error("--format and --text-only cannot be used together")
    if args.format in {"text", "timestamped"} and args.timestamps:
        parser.error("--timestamps only adds timestamped_text to JSON; use --format timestamped")

    if args.format:
        return args.format, bool(args.timestamps and args.format == "json")
    if args.text_only:
        return ("timestamped" if args.timestamps else "text"), False
    return "json", bool(args.timestamps)


def main(argv: Optional[Sequence[str]] = None) -> int:
    parser = argparse.ArgumentParser(
        description="Fetch YouTube captions as structured JSON, text, or timestamped text."
    )
    parser.add_argument("url", help="YouTube URL or raw 11-character video ID")
    parser.add_argument(
        "--language",
        "-l",
        default=None,
        help="Comma-separated language codes in priority order (default: en)",
    )
    parser.add_argument(
        "--strict-language",
        action="store_true",
        help="Fail instead of selecting the first available caption language",
    )
    parser.add_argument(
        "--format",
        choices=("json", "text", "timestamped"),
        default=None,
        help="Output format (default: json)",
    )
    # Compatibility aliases retained from the upstream helper.
    parser.add_argument("--text-only", action="store_true", help="Output plain text")
    parser.add_argument(
        "--timestamps",
        "-t",
        action="store_true",
        help="With JSON, include timestamped_text; with --text-only, output timestamped text",
    )
    args = parser.parse_args(argv)
    mode, include_timestamped_json = _output_mode(args, parser)

    try:
        video_id = extract_video_id(args.url)
        languages = _parse_language_arg(args.language)
    except ValueError as exc:
        _emit_error("invalid_input", str(exc), json_output=mode == "json")
        return 2

    try:
        result = fetch_transcript(
            video_id,
            languages,
            allow_any_language=not args.strict_language,
        )
    except Exception as exc:
        error_type, message = _error_details(exc)
        _emit_error(error_type, message, json_output=mode == "json")
        return 1

    if mode == "json":
        if not include_timestamped_json:
            result = {key: value for key, value in result.items() if key != "timestamped_text"}
        print(json.dumps(result, ensure_ascii=False, indent=2))
    else:
        fallback_note = " via any-language fallback" if result["selection"]["used_any_available_fallback"] else ""
        generated_note = "generated" if result["is_generated"] else "manual"
        print(
            f"Selected captions: {result['language_name']} ({result['language_code']}), "
            f"{generated_note}{fallback_note}",
            file=sys.stderr,
        )
        print(result["timestamped_text"] if mode == "timestamped" else result["full_text"])
    return 0


if __name__ == "__main__":
    sys.exit(main())
