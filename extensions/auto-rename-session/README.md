# auto-rename-session

Pi extension that automatically keeps a concise generated display name for the current session.

## Behavior

- Runs after the first recorded user/assistant message.
- Runs again every subsequent 10 user/assistant messages: message counts `1`, `11`, `21`, ...
- Names the whole session arc around the user's goal, using recent tasks only as evidence for how the arc has evolved.
- For long sessions, preserves the beginning and recent end of the transcript instead of only the tail.
- Generates names with `openai-codex/gpt-5.4-mini` in a child `pi --mode json --no-session` process.
- Calls `pi.setSessionName()` only when the session is not user-named.
- Treats `/name ...`, interactive/manual rename, or any pre-existing non-auto name as user ownership and stops touching the session.
- Stores per-session state with `pi.appendEntry()`, so it survives reload/resume without an external state file.
- Publishes the current session name to Pi extension status key `session-name`, so `pi-powerline-footer` can display it via `powerline.customItems`.

## Install

From this monorepo checkout:

```bash
pi install /home/greg/workspace/personal-pi-extensions/packages/auto-rename-session
```

After install, restart Pi or run `/reload`.

## Commands

```text
/auto-rename-session status
/auto-rename-session reset
```

`reset` clears the per-session manual-name guard for the current branch so auto-renaming can run again.

## Requirements

The child naming turn uses:

```text
openai-codex/gpt-5.4-mini
```

Make sure the `openai-codex` provider is configured in Pi before relying on automatic naming.
