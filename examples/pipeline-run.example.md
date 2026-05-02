# Pipeline Run — Example Trace

A complete `Run full pipeline` walkthrough from operator brief to QA pass. Tier: **Standard** (PED-07 disabled).

---

## Operator's brief

```
Run full pipeline.
Topic: Writing effective boolean search strings for niche technical roles.
Objective: Apply boolean operators to reduce candidate search results by 80%.
Month: 3, Week: 2, Lesson: 4.
Difficulty: Independent.
Tone: tone-01 (practitioner-casual).
Previous lessons covered: LinkedIn profile search basics, basic boolean AND/OR,
saved search alerts, X-ray search fundamentals, search string documentation.
```

---

## Step 0 — Orchestrator

**Reads:** `references/agents/orchestrator.md`

**Output:**

```json
{
  "agent": "orchestrator",
  "step": 0,
  "verdict": "PASS",
  "run_id": "run-20260430-053214-M03W02L04",
  "tier": "Standard",
  "active_agents": [
    "content-agent", "ped-01-cognitive-load", "ped-02-transfer",
    "ped-04-motivation", "brand-agent", "assignment-agent",
    "media-agent", "ped-06-assessment-validity", "qa-reviewer"
  ],
  "next_agent": "content-agent",
  "lesson_state": {
    "lessonId": "M03-W02-L04",
    "courseId": "recruiter-foundations-12mo",
    "moduleId": "M03",
    "week": 2,
    "day": 4,
    "type": "daily-micro",
    "difficulty": "Independent",
    "topic": "Writing effective boolean search strings for niche technical roles",
    "intent": "Apply boolean operators to reduce candidate search results by 80%",
    "tone_preset": "tone-01",
    "previous_lessons": ["LinkedIn profile search basics", "basic boolean AND/OR", "..."]
  },
  "missing_inputs": []
}
```

> **Operator:** `Continue`

---

## Step 1 — Content Agent

**Reads:** `references/agents/content-agent.md`

**Produces** the lesson YAML with all 7 ULC sections. (Full body shown in `lesson.example.yaml`.)

**Output (truncated):**

```json
{
  "agent": "content-agent",
  "step": 1,
  "verdict": "PASS",
  "lesson_state": {
    "lessonId": "M03-W02-L04",
    "status": "Draft",
    "hook": "...",
    "coreContent": "...",
    "insight": "...",
    "takeaway": "...",
    "mission": "Open LinkedIn. Pick one technical role you're working...",
    "verification": "Paste the boolean string you saved and the result count.",
    "submitCommand": "/submit M03-W02-L04 complete",
    "slackThreadText": "..."
  },
  "word_counts": {
    "hook_sentences": 2,
    "coreContent_words": 180,
    "insight_words": 24,
    "takeaway_words": 10,
    "total_words": 289
  },
  "continuity_notes": "Builds on basic AND/OR boolean from M02-W04. Introduces three-layer string structure. Does not duplicate X-ray search material from M03-W01.",
  "next_agent": "ped-01-cognitive-load"
}
```

> **Operator:** `Continue`

---

## Step 2 — PED-01 Cognitive Load

**Reads:** `references/agents/ped-01-cognitive-load.md`

**Output:**

```json
{
  "agent": "ped-01-cognitive-load",
  "step": 2,
  "verdict": "PASS",
  "concept_count": 1,
  "estimated_cognitive_minutes": 5,
  "issues": [],
  "next_agent": "ped-02-transfer"
}
```

One concept (three-layer boolean structure). Within 5-minute Daily Micro budget.

> **Operator:** `Continue`

---

## Step 3 — PED-02 Transfer

**Reads:** `references/agents/ped-02-transfer.md`

**Output:**

```json
{
  "agent": "ped-02-transfer",
  "step": 3,
  "verdict": "PASS",
  "transfer_score": 92,
  "mission_rewrite": null,
  "verification_rewrite": null,
  "flags": {
    "theory_only": false,
    "recall_based": false,
    "no_workplace_action": false,
    "no_observable_evidence": false
  },
  "next_agent": "ped-04-motivation"
}
```

Mission opens LinkedIn → real workplace action. Verification requires the saved string + result count → observable.

> **Operator:** `Continue`

---

## Step 4 — PED-04 Motivation

**Reads:** `references/agents/ped-04-motivation.md`

**Output:**

```json
{
  "agent": "ped-04-motivation",
  "step": 4,
  "verdict": "PASS",
  "motivation_score": 88,
  "autonomy_score": 90,
  "competence_score": 88,
  "relatedness_score": 86,
  "controlling_language_found": [],
  "hype_language_found": [],
  "shaming_language_found": [],
  "flags": [],
  "next_agent": "brand-agent"
}
```

> **Operator:** `Continue`

---

## Step 5 — Brand Agent

**Reads:** `references/agents/brand-agent.md`

**Output:**

```json
{
  "agent": "brand-agent",
  "step": 5,
  "verdict": "PASS",
  "changelog": [
    {
      "field": "coreContent",
      "before": "...candidates the role's title...",
      "after": "...candidates' role titles...",
      "reason": "minor possessive correction; no semantic change"
    }
  ],
  "brand_compliance_score": 94,
  "brand_voice_check": {
    "empowerment_language": true,
    "people_first": true,
    "forward_looking": true
  },
  "banned_words_found": [],
  "tone_applied": "tone-01",
  "emoji_count": 0,
  "next_agent": "assignment-agent"
}
```

