---
name: code-quality-review
description: Router for code review, modernization, best-practices checks, and performance optimization audits. Use when asked to review code, assess code quality, modernize implementation, find bugs, identify performance issues, or optimize a codebase. Does not route security threat modeling; use security-review separately for security-specific work.
---

<objective>
Route code quality work to the smallest relevant specialist skill while keeping security review as a separate explicit skill.
</objective>

<routing>
Choose the narrowest specialist path that matches the user's request:

- Review staged/unstaged changes, commits, PR-ready diffs, bug risks, performance concerns, code quality, or test coverage gaps → read `/home/gm/.agents/skills/review/SKILL.md`
- Apply modern web development best practices, compatibility checks, general code quality standards, modernization, or Lighthouse-style best-practices checks → read `/home/gm/.agents/skills/best-practices/SKILL.md`
- Deep performance optimization audit, bottleneck hunting, anti-pattern detection, memory/algorithm/concurrency/cache/build/logging/infrastructure efficiency review → read `/home/gm/.agents/skills/code-optimizer/SKILL.md`
</routing>

<security_boundary>
Do not treat this router as a replacement for `security-review`.

If the user explicitly asks for a security review, threat model, vulnerability audit, auth/input/data-access review, or secure design review, use `/home/gm/.agents/skills/security-review/SKILL.md` separately. That skill remains model-invocable and intentionally outside this consolidation.
</security_boundary>

<process>
1. Determine whether the request is review, best-practices modernization, or deep optimization.
2. Read only the matching specialist skill.
3. If the request spans multiple non-security code-quality axes, read the smallest useful set of specialist skills.
4. Escalate to `security-review` only when the user asks for security-specific analysis or the task clearly touches sensitive security boundaries.
5. Produce concrete findings with severity, evidence, and remediation steps where applicable.
</process>

<success_criteria>
The relevant code-quality guidance is loaded on demand, security review remains separately routed, and the user receives focused, actionable review or optimization feedback.
</success_criteria>
