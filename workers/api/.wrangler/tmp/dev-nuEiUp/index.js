var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/response.ts
function ok(data, requestId, status = 200) {
  return Response.json({ ok: true, data, requestId }, { status });
}
__name(ok, "ok");
function fail(errorCode, message, requestId, status = 400) {
  return Response.json({ ok: false, errorCode, message, requestId }, { status });
}
__name(fail, "fail");

// src/security.ts
async function verifySlackRequest(req, env, requestId) {
  const ts = req.headers.get("x-slack-request-timestamp");
  const sig = req.headers.get("x-slack-signature");
  if (!ts || !sig) return { ok: false, response: fail("slack_signature_missing", "Missing Slack signature headers", requestId, 401) };
  const replayWindow = Number(env.REPLAY_WINDOW_SECONDS || "300");
  const now = Math.floor(Date.now() / 1e3);
  if (Math.abs(now - Number(ts)) > replayWindow) {
    return { ok: false, response: fail("slack_replay_rejected", "Slack request timestamp outside replay window", requestId, 401) };
  }
  const body = await req.text();
  const base = `v0:${ts}:${body}`;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(env.SLACK_SIGNING_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(base));
  const expected = `v0=${[...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("")}`;
  if (expected !== sig) return { ok: false, response: fail("slack_signature_invalid", "Invalid Slack signature", requestId, 401) };
  return { ok: true, body };
}
__name(verifySlackRequest, "verifySlackRequest");
function requireBearer(req, token) {
  const auth = req.headers.get("authorization") || "";
  return auth === `Bearer ${token}`;
}
__name(requireBearer, "requireBearer");

