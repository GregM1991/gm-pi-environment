#!/usr/bin/env bash
set -euo pipefail
SKILLS_DIR="${AGENTS_SKILLS_DIR:-$HOME/.agents/skills}"
STAMP="$(date +%Y%m%d-%H%M%S)"
mkdir -p "$SKILLS_DIR"
if find "$SKILLS_DIR" -mindepth 1 -maxdepth 1 | read -r _; then
  BACKUP="$SKILLS_DIR.backup-$STAMP"
  cp -a "$SKILLS_DIR" "$BACKUP"
  find "$SKILLS_DIR" -mindepth 1 -maxdepth 1 -exec rm -rf {} +
  echo "Emptied $SKILLS_DIR after backing it up to $BACKUP"
else
  echo "$SKILLS_DIR is already empty"
fi
