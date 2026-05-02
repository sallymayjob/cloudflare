# Content Factory — Overview

The content factory is the in-skill multi-agent pipeline that **generates** lessons from a topic brief. It runs upstream of the approval gate and the Cloudflare sync.

```
Discovery ─→ Content Factory ─→ Lesson reaches Ready ─→ Approval Packet ─→ Cloudflare D1 sync
            (this document)        (status promotion)     (existing flow)     (existing flow)
```

The factory is **not** required. The operator can still author manually (Discovery → Drafting → Review → manual scoring). The factory is the high-throughput path for generating lessons at scale (a week, a month, the full 288-lesson curriculum).

---

## Authority hierarchy

When two instructions conflict, the higher level wins. The skill never produces partial output that violates a higher level.

1. **System & Governance** — ULC structure, SOP-05 rubric, Slack format, the hard rules in `SKILL.md`. Non-negotiable.
2. **Pedagogical** — PED-01 through PED-07. Pedagogy overrides brand and content.
3. **Brand** — RWR tone, voice, terminology, banned words.
4. **Prompt** — depth and thinking constraints.
5. **User input** — topic, lesson number, context from the operator.

If a lower-priority instruction conflicts with a higher-priority rule, the skill **refuses** and explains the conflict. No "best-effort" workarounds.

---

## The 13 agents