// src/index.ts
var allowedStatuses = /* @__PURE__ */ new Set(["Ready", "Live", "Archived"]);
async function sha256(input) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
__name(sha256, "sha256");
function canonicalJson(value) {
  return JSON.stringify(value, Object.keys(value).sort());
}
__name(canonicalJson, "canonicalJson");
function parseApprovalPhrase(phrase) {
  const m = /^APPROVE_SYNC lesson:([^\s]+) course:([^\s]+) target:(staging|production)$/.exec(phrase.trim());
  if (!m) return null;
  return { lessonId: m[1], courseId: m[2], target: m[3] };
}
__name(parseApprovalPhrase, "parseApprovalPhrase");
async function insertAudit(env, actor, action, entityType, entityId, status, metadata) {
  await env.DB.prepare("INSERT INTO audit_logs (id, actor, action, entity_type, entity_id, status, metadata_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").bind(crypto.randomUUID(), actor, action, entityType, entityId, status, JSON.stringify(metadata || {}), (/* @__PURE__ */ new Date()).toISOString()).run();
}
__name(insertAudit, "insertAudit");
async function isDuplicateSlackRequest(env, dedupeKey, requestType) {
  const row = await env.DB.prepare("SELECT id FROM slack_request_dedupe WHERE dedupe_key = ?").bind(dedupeKey).first();
  if (row) return true;
  await env.DB.prepare("INSERT INTO slack_request_dedupe (id, dedupe_key, request_type, created_at) VALUES (?, ?, ?, ?)").bind(crypto.randomUUID(), dedupeKey, requestType, (/* @__PURE__ */ new Date()).toISOString()).run();
  return false;
}
__name(isDuplicateSlackRequest, "isDuplicateSlackRequest");
async function handleSync(req, env, requestId) {
  if (!requireBearer(req, env.ADMIN_SYNC_TOKEN)) return fail("auth_failed", "Missing/invalid bearer token", requestId, 401);
  const idem = req.headers.get("Idempotency-Key");
  if (!idem) return fail("idempotency_missing", "Missing Idempotency-Key header", requestId, 400);
  const payload = await req.json();
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
  const existing = await env.DB.prepare("SELECT id, result_json FROM approvals WHERE idempotency_key = ?").bind(idem).first();
  if (existing) return ok(JSON.parse(existing.result_json || "{}"), requestId);
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const contentId = payload.content.lessonId || payload.content.courseId;
  if (!contentId) return fail("schema_invalid", "content missing lessonId/courseId", requestId, 400);
  if (payload.contentType === "lesson" && !payload.content.courseId) return fail("schema_invalid", "lesson content missing courseId", requestId, 400);
  if (payload.contentType === "lesson" && !payload.content.title) return fail("schema_invalid", "lesson content missing title", requestId, 400);
  await env.DB.batch([
    env.DB.prepare("INSERT INTO courses (id, title, status, content_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET title=excluded.title, status=excluded.status, content_json=excluded.content_json, updated_at=excluded.updated_at").bind(payload.content.courseId, payload.content.courseTitle || payload.content.courseId, payload.content.status, JSON.stringify({ courseId: payload.content.courseId, title: payload.content.courseTitle || payload.content.courseId }), now, now),
    ...payload.content.moduleId ? [
      env.DB.prepare("INSERT INTO modules (id, course_id, title, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET course_id=excluded.course_id, title=excluded.title, status=excluded.status, updated_at=excluded.updated_at").bind(payload.content.moduleId, payload.content.courseId, payload.content.moduleTitle || payload.content.moduleId, payload.content.status, now, now)
    ] : [],
    env.DB.prepare("INSERT OR REPLACE INTO lessons (id, course_id, module_id, title, status, slack_message, content_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, COALESCE((SELECT created_at FROM lessons WHERE id = ?), ?), ?)").bind(payload.content.lessonId, payload.content.courseId, payload.content.moduleId, payload.content.title, payload.content.status, payload.content.slackThreadText || "", JSON.stringify(payload.content), payload.content.lessonId, now, now)
  ]);
  await env.DB.prepare("INSERT INTO approvals (id, idempotency_key, content_hash, approval_phrase, approved_by, approved_at, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(crypto.randomUUID(), idem, payload.contentHash, payload.approval.approvalPhrase, payload.approval.approvedBy, payload.approval.approvedAt, "approved", now, now).run();
  const queueRows = [];
  if (payload.publish_mode === "queue" && payload.contentType === "lesson") {
    const queueId = crypto.randomUUID();
    await env.DB.prepare("INSERT INTO lesson_queue (id, lesson_id, workspace_id, status, due_at, attempts, max_attempts, idempotency_key, created_at, updated_at) VALUES (?, ?, ?, 'queued', ?, 0, 3, ?, ?, ?)").bind(queueId, payload.content.lessonId, payload.content.workspaceId || "default", now, `${idem}:${payload.content.lessonId}`, now, now).run();
    await env.DELIVERY_QUEUE.send({ queueId, lessonId: payload.content.lessonId, workspaceId: payload.content.workspaceId || "default" });
    queueRows.push(queueId);
  }
  const result = { syncedRecords: [{ table: "lessons", id: contentId, action: "upserted" }], queueRows };
  await env.DB.prepare("UPDATE approvals SET result_json = ? WHERE idempotency_key = ?").bind(JSON.stringify(result), idem).run();
  await insertAudit(env, payload.approval.approvedBy, "content_sync", payload.contentType, contentId, "success", { idem, requestId });
  return ok(result, requestId);
}
__name(handleSync, "handleSync");
async function handleSlackEvents(req, env, requestId) {
  const verified = await verifySlackRequest(req, env, requestId);
  if (!verified.ok) return verified.response;
  const body = JSON.parse(verified.body || "{}");
  if (body.type === "url_verification") return Response.json({ challenge: body.challenge });
  const dedupeKey = body.event_id ? `event:${body.event_id}` : `eventhash:${await sha256(verified.body)}`;
  if (await isDuplicateSlackRequest(env, dedupeKey, "events")) return ok({ duplicate: true }, requestId);
  return ok({ received: true }, requestId, 200);
}
__name(handleSlackEvents, "handleSlackEvents");
async function upsertProgress(env, learnerId, lessonId) {
  const now = (/* @__PURE__ */ new Date()).toISOString();
  await env.DB.prepare("INSERT INTO learner_progress (id, learner_id, lesson_id, progress_status, completed_at, created_at, updated_at) VALUES (?, ?, ?, 'completed', ?, ?, ?) ON CONFLICT(learner_id, lesson_id) DO UPDATE SET progress_status='completed', completed_at=excluded.completed_at, updated_at=excluded.updated_at").bind(crypto.randomUUID(), learnerId, lessonId, now, now, now).run();
}
__name(upsertProgress, "upsertProgress");
async function handleSlackCommands(req, env, requestId) {
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
    await env.DB.prepare("INSERT INTO submissions (id, learner_id, lesson_id, submission_text, status, created_at, updated_at) VALUES (?, ?, ?, ?, 'submitted', ?, ?)").bind(crypto.randomUUID(), userId, lessonId, text, (/* @__PURE__ */ new Date()).toISOString(), (/* @__PURE__ */ new Date()).toISOString()).run();
    await upsertProgress(env, userId, lessonId);
    await insertAudit(env, userId, "submission_completed", "lesson", lessonId, "success", { channel: params.get("channel_id") });
    return Response.json({ response_type: "ephemeral", text: "Submission received and progress updated." });
  }
  return fail("command_unsupported", "Unsupported slash command", requestId, 400);
}
__name(handleSlackCommands, "handleSlackCommands");
async function handleSlackInteractions(req, env, requestId) {
  const verified = await verifySlackRequest(req, env, requestId);
  if (!verified.ok) return verified.response;
  const payload = JSON.parse(new URLSearchParams(verified.body).get("payload") || "{}");
  const dedupeMaterial = payload.trigger_id || payload.view?.id || `${payload.user?.id}:${payload.action_ts || "0"}:${await sha256(verified.body)}`;
  if (await isDuplicateSlackRequest(env, `ia:${dedupeMaterial}`, "interactivity")) return Response.json({ response_action: "clear" });
  if (payload.type === "view_submission") {
    const learnerId = payload.user?.id || "unknown";
    const lessonId = payload.view?.private_metadata || "unknown";
    await env.DB.prepare("INSERT INTO submissions (id, learner_id, lesson_id, submission_text, status, created_at, updated_at) VALUES (?, ?, ?, ?, 'submitted', ?, ?)").bind(crypto.randomUUID(), learnerId, lessonId, JSON.stringify(payload.view?.state || {}), (/* @__PURE__ */ new Date()).toISOString(), (/* @__PURE__ */ new Date()).toISOString()).run();
    await upsertProgress(env, learnerId, lessonId);
    await insertAudit(env, learnerId, "submission_completed", "lesson", lessonId, "success", { source: "view_submission" });
    return Response.json({ response_action: "clear" });
  }
  return ok({ received: true }, requestId);
}
__name(handleSlackInteractions, "handleSlackInteractions");
async function withDeprecatedInteractionsMetadata(res, env, requestId) {
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
__name(withDeprecatedInteractionsMetadata, "withDeprecatedInteractionsMetadata");
async function postToSlack(env, channel, text) {
  const res = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${env.SLACK_BOT_TOKEN}` },
    body: JSON.stringify({ channel, text })
  });
  const body = await res.json().catch(() => ({}));
  return { httpStatus: res.status, body };
}
__name(postToSlack, "postToSlack");
var src_default = {
  async fetch(req, env) {
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
  async queue(batch, env) {
    for (const msg of batch.messages) {
      const { queueId, lessonId, channel = "#general" } = msg.body;
      const now = (/* @__PURE__ */ new Date()).toISOString();
      const row = await env.DB.prepare("SELECT attempts, max_attempts FROM lesson_queue WHERE id=?").bind(queueId).first();
      const attempts = Number(row?.attempts || 0);
      const maxAttempts = Number(row?.max_attempts || 3);
      try {
        await env.DB.prepare("UPDATE lesson_queue SET status='processing', updated_at=? WHERE id=? AND status IN ('queued','retrying')").bind(now, queueId).run();
        const lesson = await env.DB.prepare("SELECT slack_message FROM lessons WHERE id=?").bind(lessonId).first();
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
  async scheduled(_, env) {
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const due = await env.DB.prepare("SELECT id, lesson_id, workspace_id FROM lesson_queue WHERE status='queued' AND due_at <= ? LIMIT 50").bind(now).all();
    for (const r of due.results || []) await env.DELIVERY_QUEUE.send({ queueId: r.id, lessonId: r.lesson_id, workspaceId: r.workspace_id });
  }
};

// node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
var drainBody = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;

// node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
function reduceError(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError(e.cause)
  };
}
__name(reduceError, "reduceError");
var jsonError = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError(e);
    return Response.json(error, {
      status: 500,
      headers: { "MF-Experimental-Error-Stack": "true" }
    });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default = jsonError;

// .wrangler/tmp/bundle-ENZb0l/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_miniflare3_json_error_default
];
var middleware_insertion_facade_default = src_default;

// node_modules/wrangler/templates/middleware/common.ts
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");

// .wrangler/tmp/bundle-ENZb0l/middleware-loader.entry.ts
var __Facade_ScheduledController__ = class ___Facade_ScheduledController__ {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  static {
    __name(this, "__Facade_ScheduledController__");
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof ___Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = /* @__PURE__ */ __name((request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    }, "#fetchDispatcher");
    #dispatcher = /* @__PURE__ */ __name((type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    }, "#dispatcher");
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;
export {
  __INTERNAL_WRANGLER_MIDDLEWARE__,
  middleware_loader_entry_default as default
};
//# sourceMappingURL=index.js.map
