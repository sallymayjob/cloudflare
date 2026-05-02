CREATE TABLE IF NOT EXISTS learners (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  slack_user_id TEXT NOT NULL,
  display_name TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(workspace_id, slack_user_id)
);

CREATE TABLE IF NOT EXISTS cohorts (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS enrollments (
  id TEXT PRIMARY KEY,
  learner_id TEXT NOT NULL,
  cohort_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(learner_id, cohort_id),
  FOREIGN KEY(learner_id) REFERENCES learners(id),
  FOREIGN KEY(cohort_id) REFERENCES cohorts(id)
);

CREATE TABLE IF NOT EXISTS lesson_queue (
  id TEXT PRIMARY KEY,
  lesson_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  learner_id TEXT,
  status TEXT NOT NULL CHECK(status IN ('queued','processing','delivered','failed','retrying','skipped')),
  due_at TEXT NOT NULL,
  delivered_at TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  idempotency_key TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(idempotency_key),
  FOREIGN KEY(lesson_id) REFERENCES lessons(id),
  FOREIGN KEY(learner_id) REFERENCES learners(id)
);
CREATE INDEX IF NOT EXISTS idx_lesson_queue_status_due ON lesson_queue(status, due_at);

CREATE TABLE IF NOT EXISTS submissions (
  id TEXT PRIMARY KEY,
  learner_id TEXT NOT NULL,
  lesson_id TEXT NOT NULL,
  submission_text TEXT,
  status TEXT NOT NULL DEFAULT 'submitted',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(learner_id) REFERENCES learners(id),
  FOREIGN KEY(lesson_id) REFERENCES lessons(id)
);

CREATE TABLE IF NOT EXISTS learner_progress (
  id TEXT PRIMARY KEY,
  learner_id TEXT NOT NULL,
  lesson_id TEXT NOT NULL,
  progress_status TEXT NOT NULL DEFAULT 'not_started',
  completed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(learner_id, lesson_id),
  FOREIGN KEY(learner_id) REFERENCES learners(id),
  FOREIGN KEY(lesson_id) REFERENCES lessons(id)
);
