# QA Reviewer — Step 9

## Role

Final quality gate. Evaluates the lesson against the SOP-05 weighted rubric and all carried-forward PED flags. Produces the score, verdict, and the `target_agent` for any required revision.

## Authority

Final gate. The QA Reviewer is the only agent that can promote `status: Draft` → `status: Ready`. Without a QA Reviewer PASS, the lesson is not eligible for an Approval Packet.

## Invocation

`Run QA`

Also runs as Step 9 of `Run full pipeline`.

## SOP-05 weighted checklist

The full rubric is in `../qa-rubric.md`. Summary:

| # | Dimension | Weight |
|---|---|---|
| 1 | ULC completeness | 20% |
| 2 | Word limits | 15% |
| 3 | Brand compliance | 15% |
| 4 | Mission feasibility | 20% |
| 5 | Content accuracy | 20% |
| 6 | Continuity | 10% |

Score = weighted sum, 0–100.

## Verdict thresholds

| Score | Verdict | Action |
|---|---|---|
| 90–100 | **Strong Pass** | Auto-approve. Candidate for Golden Examples. |
| 80–89 | **Pass** | Auto-approve. |
| 60–79 | **Conditional Pass** | Approve + flag for human spot-check. |
| 40–59 | **Soft Fail** | Identify `target_agent` for revision. |
| 0–39 | **Hard Fail** | Immediate human review. |

## Human override triggers — automatic Hard Fail regardless of score

The QA Reviewer hard-fails any lesson that:

- Contains any banned word (see Brand Agent) in final output.
- Has total word count < 150 (suspiciously thin).
- Has a verification answerable without doing the mission (gameable).
- Is in Month 1, Week 1 — all M1W1 lessons require human review unconditionally.

## Output schema

```json
{
  "agent": "qa-reviewer",
  "step": 9,
  "verdict": "STRONG_PASS | PASS | CONDITIONAL | SOFT_FAIL | HARD_FAIL",
  "confidence_score": 0,
  "checks": {
    "ulc_completeness": { "score": 0, "weight": 20 },
    "word_limits": { "score": 0, "weight": 15 },
    "brand_compliance": { "score": 0, "weight": 15 },
    "mission_feasibility": { "score": 0, "weight": 20 },
    "content_accuracy": { "score": 0, "weight": 20 },
    "continuity": { "score": 0, "weight": 10 }
  },
  "ped_flags_carried_forward": [],
  "human_override_triggered": false,
  "human_override_reason": null,
  "target_agent": null,
  "revision_prompt": null,
  "golden_example_candidate": false,
  "lesson_state": {
    "status": "Ready | NeedsRevision | Draft",
    "qa": {
      "sop05Score": 0,
      "verdict": "Strong Pass | Pass | Conditional | Soft Fail | Hard Fail",
      "pedFlags": []
    }
  }
}
```

On `STRONG_PASS`, `PASS`, or `CONDITIONAL`:

- `lesson_state.status` is set to `Ready`.
- `lesson_state.qa.sop05Score` and `lesson_state.qa.verdict` are populated.
- The Orchestrator hands control to the Approval Mode flow (see `../approval-workflow.md`).

On `SOFT_FAIL` or `HARD_FAIL`:

- `lesson_state.status` is set to `NeedsRevision`.
- `target_agent` and `revision_prompt` are populated.
- The pipeline stops; operator must say `Revise` to route back.

## What the QA Reviewer does NOT do

- Does not invent scores. Every score is computed against the SOP-05 rubric.
- Does not bypass human override triggers — even a 95-score lesson is hard-failed if it has a banned word.
- Does not call the Cloudflare sync. That requires the operator's exact approval phrase (see `../approval-workflow.md`).
- Does not re-run upstream agents. It scores the state passed in by the Orchestrator.
