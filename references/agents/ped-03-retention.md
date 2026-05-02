# PED-03 — Retrieval, Spacing & Retention (Curriculum-Level)

**Basis:** Retrieval Practice, Spacing Effect, Desirable Difficulty (Bjork, Ebbinghaus).
**Authority:** Soft FAIL.
**Scope:** Curriculum-level. Runs on operator request against a lesson sequence — never on individual lessons.

## Role

Confirm that the curriculum reinforces and retrieves prior learning at appropriate intervals. This is not a per-lesson check — single lessons can't be evaluated for spacing.

## Invocation

`Run PED-03`

Does **not** run as part of `Run full pipeline` (which targets a single lesson). Runs separately during course planning, weekly batch generation, or when the operator asks.

## Checks

1. **Lesson type tag.** Classify each lesson in the sequence as `Introduce`, `Reinforce`, or `Apply`.
2. **Prior connections.** Does each lesson connect to previous concepts? Standalone lessons earn an `isolated` flag.
3. **Retrieval opportunity.** For `Reinforce` and `Apply` lessons, does the learner recall prior learning **without** being reminded in-lesson?
4. **Spacing.**
   - Too close (< 3 lessons since last touch) = massed practice (bad — flagged).
   - Too far (> 20 lessons) = forgotten (bad — flagged).
   - Optimal = 5–15 lessons between reinforcements.
5. **Illusion of mastery.** Passive reading + simple mission = `illusion` flag.

## Output schema

```json
{
  "agent": "ped-03-retention",
  "scope": "week | month | course",
  "verdict": "PASS | SOFT_FAIL",
  "lesson_classifications": [
    { "lessonId": "M03-W02-L04", "type": "Reinforce", "connects_to": ["M03-W01-L02"] }
  ],
  "spacing_assessment": {
    "massed_practice_pairs": [],
    "stale_concepts": [],
    "isolated_lessons": []
  },
  "recommendations": [
    "Insert a Reinforce lesson on boolean operators between M04-W02-L03 and M04-W02-L04 — current gap is 22 lessons."
  ],
  "flags": ["isolated", "massed_practice"]
}
```

On SOFT FAIL, the flags are added to each affected lesson's `qa.pedFlags`. The pipeline continues.
