import { fail, ok } from "./response";
import { requireBearer, verifySlackRequest } from "./security";
import type { Env, SyncPayload } from "./types";

const allowedStatuses = new Set(["Ready", "Live", "Archived"]);

async function sha256(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(value, Object.keys(value as Record<string, unknown>).sort());
}

function parseApprovalPhrase(phrase: string) {
  const m = /^APPROVE_SYNC lesson:([^\s]+) course:([^\s]+) target:(staging|production)$/.exec(phrase.trim());
  if (!m) return null;
  return { lessonId: m[1], courseId: m[2], target: m[3] as "staging" | "production" };
}

async function insertAudit(env: Env, actor: string, action: string, entityType: string, entityId: string, status: string, metadata: unknown) {
  await env.DB.prepare("INSERT INTO audit_logs (id, actor, action, entity_type, entity_id, status, metadata_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(crypto.randomUUID(), actor, action, entityType, entityId, status, JSON.stringify(metadata || {}), new Date().toISOString()).run();
}

async function isDuplicateSlackRequest(env: Env, dedupeKey: string, requestType: string): Promise<boolean> {
  const row = await env.DB.prepare("SELECT id FROM slack_request_dedupe WHERE dedupe_key = ?").bind(dedupeKey).first();
  if (row) return true;
  await env.DB.prepare("INSERT INTO slack_request_dedupe (id, dedupe_key, request_type, created_at) VALUES (?, ?, ?, ?)")
    .bind(crypto.randomUUID(), dedupeKey, requestType, new Date().toISOString()).run();
  return false;
}

async function handleSync(req: Request, env: Env, requestId: string) {
  if (!requireBearer(req, env.ADMIN_SYNC_TOKEN)) return fail("auth_failed", "Missing/invalid bearer token", requestId, 401);
  const idem = req.headers.get("Idempotency-Key");
  if (!idem) return fail("idempotency_missing", "Missing Idempotency-Key header", requestId, 400);

  const payload = (await req.json()) as SyncPayload;
  if (!payload.approval?.approvalPhrase || !payload.approval?.approvedBy || !payload.approval?.approvedAt) return fail("approval_missing", "Missing approval metadata", requestId, 400);
  if (!payload.contentHash) return fail("hash_missing", "Missing contentHash", requestId, 400);

  const phrase = parseApprovalPhrase(payload.approval.approvalPhrase);
  if (!phrase) return fail("phrase_mismatch", "Malformed approval phrase", requestId, 400);
  if (payload.content?.lessonId !== phrase.lessonId) return fail("phrase_mismatch", "Approval lesson mismatch", requestId, 400);
  if (payload.content?.courseId !== phrase.courseId) return fail("phrase_mismatch", "Approval course mismatch", requestId, 400);
  if (payload.approval.targetEnvironment !== phrase.target) return fail("phrase_mismatch", "Approval target mismatch", requestId, 400);

  const status = payload.content?.status;
  if (!allowedStatuses.has(status)) return fail("status_invalid", `Status ${status} not syncable`, requestId, 400);

  const computed = await sha256(canonicalJson(payload.content));
  if (computed !== payload.contentHash) return fail("hash_mismatch", "contentHash mismatch", requestId, 400);

  const existing = await env.DB.prepare("SELECT id, result_json FROM approvals WHERE idempotency_key = ?").bind(idem).first<any>();
  if (existing) return ok(JSON.parse(existing.result_json || "{}"), requestId);

  const now = new Date().toISOString();
  const contentId = payload.content.lessonId || payload.content.courseId;
  if (!contentId) return fail("schema_invalid", "content missing lessonId/courseId", requestId, 400);
  if (payload.contentType === "lesson" && !payload.content.courseId) return fail("schema_invalid", "lesson content missing courseId", requestId, 400);
  if (payload.contentType === "lesson" && !payload.content.title) return fail("schema_invalid", "lesson content missing title", requestId, 400);

  await env.DB.batch([
    env.DB.prepare("INSERT INTO courses (id, title, status, content_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET title=excluded.title, status=excluded.status, content_json=excluded.content_json, updated_at=excluded.updated_at")
      .bind(payload.content.courseId, payload.content.courseTitle || payload.content.courseId, payload.content.status, JSON.stringify({ courseId: payload.content.courseId, title: payload.content.courseTitle || payload.content.courseId }), now, now),
    ...(payload.content.moduleId ? [
      env.DB.prepare("INSERT INTO modules (id, course_id, title, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET course_id=excluded.course_id, title=excluded.title, status=excluded.status, updated_at=excluded.updated_at")
        .bind(payload.content.moduleId, payload.content.courseId, payload.content.moduleTitle || payload.content.moduleId, payload.content.status, now, now),
    ] : []),
    env.DB.prepare("INSERT OR REPLACE INTO lessons (id, course_id, module_id, title, status, slack_message, content_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, COALESCE((SELECT created_at FROM lessons WHERE id = ?), ?), ?)")
      .bind(payload.content.lessonId, payload.content.courseId, payload.content.moduleId, payload.content.title, payload.content.status, payload.content.slackThreadText || "", JSON.stringify(payload.content), payload.content.lessonId, now, now),
  ]);

  await env.DB.prepare("INSERT INTO approvals (id, idempotency_key, content_hash, approval_phrase, approved_by, approved_at, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(crypto.randomUUID(), idem, payload.contentHash, payload.approval.approvalPhrase, payload.approval.approvedBy, payload.approval.approvedAt, "approved", now, now).run();

  const queueRows: string[] = [];
  if (payload.publish_mode === "queue" && payload.contentType === "lesson") {
    const queueId = crypto.randomUUID();
    await env.DB.prepare("INSERT INTO lesson_queue (id, lesson_id, workspace_id, status, due_at, attempts, max_attempts, idempotency_key, created_at, updated_at) VALUES (?, ?, ?, 'queued', ?, 0, 3, ?, ?, ?)")
      .bind(queueId, payload.content.lessonId, payload.content.workspaceId || "default", now, `${idem}:${payload.content.lessonId}`, now, now).run();
    await env.DELIVERY_QUEUE.send({ queueId, lessonId: payload.content.lessonId, workspaceId: payload.content.workspaceId || "default" });
    queueRows.push(queueId);
  }

  const result = { syncedRecords: [{ table: "lessons", id: contentId, action: "upserted" }], queueRows };
  await env.DB.prepare("UPDATE approvals SET result_json = ? WHERE idempotency_key = ?").bind(JSON.stringify(result), idem).run();
  await insertAudit(env, payload.approval.approvedBy, "content_sync", payload.contentType, contentId, "success", { idem, requestId });
  return ok(result, requestId);
}

async function handleSlackEvents(req: Request, env: Env, requestId: string) {
  const verified = await verifySlackRequest(req, env, requestId);
  if (!verified.ok) return verified.response;
  const body = JSON.parse(verified.body || "{}");
  if (body.type === "url_verification") return Response.json({ challenge: body.challenge });
  const dedupeKey = body.event_id ? `event:${body.event_id}` : `eventhash:${await sha256(verified.body)}`;
  if (await isDuplicateSlackRequest(env, dedupeKey, "events")) return ok({ duplicate: true }, requestId);
  return ok({ received: true }, requestId, 200);
}

async function upsertProgress(env: Env, learnerId: string, lessonId: string) {
  const now = new Date().toISOString();
  await env.DB.prepare("INSERT INTO learner_progress (id, learner_id, lesson_id, progress_status, completed_at, created_at, updated_at) VALUES (?, ?, ?, 'completed', ?, ?, ?) ON CONFLICT(learner_id, lesson_id) DO UPDATE SET progress_status='completed', completed_at=excluded.completed_at, updated_at=excluded.updated_at")
    .bind(crypto.randomUUID(), learnerId, lessonId, now, now, now).run();
}

async function handleSlackCommands(req: Request, env: Env, requestId: string) {
  const verified = await verifySlackRequest(req, env, requestId);
  if (!verified.ok) return verified.response;
  const params = new URLSearchParams(verified.body);
  const command = params.get("command");
  if (command === "/lesson") return Response.json({ response_type: "ephemeral", text: "Next lesson will be delivered shortly." });
  if (command === "/progress") return Response.json({ response_type: "ephemeral", text: "Progress: pending MVP aggregation." });
  if (command === "/submit") {
    const text = params.get("text") || "";
    const userId = params.get("user_id") || "unknown";
    const lessonId = text.split(" ")[0] || "unknown";
    await env.DB.prepare("INSERT INTO submissions (id, learner_id, lesson_id, submission_text, status, created_at, updated_at) VALUES (?, ?, ?, ?, 'submitted', ?, ?)")
      .bind(crypto.randomUUID(), userId, lessonId, text, new Date().toISOString(), new Date().toISOString()).run();
    await upsertProgress(env, userId, lessonId);
    await insertAudit(env, userId, "submission_completed", "lesson", lessonId, "success", { channel: params.get("channel_id") });
    return Response.json({ response_type: "ephemeral", text: "Submission received and progress updated." });
  }
  return fail("command_unsupported", "Unsupported slash command", requestId, 400);
}

async function handleSlackInteractions(req: Request, env: Env, requestId: string) {
  const verified = await verifySlackRequest(req, env, requestId);
  if (!verified.ok) return verified.response;
  const payload = JSON.parse(new URLSearchParams(verified.body).get("payload") || "{}");
  const dedupeMaterial = payload.trigger_id || payload.view?.id || `${payload.user?.id}:${payload.action_ts || "0"}:${await sha256(verified.body)}`;
  if (await isDuplicateSlackRequest(env, `ia:${dedupeMaterial}`, "interactivity")) return Response.json({ response_action: "clear" });

  if (payload.type === "view_submission") {
    const learnerId = payload.user?.id || "unknown";
    const lessonId = payload.view?.private_metadata || "unknown";
    await env.DB.prepare("INSERT INTO submissions (id, learner_id, lesson_id, submission_text, status, created_at, updated_at) VALUES (?, ?, ?, ?, 'submitted', ?, ?)")
      .bind(crypto.randomUUID(), learnerId, lessonId, JSON.stringify(payload.view?.state || {}), new Date().toISOString(), new Date().toISOString()).run();
    await upsertProgress(env, learnerId, lessonId);
    await insertAudit(env, learnerId, "submission_completed", "lesson", lessonId, "success", { source: "view_submission" });
    return Response.json({ response_action: "clear" });
  }
  return ok({ received: true }, requestId);
}


async function withDeprecatedInteractionsMetadata(res: Response, env: Env, requestId: string) {
  await insertAudit(env, "system", "deprecated_route_used", "route", "/api/slack/interactions", "warning", { replacement: "/api/slack/interactivity", requestId });
  console.warn(JSON.stringify({ level: "warn", event: "deprecated_route_used", route: "/api/slack/interactions", replacement: "/api/slack/interactivity", requestId }));

  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    const payload = await res.clone().json().catch(() => null);
    if (payload && typeof payload === "object") {
      return Response.json({
        ...payload,
        deprecation: {
          deprecated: true,
          route: "/api/slack/interactions",
          replacement: "/api/slack/interactivity",
          sunset: "TBD"
        }
      }, { status: res.status, headers: res.headers });
    }
  }

  const headers = new Headers(res.headers);
  headers.set("x-deprecated-route", "/api/slack/interactions");
  headers.set("x-route-replacement", "/api/slack/interactivity");
  return new Response(res.body, { status: res.status, headers });
}

async function postToSlack(env: Env, channel: string, text: string) {
  const res = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${env.SLACK_BOT_TOKEN}` },
    body: JSON.stringify({ channel, text }),
  });
  const body: any = await res.json().catch(() => ({}));
  return { httpStatus: res.status, body };
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const requestId = crypto.randomUUID();
    if (req.method === "GET" && url.pathname === "/health") return ok({ status: "healthy" }, requestId);
    if (req.method === "POST" && url.pathname === "/admin/content-approval-sync") return handleSync(req, env, requestId);
    if (req.method === "POST" && url.pathname === "/api/slack/events") return handleSlackEvents(req, env, requestId);
    if (req.method === "POST" && url.pathname === "/api/slack/commands") return handleSlackCommands(req, env, requestId);
    if (req.method === "POST" && url.pathname === "/api/slack/interactivity") return handleSlackInteractions(req, env, requestId);
    if (req.method === "POST" && url.pathname === "/api/slack/interactions") return withDeprecatedInteractionsMetadata(await handleSlackInteractions(req, env, requestId), env, requestId);
    return fail("not_found", "Route not found", requestId, 404);
  },

  async queue(batch: MessageBatch<any>, env: Env): Promise<void> {
    for (const msg of batch.messages) {
      const { queueId, lessonId, channel = "#general" } = msg.body;
      const now = new Date().toISOString();
      const row = await env.DB.prepare("SELECT attempts, max_attempts FROM lesson_queue WHERE id=?").bind(queueId).first<any>();
      const attempts = Number(row?.attempts || 0);
      const maxAttempts = Number(row?.max_attempts || 3);
      try {
        await env.DB.prepare("UPDATE lesson_queue SET status='processing', updated_at=? WHERE id=? AND status IN ('queued','retrying')").bind(now, queueId).run();
        const lesson = await env.DB.prepare("SELECT slack_message FROM lessons WHERE id=?").bind(lessonId).first<any>();
        const delivery = await postToSlack(env, channel, lesson?.slack_message || `Lesson ${lessonId}`);

        if (delivery.httpStatus === 429 || delivery.httpStatus >= 500 || delivery.body?.error === "ratelimited") {
          if (attempts + 1 >= maxAttempts) {
            await env.DB.prepare("UPDATE lesson_queue SET status='failed', attempts=attempts+1, updated_at=? WHERE id=?").bind(now, queueId).run();
            await insertAudit(env, "system", "lesson_delivery_failed", "lesson_queue", queueId, "failed", { reason: "retry_ceiling", attempts: attempts + 1 });
            msg.ack();
          } else {
            await env.DB.prepare("UPDATE lesson_queue SET status='retrying', attempts=attempts+1, updated_at=? WHERE id=?").bind(now, queueId).run();
            await insertAudit(env, "system", "lesson_delivery_retrying", "lesson_queue", queueId, "retrying", { attempts: attempts + 1 });
            msg.retry();
          }
          continue;
        }

        if (!delivery.body?.ok) {
          await env.DB.prepare("UPDATE lesson_queue SET status='failed', attempts=attempts+1, updated_at=? WHERE id=?").bind(now, queueId).run();
          await insertAudit(env, "system", "lesson_delivery_failed", "lesson_queue", queueId, "failed", { error: delivery.body?.error || "slack_error" });
          msg.ack();
          continue;
        }

        await env.DB.prepare("UPDATE lesson_queue SET status='delivered', delivered_at=?, updated_at=? WHERE id=?").bind(now, now, queueId).run();
        await insertAudit(env, "system", "lesson_delivered", "lesson", lessonId, "success", { channel: delivery.body.channel, ts: delivery.body.ts, messageId: delivery.body.message?.client_msg_id });
        msg.ack();
      } catch (err) {
        if (attempts + 1 >= maxAttempts) {
          await env.DB.prepare("UPDATE lesson_queue SET status='failed', attempts=attempts+1, updated_at=? WHERE id=?").bind(now, queueId).run();
          await insertAudit(env, "system", "lesson_delivery_failed", "lesson_queue", queueId, "failed", { reason: "exception", detail: String(err) });
          msg.ack();
        } else {
          await env.DB.prepare("UPDATE lesson_queue SET status='retrying', attempts=attempts+1, updated_at=? WHERE id=?").bind(now, queueId).run();
          await insertAudit(env, "system", "lesson_delivery_retrying", "lesson_queue", queueId, "retrying", { reason: "exception", attempts: attempts + 1 });
          msg.retry();
        }
      }
    }
  },

  async scheduled(_: ScheduledController, env: Env): Promise<void> {
    const now = new Date().toISOString();
    const due = await env.DB.prepare("SELECT id, lesson_id, workspace_id FROM lesson_queue WHERE status='queued' AND due_at <= ? LIMIT 50").bind(now).all<any>();
    for (const r of due.results || []) await env.DELIVERY_QUEUE.send({ queueId: r.id, lessonId: r.lesson_id, workspaceId: r.workspace_id });
  },
};