> **Operator:** `Continue`

---

## Step 6 — Assignment Agent

**Reads:** `references/agents/assignment-agent.md`

**Output:**

```json
{
  "agent": "assignment-agent",
  "step": 6,
  "verdict": "PASS",
  "mission_validated": true,
  "mission": {
    "description": "Open LinkedIn. Pick one technical role you're currently working...",
    "estimated_minutes": 5,
    "difficulty_tier": "Independent",
    "submission_format": "screenshot + text",
    "tools_required": ["LinkedIn"],
    "alternative_path": "Free LinkedIn account works. Recruiter not required."
  },
  "verification": {
    "question": "Paste the boolean string you saved and the result count.",
    "expected_evidence": "A 3-layer boolean string + a numeric result count from LinkedIn",
    "mission_gated": true
  },
  "flags": [],
  "next_agent": "media-agent"
}
```

> **Operator:** `Continue`

---

## Step 7 — Media Agent

**Reads:** `references/agents/media-agent.md`

**Output:**

```json
{
  "agent": "media-agent",
  "step": 7,
  "verdict": "PASS",
  "media_required": false,
  "media_brief": null,
  "next_agent": "ped-06-assessment-validity"
}
```

Three-layer boolean structure is conveyed clearly in prose. No diagram required.

> **Operator:** `Continue`

(Step 7a — PED-07 — skipped because the tier is Standard.)

---

## Step 8 — PED-06 Assessment Validity

**Reads:** `references/agents/ped-06-assessment-validity.md`

**Output:**

```json
{
  "agent": "ped-06-assessment-validity",
  "step": 8,
  "verdict": "PASS",
  "alignment_score": 95,
  "issues": [],
  "verification_rewrite": null,
  "next_agent": "qa-reviewer"
}
```

Verification ("paste the saved string + result count") cannot be answered without doing the mission. Aligned with `intent: "Apply boolean operators to reduce candidate search results by 80%"`.

> **Operator:** `Continue`

---

## Step 9 — QA Reviewer

**Reads:** `references/agents/qa-reviewer.md`

**Output:**

```json
{
  "agent": "qa-reviewer",
  "step": 9,
  "verdict": "STRONG_PASS",
  "confidence_score": 92,
  "checks": {
    "ulc_completeness": { "score": 100, "weight": 20 },
    "word_limits": { "score": 100, "weight": 15 },
    "brand_compliance": { "score": 94, "weight": 15 },
    "mission_feasibility": { "score": 92, "weight": 20 },
    "content_accuracy": { "score": 88, "weight": 20 },
    "continuity": { "score": 90, "weight": 10 }
  },
  "ped_flags_carried_forward": [],
  "human_override_triggered": false,
  "human_override_reason": null,
  "target_agent": null,
  "revision_prompt": null,
  "golden_example_candidate": true,
  "lesson_state": {
    "lessonId": "M03-W02-L04",
    "status": "Ready",
    "qa": {
      "sop05Score": 92,
      "verdict": "Strong Pass",
      "pedFlags": []
    }
  }
}
```

Lesson promoted: `status: Ready`. Marked as a **Golden Examples** candidate (score ≥ 90).

---

## Post Step 9 — Approval Mode

The factory hands control to Approval Mode. The skill produces the Approval Packet (see `examples/approval-packet.example.md`):

```
APPROVAL PACKET

Action:
Sync new lesson to staging

Target:
staging

Course / Lesson:
M03-W02-L04 — "Writing boolean strings for niche technical roles"
Course: recruiter-foundations-12mo

Status:
Ready

QA:
  SOP-05 Score: 92
  Verdict: Strong Pass
  PED Flags: none
  Blocking Issues: none

[... full packet ...]

To approve, reply exactly:

APPROVE LESSON_SYNC lessonId=M03-W02-L04 target=staging
```

The factory has done its job. The remaining flow (operator types the exact phrase → Sync Preparation → Cloudflare D1 sync) is the existing approval/sync flow already documented in `references/approval-workflow.md` and `references/cloudflare-sync-rules.md`.

---

## Pipeline summary

| Step | Agent | Verdict | Score |
|---|---|---|---|
| 0 | Orchestrator | PASS | — |
| 1 | Content Agent | PASS | — |
| 2 | PED-01 Cognitive | PASS | — |
| 3 | PED-02 Transfer | PASS | 92 |
| 4 | PED-04 Motivation | PASS | 88 |
| 5 | Brand Agent | PASS | 94 |
| 6 | Assignment Agent | PASS | — |
| 7 | Media Agent | PASS | (no media) |
| 8 | PED-06 Assessment | PASS | 95 |
| 9 | QA Reviewer | **STRONG PASS** | **92** |

Total run time: 9 steps, no retries, no Hard FAILs.
Status transition: `Draft` → `Ready`.
Next: operator approves with the exact phrase → Cloudflare D1 sync.
