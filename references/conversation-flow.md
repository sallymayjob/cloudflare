# Conversation Flow

Authoritative reference for the modes, their triggers, and transitions.

The skill operates conversationally. The operator should never have to invoke a mode by name. The skill identifies the operator's intent and produces the matching output.

---

## Mode 0 — Intake (runs first on every conversation)

**Triggered by:**

- The first turn of any new conversation, unless the operator's first message exactly matches an approval phrase.
- Any mid-conversation pivot in intent ("actually, let's do something else", "wait, change of plan").
- The operator saying `Run intake`, `Reset purpose`, or `What are we doing?`.

**Skill response:**

A three-step adaptive triage. Full spec: `intake-questionnaire.md`. Worked examples: `../examples/intake-conversation.example.md`.

1. **Step 1 — Purpose.** If unclear from the operator's first message, present four options via `ask_user_input_v0`: Author new content · Work on existing content · Sync to Cloudflare · Archive or audit.
2. **Step 2 — Clarify the target.** Per-purpose follow-up via `ask_user_input_v0`. Skipped if already specified.
3. **Step 3 — Cloudflare-effect explanation + confirmation.** **ALWAYS runs.** Produces a structured block listing what this session will and will not do on Cloudflare D1, audit_log, and delivery_queue. Waits for explicit `Proceed` (or operator's words) before transitioning.

**Adaptive behavior:**

- If the operator's first message names both action and target ("create lesson M03-W02-L04 on boolean search"), Steps 1 and 2 are skipped. Step 3 still runs — the Cloudflare-effect explanation is the non-negotiable part.
- If the operator types an approval phrase as their first message, Mode 0 is bypassed entirely and the skill goes to Sync Preparation. (This is an exception only — the intake should already have run earlier in the conversation.)

**What Mode 0 records:**

- Confirmed intent (Author / Work / Sync / Archive)
- Confirmed target (course / module / lesson / batch + IDs)
- Cloudflare-effect summary (D1 writes? audit rows? queue jobs? learner impact?)

These persist in run state. The Approval Packet's `Action` and `Target` fields must match the intake's intent.

**Transition out:**

- Operator confirms with `Proceed` → transition to the working mode dictated by the chosen intent (Discovery, Drafting, Pipeline, Review, Approval, etc.).
- Operator pushes back ("actually I meant…") → restart Step 1 with the correction as default.

**What Mode 0 doesn't do:**

- Doesn't authorize any sync. The exact approval phrase remains the only authorization.
- Doesn't fabricate Cloudflare-effect numbers (learner counts, audit IDs). Reserves precision for the moment of action.
- Doesn't proceed without explicit confirmation. Ambiguous responses ("ok…?" "I guess?") get a second confirmation request.

---

## Mode 1 — Discovery

**Triggered by:**

- "help me build a course"
- "I need a new lesson"
- "create onboarding"
- "make a reinforcement path"
- "design a course for {role}"
- "we need lessons on {topic}"
- Any message that signals a request for new content without specifying enough to draft.

**Skill response:**

One focused clarifying question. Pick the highest-impact unknown. The remaining unknowns get sensible defaults that the skill calls out.

For a course request, prefer asking about:

1. Target role (recruiter L1 / L2 / team lead / manager)
2. Course goal (one sentence — what should the learner be able to do after?)
3. Duration (week / month / quarter / 12-month)
4. Existing content to reuse (or: starting from scratch?)

For a lesson request, prefer asking about:

1. Course / module / week / day position (M03-W02-L04 if known)
2. Topic and objective
3. Difficulty (Guided / Independent / Strategic — defaults from month tier if not given)
4. Tone preset (defaults from month tier and lesson type)

**Transition out:**

The operator answers → skill moves to **Drafting**. If the operator says "actually, make it different" → stay in Discovery. If the operator hands the skill a finished draft and asks to validate it → jump to **Review**.

---

## Mode 2 — Drafting

**Triggered by:**

- "draft the course map"
- "write lesson L04"
- "give me the SlackThreadText"
- "generate the submit command"
- "produce the YAML"
- Any message that asks for a specific authored artifact.
- Implicitly entered after Discovery once enough inputs are collected.

**Skill response:**

The requested artifact, in the right format. For YAML, valid YAML syntax. For SlackThreadText, the Slack-ready rendering. For a course map, the full table of M01-W01-L01 through M12-W04-L06 (or the requested subset).

The skill produces the artifact and **stops**. It does not auto-advance to Approval. The operator decides when to move on.

The skill labels the artifact's status (`Draft`) and notes what's needed to advance (typically: validation + QA preparation).

**Transition out:**

- Operator says "looks good, validate it" → **Review**.
- Operator says "I want to revise X" → stay in Drafting.
- Operator says "this is ready to ship" → **Approval** (skill first runs Review and QA prep silently to confirm it's actually Ready; if not, stays in Drafting and reports why).
- Operator says `Run Content Agent` / `Run full pipeline` / any factory command → **Pipeline**.

---

## Mode 2b — Pipeline (Content Factory)

**Triggered by any factory command:**

- `Run Orchestrator`
- `Run Content Agent`
- `Run PED-01` / `Run PED-02` / `Run PED-03` / `Run PED-04` / `Run PED-05` / `Run PED-06` / `Run PED-07`
- `Run Brand Agent`
- `Run Assignment Agent`
- `Run Media Agent`
- `Run QA`
- `Run full pipeline`
- `Run PED sweep`

Also when the operator speaks naturally — "now check cognitive load", "brand this", "score it", "validate the mission" — interpret and activate the matching agent.

**Skill response:**

Adopt **only** that agent's role. Read the matching file in `references/agents/` before producing output. Each agent has a defined output schema; produce it.

For a single-agent invocation: produce that agent's output, label any FAIL with `target_agent` and `revision_instruction`, then stop.

For `Run full pipeline`: iterate through Steps 0 → 9, displaying each step's verdict and waiting for `Continue` or `Revise` between steps.

**Authority rules during Pipeline mode:**

- Don't blend agents. A `Run Brand Agent` invocation produces brand corrections only — not a QA score, not a PED check.
- Hard FAIL stops the pipeline. The skill shows the verdict and waits for `Revise`.
- Soft FAIL is logged in `qa.pedFlags` and the pipeline continues.
- On `Revise`: route back to the failing agent's `target_agent` only — never restart from Step 1 unless `target_agent` is the Content Agent.
- Max 2 retries per agent. Third failure → `publication_status: HUMAN_REVIEW_REQUIRED` and stop.

**Transition out:**

- QA Reviewer (Step 9) returns `STRONG_PASS`, `PASS`, or `CONDITIONAL` → lesson promotes to `Ready` → operator can request the Approval Packet → **Approval**.
- Hard FAIL after 3 retries → escalation; the skill remains paused until the operator intervenes.
- Operator says "stop" or "I'll take it from here" → return to **Drafting** with the lesson state preserved.

---

## Mode 3 — Review

**Triggered by:**

- "review this"
- "validate"
- "is this syncable"
- "check QA"
- "check the contract"
- "run the validator"
- Operator pastes a YAML and asks for a check.

**Skill response:**

A structured validation report:

1. **Contract validation** — does it match the lesson/course/module contract? Pass or list of violations.
2. **Word counts** — exact counts vs. limits.
3. **Brand check** — banned words, emoji count, tone preset alignment.
4. **QA preparation notes** — per-dimension notes, but **not** a score. Labelled "QA-prepared".
5. **Sync eligibility verdict** — `Eligible (target: staging)` / `Eligible (target: production, after staging verification)` / `Not eligible: {reason}`.

If the validator script is available in the environment, the skill runs it and reports the exit code and output. Otherwise, the skill walks the contract manually and reports what it sees.

**Transition out:**

- All checks pass + status is or can be promoted to `Ready` → operator can request Approval Packet → **Approval**.
- Checks fail → loop back to **Drafting** with concrete revision items.
- Operator says "score it as Strong Pass at 92" → skill writes the score, promotes to Ready, moves to Approval.

---

## Mode 4 — Approval

**Triggered by:**

- Status is `Ready` and the operator says "let's approve" / "ship it" / "ready to sync" / "send to staging".
- Operator explicitly asks for the Approval Packet.

**Skill response:**

The Approval Packet (format in `SKILL.md`, full filled example in `examples/approval-packet.example.md`).

The packet ends with the **exact approval phrase** the operator must paste back, with real IDs filled in.

The skill **stops**. It does not auto-prepare a sync. It does not pre-fetch tokens. It waits for the exact phrase.

If the operator's response is anything other than an exact approval phrase, the skill remains in Approval mode and reminds the operator of the exact phrase.

**Transition out:**

- Operator's reply matches an approval phrase exactly → **Sync Preparation**.
- Operator wants to change something → back to **Drafting**.
- Operator says "never mind, archive it" → produce a new Approval Packet for `APPROVE ARCHIVE`.

---

## Mode 5 — Sync Preparation

**Triggered by:**

- Operator's last message exactly matches an approval phrase from the most recent Approval Packet.

**Skill response:**

The full sync-ready package, in this order:

1. Approval confirmation (echo phrase, timestamp, target).
2. GitHub changed files list.
3. Cloudflare sync payload (full JSON).
4. Content hash (computed if possible, else placeholder + computation hint).
5. Audit notes (what `audit_log` will record).
6. Rollback notes (concrete revert steps).
7. Test/verification steps.

The skill updates the lesson YAML's `metadata` block (`approvedBy`, `approvedAt`, `approvalPhrase`, `targetEnvironment`, `contentHash`) and shows the updated YAML.

**Transition out:**

- A Cloudflare connector / MCP tool is available → **Endpoint Call**.
- No connector → skill explicitly says "prepared, not executed". Operator runs the request manually. Skill stays in Sync Preparation until the operator returns with a result.

---

## Mode 6 — Endpoint Call

**Triggered by:**

- Sync Preparation is complete **and** a Cloudflare connector / MCP tool exists.

**Skill response:**

A real `POST /admin/content-approval-sync` call with the prepared payload.

On success → **Result**.

On failure → show the Cloudflare error response verbatim, **do not retry**, ask the operator to investigate. If the issue is content-side (hash mismatch after edit, schema invalid), return to **Drafting**. If environmental (auth, network), stay here and let the operator resolve.

The skill never:

- Modifies the payload to "fix" a Cloudflare-side rejection.
- Retries automatically.
- Pretends a sync succeeded when it didn't.

---

## Mode 7 — Result

**Triggered by:**

- Successful endpoint call (Mode 6) returns `ok: true`.
- Or operator returns from a manual sync and pastes the success response.

**Skill response:**

A summary:

- Records synced (table + ID for each row written).
- `audit_log.id` returned.
- Queue jobs created (job IDs and types).
- Lesson `status` after sync.
- Next verification step ("test in staging Slack with `/learn`", "monitor delivery_queue for first 10 jobs", etc.).

**Transition out:**

- Operator says "now production" → produce a production Approval Packet → **Approval**.
- Operator says "looks good, we're done" → idle. Skill ends the conversation cleanly.
- Operator notices something off in staging → **Drafting** for revisions, then re-approval.

---

## Mode-detection priority

When a turn is ambiguous, resolve in this order:

1. **First turn of the conversation OR mid-session pivot** → Intake (Mode 0). Only exception: an exact approval phrase in the first message bypasses Intake. Otherwise the intake runs first.
2. **Exact approval phrase match** → Sync Preparation. Highest priority within an active conversation.
3. **Factory command** (`Run ...`) → Pipeline. Adopt the agent's role, read the agent file, produce the output schema. (Only after Intake has confirmed intent.)
4. **Validation request** ("review", "validate", "check") → Review.
5. **Authoring artifact request** ("draft", "write", "give me the YAML") → Drafting.
6. **New content request without enough detail** → Discovery.
7. **Any other course/lesson management** → use context to pick.

When in doubt, the skill asks. One question, focused.

---

## Mode signaling without naming modes

The operator should never have to think "I'm in Drafting mode now". The skill produces output that makes the mode obvious by what it contains:

- Discovery output: a question + a small set of defaults.
- Drafting output: a YAML / a SlackThreadText / a course map.
- Review output: a validation report.
- Approval output: the Approval Packet + the exact phrase.
- Sync Preparation output: the JSON payload + GitHub files + audit + rollback.
- Endpoint Call output: a tool invocation, then a result block.
- Result output: a summary + next step.

The structure speaks. The skill names a mode only when it helps the operator (e.g., "switching to approval mode — here's the packet").

---

## Bootstrapping a fresh conversation

If the operator opens with no context ("hi" / "let's work on the LMS" / "I need help"), **run Mode 0 (Intake) immediately**. Do not ask the legacy single-question opener — the intake replaces it.

If the operator opens with a specific brief ("create lesson M03-W02-L04 on boolean search"), still run Mode 0 — but skip Steps 1 and 2 and go directly to the Cloudflare-effect explanation in Step 3, with the inferred intent shown at the top for confirmation.

If the operator opens with an exact approval phrase, that's the only case that bypasses Intake. Go straight to Sync Preparation.

The intake is the only acceptable opening behavior other than these two exceptions. Anything else risks beginning work without the operator and the skill agreeing on what work is being done.
