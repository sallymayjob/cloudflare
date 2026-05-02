# PED-05 — Sequencing & Curriculum Coherence (Curriculum-Level)

**Basis:** Instructional Design, Scaffolding theory.
**Authority:** Hard FAIL for prerequisite violations. Soft FAIL for sequencing suggestions.
**Scope:** Curriculum-level. Runs during course-map planning or batch generation, not per lesson.

## Role

Confirm the curriculum builds skills in a sensible order, with prerequisites taught before concepts that depend on them.

## Invocation

`Run PED-05`

Does **not** run as part of `Run full pipeline`. Runs separately when planning a new course, restructuring a module, or before a batch sync.

## Checks

1. **Prerequisites.** Are all prerequisite concepts covered before this lesson assumes them? **Hard FAIL** on missing prerequisites.
2. **Scaffolding.** Does skill complexity increase gradually? Flag sudden jumps.
3. **Redundancy.** Any lessons teaching the same concept without adding depth?
4. **Week coherence.** Do the six lessons in this week form a logical progression?
5. **Month arc.** Does this month build meaningfully on the previous month?

## Output schema

```json
{
  "agent": "ped-05-sequencing",
  "scope": "week | month | course",
  "verdict": "PASS | SOFT_FAIL | HARD_FAIL",
  "prerequisites_met": true,
  "missing_prerequisites": [
    { "lessonId": "M03-W02-L04", "missing": ["boolean-operators-basic"], "suggested_position": "M03-W01-L02" }
  ],
  "difficulty_progression": "smooth | jumpy",
  "redundant_with": [
    { "lessonId": "M04-W02-L01", "duplicates": "M03-W02-L04" }
  ],
  "week_coherence_score": 0,
  "month_arc_assessment": "string",
  "recommendations": [
    "Move boolean basics from M03-W02-L01 to M02-W04-L06 — currently depended on a week before introduction."
  ]
}
```

On HARD FAIL (missing prerequisites): the affected lessons cannot reach `Ready` until the prerequisite is taught earlier in the curriculum.
