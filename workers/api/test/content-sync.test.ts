import { describe, expect, it } from "vitest";
import worker from "../src/index";

function makeEnv() {
  const approvals = new Map<string, any>();
  const courses = new Map<string, any>();
  const modules = new Map<string, any>();
  const lessons = new Map<string, any>();
  const queueRows: any[] = [];
  const queues: any[] = [];
  const db: any = {
    prepare(sql: string) {
      return {
        bind: (...args: any[]) => ({
          sql,
          args,
          first: async () => {
            if (sql.includes("FROM approvals")) return approvals.get(args[0]) || null;
            return null;
          },
          run: async () => {
            if (sql.includes("INSERT INTO approvals")) approvals.set(args[1], { id: "a1", result_json: null });
            if (sql.includes("INSERT INTO courses")) courses.set(args[0], { id: args[0] });
            if (sql.includes("INSERT INTO modules")) {
              if (!courses.has(args[1])) throw new Error("FOREIGN KEY constraint failed: modules.course_id");
              modules.set(args[0], { id: args[0], course_id: args[1] });
            }
            if (sql.includes("INSERT OR REPLACE INTO lessons")) {
              if (!courses.has(args[1])) throw new Error("FOREIGN KEY constraint failed: lessons.course_id");
              if (args[2] && !modules.has(args[2])) throw new Error("FOREIGN KEY constraint failed: lessons.module_id");
              lessons.set(args[0], { id: args[0], course_id: args[1], module_id: args[2] });
            }
            if (sql.includes("INSERT INTO lesson_queue")) {
              if (!lessons.has(args[1])) throw new Error("FOREIGN KEY constraint failed: lesson_queue.lesson_id");
              queueRows.push({ id: args[0], lesson_id: args[1], idempotency_key: args[4] });
            }
            if (sql.includes("UPDATE approvals SET result_json")) {
              const row = approvals.get(args[1]);
              if (row) row.result_json = args[0];
            }
            return {};
          },
          all: async () => ({ results: [] }),
        }),
      };
    },
    batch: async (statements: any[]) => {
      for (const statement of statements) await statement.run();
      return {};
    },
  };
  const env: any = {
    ADMIN_SYNC_TOKEN: "admin",
    SLACK_SIGNING_SECRET: "secret",
    SLACK_BOT_TOKEN: "xoxb",
    DB: db,
    DELIVERY_QUEUE: { send: async (msg: any) => queues.push(msg) },
  };
  return { env, queues, courses, modules, lessons, queueRows };
}

function makePayload(status = "Ready", phrase = "APPROVE_SYNC lesson:M01-W01-L01 course:c1 target:staging") {
  const content = { lessonId: "M01-W01-L01", courseId: "c1", courseTitle: "Course 1", moduleId: "M01", moduleTitle: "Module 1", title: "t", status, slackThreadText: "x", workspaceId: "w1" };
  return { approval: { approvalPhrase: phrase, approvedBy: "u", approvedAt: new Date().toISOString(), targetEnvironment: "staging" }, contentType: "lesson", content, contentHash: "", requestedAction: "sync", publish_mode: "queue" };
}

async function hash(content: any) {
  const raw = JSON.stringify(content, Object.keys(content).sort());
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

describe("content sync behaviors", () => {
  it("rejects unapproved status", async () => {
    const { env } = makeEnv();
    const payload = makePayload("Draft");
    payload.contentHash = await hash(payload.content);
    const req = new Request("http://x/admin/content-approval-sync", { method: "POST", headers: { authorization: "Bearer admin", "Idempotency-Key": "k1" }, body: JSON.stringify(payload) });
    const res = await worker.fetch(req, env);
    expect(res.status).toBe(400);
  });

  it("accepts approved lesson", async () => {
    const { env, queues } = makeEnv();
    const payload = makePayload("Ready");
    payload.contentHash = await hash(payload.content);
    const req = new Request("http://x/admin/content-approval-sync", { method: "POST", headers: { authorization: "Bearer admin", "Idempotency-Key": "k2" }, body: JSON.stringify(payload) });
    const res = await worker.fetch(req, env);
    expect(res.status).toBe(200);
    expect(queues.length).toBe(1);
  });

  it("creates course and module parents before lesson and queue rows", async () => {
    const { env, courses, modules, lessons, queueRows } = makeEnv();
    const payload = makePayload("Ready");
    payload.contentHash = await hash(payload.content);
    const req = new Request("http://x/admin/content-approval-sync", { method: "POST", headers: { authorization: "Bearer admin", "Idempotency-Key": "k-parent-order" }, body: JSON.stringify(payload) });
    const res = await worker.fetch(req, env);
    expect(res.status).toBe(200);
    expect(courses.has(payload.content.courseId)).toBe(true);
    expect(modules.has(payload.content.moduleId)).toBe(true);
    expect(lessons.has(payload.content.lessonId)).toBe(true);
    expect(queueRows.length).toBe(1);
  });

  it("idempotency prevents duplicate queue rows", async () => {
    const { env, queues, queueRows } = makeEnv();
    const payload = makePayload("Ready");
    payload.contentHash = await hash(payload.content);
    const headers = { authorization: "Bearer admin", "Idempotency-Key": "k3" };
    await worker.fetch(new Request("http://x/admin/content-approval-sync", { method: "POST", headers, body: JSON.stringify(payload) }), env);
    await worker.fetch(new Request("http://x/admin/content-approval-sync", { method: "POST", headers, body: JSON.stringify(payload) }), env);
    expect(queues.length).toBe(1);
    expect(queueRows.length).toBe(1);
  });

  it("rejects malformed approval phrase", async () => {
    const { env } = makeEnv();
    const payload = makePayload("Ready", "bad phrase");
    payload.contentHash = await hash(payload.content);
    const res = await worker.fetch(new Request("http://x/admin/content-approval-sync", { method: "POST", headers: { authorization: "Bearer admin", "Idempotency-Key": "k4" }, body: JSON.stringify(payload) }), env);
    expect(res.status).toBe(400);
  });
});
