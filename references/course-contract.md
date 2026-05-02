# Course Contract — Full Specification

Authoritative spec for every `content/courses/{courseId}/course.yaml` file.

---

## File location

```
content/courses/{courseId}/course.yaml
```

Sibling folders:

```
content/courses/{courseId}/modules/        # one file per module
content/courses/{courseId}/lessons/        # one file per lesson
content/courses/{courseId}/qa/             # one file per lesson QA record
```

---

## Top-level fields

| Key | Type | Required | Constraint | Notes |
|---|---|---|---|---|
| `courseId` | string | yes | kebab-case, matches folder name | e.g. `recruiter-foundations-12mo` |
| `title` | string | yes | ≤ 100 chars | Human-readable. |
| `description` | string | yes | 1–3 sentences | What this course teaches. |
| `audience` | string | yes | one of the RWR brand cohorts | e.g. `RWR Health Recruiters · NZ/AU` |
| `rolePath` | string | yes | role identifier | e.g. `recruiter-l1`, `recruiter-l2`, `team-lead`, `branch-manager` |
| `duration` | string | yes | human-readable | e.g. `12 months · 288 lessons · 6 lessons/week` |
| `status` | enum | yes | `Draft` \| `Ready` \| `Live` \| `Archived` | Course-level lifecycle. |
| `modules` | list | yes | non-empty | One entry per module. |
| `metadata` | object | yes | see below | Audit fields. |

A course's `status` is independent of any individual lesson's status. A course can be `Live` while individual modules contain `Draft` lessons that haven't yet been published — those lessons simply don't reach learners.

---

## `modules` list — entry shape

```yaml
modules:
  - moduleId:    # M## — must match a file at modules/{moduleId}.yaml
    title:       # Module title
    order:       # int 1..N — module sequence
    weeks:       # int — number of weeks in this module (typically 4)
```

The full module body lives in `content/courses/{courseId}/modules/{moduleId}.yaml`. The course file carries only the index entry.

---

## `metadata` block

```yaml
metadata:
  createdBy:    # string — operator handle
  createdAt:    # ISO-8601 UTC
  updatedAt:    # ISO-8601 UTC
  approvedBy:   # string; null until approved
  approvedAt:   # ISO-8601 UTC; null until approved
```

Course `metadata` does **not** carry `approvalPhrase`, `targetEnvironment`, or `contentHash` — those are lesson-level fields, because sync operates on lessons (or on a course-publish bundle). When a whole course is approved for sync, each constituent lesson carries its own approval record.

---

## Course-publish bundle

When the operator approves a course-level sync (`APPROVE COURSE_SYNC courseId={courseId} target={env}`), the sync prepares:

- The `course.yaml` itself.
- Every `module.yaml` referenced.
- Every `lesson.yaml` whose `status` is `Ready` (for `target=staging`) or `Live` (for `target=production`).
- The corresponding `qa/{lessonId}.qa.yaml` files.

Lessons in `Draft`, `SOP5Review`, or `NeedsRevision` are **excluded** from the bundle. The Approval Packet must list which lessons were excluded and why.

---

## Status transitions

```
Draft  ──first publish approval──▶  Live   ──archive approval──▶  Archived
       (a course skips Ready — readiness is per-lesson)
```

A course is `Ready` is **not** a real status — courses don't pass SOP-05 themselves; their lessons do.

---

## Cross-file invariants

These are checked by the PR reviewer (`github-content-pr-reviewer` skill in the compendium) and re-checked by the Cloudflare sync worker:

- Every `moduleId` in `course.yaml.modules` has a matching `modules/{moduleId}.yaml`.
- Every `moduleId` in any lesson YAML matches a module in the course.
- No duplicate `lessonId` across the entire course.
- Every lesson's `submitCommand` contains its `lessonId`.
- `rolePath` matches the role expected by the curriculum-blueprint registry (out of scope for this skill — referenced by `blueprintId` in each lesson).
