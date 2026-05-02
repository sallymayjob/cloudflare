# cloudflare
## P0 MVP Runtime Foundation

This repository now includes a runnable Cloudflare Workers backend scaffold at `workers/api` for a Google-free Slack-native LMS MVP loop.

### Worker routes
- `GET /health`
- `POST /admin/content-approval-sync`
- `POST /api/slack/events`
- `POST /api/slack/commands`
- `POST /api/slack/interactivity`

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

## Environment setup and deployment
Run all commands from `workers/api` unless noted.

### 1) Create and bind D1 per environment
Create one D1 database per deploy environment and then copy the IDs into `wrangler.toml`.

```bash
# Create D1 databases
wrangler d1 create slack_lms_staging
wrangler d1 create slack_lms_production

# Then replace placeholders in workers/api/wrangler.toml:
# - REPLACE_STAGING_D1_DATABASE_ID
# - REPLACE_PRODUCTION_D1_DATABASE_ID
```

Optional: run migrations per environment after DB IDs are bound.

```bash
wrangler d1 migrations apply DB --env staging
wrangler d1 migrations apply DB --env production
```

### 2) Set secrets per environment
Set each required secret separately for `staging` and `production`.

```bash
# Staging secrets
wrangler secret put ADMIN_SYNC_TOKEN --env staging
wrangler secret put SLACK_SIGNING_SECRET --env staging
wrangler secret put SLACK_BOT_TOKEN --env staging

# Production secrets
wrangler secret put ADMIN_SYNC_TOKEN --env production
wrangler secret put SLACK_SIGNING_SECRET --env production
wrangler secret put SLACK_BOT_TOKEN --env production
```

### 3) Deploy with explicit environment
A predeploy check is required and fails if any `REPLACE_*` placeholder remains in `wrangler.toml`.

```bash
# Validate config placeholders are fully replaced
npm run predeploy

# Deploy explicitly to staging or production
wrangler deploy --env staging
wrangler deploy --env production

# Or use convenience scripts (runs predeploy automatically)
npm run deploy:staging
npm run deploy:production
```

### Placeholder values (must be replaced)
The following placeholders are intentionally unsafe defaults and must be replaced before deploy:
- `REPLACE_WITH_ENV_SPECIFIC_DB_NAME`
- `REPLACE_WITH_ENV_SPECIFIC_D1_DATABASE_ID`
- `REPLACE_WITH_ENV_SPECIFIC_QUEUE_NAME`
- `REPLACE_STAGING_D1_DATABASE_ID`
- `REPLACE_PRODUCTION_D1_DATABASE_ID`
