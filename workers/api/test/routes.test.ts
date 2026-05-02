import { describe, expect, it } from "vitest";
import worker from "../src/index";

const env: any = {
  ADMIN_SYNC_TOKEN: "admin",
  SLACK_SIGNING_SECRET: "secret",
  SLACK_BOT_TOKEN: "xoxb",
  DB: {
    prepare: () => ({ bind: () => ({ first: async () => null, run: async () => ({}), all: async () => ({ results: [] }) }) }),
    batch: async () => ({}),
  },
  DELIVERY_QUEUE: { send: async () => ({}) },
};

describe("content sync route", () => {
  it("rejects missing auth", async () => {
    const req = new Request("http://x/admin/content-approval-sync", { method: "POST", body: "{}" });
    const res = await worker.fetch(req, env);
    expect(res.status).toBe(401);
  });

  it("rejects missing idempotency", async () => {
    const req = new Request("http://x/admin/content-approval-sync", { method: "POST", headers: { authorization: "Bearer admin" }, body: "{}" });
    const res = await worker.fetch(req, env);
    expect(res.status).toBe(400);
  });

  it("handles slack url_verification", async () => {
    const body = JSON.stringify({ type: "url_verification", challenge: "abc" });
    const ts = Math.floor(Date.now() / 1000).toString();
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode("secret"), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const raw = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`v0:${ts}:${body}`));
    const sig = `v0=${[...new Uint8Array(raw)].map((b) => b.toString(16).padStart(2, "0")).join("")}`;
    const req = new Request("http://x/api/slack/events", { method: "POST", headers: { "x-slack-request-timestamp": ts, "x-slack-signature": sig }, body });
    const res = await worker.fetch(req, env);
    const json = await res.json();
    expect(json.challenge).toBe("abc");
  });
});
