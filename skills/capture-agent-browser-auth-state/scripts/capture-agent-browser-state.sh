#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  capture-agent-browser-state.sh --name NAME --login-url URL --verify-url URL [--out DIR] [--server USER@HOST] [--remote-dir DIR]

Example:
  capture-agent-browser-state.sh \
    --name dndbeyond \
    --login-url https://www.dndbeyond.com/sign-in \
    --verify-url https://www.dndbeyond.com/campaigns/7452624 \
    --server gm-home-server \
    --remote-dir '~/agent-browser-states'

What it does:
  1. Opens a headed agent-browser session on this GUI machine.
  2. Lets you log in manually.
  3. Opens the verify URL and asks you to confirm access.
  4. Saves an agent-browser state JSON file.
  5. Optionally prints and runs scp to copy it to a server.

Security:
  The state file contains cookies/session tokens. Treat it like a password.
EOF
}

name=""
login_url=""
verify_url=""
out_dir="${PWD}"
server=""
remote_dir="~/agent-browser-states"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --name) name="${2:-}"; shift 2 ;;
    --login-url) login_url="${2:-}"; shift 2 ;;
    --verify-url) verify_url="${2:-}"; shift 2 ;;
    --out) out_dir="${2:-}"; shift 2 ;;
    --server) server="${2:-}"; shift 2 ;;
    --remote-dir) remote_dir="${2:-}"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown argument: $1" >&2; usage; exit 2 ;;
  esac
done

if [[ -z "$name" || -z "$login_url" || -z "$verify_url" ]]; then
  usage >&2
  exit 2
fi

if ! command -v agent-browser >/dev/null 2>&1; then
  echo "agent-browser not found on PATH. Install/configure agent-browser on this GUI machine first." >&2
  exit 1
fi

mkdir -p "$out_dir"
state_file="${out_dir%/}/${name}-state.json"
session_name="capture-${name}-$(date +%Y%m%d%H%M%S)"

echo "Opening headed browser session: $session_name"
echo "Login URL: $login_url"
agent-browser --headed --session-name "$session_name" open "$login_url"

echo
read -r -p "Complete login in the browser window, then press Enter to continue... " _

echo "Opening verify URL: $verify_url"
agent-browser --session-name "$session_name" open "$verify_url"

echo
current_url="$(agent-browser --session-name "$session_name" get url || true)"
echo "Current URL: $current_url"
echo "If you were redirected to sign-in or cannot see the gated content, answer no."
read -r -p "Is the gated page accessible? [y/N] " ok
case "$ok" in
  y|Y|yes|YES) ;;
  *) echo "Aborting without saving state." >&2; exit 1 ;;
esac

echo "Saving state to: $state_file"
agent-browser --session-name "$session_name" state save "$state_file"
chmod 600 "$state_file"
ls -lh "$state_file"

echo
cat <<EOF
Saved agent-browser state file:
  $state_file

Use on a headless/server machine with agent-browser by loading this state file before opening the gated URL.
Do not commit or print this file. It contains authenticated session material.
EOF

if [[ -n "$server" ]]; then
  echo
  echo "Preparing remote directory and copying to server..."
  ssh "$server" "mkdir -p $remote_dir && chmod 700 $remote_dir"
  remote_path="${remote_dir%/}/$(basename "$state_file")"
  scp "$state_file" "$server:$remote_path"
  echo "Copied to: $server:$remote_path"
fi
