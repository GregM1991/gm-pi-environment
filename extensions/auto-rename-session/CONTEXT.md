# Auto Rename Session

This context describes how generated Pi session display names should reflect a conversation's meaning over time.

## Language

**Session Arc**:
The overall purpose and narrative direction of a session across the whole conversation.
_Avoid_: Recent task, latest turn, last 10 messages

**Active Task**:
The immediate work happening in the latest part of the session, used only as evidence for the **Session Arc**.
_Avoid_: Session title basis, rename basis

**User Goal**:
The outcome the user wants the session to achieve, phrased as an outcome rather than a topic label.
_Avoid_: Assistant activity, implementation step, tool action, neutral topic label, assistant-action verb

**Session Title**:
A concise outcome phrase for the **Session Arc**, allowed up to 15 words when extra context is needed.
_Avoid_: Fixed-length title, unnecessarily long title, over-specific technical summary

## Relationships

- A **Session Arc** spans the whole session.
- A **Session Title** describes the **User Goal**, not the assistant's current activity, assistant-action verb, or a neutral topic label.
- A **Session Title** should strive for concision without being bound to the shortest possible wording.
- A **Session Title** may use up to 15 words when needed to preserve context.
- An **Active Task** may clarify or shift a **Session Arc**, but should not replace it as the basis for the session title.

## Example dialogue

> **Dev:** "Should the title follow the last implementation step?"
> **Domain expert:** "No — the title should describe the **User Goal** across the **Session Arc**; the **Active Task** only helps interpret that arc."

## Flagged ambiguities

- "last 10 messages" was clarified as a rename cadence/window concern, not the title basis.
