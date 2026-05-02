# Approval Workflow — Step by Step

Authoritative procedure for every approval gate this skill operates.

The skill never skips a step. The skill never accepts approximate approval.

---

## Step 1 — Author produces a draft

Operator and skill collaborate (Discovery → Drafting modes) to produce:

- A lesson YAML, **or**
- A module YAML + its lesson set, **or**
- A whole course bundle.

Status at this point: `Draft`.

---

## Step 2 — Skill validates the contract

Skill runs (or simulates) `scripts/validate_lesson_contract.py` against every lesson YAML in scope.

Outcome:

- **Pass**: status promotes to `SOP5Review`. Continue.
- **Fail**: skill reports each violation, status stays `Draft`. Loop back to Step 1.

The skill does **not** show an Approval Packet for content that fails the contract validator.

---

## Step 3 — Skill prepares QA notes

Skill produces, per lesson:

- ULC completeness check
- Word-limit check (already covered by validator but called out for the operator)
- Brand-compliance preview (banned words scan, emoji count, tone preset)
- Mission-feasibility note
- Continuity note (if previous-five-lessons context was provided)
- PED-01 cognitive-load note
- PED-02 transfer note
- PED-04 motivation note
- PED-06 assessment-validity note

These are **prepared** — not scored. Status remains `SOP5Review`.

The skill labels every lesson as `QA-prepared` rather than claiming it passed QA. Actual scoring is the QA Reviewer agent's responsibility (separate skill in the compendium: `qa-reviewer`).

---

## Step 4 — QA scoring (out of skill scope, but tracked)

Either:

- The operator runs the `qa-reviewer` skill and pastes the verdict back, **or**
- The operator manually scores against the rubric and updates the `qa` block.

The skill updates `qa.sop05Score`, `qa.verdict`, `qa.pedFlags` in the lesson YAML.

Status transitions:

- `SOP5Review` → `Ready` if score ≥ 80, verdict ∈ {Strong Pass, Pass, Conditional}, no blocking PED flags.
- `SOP5Review` → `NeedsRevision` otherwise. Loop back to Step 1.

---

## Step 5 — Skill shows the Approval Packet

Status is now `Ready`.

The skill produces the Approval Packet (format in `SKILL.md`, filled example in `examples/approval-packet.example.md`).

The packet ends with the **exact approval phrase** the operator must paste back.

Crucially, the skill **stops here** and waits. No sync preparation, no payload, no endpoint call. Just the packet and the phrase.

---

## Step 6 — Operator types an approval phrase

The operator's response must match exactly one of:

```
APPROVE COURSE_SYNC courseId={courseId} target=staging
APPROVE COURSE_SYNC courseId={courseId} target=production
APPROVE LESSON_SYNC lessonId={lessonId} target=staging
APPROVE LESSON_SYNC lessonId={lessonId} target=production
APPROVE ARCHIVE lessonId={lessonId} target=staging
APPROVE ARCHIVE lessonId={lessonId} target=production
```

Match rules:

- Whitespace is normalized to single spaces, but the keyword sequence must match exactly.
- IDs (`{courseId}`, `{lessonId}`) are case-sensitive.
- `target=` value is lowercase only — `staging` and `production`, never `Staging` or `PROD`.
- Anything that resembles approval but isn't exact is **not** approval. The skill replies with the exact phrase to copy/paste and waits.

What does **not** count as approval:

- "yes" / "go" / "ship it" / "approved" — vague.
- "APPROVE LESSON_SYNC M03-W02-L04 staging" — wrong format (missing `lessonId=` and `target=` keys).
- "approve lesson_sync lessonId=M03-W02-L04 target=staging" — wrong case on `APPROVE` and `LESSON_SYNC`.
- Approving a different ID than the one in the packet.

---

## Step 7 — Skill prepares the sync payload

Now in Sync Preparation mode. The skill produces, in this order:

