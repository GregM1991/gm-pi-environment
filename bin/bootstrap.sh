#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PI_DIR="${PI_CODING_AGENT_DIR:-$HOME/.pi/agent}"
STAMP="$(date +%Y%m%d-%H%M%S)"

mkdir -p "$PI_DIR" "$HOME/.agents/skills"

backup_if_exists() {
  local path="$1"
  if [ -e "$path" ] || [ -L "$path" ]; then
    cp -a "$path" "$path.backup-$STAMP"
  fi
}

backup_if_exists "$PI_DIR/AGENTS.md"
backup_if_exists "$PI_DIR/settings.json"
backup_if_exists "$PI_DIR/mcp.json"

cp "$REPO_ROOT/config/pi/AGENTS.md" "$PI_DIR/AGENTS.md"
cp "$REPO_ROOT/config/pi/mcp.json" "$PI_DIR/mcp.json"
cp "$REPO_ROOT/config/pi/settings.base.json" "$PI_DIR/settings.json"

# Register this repo as the Pi package providing skills/extensions.
pi install "$REPO_ROOT"

cat <<MSG
Installed gm-pi-environment.

Backups, if any, were written next to original files with suffix .backup-$STAMP.
Run this if you want ~/.agents/skills to be local-only/empty on this machine:
  $REPO_ROOT/bin/empty-system-skills-dir.sh
MSG
