# GitHub Content Paths

Authoritative spec for where content files live in the GitHub repo and how PRs should be structured.

GitHub is the **content source-control authority** for the Cloudflare Edition. Cloudflare D1 is the runtime authority. Content flows GitHub → D1, never the other way.

---

## Repository layout

```
{repo-root}/
├── content/
│   └── courses/
│       └── {courseId}/
│           ├── course.yaml
│           ├── modules/
│           │   ├── M01.yaml
│           │   ├── M02.yaml
│           │   └── ...
│           ├── lessons/
│           │   ├── M01-W01-L01.yaml
│           │   ├── M01-W01-L02.yaml
│           │   └── ...
│           └── qa/
│               ├── M01-W01-L01.qa.yaml
│               └── ...
├── cloudflare_ts_project/      # Worker code, D1 migrations, etc.
└── docs/
```

---

## ID conventions

| ID | Pattern | Example |
|---|---|---|
| `courseId` | kebab-case, ≤ 60 chars | `recruiter-foundations-12mo` |
| `moduleId` | `M{NN}` zero-padded | `M03` |
| `lessonId` | `M{NN}-W{NN}-L{NN}` zero-padded | `M03-W02-L04` |
| `blueprintId` | kebab-case | `boolean-search-niche-roles` |

Filenames must match IDs exactly (case-sensitive).

---

## File naming rules

- One YAML file per entity.
- Filenames lowercase except for `M`, `W`, `L` letters in lesson/module IDs.
- No spaces, no underscores in filenames (use hyphens in courseId / blueprintId; use the strict ID pattern for module/lesson).
- File extension is always `.yaml` (not `.yml`).
- Line endings LF (Unix). UTF-8 without BOM.

---

## PR conventions

### Branch naming

```
content/{courseId}/{action}/{scope}
```

Examples:

```
content/recruiter-foundations-12mo/add-lesson/M03-W02-L04
content/recruiter-foundations-12mo/revise-lesson/M03-W02-L04
content/recruiter-foundations-12mo/add-module/M04
content/recruiter-foundations-12mo/archive/M02-W04-L06
```

### PR title

```
[content] {courseId}: {action} {scope}
```

Example:

```
[content] recruiter-foundations-12mo: add lesson M03-W02-L04
```

### PR summary — required sections

The skill produces this for every sync-ready output. Filled example in `examples/pr-summary.example.md`.

```markdown
## Action
{create / update / archive} {course|module|lesson}

## Scope
{courseId}, {moduleId}, {lessonId}

## Status transition
{from-status} → {to-status}

## Files changed
- content/courses/{courseId}/lessons/{lessonId}.yaml  (created|modified|deleted)
- content/courses/{courseId}/qa/{lessonId}.qa.yaml    (created|modified|deleted)

## QA
SOP-05 Score: {score}
Verdict: {verdict}
PED Flags: {list or none}

## Approval
Approval phrase: {exact phrase}
Approved by: {operator}
Approved at: {iso timestamp}
Target: {staging|production}
Content hash: {sha256 hex}

## Risks
- {risk list}

## Rollback
- {rollback steps}

## Acceptance criteria
- [ ] PR reviewer ran github-content-pr-reviewer skill
- [ ] All YAML files validate against scripts/validate_lesson_contract.py
- [ ] Cloudflare staging sync returns ok:true
- [ ] Test /learn command in staging Slack returns the expected lesson
- [ ] Audit log entry visible in D1 audit_log table
```

---

## Which files trigger sync

A merged PR to `main` does **not** automatically sync to Cloudflare. The sync is initiated separately by the operator typing an approval phrase in the Claude conversation. This decouples GitHub merge from runtime publication and prevents accidental production writes from PR auto-merge.

The recommended operator flow:

1. Operator collaborates with this skill, produces a draft.
2. Operator commits the draft to a feature branch and opens a PR.
3. PR review uses the `github-content-pr-reviewer` skill.
4. PR is merged to `main` — content is now in source control but not yet running.
5. Operator returns to this skill and types the staging approval phrase. Sync to staging D1.
6. Operator verifies in staging Slack.
7. Operator types the production approval phrase. Sync to production D1.

---

## Cross-file invariants checked at PR review

- Every `moduleId` referenced in `course.yaml.modules` exists at `modules/{moduleId}.yaml`.
- Every lesson's `moduleId` references an existing module.
- Every lesson's `courseId` matches the parent folder.
- No duplicate `lessonId` across the entire course.
- Every lesson's `submitCommand` second token equals its `lessonId`.
- For status `Ready` / `Live`, the matching `qa/{lessonId}.qa.yaml` exists and has `sop05Score` and `verdict` set.

The PR reviewer blocks merge on any invariant failure.

---

## What lives outside `content/`

- `cloudflare_ts_project/` — Worker code, D1 migrations, queue consumers. Not touched by this skill; that's `cloudflare-worker-runtime-writer`'s territory.
- `docs/` — operator-facing docs.
- `.github/workflows/` — CI for content validation. The validator script is run on every PR.
- `RUNBOOK.md`, `DEPLOYMENT.md`, `RELEASE_NOTES.md` — operations.

This skill produces files **only** under `content/`. The operator may also need to update the runtime code when introducing a new lesson type or new ULC section — that's a separate skill's job.