1. **Approval confirmation** — echoes the exact phrase, the timestamp, and the target environment.
2. **GitHub changed files** — the exact list of paths that need to be created/modified/deleted.
3. **Cloudflare sync payload** — the JSON in the shape from `examples/cloudflare-sync-payload.example.json`. The skill computes `contentHash` if it can (SHA-256 over canonical content), otherwise emits `"<COMPUTE_BEFORE_SEND>"` and a one-liner showing how to compute it.
4. **Audit notes** — what `audit_log` row(s) Cloudflare will append.
5. **Rollback notes** — concrete steps to revert (which D1 row to flip back, which queue jobs to cancel, which GitHub commit to revert).
6. **Test/verification steps** — how the operator confirms the sync landed.

The lesson YAML's `metadata` block is updated:

```yaml
metadata:
  approvedBy: "{operator}"
  approvedAt: "{utc-iso8601}"
  approvalPhrase: "{exact phrase}"
  targetEnvironment: "{staging|production}"
  contentHash: "{sha256 hex}"
```

---

## Step 8 — Endpoint call (if connector exists)

If a Cloudflare connector / MCP tool is available, the skill calls:

```
POST /admin/content-approval-sync
```

with the payload from Step 7.

The skill waits for the response. On success, it transitions to Result mode (Step 9). On failure, it shows the error verbatim, **does not retry**, and asks the operator to investigate.

If no connector is available, the skill says explicitly:

> The sync payload is **prepared, not executed.** Send the payload to the endpoint shown above with the operator-supplied bearer token. The skill will not call the endpoint because no Cloudflare connector is available in this environment.

The skill never simulates a successful sync.

---

## Step 9 — Result

Skill summarizes:

- Records synced (with IDs)
- `audit_log.id` returned by Cloudflare
- Queue jobs created (job IDs and types)
- Lesson `status` after sync (`Live` for `target=production`, `Live (staging)` annotation for staging)
- Next verification step (typically: "send a test `/learn` command in the staging Slack workspace and confirm the lesson renders")

---

## Exception paths

### A — Operator changes their mind after seeing the packet

Operator says "wait, change X". The skill:

1. Returns to Drafting mode.
2. Updates the YAML.
3. Re-runs validation (Step 2).
4. Re-prepares QA notes (Step 3).
5. Re-issues the Approval Packet (Step 5).

The skill does **not** carry forward an Approval Packet across content changes. Every change resets the approval state.

### B — Operator types a phrase for the wrong ID

Skill replies:

> The ID in your approval phrase doesn't match the packet. The packet was for `{packetId}`; your phrase referenced `{operatorId}`. If you want to approve `{packetId}`, copy/paste the exact phrase below. If you want to approve a different lesson, ask me to prepare a new packet for it.

No sync. The skill does not "guess" the operator's intent.

### C — Operator approves staging, then asks for production "now"

A staging approval does **not** imply production approval. The operator must type the production approval phrase separately.

A reasonable pattern: approve staging → verify in staging → request production packet → approve production. The skill explicitly walks this path.

### D — Endpoint call returns a Cloudflare-side validation failure

Cloudflare may reject for reasons including:

- Hash mismatch (content was edited between approval and call)
- Status mismatch (lesson moved out of Ready before sync)
- Idempotency conflict (this `contentHash` was already synced)
- Schema violation (Cloudflare runs its own contract validator)
- Auth failure

The skill shows the Cloudflare response verbatim. It does not retry, does not "fix" the payload, does not pretend success. It returns to Drafting mode if the issue is content-side, or asks the operator to investigate auth/network if the issue is environmental.

### E — Operator wants to archive a Live lesson

Different approval phrase: `APPROVE ARCHIVE lessonId={lessonId} target=production`. Different sync flow:

- `contentType` in the payload is `archive`.
- `requestedAction` is `archive`.
- Cloudflare flips the D1 lesson row's `status` to `Archived` and removes it from the active delivery rotation. Learner progress is preserved.
- Audit log records the archive with the approval phrase.
- Rollback for archive: flip back to `Live` via a separate approval.

---

## What the skill never does

- Never accepts an approval phrase that wasn't shown in an Approval Packet.
- Never re-uses an old approval for new content.
- Never claims a sync happened without a Cloudflare response confirming it.
- Never writes secrets to YAML.
- Never invents resource IDs, account IDs, or tokens.
- Never bypasses the validator before showing an Approval Packet.
