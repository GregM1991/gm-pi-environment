# zed-bell

Pi extension that emits a terminal bell (`BEL`, `\x07`) whenever a Pi agent turn finishes.

This is useful when running Pi inside a Zed Terminal Thread from a laptop SSH session: Zed can react to the terminal bell when the thread is unfocused.

## Behavior

- Listens for Pi's `agent_end` event.
- Writes `BEL` to stdout at the end of each agent turn.
- Provides `/zed-bell-test`, which waits 3 seconds and then emits `BEL` so you have time to switch focus before testing.

## Install

From this monorepo checkout:

```bash
pi install /home/gm/workspace/personal-pi-extensions/packages/zed-bell
```

After install, restart Pi or run `/reload`.

If you start Pi with `--no-extensions`, add this package explicitly with `-e` or install it into the alias that starts Pi.

## Zed client settings

On the laptop running Zed, terminal bell handling must be enabled. For current Zed versions, check your local schema, but this is the relevant setting:

```jsonc
{
  "terminal": {
    "bell": "system"
  }
}
```

Agent notification settings may also be useful:

```jsonc
{
  "agent": {
    "notify_when_agent_waiting": "primary_screen",
    "play_sound_when_agent_done": "always"
  }
}
```

## Test

In Pi:

```text
/zed-bell-test
```

Switch away from the Zed Terminal Thread before the 3 second delay finishes. Zed should play/show the terminal bell notification.
