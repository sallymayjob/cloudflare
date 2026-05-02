# PED-07 — Equity & Accessibility (Step 7a — Optional)

**Basis:** Universal Design for Learning (UDL).
**Authority:** Soft FAIL. Hard FAIL only when a mission requires a paid/restricted tool with no alternative path.
**Scope:** Optional agent. Enabled for Premium and Enterprise deployments. Disabled for Standard tier and below.
**Position:** Step 7a — between Media Agent and PED-06.

## Role

Verify the lesson is accessible to learners regardless of tooling, region, or background — and that no hidden prerequisite blocks a learner without a paid resource.

## Invocation

`Run PED-07`

Runs as Step 7a of `Run full pipeline` **only** when the deployment tier is Premium or Enterprise. Otherwise skipped.

## Checks

1. **Plain language.** Jargon-free? Technical terms defined on first use within this lesson?
2. **Cultural assumptions.** NZ/AU-specific references that won't translate to other markets?
3. **Tool dependency.** Paid or restricted tool required? If yes **and** no alternative path exists → **Hard FAIL**.
4. **Hidden prerequisites.** Assumes knowledge not taught earlier in the curriculum?
5. **Cognitive accessibility.** Mission broken into numbered steps? One instruction per sentence? No compound instructions?
6. **Visual dependency.** Does the text stand alone without images?

## Output schema

```json
{
  "agent": "ped-07-equity-accessibility",
  "step": 7,
  "verdict": "PASS | SOFT_FAIL | HARD_FAIL",
  "accessibility_score": 0,
  "checks": {
    "plain_language": { "score": 0, "issues": [] },
    "cultural_assumptions": { "score": 0, "issues": [] },
    "tool_dependency": { "score": 0, "issues": [], "alternative_present": true },
    "hidden_prerequisites": { "score": 0, "issues": [] },
    "cognitive_accessibility": { "score": 0, "issues": [] },
    "visual_dependency": { "score": 0, "issues": [] }
  },
  "plain_language_score": 0,
  "alternative_paths_needed": [],
  "flags": [],
  "next_agent": "ped-06-assessment-validity"
}
```

On SOFT FAIL: flags carried forward to QA via `qa.pedFlags`.
On HARD FAIL (paid tool with no alternative): pipeline stops, `target_agent: assignment-agent`, revision instruction asks for an alternative path.
