# Lesson Contract — Full Specification

Authoritative spec for every `content/courses/{courseId}/lessons/{lessonId}.yaml` file.

A lesson YAML must round-trip through `scripts/validate_lesson_contract.py` cleanly before any Approval Packet is shown.

---

## File location

```
content/courses/{courseId}/lessons/{lessonId}.yaml
```

A separate QA record is stored at:

```
content/courses/{courseId}/qa/{lessonId}.qa.yaml
```

The QA file is optional in `Draft` and `SOP5Review` status. It is **mandatory** when the lesson reaches `Ready` status.

---

## Top-level fields

| Key | Type | Required | Constraint | Notes |
|---|---|---|---|---|
| `lessonId` | string | yes | matches `^M\d{2}-W\d{2}-L\d{2}$` | Must equal the filename stem and the suffix of `submitCommand`. |
| `courseId` | string | yes | kebab-case | Must match the parent folder. |
| `moduleId` | string | yes | matches `^M\d{2}$` | Must reference an existing module. |
| `week` | int | yes | 1..4 | Week within the month. |
| `day` | int | yes | 1..6 | Lesson slot within the week (six lessons per week). |
| `title` | string | yes | ≤ 80 chars | Human-readable. Sentence case. |
| `intent` | string | yes | one sentence | What outcome the lesson produces. |
| `blueprintId` | string | yes | kebab-case | Curriculum blueprint reference. Required by reviewer. |
| `difficulty` | enum | yes | `Guided` \| `Independent` \| `Strategic` | Tracks month tier (M1–3 / M4–8 / M9–12). |
| `type` | enum | yes | `daily-micro` \| `weekly-deep` \| `certification` | Daily Micro is the default. |
| `status` | enum | yes | `Draft` \| `SOP5Review` \| `NeedsRevision` \| `Ready` \| `Live` \| `Archived` | Drives sync eligibility. |
| `hook` | string | yes | ≤ 2 sentences | Curiosity opener. |
| `coreContent` | string | yes | ≤ 300 words | Practitioner-level body. No filler. |
| `insight` | string | yes | ≤ 50 words, 1 sentence | Specific, counterintuitive, or actionable. |
| `takeaway` | string | yes | ≤ 15 words, 1 sentence | Actionable. No vague platitudes. |
| `mission` | string | yes | verb-first, doable in < 5 min with available tools | Real workplace action. |
| `verification` | string | yes | 1 question | Cannot be answered without doing the mission. |
| `submitCommand` | string | yes | exactly `/submit {lessonId} complete` | Validator hard-checks this. |
| `slackThreadText` | string | yes | Slack-safe formatting | The complete message as it will render in Slack. |
| `qa` | object | yes (structure) | see below | Required keys present even if values are null in Draft. |
| `metadata` | object | yes (structure) | see below | Audit fields. |

---

## `qa` block

```yaml
qa:
  sop05Score:    # int 0..100, or null in Draft
  verdict:       # Strong Pass | Pass | Conditional | Soft Fail | Hard Fail | null
  pedFlags:      # list of strings; flag IDs from PED-01..PED-07; [] if none
```

Constraints by status:

- `Draft`: all three may be null/empty.
- `SOP5Review`: `sop05Score` must be set; `verdict` may be null.
- `NeedsRevision`: `sop05Score` and `verdict` must be set; `pedFlags` may be populated.
- `Ready`: `sop05Score` ≥ 80, `verdict` ∈ {`Strong Pass`, `Pass`, `Conditional`}, blocking PED flags resolved.
- `Live`: same as Ready, plus `metadata.approvedAt` and `metadata.approvalPhrase` set.

---

## `metadata` block

```yaml
metadata:
  createdBy:           # string — operator handle
  createdAt:           # ISO-8601 UTC, e.g. 2026-04-30T05:00:00Z
  updatedAt:           # ISO-8601 UTC
  approvedBy:          # string, set on approval; null otherwise
  approvedAt:          # ISO-8601 UTC, set on approval; null otherwise
  approvalPhrase:      # the exact phrase the operator typed; null otherwise
  targetEnvironment:   # staging | production | null
  contentHash:         # SHA-256 hex of canonical content (see cloudflare-sync-rules.md)
```

Rules:

- `createdAt` and `createdBy` are immutable after first write.
- `updatedAt` is bumped on every save.
- `approvedBy`, `approvedAt`, `approvalPhrase`, `targetEnvironment` are populated by the sync flow, not by the author.
- `contentHash` is recomputed every time the content changes. The validator computes and writes it.

---

## Word-count enforcement

The validator enforces:

| Field | Hard limit |
|---|---|
| `hook` | 2 sentences |
| `coreContent` | 300 words |
| `insight` | 50 words AND 1 sentence |
| `takeaway` | 15 words AND 1 sentence |
| Total lesson body | 500 words (hook + coreContent + insight + takeaway + mission + verification) |

Exceeding any limit is a hard fail. The validator prints exact counts.

---

## `submitCommand` rule

```
submitCommand: "/submit M03-W02-L04 complete"
lessonId:      "M03-W02-L04"
```

The validator splits `submitCommand` on whitespace and checks the second token equals `lessonId`. Mismatch is a hard fail.

---

## `slackThreadText` rule

The validator does **not** parse Slack syntax, but it does enforce:

- Field is non-empty in `Ready` and `Live` statuses.
- Contains the literal `submitCommand` somewhere in the body.
- No HTML tags (Slack doesn't render them).
- No more than 2 emojis from the approved RWR emoji list (`📘 ✍️ 💡 🎧 🎬 📊 📖`).

---

## Status transitions

```
Draft  ──save──▶  SOP5Review  ──QA score──▶  NeedsRevision  ──revise──▶  SOP5Review
                                              │
                                              └──QA pass──▶  Ready  ──approval (staging)──▶  Live (staging)
                                                                  ──approval (production)──▶  Live (production)

Live  ──archive approval──▶  Archived
```

Backwards transitions (e.g., `Ready` → `NeedsRevision`) are allowed and audited.
Live → Draft is **not** allowed; Live content is archived first, then a new Draft is created.

---

## Validator usage

```
python scripts/validate_lesson_contract.py content/courses/{courseId}/lessons/{lessonId}.yaml
```

Exit code `0` = pass. Exit code `1` = fail with structured report on stdout.

The validator must run clean before any Approval Packet is produced.
