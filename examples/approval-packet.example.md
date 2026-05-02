# Approval Packet — Example

This is what the skill produces when a lesson reaches `Ready` status and the
operator says "let's approve" / "send to staging". The packet is shown inline in
the chat. The operator must paste back the exact phrase at the bottom for the
skill to proceed.

---

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

Records affected:
  - courses: 0 (course already Live)
  - modules: 0 (M03 already Live)
  - lessons: 1 (M03-W02-L04, upsert)
  - lesson_qa_records: 1 (insert)
  - audit_log: will append 1 row
  - delivery_queue: 0 jobs (staging only — production sync enqueues)

Risks:
  - Lesson is in Independent tier (M3). Operator should confirm difficulty
    matches the boolean-search prerequisites in M03-W01.
  - Mission depends on LinkedIn (free or Recruiter). Alternative path noted in
    coreContent. Cloudflare validator will not flag.
  - Verification is mission-gated (paste the saved string + result count) —
    cannot be answered without doing the mission. PASS on PED-06.gameable.

Rollback:
  - If staging sync surfaces an issue, run a counter-sync with the prior lesson
    YAML version (git history). Cloudflare upserts back; status returns to
    prior value. Audit log records both writes.
  - If the lesson is brand new and there is no prior version, the rollback is
    to archive the lesson: `APPROVE ARCHIVE lessonId=M03-W02-L04 target=staging`.

Sync eligibility:
Eligible — status is Ready, target is staging. Production sync requires a
separate approval after staging verification.

To approve, reply exactly:

APPROVE LESSON_SYNC lessonId=M03-W02-L04 target=staging
```

---

## What the skill does next

If the operator's reply is exactly:

```
APPROVE LESSON_SYNC lessonId=M03-W02-L04 target=staging
```

The skill switches to **Sync Preparation** mode and produces:

1. Approval confirmation
2. Cloudflare sync payload (see `cloudflare-sync-payload.example.json`)
3. GitHub changed files
4. Audit notes
5. Rollback notes
6. Test/verification steps

If the reply is anything else — even close variants like
"approve lesson sync M03-W02-L04 staging" or "yes approve it" — the skill stays
in Approval mode and reminds the operator of the exact phrase.

---

## Variant — production approval packet

After staging is verified, the operator typically asks for the production packet.
The skill produces a near-identical packet with these differences:

```
Action:
Promote staging → production

Target:
production

Records affected:
  - lessons: 1 (M03-W02-L04, upsert to production D1)
  - lesson_qa_records: 1 (insert)
  - audit_log: will append 1 row
  - delivery_queue: will enqueue lesson.publish jobs for learners whose
    schedule reaches M03-W02-L04 on the next 9am delivery tick (estimate: 47
    learners across RWR Health, Hospoworld, Retailworld, RWR Construction)

Risks:
  - Production sync enqueues delivery to real learners on next tick. Confirm
    staging verification passed before approving.

Rollback:
  - Counter-sync with the prior production version. Pending delivery_queue
    jobs for this lesson are NOT cancelled by the counter-sync — they will
    deliver the prior content. To cancel pending jobs, follow the lesson
    delivery pause SOP in RUNBOOK.md.

To approve, reply exactly:

APPROVE LESSON_SYNC lessonId=M03-W02-L04 target=production
```

---

## Variant — archive approval packet

```
APPROVAL PACKET

Action:
Archive lesson

Target:
production

Course / Lesson:
M02-W04-L06 — "Initial outreach templates for retail roles"
Course: recruiter-foundations-12mo

Status:
Live → Archived

Records affected:
  - lessons: 1 (M02-W04-L06, status flip Live → Archived)
  - audit_log: will append 1 row
  - delivery_queue: pending jobs for this lesson will be CANCELLED (audited)
  - learner_progress: PRESERVED — historical record stays intact

Risks:
  - Learners currently mid-week-4 in M02 will not receive this lesson on the
    next tick. Confirm the rotation has a replacement or that the gap is
    intentional.

Rollback:
  - Re-approve `APPROVE LESSON_SYNC lessonId=M02-W04-L06 target=production`
    against the prior content. Status flips back to Live.

To approve, reply exactly:

APPROVE ARCHIVE lessonId=M02-W04-L06 target=production
```