The Cloudflare Edition runs 13 agents (the master spec's 14th — the Notion Sync agent — is replaced by the existing Cloudflare D1 sync flow described in `cloudflare-sync-rules.md`).

| Step | Agent | File | Authority |
|---|---|---|---|
| 0 | Orchestrator | `orchestrator.md` | Governance |
| 1 | Content Agent | `content-agent.md` | Creator |
| 2 | PED-01 Cognitive Load | `ped-01-cognitive-load.md` | Hard FAIL |
| 3 | PED-02 Transfer | `ped-02-transfer.md` | Hard FAIL + Rewrite |
| 4 | PED-04 Motivation | `ped-04-motivation.md` | Soft FAIL |
| 5 | Brand Agent | `brand-agent.md` | Editor |
| 6 | Assignment Agent | `assignment-agent.md` | Validator |
| 7 | Media Agent | `media-agent.md` | Coordinator |
| 7a | PED-07 Equity & Accessibility | `ped-07-equity-accessibility.md` | Soft FAIL (Premium/Enterprise only) |
| 8 | PED-06 Assessment Validity | `ped-06-assessment-validity.md` | Hard FAIL + Rewrite |
| 9 | QA Reviewer | `qa-reviewer.md` | Final Gate |
| — | PED-03 Retention | `ped-03-retention.md` | Soft FAIL — curriculum-level only |
| — | PED-05 Sequencing | `ped-05-sequencing.md` | Hard/Soft FAIL — curriculum-level only |

PED-03 and PED-05 do **not** run on individual lessons. They run against lesson sequences, on operator request, during course planning or batch generation.

---

## Invocation commands

The operator invokes a specific agent by name. When invoked, the skill adopts **only** that agent's role.

| Command | Agent activated | Step |
|---|---|---|
| `Run Orchestrator` | Orchestrator — validates inputs, injects topic brief, manages state | 0 |
| `Run Content Agent` | Content Agent — generates ULC lesson draft | 1 |
| `Run PED-01` | Cognitive Load & Clarity | 2 |
| `Run PED-02` | Transfer & Application | 3 |
| `Run PED-04` | Motivation & Self-Determination | 4 |
| `Run Brand Agent` | Brand Agent — applies RWR brand rules | 5 |
| `Run Assignment Agent` | Assignment Agent — validates mission design | 6 |
| `Run Media Agent` | Media Agent — assesses visual needs | 7 |
| `Run PED-07` | Equity & Accessibility (Premium/Enterprise) | 7a |
| `Run PED-06` | Assessment Validity | 8 |
| `Run QA` | QA Reviewer — final SOP-05 scoring | 9 |
| `Run PED-03` | Retrieval, Spacing & Retention — curriculum-level | on request |
| `Run PED-05` | Sequencing & Curriculum Coherence — curriculum-level | on request |
| `Run full pipeline` | All steps in sequence (0 → 9), with Step 7a included only if PED-07 is enabled | 0–9 |
| `Run PED sweep` | PED-01 → PED-02 → PED-04 → PED-06 | 2, 3, 4, 8 |

The operator may also speak naturally — "now check cognitive load", "brand this", "score the QA". The skill interprets and activates the correct agent.

---

## Pipeline sequence

When the operator says **`Run full pipeline`**, execute in this order. After each step, display the step verdict and wait for the operator to say `Continue` or `Revise` before proceeding.

```
Step 0:  Orchestrator        → validates inputs, injects topic brief, tracks state
Step 1:  Content Agent       → generates ULC draft
Step 2:  PED-01 Cognitive    → validates cognitive load            [Hard FAIL gate]
Step 3:  PED-02 Transfer     → validates real-world transfer       [Hard FAIL gate]
Step 4:  PED-04 Motivation   → checks motivation/autonomy          [Soft FAIL — log, continue]
Step 5:  Brand Agent         → applies RWR brand + tone
Step 6:  Assignment Agent    → validates mission design
Step 7:  Media Agent         → assesses media needs
Step 7a: PED-07 Accessibility → equity & accessibility check       [Premium/Enterprise only — Soft FAIL]
Step 8:  PED-06 Assessment   → validates verification              [Hard FAIL gate]
Step 9:  QA Reviewer         → final quality gate (SOP-05)
Post-9:  Approval Packet     → see SKILL.md and approval-workflow.md
         Cloudflare D1 sync  → see cloudflare-sync-rules.md
```

---

## FAIL routing

### Hard FAIL — gates that block the pipeline

PED-01, PED-02, PED-06, and the QA Reviewer can issue a Hard FAIL.

When a Hard FAIL is raised:

1. **Stop immediately.** Do not advance to the next step.
2. **Show** the failing agent's verdict, revision instruction, and the `target_agent` the failure routes to.
3. **Wait** for the operator to say `Revise`.
4. On `Revise`: route back to **`target_agent` only** — do not restart the full pipeline unless `target_agent` is the Content Agent.
5. **Max 2 retries per agent.** On a third failure: stop, set `publication_status: "HUMAN_REVIEW_REQUIRED"`, do not continue.

### Soft FAIL — logged, pipeline continues

PED-03, PED-04, and PED-07 produce Soft FAIL.

When a Soft FAIL is raised:

1. **Log the flag** in the lesson's `qa.pedFlags` list.
2. **Continue** to the next step.
3. The flag is carried forward to the QA Reviewer for inclusion in final scoring.

### Exception: PED-04 shaming language

`PED-04.shaming` is the one PED-04 flag that escalates to Hard FAIL. It blocks the pipeline regardless of other settings.

### Exception: PED-07 paid tool with no alternative

`PED-07.tool-paywall` is Soft FAIL by default but escalates to Hard FAIL if the mission requires a paid/restricted tool **and** no alternative path is provided.

---

## Data contract between agents

The Orchestrator validates that the output JSON from each agent is complete and all required fields are non-null **before** passing it to the next agent. Malformed output is **not** passed downstream — the Orchestrator stops and asks the operator.

Each agent's output schema is defined in its individual `.md` file. The common envelope:

```json
{
  "agent": "string — agent identifier",
  "step": 0,
  "verdict": "PASS | FAIL | SOFT_FAIL",
  "issues": [],
  "target_agent": null,
  "revision_instruction": null,
  "lesson_state": { /* the lesson object passed forward */ }
}
```

When `verdict` is `FAIL` (Hard) or `SOFT_FAIL`, `issues` lists the violations. When `verdict` is `FAIL`, `target_agent` and `revision_instruction` must be populated.

---

## Deployment tiers

The operator (or the project configuration) selects which agents are active. The factory respects the tier.

| Tier | Agents active | Use case |
|---|---|---|
| **Minimum** | PED-01, PED-02, PED-06 + Content Agent + QA Reviewer | Non-negotiable baseline. All deployments. |
| **Standard** | Minimum + PED-03, PED-04 + Brand + Assignment + Media | Recommended for the full 12-month programme. |
| **Premium / Enterprise** | Standard + PED-05, PED-07 | Multi-market or regulated deployments. |

PED-03 and PED-05 always run at **curriculum level**, never on individual lessons.
PED-07 is **disabled by default**. Enable only for Premium or Enterprise.

The Orchestrator records which tier is active in the run state and skips agents that are not enabled for the tier.

---

## How the factory connects to the rest of the skill

The factory advances a lesson from `Draft` toward `Ready` by running it through the gates. The lesson's `status` field tracks its position:

- After Step 1 (Content Agent): `status: Draft`.
- After Steps 2–4 pass: `status: Draft` (still — the factory hasn't scored yet).
- After Step 9 (QA Reviewer) passes with a real score: `status: Ready`.
- After Approval Packet + operator's exact approval phrase: `status: Live` upon Cloudflare sync confirmation.

The factory does **not** mark content `Live`. That requires the explicit approval phrase, which is operator territory only. See `../approval-workflow.md`.

---

## What the factory never does

- Never produces a "Strong Pass" verdict without actual scoring against the SOP-05 rubric.
- Never blends agent roles — when in Content Agent mode, only Content Agent's authority applies; same for every other agent.
- Never bypasses a Hard FAIL gate, even on operator instruction. The Orchestrator can be told to skip optional agents (PED-03, PED-05, PED-07) only.
- Never auto-restarts the pipeline from Step 1 on a downstream FAIL. Routing goes to `target_agent` only.
- Never marks a lesson `Ready` without a real QA score in `qa.sop05Score` and a Pass-tier verdict.
