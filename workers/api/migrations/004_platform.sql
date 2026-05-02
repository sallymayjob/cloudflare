CREATE TABLE IF NOT EXISTS slack_workspaces (
  id TEXT PRIMARY KEY,
  slack_team_id TEXT NOT NULL UNIQUE,
  team_name TEXT,
  bot_user_id TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS admin_users (
  id TEXT PRIMARY KEY,
  workspace_id TEXT,
  email TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(workspace_id) REFERENCES slack_workspaces(id)
);

CREATE TABLE IF NOT EXISTS assets (
  id TEXT PRIMARY KEY,
  workspace_id TEXT,
  path TEXT NOT NULL,
  content_type TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(workspace_id) REFERENCES slack_workspaces(id)
);
CREATE INDEX IF NOT EXISTS idx_assets_workspace ON assets(workspace_id);
