# PED Hard FAIL — Routing Example

A walkthrough of what happens when a downstream gate fails. This example shows PED-02 issuing a Hard FAIL on a "theory-only" mission, the routing back to the Content Agent, and the second-pass success.

---

## Setup

The operator has already run Steps 0 and 1. The Content Agent produced a lesson with this mission and verification:

```yaml
mission: >
  Reflect on your sourcing philosophy. Consider what makes a strong outreach
  message. Think about how your approach has evolved.
verification: >
  What did you learn about your sourcing philosophy?
```

> **Operator:** `Continue`

---

## Step 3 — PED-02 Transfer issues a Hard FAIL

**Reads:** `references/agents/ped-02-transfer.md`

**Output:**

```json
{
  "agent": "ped-02-transfer",
  "step": 3,
  "verdict": "FAIL",
  "transfer_score": 28,
  "mission_rewrite": null,
  "verification_rewrite": null,
  "flags": {
    "theory_only": true,
    "recall_based": false,
    "no_workplace_action": true,
    "no_observable_evidence": true
  },
  "issues": [
    {
      "type": "theory_only",
      "detail": "Mission is 'reflect / consider / think' with no real workplace action.",
      "severity": "blocking",
      "location": "mission"
    },
    {
      "type": "no_observable_evidence",
      "detail": "Verification 'what did you learn' has no observable answer — any text passes.",
      "severity": "blocking",
      "location": "verification"
    }
  ],
  "target_agent": "content-agent",
  "revision_instruction": "Rewrite the mission to require a real workplace action a recruiting professional can complete in <5 minutes today, using LinkedIn / ATS / email / Slack. Rewrite the verification to require observable evidence (a pasted message, a screenshot, a link, or a metric). The new verification must be answerable only by someone who completed the new mission."
}
```

**The skill stops** and shows the verdict + revision instruction to the operator.

---

## Operator decides

The skill displays:

```
PED-02 issued a Hard FAIL.

Issues:
  1. theory_only — Mission is 'reflect / consider / think' with no real
     workplace action.
  2. no_observable_evidence — Verification 'what did you learn' has no
     observable answer; any text passes.

Routing target: content-agent (rewrite required)
Retry count for content-agent: 0 of 2 allowed

Revision instruction:
  Rewrite the mission to require a real workplace action a recruiting
  professional can complete in <5 minutes today, using LinkedIn / ATS /
  email / Slack. Rewrite the verification to require observable evidence
  (a pasted message, a screenshot, a link, or a metric). The new
  verification must be answerable only by someone who completed the new
  mission.

Reply 'Revise' to route back to the Content Agent with this instruction,
or 'Stop' to halt the pipeline and return to drafting.
```

> **Operator:** `Revise`

---

## Routing — back to Content Agent only

The Orchestrator does **not** restart the pipeline from Step 0. It routes **only** to the `target_agent` from the FAIL:

```
Pipeline state:
  current_step: 1 (Content Agent — re-run)
  retry_counts: { content-agent: 1 }
  status: in_progress
```

Step 1 re-runs with the revision instruction injected as additional context.

---

## Step 1 (retry 1) — Content Agent rewrites

**Output:**

```json
{
  "agent": "content-agent",
  "step": 1,
  "verdict": "PASS",
  "lesson_state": {
    "mission": "Open your ATS. Pick one candidate you've been holding warm for >14 days. Send them a 3-line message that references the specific role you're now considering them for. Keep it under 60 words.",
    "verification": "Paste the message you sent (you can redact the candidate's name). The message must be 3 lines or fewer and reference a specific role.",
    ...
  },
  "word_counts": { "total_words": 287 },
  "continuity_notes": "Reuses outreach-message-structure from M02-W04. New: 14-day dormant pipeline trigger.",
  "next_agent": "ped-01-cognitive-load"
}
```

> **Operator:** `Continue`

---

## Pipeline resumes — Step 2 (PED-01)

PED-01 re-runs from the rewritten lesson (the revision didn't affect cognitive load — same single concept).

```json
{
  "agent": "ped-01-cognitive-load",
  "step": 2,
  "verdict": "PASS",
  "concept_count": 1,
  "estimated_cognitive_minutes": 5,
  "issues": []
}
```

> **Operator:** `Continue`

---

## Step 3 (retry) — PED-02 re-evaluates

PED-02 re-runs against the new mission and verification.

```json
{
  "agent": "ped-02-transfer",
  "step": 3,
  "verdict": "PASS",
  "transfer_score": 91,
  "mission_rewrite": null,
  "verification_rewrite": null,
  "flags": {
    "theory_only": false,
    "recall_based": false,
    "no_workplace_action": false,
    "no_observable_evidence": false
  },
  "issues": [],
  "next_agent": "ped-04-motivation"
}
```

The mission ("Open your ATS. Send a 3-line message…") is a real workplace action. The verification ("paste the message you sent") is observable. PASS.

The pipeline continues to Step 4, then Step 5, etc., as in the normal-path example.

---

## Key behaviors demonstrated

1. **Hard FAIL stops the pipeline.** No silent continuation, no "best-effort" pass.
2. **Routing is targeted.** PED-02 set `target_agent: content-agent`. The skill routed there only — not back to Step 0.
3. **Retry counter increments.** `retry_counts.content-agent: 0 → 1`. After two retries, a third failure on the same agent escalates to `HUMAN_REVIEW_REQUIRED`.
4. **Pipeline resumes from the routing target.** After the Content Agent re-runs, the pipeline goes back through Step 2 (PED-01) on the rewritten content, even though PED-01 had previously passed. This catches the case where a rewrite breaks an earlier check.
5. **The factory does not auto-approve.** The operator must say `Revise` to authorize the retry. The skill never silently re-runs.

---

## Escalation case — three failures on the same agent

If PED-02 had failed a second time after the rewrite, the retry counter would increment to 2. A third failure would trigger:

```json
{
  "agent": "orchestrator",
  "publication_status": "HUMAN_REVIEW_REQUIRED",
  "reason": "content-agent exceeded max retries (2) with PED-02 still failing",
  "lesson_state": { "status": "NeedsRevision" },
  "history": [
    { "step": 1, "agent": "content-agent", "verdict": "PASS", "attempt": 1 },
    { "step": 3, "agent": "ped-02-transfer", "verdict": "FAIL", "attempt": 1 },
    { "step": 1, "agent": "content-agent", "verdict": "PASS", "attempt": 2 },
    { "step": 3, "agent": "ped-02-transfer", "verdict": "FAIL", "attempt": 2 },
    { "step": 1, "agent": "content-agent", "verdict": "PASS", "attempt": 3 },
    { "step": 3, "agent": "ped-02-transfer", "verdict": "FAIL", "attempt": 3 }
  ]
}
```

The skill stops. The lesson sits at `status: NeedsRevision`. The operator must intervene manually — either revise the topic itself, lower the difficulty tier, or accept that this lesson requires a human author. The factory does not loop forever on a stuck case.
