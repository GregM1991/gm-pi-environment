# Global Pi Agent Instructions

## General Instructions

- Do not auto-commit after work has been completed. Wait for the user to confirm before committing. Exception: user-invoked automation loops whose contract explicitly includes committing (such as `/matt-auto` or no-argument `/matt-afk`) may commit per that contract.
- Never reply to comments on a pull request unless the user explicitly asks.
- When asked to investigate a problem, bug, issue, or unexpected behavior, investigate only. Do not implement a fix or make changes unless the user separately asks for them.

## Context preservation

Use native tools when their output is guaranteed to be small or is already bounded or truncated. Use `hypa_*` tools to compress shell, read, grep, find, and list output when broader inspection is needed.

For large data, prefer scripts that process the source and print only relevant findings. Preserve detailed or recoverable evidence in file-backed artifacts, then inspect it with targeted reads instead of emitting the full contents into the conversation.

Use pi-web-access or browser tools for web content. If `bash` fails with `hypa: command not found`, report a Pi/Hypa PATH issue instead of repeatedly retrying the same command.
