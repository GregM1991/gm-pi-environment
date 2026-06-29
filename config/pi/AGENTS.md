# Global Pi Agent Instructions

## Context preservation

For commands, logs, tests, API calls, git history, large files, browser snapshots, or any output that might exceed a few lines, use the context-mode skill/tools. Prefer `ctx_execute`, `ctx_execute_file`, `ctx_batch_execute`, `ctx_fetch_and_index`, and `ctx_search` over raw Bash/read output. Read the `context-mode` skill before large-output work if its detailed workflow is needed.

## Hypa and context-mode

Use context-mode (`ctx_execute`, `ctx_batch_execute`, `ctx_execute_file`, `ctx_search`) for large-output analysis, tests, logs, command aggregation, indexing, and retrieval.

Hypa is installed in additive mode as a shell-output reducer. Native `bash` calls may be rewritten through Hypa automatically. Use `hypa_*` tools for concise shell/read/grep/find/ls output when context-mode indexing/search is not needed.

Do not replace context-mode with Hypa for large analysis or searchable evidence. If `bash` fails with `hypa: command not found`, report a Pi/Hypa PATH issue instead of repeatedly retrying the same command.
