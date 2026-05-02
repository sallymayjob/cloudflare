export type ContentStatus = "Draft" | "SOP5Review" | "NeedsRevision" | "Ready" | "Live" | "Archived";

export interface Env {
  DB: D1Database;
  DELIVERY_QUEUE: Queue;
  ADMIN_SYNC_TOKEN: string;
  SLACK_SIGNING_SECRET: string;
  SLACK_BOT_TOKEN: string;
  REPLAY_WINDOW_SECONDS?: string;
}

export interface SyncPayload {
  approval: {
    approvalPhrase: string;
    approvedBy: string;
    approvedAt: string;
    targetEnvironment: "staging" | "production";
  };
  contentType: "lesson" | "course";
  content: Record<string, any>;
  contentHash: string;
  requestedAction: "create" | "update" | "sync" | "archive";
  publish_mode?: "queue" | "none";
}
