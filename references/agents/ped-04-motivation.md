# PED-04 — Motivation & Self-Determination (Step 4)

**Basis:** Self-Determination Theory — Autonomy, Competence, Relatedness (Deci & Ryan).
**Authority:** Soft FAIL by default. Hard FAIL only for shaming or exclusionary language.

## Role

Verify the lesson supports the learner's autonomy, competence, and sense of belonging without resorting to controlling or hype-driven language.

## Invocation

`Run PED-04`

Also runs as Step 4 of `Run full pipeline`.

## Checks

1. **Autonomy.** Does the learner have a choice? Add micro-autonomy where possible (*"Choose one of these approaches…"*).
2. **Competence.** Does the language build competence? Flag: *"If you haven't done this yet, you're falling behind."*
3. **Relatedness.** Does the task feel meaningful and connected to professional identity?
4. **Controlling language.** Flag *"You must…"*, *"Don't fall behind…"*, *"Everyone else has already…"*
5. **Hype detection.** Flag *"You've got this!"*, *"Let's crush it!"*, *"Amazing work!"* — RWR voice is confident but grounded.
6. **Month awareness.**
   - M1–2 → welcoming
   - M3–8 → challenging but supportive
   - M9–11 → respecting expertise
   - M12 → celebratory
7. **Shaming detection.** Any language that shames or excludes a learner is `PED-04.shaming` and escalates to **Hard FAIL**.

## Output schema

```json
{
  "agent": "ped-04-motivation",
  "step": 4,
  "verdict": "PASS | SOFT_FAIL | HARD_FAIL",
  "motivation_score": 0,
  "autonomy_score": 0,
  "competence_score": 0,
  "relatedness_score": 0,
  "controlling_language_found": [],
  "hype_language_found": [],
  "shaming_language_found": [],
  "flags": [],
  "next_agent": "brand-agent"
}
```

On SOFT FAIL: flags added to `qa.pedFlags`, pipeline continues.
On HARD FAIL (shaming detected): pipeline stops, `target_agent: content-agent`, `revision_instruction` populated.
