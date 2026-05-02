# Cloudflare Sync Rules

Authoritative spec for how content moves from approved GitHub state into Cloudflare D1.

The skill produces the payload. Cloudflare validates it independently. **Both sides verify** — Claude's approval is a necessary but not sufficient condition for a D1 write.

---

## Sync eligibility matrix

| Status | Sync to staging | Sync to production | Notes |
|---|---|---|---|
| `Draft` | ❌ | ❌ | Author working state. Not visible to learners in any environment. |
| `SOP5Review` | ❌ | ❌ | Awaiting QA. |
| `NeedsRevision` | ❌ | ❌ | QA flagged. |
| `Ready` | ✅ | ❌ | Eligible for staging. Production requires a separate approval. |
| `Live` (staging) | n/a | ✅ | Promote to production with explicit production approval. |
| `Live` (production) | n/a | n/a | Already live. Future changes follow the same flow from Draft. |
| `Archived` | ✅ archive update | ✅ archive update | Approval phrase: `APPROVE ARCHIVE`. |

---

## Endpoint contract

```
POST /admin/content-approval-sync
```

**Headers:**

```
Authorization: Bearer {CF_ADMIN_TOKEN}
Content-Type: application/json
X-Idempotency-Key: {contentHash}
```

`CF_ADMIN_TOKEN` is operator-supplied. The skill never has it. The skill never invents it.

`X-Idempotency-Key` is the SHA-256 `contentHash` of the payload's `content` block. Cloudflare uses this to deduplicate retries — a second call with the same key returns the same result without writing twice.

**Body schema:**

```json
{
  "approval": {
    "approvalPhrase": "string — the exact phrase the operator typed",
    "approvedBy": "string — operator handle",
    "approvedAt": "ISO-8601 UTC timestamp",
    "targetEnvironment": "staging | production"
  },
  "contentType": "course | module | lesson | archive",
  "content": { /* the canonical content object */ },
  "contentHash": "hex sha256 of canonical content",
  "source": "claude",
  "requestedAction": "create | update | sync | archive"
}
```

**Response — success:**

```json
{
  "ok": true,
  "syncedRecords": [
    { "table": "lessons", "id": "M03-W02-L04", "action": "upserted" },
    { "table": "lesson_qa_records", "id": "...", "action": "inserted" }
  ],
  "auditLogId": "audit-...",
  "queueJobsCreated": [
    { "jobType": "lesson.publish", "jobId": "..." }
  ],
  "environment": "staging"
}
```

**Response — failure:**

```json
{
  "ok": false,
  "error": "string code",
  "detail": "human-readable explanation",
  "retriable": false
}
```

Error codes Cloudflare returns include:

| Code | Meaning |
|---|---|
| `phrase_mismatch` | Approval phrase doesn't match expected pattern. |
| `hash_mismatch` | `contentHash` doesn't match SHA-256 of `content`. |
| `status_invalid` | Content status not eligible for the requested target. |
| `schema_invalid` | Lesson/course YAML failed Cloudflare's contract validator. |
| `qa_missing` | Status is `Ready` or `Live` but `qa.sop05Score` or `qa.verdict` absent. |
| `idempotency_conflict` | Different content already synced with this hash. |
| `auth_failed` | Bearer token invalid or insufficient scope. |
| `not_found` | Referenced `courseId` / `moduleId` doesn't exist. |
| `learner_progress_conflict` | Operation would orphan or overwrite learner progress. |

---

## What Cloudflare validates (independent of Claude)

1. Bearer token is present, valid, and scoped for `content-approval-sync`.
2. `approvalPhrase` matches the canonical pattern.
3. `contentHash` equals SHA-256 of canonical content (recomputed by Cloudflare).
4. `content` schema validates against Cloudflare's contract validator (mirror of `validate_lesson_contract.py`).
5. `status` is in the eligibility matrix for `targetEnvironment`.
6. `qa` block is complete for `Ready` / `Live` status.
7. No duplicate `lessonId` exists with conflicting content.
8. Idempotency key has not been used with different content.
9. The action does not orphan learner progress (e.g., archiving a lesson learners are mid-completion).

A failure of any of these returns `ok: false` and **no D1 write occurs**.

---

## Canonical content hash

The `contentHash` is computed over the **canonical JSON** form of `content` — keys sorted, whitespace normalized, no trailing newlines.

Reference computation in Python:

```python
import hashlib, json
canonical = json.dumps(content, sort_keys=True, separators=(",", ":"))
content_hash = hashlib.sha256(canonical.encode("utf-8")).hexdigest()
```

The validator script computes the hash and writes it to `metadata.contentHash`. The skill carries that value through to the payload.

---

## Idempotency

Same hash + same approval phrase + same target = same outcome. Cloudflare returns the original response on retry without writing again. This means:

- Network retries are safe.
- Accidentally hitting "send" twice is safe.
- Re-sending after a transient failure is safe.

But: if the content changes by even one character, the hash changes, and Cloudflare treats it as a new sync — which requires a new approval phrase. The skill never re-uses an approval across content changes.

---

## What gets written on a successful lesson sync

1. **`lessons` table** — upsert by `lessonId`. Status set to `Live (staging)` or `Live (production)` per target.
2. **`lesson_qa_records` table** — insert one row capturing `sop05Score`, `verdict`, `pedFlags`, `approvedBy`, `approvedAt`, `approvalPhrase`, `contentHash`.
3. **`audit_log` table** — append-only row: `{action, actor, timestamp, contentHash, approvalPhrase, target, ipHash}`.
4. **`delivery_queue` table** — for `target=production`, enqueue `lesson.publish` jobs for any learners whose schedule reaches this lesson on next delivery tick. Staging skips this.
5. **R2** — optional snapshot of the YAML file under `content-snapshots/{contentHash}.yaml` for forensics.

GitHub side: the operator (or a downstream automation) commits the lesson YAML to `main` after a successful staging sync, so GitHub and D1 stay aligned.

---

## What gets written on archive

1. **`lessons` table** — `status` flipped to `Archived`. Lesson removed from active rotation.
2. **`audit_log`** — archive row.
3. **`delivery_queue`** — pending jobs for this lesson are cancelled (not deleted; cancelled and audited).
4. Learner progress is **preserved** in `learner_progress` and `submissions` — historical record remains intact.

---

## Rollback

For a lesson sync:

1. Re-approve the **previous** lesson YAML version (operator pulls from git history).
2. Submit a sync with the prior content. Cloudflare upserts back to the prior state.
3. The audit log records both: forward sync and rollback.

For an archive:

1. Approve a `LESSON_SYNC ... target=production` for the same lessonId with status `Live` to restore.
2. Audit log records the un-archive.

The skill produces concrete rollback steps in every Sync Preparation output. It does **not** rely on operator memory.
