import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import worker from "../src/index";

function sign(body: string, secret = "secret", ts = Math.floor(Date.now() / 1000).toString()) {
  return crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]).then((key) =>
    crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`v0:${ts}:${body}`)).then((raw) => ({
      ts,
      sig: `v0=${[...new Uint8Array(raw)].map((b) => b.toString(16).padStart(2, "0")).join("")}`,
    }))
  );
}

function envWithDb(state: any = {}) {
  const dedupe = new Set<string>();
  const submissions: any[] = [];
  const progress = new Map<string, any>();
  const queueRows = new Map<string, any>([["q1", { attempts: state.attempts ?? 0, max_attempts: state.max_attempts ?? 3 }]]);
  const audits: any[] = [];

  const env: any = {
    ADMIN_SYNC_TOKEN: "admin",
    SLACK_SIGNING_SECRET: "secret",
    SLACK_BOT_TOKEN: "xoxb",
    DELIVERY_QUEUE: { send: async () => ({}) },
    DB: {
      prepare: (sql: string) => ({
        bind: (...args: any[]) => ({
          first: async () => {
            if (sql.includes("FROM slack_request_dedupe")) return dedupe.has(args[0]) ? { id: "d1" } : null;
            if (sql.includes("SELECT attempts, max_attempts FROM lesson_queue")) return queueRows.get(args[0]);
            if (sql.includes("SELECT slack_message FROM lessons")) return { slack_message: "hello" };
            return null;
          },
          run: async () => {
            if (sql.includes("INSERT INTO slack_request_dedupe")) dedupe.add(args[1]);
            if (sql.includes("INSERT INTO submissions")) submissions.push(args);
            if (sql.includes("INSERT INTO learner_progress") || sql.includes("DO UPDATE SET progress_status='completed'")) progress.set(`${args[1]}:${args[2]}`, true);
            if (sql.includes("INSERT INTO audit_logs")) audits.push(args);
            if (sql.includes("UPDATE lesson_queue SET status='retrying'")) queueRows.get(args[1]).attempts += 1;
            if (sql.includes("UPDATE lesson_queue SET status='failed'")) queueRows.get(args[1]).attempts += 1;
            return {};
          },
          all: async () => ({ results: [] }),
        }),
      }),
      batch: async () => ({}),
    },
  };
  return { env, submissions, progress, audits, dedupe, queueRows };
}

describe("approval phrase validation", () => {
  async function post(payload: any) {
    const { env } = envWithDb();
    const contentHash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(payload.content, Object.keys(payload.content).sort()))).then((d) => [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join(""));
    payload.contentHash = contentHash;
    return worker.fetch(new Request("http://x/admin/content-approval-sync", { method: "POST", headers: { authorization: "Bearer admin", "Idempotency-Key": crypto.randomUUID() }, body: JSON.stringify(payload) }), env);
  }

  const base = { approval: { approvalPhrase: "APPROVE_SYNC lesson:L1 course:C1 target:staging", approvedBy: "u", approvedAt: new Date().toISOString(), targetEnvironment: "staging" }, contentType: "lesson", content: { lessonId: "L1", courseId: "C1", moduleId: "M1", title: "t", status: "Ready", slackThreadText: "x" }, publish_mode: "none" };

  it("rejects lesson mismatch", async () => expect((await post({ ...base, approval: { ...base.approval, approvalPhrase: "APPROVE_SYNC lesson:L2 course:C1 target:staging" } })).status).toBe(400));
  it("rejects course mismatch", async () => expect((await post({ ...base, approval: { ...base.approval, approvalPhrase: "APPROVE_SYNC lesson:L1 course:C2 target:staging" } })).status).toBe(400));
  it("rejects target mismatch", async () => expect((await post({ ...base, approval: { ...base.approval, approvalPhrase: "APPROVE_SYNC lesson:L1 course:C1 target:production" } })).status).toBe(400));
});

describe("submission progress + dedupe", () => {
  it("view_submission writes submission and progress", async () => {
    const { env, submissions, progress } = envWithDb();
    const payload = { type: "view_submission", trigger_id: "t1", user: { id: "U1" }, view: { id: "V1", private_metadata: "L1", state: {} } };
    const body = `payload=${encodeURIComponent(JSON.stringify(payload))}`;
    const s = await sign(body);
    const req = new Request("http://x/api/slack/interactivity", { method: "POST", headers: { "x-slack-request-timestamp": s.ts, "x-slack-signature": s.sig, "content-type": "application/x-www-form-urlencoded" }, body });
    await worker.fetch(req, env);
    expect(submissions.length).toBe(1);
    expect(progress.has("U1:L1")).toBe(true);
  });

  it("duplicate interaction is deduped", async () => {
    const { env, submissions } = envWithDb();
    const payload = { type: "view_submission", trigger_id: "dup", user: { id: "U1" }, view: { id: "V1", private_metadata: "L1", state: {} } };
    const body = `payload=${encodeURIComponent(JSON.stringify(payload))}`;
    const s = await sign(body);
    const req1 = new Request("http://x/api/slack/interactivity", { method: "POST", headers: { "x-slack-request-timestamp": s.ts, "x-slack-signature": s.sig }, body });
    const req2 = new Request("http://x/api/slack/interactivity", { method: "POST", headers: { "x-slack-request-timestamp": s.ts, "x-slack-signature": s.sig }, body });
    await worker.fetch(req1, env);
    await worker.fetch(req2, env);
    expect(submissions.length).toBe(1);
  });
});

describe("queue retry ceiling", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ status: 429, json: async () => ({ ok: false, error: "ratelimited" }) })) as any);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("retries below max and fails at ceiling", async () => {
    const { env, queueRows } = envWithDb({ attempts: 2, max_attempts: 3 });
    const ack = vi.fn(); const retry = vi.fn();
    await worker.queue({ messages: [{ body: { queueId: "q1", lessonId: "L1", channel: "C1" }, ack, retry }] } as any, env);
    expect(retry).not.toHaveBeenCalled();
    expect(ack).toHaveBeenCalled();
    expect(queueRows.get("q1").attempts).toBe(3);
  });
});
