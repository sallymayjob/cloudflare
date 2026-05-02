# Intake Conversation — Example Walkthroughs

Three variants showing how the intake adapts to the operator's opening message.

---

## Variant A — Vague start (full intake)

The operator opens the conversation with no specifics.

> **Operator:** Hi, let's work on the LMS today.

The skill responds with a short conversational lead-in, then asks Question 1 via the multi-choice tool.

> **Skill:** Welcome back. Quick triage before we begin — this protects the Cloudflare runtime from accidental writes and lets me explain what will and won't happen this session.
>
> [presents `ask_user_input_v0` with: Author new content · Work on existing content · Sync to Cloudflare · Archive or audit]

> **Operator:** [taps] Author new content

The skill asks Question 2.

> **Skill:** [presents `ask_user_input_v0` with: New course · New module · New lesson · Reinforcement path]

> **Operator:** [taps] New lesson

Now the skill produces the Cloudflare-effect explanation:

> **Skill:**
>
> Got it — authoring a new lesson.
>
> Cloudflare-side effects during this session:
>   D1 writes:       None until you approve a sync
>   Audit log:       None during authoring
>   Delivery queue:  None during authoring
>   Learner impact:  None
>
> What happens after this session:
>   GitHub:          One PR adding `content/courses/{courseId}/lessons/{lessonId}.yaml` and `content/courses/{courseId}/qa/{lessonId}.qa.yaml`
>   Approval gate:   Approval Packet shown when the lesson reaches Ready
>   Sync requires:   The exact phrase `APPROVE LESSON_SYNC lessonId={lessonId} target=staging`
>
> What this session WILL NOT do:
>   - Skip CMC Step 0–7
>   - Skip SOP-05 QA
>   - Mark anything Live without your exact approval phrase
>   - Write to production D1 without Cloudflare endpoint validation
>
> One thing I still need before we draft: which course / module / week / day, and a one-line topic. Reply with those plus 'Proceed' to begin.

> **Operator:** recruiter-foundations-12mo, M03-W02-L04, boolean search for niche technical roles. Proceed.

The skill records the intent and target, then transitions to **Discovery** mode (or directly to **Drafting** if the operator's brief is complete enough).

---

## Variant B — Specific start (intake compressed to confirmation)

The operator's first message already supplies action + target.

> **Operator:** Run full pipeline. Topic: writing effective boolean search strings for niche technical roles. M03-W02-L04. Independent tier. Tone tone-01.

The skill skips Questions 1 and 2 (both already answered). It goes directly to the Cloudflare-effect explanation, with the inferred intent confirmed at the top.

> **Skill:**
>
> Inferred intent: Run the content factory pipeline on a new lesson, M03-W02-L04, course `recruiter-foundations-12mo`, Independent tier, tone-01. Tell me if any of that is wrong.
>
> Cloudflare-side effects during this session:
>   D1 writes:       None during the pipeline run
>   Audit log:       None during the pipeline run
>   Delivery queue:  None during the pipeline run
>   Learner impact:  None
>
> What happens after this session:
>   If the pipeline reaches Step 9 with a Pass-tier verdict, I'll show the Approval Packet and the exact phrase you'd need to type for staging sync.
>   GitHub:          One PR for the lesson YAML + QA YAML
>   Sync requires:   `APPROVE LESSON_SYNC lessonId=M03-W02-L04 target=staging`
>
> What this session WILL NOT do:
>   - Skip any pipeline gate (PED-01, PED-02, PED-04, PED-06, QA Reviewer)
>   - Auto-promote to Live without your approval phrase
>   - Write to D1
>
> Reply 'Proceed' to start the pipeline at Step 0.

> **Operator:** Proceed.

The skill transitions to **Pipeline mode** and runs `Run Orchestrator` (Step 0). See `pipeline-run.example.md` for the full pipeline trace from there.

---

## Variant C — Mid-session pivot (intake re-triggers)

The operator was authoring a new lesson. Halfway through Drafting, they change direction.

> **Operator:** Actually, hold on — let's not do this. I want to push the M03-W01 lessons that are already Ready in GitHub. Can we sync those to production today?

The skill recognizes a pivot: the previous intent was "author new content / new lesson" and the new intent is "sync to Cloudflare / production". This re-triggers the intake at Step 2 (purpose is now clear; target needs clarification).

> **Skill:**
>
> Pivoting — got it. Quick check on the new direction before we shift Cloudflare-side.
>
> Inferred intent: Sync existing Ready lessons in M03-W01 to production. Production sync enqueues delivery jobs to real learners.
>
> [presents `ask_user_input_v0`: Production directly · Staging first, then production · Show me the Ready lessons before deciding]

> **Operator:** [taps] Staging first, then production

The skill produces the effect explanation for a two-phase sync:

> **Skill:**
>
> Two-phase sync to staging then production.
>
> Phase 1 (this session): staging
>   D1 writes:       N upserts to staging `lessons` + N inserts to staging `lesson_qa_records`
>   Audit log:       N rows in staging audit_log
>   Delivery queue:  None (staging doesn't deliver to learners)
>   Learner impact:  None
>
> Phase 2 (next session, after you verify staging): production
>   D1 writes:       Same N upserts to production
>   Delivery queue:  Will enqueue lesson.publish jobs for the next 9am delivery tick — exact learner count shown in the Approval Packet
>   Learner impact:  Learners reach M03-W01 lessons on schedule
>
> Phase 1 requires: One approval phrase per lesson (or one course-sync phrase for the batch). I'll ask which.
> Phase 2 requires: Separate approval phrases — staging approval does not authorize production.
>
> Reply 'Proceed' and I'll list the Ready M03-W01 lessons and prepare the staging Approval Packet(s).

> **Operator:** Proceed.

The skill abandons the Drafting work-in-progress (the lesson stays as a draft in operator memory; nothing was synced) and transitions to a **listing** turn followed by **Approval Mode**.

---

## What the three variants share

1. Every variant ends with the **Cloudflare-effect explanation**, even Variant B where Questions 1 and 2 were skipped. The effect explanation is the non-negotiable part of the intake — that's what the operator asked for and that's what protects the runtime.
2. Every variant ends with **explicit confirmation** before any work begins. "Proceed" is the green light.
3. Every variant **establishes the inferred intent at the top** so the operator can correct an assumption before signing off. The skill never proceeds on a silent inference.
4. Every variant respects the operator's time. Variant A asks two questions; Variant B asks zero; Variant C asks one. The intake adapts.

---

## What the intake doesn't do, even in these examples

- It doesn't promise specific learner counts, cluster IDs, or audit_log IDs. Those come from the Cloudflare response in the Result mode after the actual sync. The intake gives directional effect ("N upserts", "M queue jobs") but reserves precision for the moment of action.
- It doesn't authorize any sync. Even after `Proceed`, no D1 write happens. The exact approval phrase remains the only authorization, shown later in the Approval Packet.
- It doesn't store secrets or tokens. Cloudflare authentication is operator-supplied at the point of the actual endpoint call.
