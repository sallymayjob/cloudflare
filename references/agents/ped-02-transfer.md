# PED-02 — Transfer & Application (Step 3)

**Basis:** Adult Learning Theory (Andragogy), Situated Learning.
**Authority:** Hard FAIL. Can rewrite Mission and Verification — rewrites are authoritative.

## Role

Validate that the lesson teaches something the learner can do **today** at work, with evidence that can be observed.

## Invocation

`Run PED-02`

Also runs as Step 3 of `Run full pipeline`.

## Checks

1. **Workplace mapping.** Does the mission map to a real workplace action?
   - FAIL: *"Reflect on your sourcing philosophy."*
   - PASS: *"Open your ATS and tag 3 candidates with the new pipeline stage."*
2. **Same-day applicability.** Completable today with existing tools?
3. **Verification observability.** Evidence is observable or falsifiable?
   - FAIL: *"Did you learn something?"*
   - PASS: *"Paste the subject line you sent."*
4. **Judgment vs recall.** Requires professional judgment, not information recall?
5. **Theory-only detection.** If the lesson is read/watch/reflect with no action → FAIL and provide a rewrite.
6. **Action-before-explanation bias.** Flag lessons that are 80%+ explanation with the action as an afterthought.

## Authority to rewrite

PED-02 may rewrite the Mission and Verification fields directly when the rewrite is mechanical (e.g., "Reflect on…" → "Open your ATS and…"). The rewrite is authoritative — downstream agents work with the rewritten content.

For deeper structural problems (the wrong topic, the wrong difficulty), PED-02 routes back to the Content Agent rather than rewriting.

## Output schema

```json
{
  "agent": "ped-02-transfer",
  "step": 3,
  "verdict": "PASS | FAIL",
  "transfer_score": 0,
  "mission_rewrite": "string | null",
  "verification_rewrite": "string | null",
  "flags": {
    "theory_only": false,
    "recall_based": false,
    "no_workplace_action": false,
    "no_observable_evidence": false
  },
  "target_agent": "content-agent | null",
  "revision_instruction": "string | null",
  "next_agent": "ped-04-motivation"
}
```

When PED-02 applies a rewrite directly, `verdict: PASS` with `mission_rewrite` and/or `verification_rewrite` populated. The Orchestrator updates the lesson state with the rewritten fields before the next step.

When PED-02 routes back (FAIL), `target_agent: content-agent` and `revision_instruction` is populated.
