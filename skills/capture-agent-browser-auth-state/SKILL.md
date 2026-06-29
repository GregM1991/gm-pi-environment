---
name: capture-agent-browser-auth-state
description: Capture and transfer agent-browser auth state for gated websites using a GUI machine, then reuse it on a headless/server machine. Use for D&D Beyond or similar sites requiring interactive login, MFA, CAPTCHA, SSO, or a headed browser. Prefer this over installing VNC/desktop packages on a server.
---

# Capture Agent Browser Auth State

Use this when a gated app needs a one-time headed login, but automation should run later on a headless server.

## Bundled Script

This skill includes:

```text
scripts/capture-agent-browser-state.sh
```

Resolve it relative to this skill directory. Copy or run it on the GUI machine that can perform the login.

## Standard Workflow

1. On a GUI machine with `agent-browser` installed, run the bundled script.
2. Provide:
   - `--name`: short state name, e.g. `dndbeyond`
   - `--login-url`: page where the user signs in
   - `--verify-url`: gated page that proves auth works
   - optional `--server`: SSH target to copy the state file to
   - optional `--remote-dir`: remote private directory for state files
3. User completes login manually in the headed browser.
4. Script opens the verify URL and asks the user to confirm access.
5. Script saves `<name>-state.json` with mode `600`.
6. If `--server` is set, script creates the remote dir and copies the state file there.
7. On the server, use the state file with `agent-browser` and verify the gated URL does not redirect to login.

## Example

```bash
/path/to/scripts/capture-agent-browser-state.sh \
  --name dndbeyond \
  --login-url https://www.dndbeyond.com/sign-in \
  --verify-url https://www.dndbeyond.com/campaigns/7452624 \
  --server gm-home-server \
  --remote-dir '~/agent-browser-states'
```

## Security Rules

- Treat state JSON files like passwords; they contain cookies/session tokens.
- Do not print, paste, commit, or index state file contents.
- Prefer state JSON over copying full Chrome profiles.
- Do not install or keep VNC/desktop stacks on servers just to refresh auth.
- If auth expires, recapture on the GUI machine and replace the server copy.

## Verification

- State file exists, is non-empty, and has mode `600`.
- Verify URL worked before saving state.
- Server copy exists in a private directory, ideally mode `700`.
- Headless `agent-browser` can open the verify URL without login redirect.
