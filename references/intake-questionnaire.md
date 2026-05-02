# Intake Questionnaire

The intake is **Mode 0** — it runs at the start of every fresh conversation, before any other mode kicks in. It establishes purpose, clarifies target, and explains the Cloudflare-side consequences before any work begins.

The intake is **adaptive**: if the operator's first message already supplies the answer to a question, that question is skipped. The intake's purpose is to ensure the operator and the skill agree on (a) what we're doing and (b) what will or won't happen on the Cloudflare runtime — not to make the operator answer questions they've already answered.

---

## When the intake runs

The intake runs on the **first turn** of a conversation, in any of these cases:

1. The operator's first message is vague ("hi", "let's work on the LMS", "I need help with the platform").
2. The operator names an action but no target ("I need to create a lesson" — but doesn't say which one).
3. The operator names a target but the action is ambiguous ("about M03-W02-L04" — revise? validate? approve?).

The intake **does not run** when:

- The operator's first message exactly matches an approval phrase. That goes straight to Sync Preparation.
- The operator's first message names both a clear action and a clear target ("create lesson M03-W02-L04 on boolean search, M3 W2, Independent tier"). The skill confirms the inferred intent in the Cloudflare-effect explanation step but does not re-ask.
- The operator says `Resume` or `Continue` and the skill has prior conversation state.

---

## The questionnaire — three steps

### Step 1 — Purpose

If the primary intent is not already clear, ask:

> What are we doing in this session?

Use the `ask_user_input_v0` tool with these four options:

| Option | Covers | Likely Cloudflare effect |
|---|---|---|
| **Author new content** | New course, module, lesson, or reinforcement path | Eventually a D1 insert + audit_log + (production) queue jobs |
| **Work on existing content** | Revise text, run validation, run QA, run the factory pipeline | None during the work; D1 upsert later if synced |
| **Sync to Cloudflare** | Operator has Ready content and wants to approve + push to staging or production | D1 upsert + audit_log + (production) queue jobs |
| **Archive or audit** | Retire a lesson, inspect recent syncs, check learner-facing state | D1 status flip + cancel queue jobs (archive); none (audit) |

If the operator's first message already implies the answer, **skip this step** and confirm the inference in Step 3 instead.

### Step 2 — Clarify the target

Per-purpose follow-up. Ask only if not already given.

#### If purpose is **Author new content**

> What level are we creating?

| Option | Path |
|---|---|
| **New course** (12-month, role-based) | Discovery → course YAML + module index + lesson list |
| **New module** (4 weeks, 24 lessons) | Drafting → module YAML + lesson list |
| **New lesson** (single ULC) | Drafting → lesson YAML, optionally via factory |
| **Reinforcement path** (cross-module) | PED-03 + PED-05 curriculum-level run, then content factory |

#### If purpose is **Work on existing content**

> What kind of work?

| Option | Path |
|---|---|
| **Revise text** | Drafting mode — author edits manually |
| **Validate / check the contract** | Review mode — runs `validate_lesson_contract.py` |
| **Run QA scoring** | Pipeline mode — `Run QA` |
| **Run the full factory** | Pipeline mode — `Run full pipeline` |

#### If purpose is **Sync to Cloudflare**

> Which target?

| Option | Path |
|---|---|
| **Staging** | Approval Packet → `APPROVE LESSON_SYNC ... target=staging` → staging D1 |
| **Production** | Approval Packet → `APPROVE LESSON_SYNC ... target=production` → production D1 + queue jobs |
| **Both (staging first, then production)** | Two-phase approval — staging now, production after verification |

#### If purpose is **Archive or audit**

> Archive a lesson, or audit?

| Option | Path |
|---|---|
| **Archive a lesson** | Approval Packet → `APPROVE ARCHIVE` → D1 status flip + queue cancellation |
| **Audit recent syncs** | Read-only — no D1 writes |
| **Check learner-facing state** | Read-only — no D1 writes |

### Step 3 — Cloudflare-effect explanation + confirmation

This step **always runs**, even when Steps 1 and 2 were skipped because the operator's first message was specific.

The skill produces a short structured explanation of what will and won't happen on Cloudflare during this session, then asks for confirmation to proceed.

#### Effect template

```
Here's what this session will do, and what it won't:

Intent: [inferred or chosen]
Target: [course / module / lesson / batch]

Cloudflare-side effects during this session:
  D1 writes:        [None until sync | upsert on approval | status flip on archive | none — read-only]
  Audit log:        [Will append N rows on sync | none]
  Delivery queue:   [Will enqueue M jobs to staging / production on sync | will cancel pending jobs on archive | none]
  Learner impact:   [None (staging) | learners receive new lesson on next 9am tick (production)]

What happens after this session:
  GitHub:           [PR created with N changed files | none]
  Approval gate:    [Approval Packet shown when content reaches Ready | not applicable]
  Sync requires:    [Exact approval phrase: APPROVE ... | not applicable]

What this session WILL NOT do:
  - Skip CMC Step 0–7
  - Skip SOP-05 QA
  - Mark anything Live without your exact approval phrase
  - Write to production D1 without Cloudflare endpoint validation

Reply 'Proceed' to begin, or tell me what to change.
```

The operator's response gates everything that follows. Anything other than `Proceed` (or a near-equivalent confirmation in the operator's words) returns to Step 1 with the operator's correction.

---

## Memory rules

- The intake runs **once per conversation**. After confirmation, don't re-ask.
- If the operator pivots mid-conversation ("actually, let's do something else"), the skill **re-triggers** the intake with the previous answer carried as a default.
- The skill records the intake answers in run state (intent, target, Cloudflare-effect summary) and references them when producing the Approval Packet later — the packet's `Action` and `Target` fields must match the intake's inferred intent.

---

## Manual invocation

The operator can re-run the intake at any time by saying:

- `Run intake`
- `Reset purpose`
- `What are we doing?`

These reset the conversation's intent state and re-run the questionnaire from Step 1.

---

## What the intake never does

- Never asks more than two intake questions before the Cloudflare-effect step. Sally is a power user; the questionnaire is for clarity, not interrogation.
- Never invents the Cloudflare-effect numbers. If the skill doesn't yet know how many learners are affected by a production sync (because the lesson hasn't been mapped to enrolled learners), the effect template says `~N learners (estimated when packet is shown)` rather than fabricating a count.
- Never proceeds past Step 3 without explicit confirmation. "Sounds good", "ok", "yes" count as confirmation in plain conversation. Anything ambiguous → ask once more.
- Never skips the Cloudflare-effect explanation, even when both Steps 1 and 2 were skipped because the operator's brief was specific. The whole point of the intake is the effect explanation; everything else is auxiliary.
- Never overrides the approval gate. The intake establishes intent; it does not authorize any sync. The exact approval phrase remains the only authorization for D1 writes.
