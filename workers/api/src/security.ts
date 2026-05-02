import { fail } from "./response";
import type { Env } from "./types";

export async function verifySlackRequest(req: Request, env: Env, requestId: string): Promise<{ ok: true; body: string } | { ok: false; response: Response }> {
  const ts = req.headers.get("x-slack-request-timestamp");
  const sig = req.headers.get("x-slack-signature");
  if (!ts || !sig) return { ok: false, response: fail("slack_signature_missing", "Missing Slack signature headers", requestId, 401) };

  const replayWindow = Number(env.REPLAY_WINDOW_SECONDS || "300");
  const now = Math.floor(Date.now() / 1000);
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

export function requireBearer(req: Request, token: string): boolean {
  const auth = req.headers.get("authorization") || "";
  return auth === `Bearer ${token}`;
}
