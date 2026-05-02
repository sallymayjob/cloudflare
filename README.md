# cloudflare
## P0 MVP Runtime Foundation

This repository now includes a runnable Cloudflare Workers backend scaffold at `workers/api` for a Google-free Slack-native LMS MVP loop.

### Worker routes
- `GET /health`
- `POST /admin/content-approval-sync`
- `POST /api/slack/events`
- `POST /api/slack/commands`
- `POST /api/slack/interactions`

### Environment variables / secrets
Set with Wrangler secrets/vars:
- `ADMIN_SYNC_TOKEN` (required)
- `SLACK_SIGNING_SECRET` (required)
- `SLACK_BOT_TOKEN` (required)
- `REPLAY_WINDOW_SECONDS` (optional; default 300)

### D1 migrations
Migration files are in `workers/api/migrations`:
1. `001_core_content.sql`
2. `002_learning_runtime.sql`
3. `003_governance.sql`
4. `004_platform.sql`

Run locally/deploy with Wrangler migration tooling against your `DB` binding.

### Local testing
From `workers/api`:
- `npm install`
- `npm test`

Tests cover:
- Sync auth/idempotency rejection behavior
- Slack signature valid/invalid/replay behavior
- Slack `url_verification` handling
