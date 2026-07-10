#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PI_DIR="${PI_CODING_AGENT_DIR:-$HOME/.pi/agent}"
PACKAGE_SOURCE="${PI_ENV_PACKAGE_SOURCE:-git:github.com/GregM1991/gm-pi-environment}"
LOCAL_CONFIG_DIR="${PI_ENV_LOCAL_CONFIG_DIR:-$HOME/.config/gm-pi-environment}"
SETTINGS_OVERLAY="$LOCAL_CONFIG_DIR/settings.local.json"
MCP_OVERLAY="$LOCAL_CONFIG_DIR/mcp.local.json"
STAMP="$(date +%Y%m%d-%H%M%S)"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

mkdir -p "$PI_DIR" "$HOME/.agents/skills"

backup_if_exists() {
  local path="$1"
  if [ -e "$path" ] || [ -L "$path" ]; then
    cp -a "$path" "$path.backup-$STAMP"
  fi
}

merge_json() {
  local base="$1"
  local overlay="$2"
  local existing="$3"
  local output="$4"
  local preserve_key="${5:-}"

  python3 - "$base" "$overlay" "$existing" "$output" "$preserve_key" <<'PY'
import json
import sys
from pathlib import Path

base_path, overlay_path, existing_path, output_path = map(Path, sys.argv[1:5])
preserve_key = sys.argv[5]

def read_json(path, required=False):
    if not path.exists():
        if required:
            raise SystemExit(f"Required JSON file does not exist: {path}")
        return {}
    try:
        value = json.loads(path.read_text())
    except json.JSONDecodeError as error:
        raise SystemExit(f"Invalid JSON in {path}: {error}") from error
    if not isinstance(value, dict):
        raise SystemExit(f"Expected a JSON object in {path}")
    return value

def deep_merge(base, overlay):
    result = dict(base)
    for key, value in overlay.items():
        if isinstance(value, dict) and isinstance(result.get(key), dict):
            result[key] = deep_merge(result[key], value)
        else:
            result[key] = value
    return result

merged = deep_merge(read_json(base_path, required=True), read_json(overlay_path))
existing = read_json(existing_path)
if preserve_key and preserve_key not in merged and preserve_key in existing:
    merged[preserve_key] = existing[preserve_key]

output_path.write_text(json.dumps(merged, indent=2) + "\n")
PY
}

# Build and validate both JSON files before replacing any live configuration.
merge_json \
  "$REPO_ROOT/config/pi/settings.base.json" \
  "$SETTINGS_OVERLAY" \
  "$PI_DIR/settings.json" \
  "$TMP_DIR/settings.json" \
  "lastChangelogVersion"
merge_json \
  "$REPO_ROOT/config/pi/mcp.json" \
  "$MCP_OVERLAY" \
  "$TMP_DIR/no-existing-mcp.json" \
  "$TMP_DIR/mcp.json"

backup_if_exists "$PI_DIR/AGENTS.md"
backup_if_exists "$PI_DIR/settings.json"
backup_if_exists "$PI_DIR/mcp.json"

cp "$REPO_ROOT/config/pi/AGENTS.md" "$PI_DIR/AGENTS.md"
cp "$TMP_DIR/mcp.json" "$PI_DIR/mcp.json"
cp "$TMP_DIR/settings.json" "$PI_DIR/settings.json"

# Register this environment as the Pi package providing skills/extensions.
# Defaults to the GitHub source so fresh machines stay updateable via `pi update --extensions`.
# For local development, run: PI_ENV_PACKAGE_SOURCE="$REPO_ROOT" ./bin/bootstrap.sh
pi install "$PACKAGE_SOURCE"
pi update --extensions

cat <<MSG
Installed gm-pi-environment from $PACKAGE_SOURCE.

Backups, if any, were written next to original files with suffix .backup-$STAMP.
Machine-local overrides, when needed, are read from:
  $SETTINGS_OVERLAY
  $MCP_OVERLAY

Run this if you want ~/.agents/skills to be local-only/empty on this machine:
  $REPO_ROOT/bin/empty-system-skills-dir.sh
MSG
