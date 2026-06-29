---
name: web-interface-quality
description: Router for auditing and improving web interfaces across accessibility, Core Web Vitals, UX guidelines, UI implementation details, SEO, and Lighthouse-style quality checks. Use when asked to audit a site, improve web quality, check accessibility, optimize page experience, review UI/UX, or assess frontend best practices.
---

<objective>
Route web interface quality work to the smallest relevant specialist skill instead of loading every web quality skill by default.
</objective>

<routing>
Choose the narrowest specialist path that matches the user's request:

- Accessibility, WCAG, screen readers, keyboard navigation, contrast, ARIA, semantic HTML → read `/home/gm/.agents/skills/accessibility/SKILL.md`
- Core Web Vitals, LCP, INP, CLS, page experience, layout shift, loading/interactivity metrics → read `/home/gm/.agents/skills/core-web-vitals/SKILL.md`
- UI/UX implementation rules, animations, CSS, audio, typography, prefetching, icons, file:line UI findings → read `/home/gm/.agents/skills/userinterface-wiki/SKILL.md`
- Web Interface Guidelines compliance, general UI review, design audit, UX audit → read `/home/gm/.agents/skills/web-design-guidelines/SKILL.md`
- Full website/page audit across performance, accessibility, SEO, and best practices → read `/home/gm/.agents/skills/web-quality-audit/SKILL.md`
</routing>

<process>
1. Identify the user's main audit/improvement axis.
2. Read only the specialist skill(s) needed for that axis.
3. If the request spans multiple axes, read the smallest set of specialist skills that covers the work.
4. Follow the specialist skill instructions directly.
5. Prefer concrete file:line findings and actionable fixes when reviewing code.
</process>

<success_criteria>
The relevant specialist guidance is loaded on demand, unrelated web-quality guidance stays out of context, and the user receives focused web interface quality feedback or implementation changes.
</success_criteria>
