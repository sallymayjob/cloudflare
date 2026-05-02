import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { createRequire } from "node:module";

const BASE_URL = process.env.LOCAL_WORKER_URL || "http://localhost:8787";
const ADMIN_SYNC_TOKEN = "test_admin_sync_token";
const LESSON_ID = `smoke-${Date.now()}`;
const COURSE_ID = "smoke-course";
const IDEMPOTENCY_KEY = `smoke-${randomUUID()}`;
const QUEUE_IDEMPOTENCY_KEY = `${IDEMPOTENCY_KEY}:${LESSON_ID}`;
const require = createRequire(import.meta.url);
const WRANGLER_CLI = require.resolve("wrangler/wrangler-dist/cli.js");

function canonicalJson(value) {
  return JSON.stringify(value, Object.keys(value).sort());
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function wranglerCommand(sql) {
  const output = execFileSync(
    process.execPath,
    ["--no-warnings", "--experimental-vm-modules", WRANGLER_CLI, "d1", "execute", "DB", "--local", "--json", "--command", sql],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );
  const jsonStart = output.indexOf("[");
  if (jsonStart === -1) throw new Error(`Wrangler returned non-JSON output:\n${output}`);
  return JSON.parse(output.slice(jsonStart));
}

function d1Rows(sql) {
  const result = wranglerCommand(sql);
  return result.flatMap((entry) => entry.results || []);
}

function printRows(label, rows) {
  console.log(`\n${label}`);
  console.table(rows);
}

async function postSync(payload) {
  let res;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      res = await fetch(`${BASE_URL}/admin/content-approval-sync`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${ADMIN_SYNC_TOKEN}`,
          "content-type": "application/json",
          "Idempotency-Key": IDEMPOTENCY_KEY,
        },
        body: JSON.stringify(payload),
      });
      break;
    } catch (err) {
      if (attempt === 3) throw err;
      console.warn(`Sync request attempt ${attempt} failed: ${err.message}. Retrying...`);
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  const body = await res.json().catch(() => null);
  if (!res.ok || !body?.ok) {
    throw new Error(`Sync request failed with HTTP ${res.status}:\n${JSON.stringify(body, null, 2)}`);
  }
  return body;
}

const content = {
  lessonId: LESSON_ID,
  courseId: COURSE_ID,
  courseTitle: "Smoke Test Course",
  moduleId: "smoke-module",
  moduleTitle: "Smoke Test Module",
  title: "Approved smoke test lesson",
  status: "Ready",
  slackThreadText: "This is a local content sync smoke test lesson.",
  workspaceId: "local-smoke-workspace",
};

const payload = {
  approval: {
    approvalPhrase: `APPROVE_SYNC lesson:${LESSON_ID} course:${COURSE_ID} target:staging`,
    approvedBy: "local-smoke-test",
    approvedAt: new Date().toISOString(),
    targetEnvironment: "staging",
  },
  contentType: "lesson",
  content,
  contentHash: sha256(canonicalJson(content)),
  requestedAction: "sync",
  publish_mode: "queue",
};

console.log(`Testing ${BASE_URL}/admin/content-approval-sync`);
console.log(`Idempotency-Key: ${IDEMPOTENCY_KEY}`);

await postSync(payload);
console.log("First sync response ok.");

printRows(
  "D1 lessons",
  d1Rows(`SELECT id, course_id, module_id, title, status, created_at, updated_at FROM lessons WHERE id = '${LESSON_ID}'`),
);
printRows(
  "D1 lesson_queue",
  d1Rows(`SELECT id, lesson_id, workspace_id, status, attempts, max_attempts, idempotency_key, created_at, updated_at FROM lesson_queue WHERE idempotency_key = '${QUEUE_IDEMPOTENCY_KEY}'`),
);
printRows(
  "D1 audit_logs",
  d1Rows(`SELECT id, actor, action, entity_type, entity_id, status, metadata_json, created_at FROM audit_logs WHERE action = 'content_sync' AND metadata_json LIKE '%${IDEMPOTENCY_KEY}%' ORDER BY created_at DESC`),
);

await postSync(payload);
console.log("Second sync response ok.");

const queueCount = d1Rows(`SELECT COUNT(*) AS count FROM lesson_queue WHERE idempotency_key = '${QUEUE_IDEMPOTENCY_KEY}'`)[0]?.count;
const auditCount = d1Rows(`SELECT COUNT(*) AS count FROM audit_logs WHERE action = 'content_sync' AND metadata_json LIKE '%${IDEMPOTENCY_KEY}%'`)[0]?.count;

if (Number(queueCount) !== 1) {
  throw new Error(`Expected exactly 1 queue row for ${QUEUE_IDEMPOTENCY_KEY}, found ${queueCount}.`);
}
if (Number(auditCount) !== 1) {
  throw new Error(`Expected exactly 1 content_sync audit row for ${IDEMPOTENCY_KEY}, found ${auditCount}.`);
}

printRows(
  "D1 lesson_queue after duplicate request",
  d1Rows(`SELECT id, lesson_id, workspace_id, status, attempts, max_attempts, idempotency_key, created_at, updated_at FROM lesson_queue WHERE idempotency_key = '${QUEUE_IDEMPOTENCY_KEY}'`),
);

console.log("\nContent sync smoke test passed: duplicate request did not create a duplicate queue row.");
