---
description: Use Pi Hermes Memory to review a failure, correction, blocker, or preferred path and save durable learnings
argument-hint: "[what happened / desired path]"
---
You are running a Pi Hermes Memory learning review.

User context / trigger:
$ARGUMENTS

Goal: assess whether the recent interaction, failure, correction, repeated attempt, blocker, or preferred workflow should become durable Hermes knowledge so future Pi agent runs do not repeat the mistake.

Use the Pi Hermes Memory ecosystem deliberately:

1. Reconstruct what happened
   - If the user supplied details above, use them as the primary trigger.
   - Search recent/past session context with `session_search` when useful. Prefer concrete queries from the trigger, error text, tool names, repo names, or files.
   - Search existing memories with `memory_search` before writing, especially:
     - `target="failure"` for prior failures, corrections, insights, and tool quirks.
     - `target="memory"` for global environment/tool facts.
     - project-scoped searches when the issue is repo-specific.
   - Do not assume memory is complete; current user input and current tool evidence win.

2. Classify the learning
   Pick the most precise category:
   - `failure`: an attempted approach failed and the reason matters later.
   - `correction`: the user corrected agent behavior or asked not to repeat something.
   - `insight`: a durable lesson discovered through investigation.
   - `preference`: a stable user preference or preferred workflow.
   - `convention`: a project/team convention.
   - `tool-quirk`: non-obvious tool/package/API behavior.
   - `skill`: a reusable multi-step procedure worth saving with `skill_manage`.

3. Decide what to save
   Save only durable, future-useful knowledge. Avoid temporary TODOs, one-off progress, stale task state, or generic summaries.
   - If a similar memory already exists, prefer `memory(action="replace")` or skip with a note rather than creating duplicates.
   - If it is a reusable procedure with concrete steps, use `skill_manage` instead of plain memory.
   - Choose target:
     - `user` for user preferences/profile/communication style.
     - `memory` for global cross-project facts/tool behavior.
     - `project` for current-repo conventions or workflows.
     - `failure` for categorized failures/corrections/insights/preferences/conventions/tool-quirks.

4. Write the durable artifact
   - Use `memory` for concise facts/lessons.
   - Use `skill_manage create|patch|update` for procedural workflows. Always pass scope explicitly: `global` for portable procedures, `project` for repo-specific ones.
   - Include enough evidence to prevent recurrence: what failed, why, what to do instead, command/tool names, relevant paths, and scope.

5. Return a compact review
   Report:
   - What happened / likely root cause.
   - Existing related memories found, if any.
   - What was saved or updated, including target/category/scope.
   - What future agents should do differently.
   - If nothing was saved, explain why.

Be conservative but useful: the purpose is not to journal everything; it is to create a self-healing feedback loop for future Pi agent sessions using Hermes Memory.
