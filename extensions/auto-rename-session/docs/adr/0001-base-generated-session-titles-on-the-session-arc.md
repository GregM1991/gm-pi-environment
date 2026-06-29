# Base Generated Session Titles On The Session Arc

Generated session titles should describe the user's goal across the whole session arc, not the assistant's latest implementation activity or the most recent task window. Recent messages remain useful evidence for how the arc has evolved, but long-session truncation should preserve both the beginning and the recent end of the conversation so the title stays anchored to what the user wanted while still reflecting meaningful changes.

## Considered Options

- Base titles on the recent active task for specificity.
- Base titles on the whole session arc, using recent activity only as evidence.

## Consequences

- Titles should be more stable and user-goal-oriented.
- Prompt and truncation tests should guard against drifting back toward technical assistant-action summaries.
