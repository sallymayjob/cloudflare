# QA Rubric — SOP-05

Authoritative scoring rubric for lesson quality. The rubric is enforced by the **QA Reviewer agent** at Step 9 of the content factory (see `agents/qa-reviewer.md`). The PED dimensions are enforced by their corresponding agents (PED-01 through PED-07) at earlier steps.

This document is also the operator's reference when manually scoring outside the factory.

---

## SOP-05 weighted dimensions

| # | Dimension | Weight | What's checked |
|---|---|---|---|
| 1 | ULC completeness | 20% | All seven sections present in correct order: Hook, Core Content, Insight, Takeaway, Mission, Verification, Submit Block. |
| 2 | Word limits | 15% | Hook ≤ 2 sentences. Core Content ≤ 300 words. Insight ≤ 50 words / 1 sentence. Takeaway ≤ 15 words / 1 sentence. Total ≤ 500 words. |
| 3 | Brand compliance | 15% | RWR voice: confident, people-first, forward-looking. Banned words check (see brand-agent skill). Emoji count ≤ 2 from approved list. |
| 4 | Mission feasibility | 20% | Verb-first, < 5 minutes, uses tools the learner already has, alternative path provided if a paid tool is referenced. |
| 5 | Content accuracy | 20% | Practitioner-level, no fabricated statistics, no generic advice, no unverifiable claims (e.g. "3x more likely", "23% better"). |
| 6 | Continuity | 10% | Does not duplicate or directly contradict the previous five lessons in the curriculum. |

Score = weighted sum, expressed 0–100.

---

## Verdict thresholds

| Score | Verdict | Action |
|---|---|---|
| 90–100 | **Strong Pass** | Auto-approve. Candidate for "Golden Examples" library. |
| 80–89 | **Pass** | Auto-approve. |
| 60–79 | **Conditional Pass** | Auto-approve **with flag** for human spot-check. |
| 40–59 | **Soft Fail** | Loop back to drafting. Identify `target_agent` for revision. |
| 0–39 | **Hard Fail** | Immediate human review. Status drops to `NeedsRevision`. |

A lesson reaching `Ready` status requires at minimum:

- Score ≥ 80 (Pass or higher), **and**
- Verdict ∈ {Strong Pass, Pass, Conditional}, **and**
- No blocking PED flags (see below)

A lesson at score 60–79 (Conditional) reaches `Ready` but the Approval Packet must call out that human spot-check is recommended before production sync.

---

## PED flags

Pedagogical validators run alongside SOP-05. Some flags are **blocking** (must be resolved before `Ready`); others are **soft** (carried forward to QA, advisory).

| Flag ID | Source | Severity | What it means |
|---|---|---|---|
| `PED-01.cognitive-overload` | PED-01 Cognitive Load | Blocking | More than one new concept, or budget exceeded for the lesson type. |
| `PED-01.unreadable-mission` | PED-01 | Blocking | Mission cannot be executed without rereading the lesson. |
| `PED-02.theory-only` | PED-02 Transfer | Blocking | Lesson is read/watch/reflect with no real workplace action. |
| `PED-02.unobservable-verification` | PED-02 | Blocking | Verification answer is not observable or falsifiable. |
| `PED-02.recall-based` | PED-02 | Blocking | Mission requires recall, not judgment. |
| `PED-03.isolated` | PED-03 Retention | Soft | Lesson does not connect to prior concepts. |
| `PED-03.massed-practice` | PED-03 | Soft | Same concept reinforced too closely (< 3 lessons since prior). |
| `PED-03.too-spaced` | PED-03 | Soft | Reinforcement gap > 20 lessons; concept may be forgotten. |
| `PED-04.controlling-language` | PED-04 Motivation | Soft | Phrases like "you must", "don't fall behind", "everyone else has already". |
| `PED-04.hype-language` | PED-04 | Soft | "You've got this!", "let's crush it!" — RWR voice is grounded, not hype. |
| `PED-04.shaming` | PED-04 | Blocking | Language that shames or excludes learners. |
| `PED-05.missing-prerequisite` | PED-05 Sequencing | Blocking | Lesson assumes a concept not yet taught. |
| `PED-05.scaffold-jump` | PED-05 | Soft | Difficulty jumps suddenly from prior lessons. |
| `PED-06.alignment-fail` | PED-06 Assessment | Blocking | Verification doesn't align with stated objective. |
| `PED-06.gameable` | PED-06 | Blocking | Verification can be answered without doing the mission. |
| `PED-07.tool-paywall` | PED-07 Equity | Blocking when no alternative path | Mission requires a paid/restricted tool with no alternative. |
| `PED-07.cultural-assumption` | PED-07 | Soft | NZ/AU-specific reference that won't translate to other markets. |

Blocking flags must be resolved before `Ready`. Soft flags are recorded in `qa.pedFlags` and carried forward.

---

## Human override triggers — automatic Hard Fail regardless of score

The QA reviewer hard-fails any lesson that:

- Contains any banned word in final output.
- Has total word count < 150 (suspiciously thin).
- Has a verification answerable without doing the mission (gameable).
- Is in Month 1, Week 1 — all M1W1 lessons require human review unconditionally.

The skill notes these triggers in QA preparation if they apply.

---

## QA preparation vs. QA scoring

There are two paths to a scored lesson:

**Path A — Content Factory (recommended):** The operator runs `Run full pipeline` (or `Run QA` against an existing draft). The QA Reviewer agent at Step 9 produces a real `sop05Score`, `verdict`, and updated `qa.pedFlags`. Lesson promotes to `Ready` automatically when the verdict is Pass-tier and blocking PED flags are resolved. See `agents/qa-reviewer.md` and `agents/content-factory-overview.md`.

**Path B — Manual authoring:** The operator drafts a lesson outside the factory, then says "I've reviewed and it scores X with verdict Y". The skill writes `qa.sop05Score: X` and `qa.verdict: Y` into the lesson YAML and promotes status if thresholds are met. The operator's score is treated as authoritative; the skill never invents one.

The skill **never** marks a lesson as "passed QA" without one of these two paths producing a real score. A lesson at `SOP5Review` status without a score sits there until scored.

When in doubt about which path to use: factory for new content at scale, manual for one-off revisions or when the operator is in the loop on each lesson.
