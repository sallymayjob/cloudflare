import { describe, expect, it } from "vitest";
import { verifySlackRequest } from "../src/security";

const env = {
  SLACK_SIGNING_SECRET: "test-secret",
  REPLAY_WINDOW_SECONDS: "300",
} as any;

async function sign(body: string, ts: string, secret: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const raw = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`v0:${ts}:${body}`));
  return `v0=${[...new Uint8Array(raw)].map((b) => b.toString(16).padStart(2, "0")).join("")}`;
}

describe("slack signature verification", () => {
  it("accepts valid signature", async () => {
    const body = "token=x&command=%2Flesson";
    const ts = Math.floor(Date.now() / 1000).toString();
    const sig = await sign(body, ts, env.SLACK_SIGNING_SECRET);
    const req = new Request("http://x", { method: "POST", headers: { "x-slack-request-timestamp": ts, "x-slack-signature": sig }, body });
    const result = await verifySlackRequest(req, env, "r1");
    expect(result.ok).toBe(true);
  });

  it("rejects invalid signature", async () => {
    const ts = Math.floor(Date.now() / 1000).toString();
    const req = new Request("http://x", { method: "POST", headers: { "x-slack-request-timestamp": ts, "x-slack-signature": "v0=bad" }, body: "a=b" });
    const result = await verifySlackRequest(req, env, "r2");
    expect(result.ok).toBe(false);
  });

  it("rejects replay timestamp", async () => {
    const body = "token=x";
    const ts = (Math.floor(Date.now() / 1000) - 10000).toString();
    const sig = await sign(body, ts, env.SLACK_SIGNING_SECRET);
    const req = new Request("http://x", { method: "POST", headers: { "x-slack-request-timestamp": ts, "x-slack-signature": sig }, body });
    const result = await verifySlackRequest(req, env, "r3");
    expect(result.ok).toBe(false);
  });
});
