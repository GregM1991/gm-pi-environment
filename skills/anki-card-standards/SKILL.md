---
name: anki-card-standards
description: |
  Standards for writing high-quality Anki flashcards that produce durable, applicable knowledge.
  Use when generating, reviewing, or revising Anki cards — whether via AnkiConnect or in any context
  where flashcard content is being drafted. Triggers on: "make anki cards", "create flashcards",
  "review these cards", "are these cards good", or any task involving flashcard authoring.
  Also triggers when the anki-connect skill is active and cards are being authored.
  This skill defines HOW cards should be written. The anki-connect skill defines how to PUSH them.
---

# Anki Card Authoring Standards

These standards govern how flashcard content is structured. Apply them whenever drafting, reviewing, or revising Anki cards.

## Philosophy

**Flashcards reinforce understanding; they don't create it.** A card should crystallize something the learner already grasps. If the source material is unclear, ask before generating cards.

**The goal is transfer, not performance.** A good card doesn't just get answered correctly during review — it makes the knowledge accessible when the learner needs it in real situations (debugging, system design, explaining to colleagues).

## The Five Laws

### 1. One Atomic Fact Per Card

Each card tests exactly one piece of retrievable knowledge. If answering requires recalling multiple independent facts, split the card.

**Test:** Can you imagine forgetting part of the answer while remembering the rest? If yes, split.

```
BAD:  "What are the SOLID principles?"
      → Tests 5 independent facts; failing one fails the whole card

GOOD: "What does the 'S' in SOLID stand for, and what does it mean?"
      → Single Responsibility: a class should have only one reason to change
```

### 2. Context-Independent Clarity

The card must make complete sense 6 months from now with zero external context. The reviewer's only information is what's on the card.

**Include:**
- Enough context to disambiguate the question
- Domain/language markers when terms overlap (e.g., "In TypeScript..." vs "In Python...")
- The specific framing that makes the answer unambiguous

```
BAD:  "What does 'lifting state up' mean?"
      → Ambiguous: React? General programming? State machines?

GOOD: "In React, what does 'lifting state up' mean?"
      → Moving state to a common ancestor component so multiple children can share it
```

### 3. Test Retrieval, Not Recognition

Cards should require generating knowledge, not confirming it. Recognition is easier than recall and creates false confidence.

**Avoid:**
- Yes/No questions (easily guessed, no retrieval exercised)
- "Which of these..." multiple choice framing
- Questions answerable by pattern-matching keywords

```
BAD:  "Is TypeScript structurally typed?" → Yes
      → Binary guess; no retrieval required

GOOD: "What typing system does TypeScript use, and how does it differ from nominal typing?"
      → Structural typing: compatibility is determined by shape/members, not declared type names
```

### 4. Demand Understanding Over Trivia

Prefer cards that test *why* and *when* over *what*. Facts without reasoning become orphaned knowledge — correct in review, useless in practice.

```
Lower value (pure fact):
Q: What is the time complexity of Array.includes()?
A: O(n)

Higher value (tests reasoning):
Q: Why can't Array.includes() be faster than O(n) in the worst case?
A: It must potentially check every element — no ordering or indexing guarantees early termination
```

### 5. Make the Answer Retrievable

The answer must be something the brain can "find" and verify. If it's too long, vague, or sprawling, the learner can't self-grade consistently.

**Answer characteristics:**
- Concise enough to hold in working memory
- Specific enough that partial answers feel incomplete
- Stable — not something that changes based on interpretation

## Card Type Selection

### Basic (Q&A)
Best for: definitions, single facts, direct "what/why/when" questions.

### Cloze Deletion
Best for: syntax patterns, terminology in context, procedural steps, reinforcing relationships within a sentence. Each deletion (c1, c2) becomes a separate review. Don't delete so much that remaining text gives no retrieval cue.

### Reversed Pairs
Best for: bidirectional recall where both directions genuinely matter (acronym ↔ expansion, symptom ↔ cause). Only use when you need recall in both directions — most concepts are naturally one-directional.

## Anti-Patterns

| Anti-Pattern | Problem | Fix |
|---|---|---|
| **Enumeration cards** | "Name all 7 HTTP methods" — tests list memorization, fails partially | One card per item, or mnemonic for ≤3 items |
| **Vague questions** | "Explain closures" has infinite valid answers | Ask a specific, bounded question |
| **Synonym traps** | Answer could be stated multiple valid ways, causing false failures | Constrain the question so only one formulation works |
| **Passive phrasing** | "X is used for..." encourages recognition | "When would you use X?" or "What problem does X solve?" |
| **Kitchen sink answers** | Extra "nice to know" info in the answer | Strip to minimum correct answer; make separate cards for extras |
| **Disconnected facts** | Card tests something with no connection to other knowledge | Add context connecting to concepts the learner already knows |
| **Combo cards** | Tests multiple independent facts in one card | Split into atomic cards — one fact each |

## Generating Cards from Source Material

### From documentation/notes:
1. Identify each atomic claim or concept
2. Ask: "What question would require knowing this to answer?"
3. Write that question with the atomic claim as the answer
4. Verify the question can't be answered correctly without the specific knowledge

### From code examples:
1. Identify the key insight the code demonstrates
2. Don't test the code itself — test the principle
3. Use code snippets only when syntax memorization is the goal

### From comparisons (X vs Y):
1. Focus on *differentiating* characteristics, not exhaustive descriptions
2. Ask: "When would you choose X over Y?" not "What are the differences?"
3. Make the criterion explicit in the answer

## Validation Checklist

Before finalizing each card, verify:

- [ ] **Atomic:** Tests exactly one retrievable fact
- [ ] **Unambiguous:** Only one correct answer exists
- [ ] **Context-complete:** Makes sense with no external information
- [ ] **Retrieval-based:** Requires generating, not recognizing
- [ ] **Appropriately difficult:** Answerable in under 10 seconds once learned
- [ ] **Transferable:** Knowing this helps in real situations, not just reviews

If any check fails, revise or split before outputting.

## Workflow Integration

When the `anki-connect` skill is also active:
1. Draft cards following these standards
2. Self-assess against the validation checklist
3. Present cards to user for review
4. Push approved cards via AnkiConnect

When reviewing existing cards:
1. Pull card content via AnkiConnect
2. Assess each card against the Five Laws
3. Flag violations with specific fixes
4. Offer to rewrite and update in-place
