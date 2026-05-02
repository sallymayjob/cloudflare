import { describe, expect, it } from "vitest";
import worker from "../src/index";

const TEST_SLACK_SIGNING_SECRET = "test_slack_signing_secret";

async function signSlackTestRequest(body: string, secret = TEST_SLACK_SIGNING_SECRET, ts = Math.floor(Date.now() / 1000).toString()) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const raw = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`v0:${ts}:${body}`));
  return {
    ts,
    sig: `v0=${[...new Uint8Array(raw)].map((b) => b.toString(16).padStart(2, "0")).join("")}`,
  };
}

function makeSlackEnv() {
  const dedupe = new Set<string>();
  const submissions: any[] = [];
  const progress = new Map<string, any>();
  const audits: any[] = [];

  const env: any = {
    ADMIN_SYNC_TOKEN: "test_admin_sync_token",
    SLACK_SIGNING_SECRET: TEST_SLACK_SIGNING_SECRET,
    SLACK_BOT_TOKEN: "test_slack_bot_token",
    REPLAY_WINDOW_SECONDS: "300",
    DELIVERY_QUEUE: { send: async () => ({}) },
    DB: {
      prepare: (sql: string) => ({
        bind: (...args: any[]) => ({
          first: async () => {
            if (sql.includes("FROM slack_request_dedupe")) return dedupe.has(args[0]) ? { id: "d1" } : null;
            return null;
          },
          run: async () => {
            if (sql.includes("INSERT INTO slack_request_dedupe")) dedupe.add(args[1]);
            if (sql.includes("INSERT INTO submissions")) submissions.push(args);
            if (sql.includes("INSERT INTO learner_progress")) progress.set(`${args[1]}:${args[2]}`, { learnerId: args[1], lessonId: args[2] });
            if (sql.includes("INSERT INTO audit_logs")) audits.push(args);
            return {};
          },
          all: async () => ({ results: [] }),
        }),
      }),
      batch: async () => ({}),
    },
  };

  return { env, dedupe, submissions, progress, audits };
}

async function signedPost(path: string, body: string, env: any, contentType = "application/json", ts?: string, sig?: string) {
  const signature = sig && ts ? { ts, sig } : await signSlackTestRequest(body, TEST_SLACK_SIGNING_SECRET, ts);
  return worker.fetch(new Request(`http://local.test${path}`, {
    method: "POST",
    headers: {
      "content-type": contentType,
      "x-slack-request-timestamp": signature.ts,
      "x-slack-signature": signature.sig,
    },
    body,
  }), env);
}

describe("local Slack events simulation", () => {
  it("handles url_verification with a valid Slack signature", async () => {
    const { env } = makeSlackEnv();
    const body = JSON.stringify({ type: "url_verification", challenge: "local-challenge" });
    const res = await signedPost("/api/slack/events", body, env);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.challenge).toBe("local-challenge");
  });

  it("rejects invalid event signatures", async () => {
    const { env } = makeSlackEnv();
    const body = JSON.stringify({ type: "event_callback", event_id: "Ev1", event: { type: "app_mention" } });
    const ts = Math.floor(Date.now() / 1000).toString();
    const res = await signedPost("/api/slack/events", body, env, "application/json", ts, "v0=invalid");
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json.errorCode).toBe("slack_signature_invalid");
  });

  it("rejects old event timestamps as replay attempts", async () => {
    const { env } = makeSlackEnv();
    const body = JSON.stringify({ type: "event_callback", event_id: "Ev2", event: { type: "app_mention" } });
    const oldTs = (Math.floor(Date.now() / 1000) - 10000).toString();
    const res = await signedPost("/api/slack/events", body, env, "application/json", oldTs);
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json.errorCode).toBe("slack_replay_rejected");
  });
});

describe("local Slack slash command simulation", () => {
  it("simulates /lesson and returns a Slack response", async () => {
    const { env } = makeSlackEnv();
    const body = new URLSearchParams({ command: "/lesson", user_id: "U1", channel_id: "C1" }).toString();
    const res = await signedPost("/api/slack/commands", body, env, "application/x-www-form-urlencoded");
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.response_type).toBe("ephemeral");
    expect(json.text).toContain("Next lesson");
  });

  it("simulates /progress and returns a Slack response", async () => {
    const { env } = makeSlackEnv();
    const body = new URLSearchParams({ command: "/progress", user_id: "U1", channel_id: "C1" }).toString();
    const res = await signedPost("/api/slack/commands", body, env, "application/x-www-form-urlencoded");
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.response_type).toBe("ephemeral");
    expect(json.text).toContain("Progress");
  });

  it("simulates /submit, records progress, and returns a Slack response", async () => {
    const { env, submissions, progress } = makeSlackEnv();
    const body = new URLSearchParams({ command: "/submit", text: "L1 reflection text", user_id: "U1", channel_id: "C1" }).toString();
    const res = await signedPost("/api/slack/commands", body, env, "application/x-www-form-urlencoded");
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.response_type).toBe("ephemeral");
    expect(json.text).toContain("Submission received");
    expect(submissions.length).toBe(1);
    expect(progress.has("U1:L1")).toBe(true);
  });

  it("rejects slash commands with invalid signatures", async () => {
    const { env } = makeSlackEnv();
    const body = new URLSearchParams({ command: "/lesson", user_id: "U1" }).toString();
    const ts = Math.floor(Date.now() / 1000).toString();
    const res = await signedPost("/api/slack/commands", body, env, "application/x-www-form-urlencoded", ts, "v0=invalid");

    expect(res.status).toBe(401);
  });
});

describe("local Slack interactivity simulation", () => {
  it("simulates view_submission, writes submission and learner progress", async () => {
    const { env, submissions, progress } = makeSlackEnv();
    const payload = { type: "view_submission", trigger_id: "T1", user: { id: "U1" }, view: { id: "V1", private_metadata: "L1", state: { values: {} } } };
    const body = new URLSearchParams({ payload: JSON.stringify(payload) }).toString();
    const res = await signedPost("/api/slack/interactivity", body, env, "application/x-www-form-urlencoded");
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.response_action).toBe("clear");
    expect(submissions.length).toBe(1);
    expect(progress.has("U1:L1")).toBe(true);
  });

  it("dedupes duplicate view_submission requests", async () => {
    const { env, submissions, progress } = makeSlackEnv();
    const payload = { type: "view_submission", trigger_id: "T-duplicate", user: { id: "U1" }, view: { id: "V1", private_metadata: "L1", state: { values: {} } } };
    const body = new URLSearchParams({ payload: JSON.stringify(payload) }).toString();
    const signature = await signSlackTestRequest(body);

    const req1 = new Request("http://local.test/api/slack/interactivity", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", "x-slack-request-timestamp": signature.ts, "x-slack-signature": signature.sig },
      body,
    });
    const req2 = new Request("http://local.test/api/slack/interactivity", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", "x-slack-request-timestamp": signature.ts, "x-slack-signature": signature.sig },
      body,
    });

    const first = await worker.fetch(req1, env);
    const second = await worker.fetch(req2, env);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(submissions.length).toBe(1);
    expect(progress.size).toBe(1);
  });
});
