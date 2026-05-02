# cloudflare
## P0 MVP Runtime Foundation

This repository now includes a runnable Cloudflare Workers backend scaffold at `workers/api` for a Google-free Slack-native LMS MVP loop.


## Architecture Boundaries

To keep responsibilities explicit and reduce cross-surface risk, this system follows the boundaries below:

- **Slack is interface-only.** Slack receives user interactions (events, commands, interactivity) and displays responses, but it does not own policy, state transitions, or business rules.
- **The Cloudflare Worker is the sole business-logic/runtime authority.** All request validation, auth checks, workflow decisions, and side effects are enforced in `workers/api` before any state change.
- **The D1 database is the source of truth.** Durable platform state lives in the Worker-bound `DB`; external clients should treat API responses as projections of DB-backed state.
- **The frontend dashboard is API-consumer-only.** The dashboard must call Worker APIs and must not contain privileged secrets or direct publish/write authority that bypasses Worker enforcement.

### Frontend repository and required API surface

- **Frontend repository:** Not present in this repository. Add the canonical dashboard repository URL here once finalized (for example: `https://github.com/<org>/<dashboard-repo>`).
- **Required API surface exposed by this repo (`workers/api`):**
  - `GET /health`
  - `POST /admin/content-approval-sync`
  - `POST /api/slack/events`
  - `POST /api/slack/commands`
  - `POST /api/slack/interactivity`

If/when dashboard-specific endpoints are introduced, they must still route through Worker authz/authn and write through the same DB-backed business logic boundary.

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

### Command reference (`workers/api/package.json`)

| Script | Prerequisites | Expected outcome |
| --- | --- | --- |
| `npm run dev` | Wrangler authenticated (`wrangler login`), dependencies installed (`npm install`) | Starts a local Worker development server for manual endpoint checks. |
| `npm run test` | Dependencies installed | Runs the Vitest suite and exits non-zero on failures. |
| `npm run predeploy` | `workers/api/wrangler.toml` placeholders replaced | Fails fast if `REPLACE_*` placeholders remain. |
| `npm run deploy:staging` | `predeploy` passes, staging secrets/DB configured in Cloudflare | Deploys the Worker to the `staging` environment. |
| `npm run deploy:production` | `predeploy` passes, production secrets/DB configured in Cloudflare | Deploys the Worker to the `production` environment. |
| `npm run migrate:staging` | Staging D1 database exists and is bound as `DB` in `wrangler.toml` | Applies pending SQL migrations to staging D1. |
| `npm run migrate:production` | Production D1 database exists and is bound as `DB` in `wrangler.toml` | Applies pending SQL migrations to production D1. |
| `npm run lint` *(optional)* | `eslint` installed via dev dependencies | Runs ESLint over the Worker project and exits non-zero on lint violations. |
| `npm run typecheck` *(optional)* | `typescript` installed via dev dependencies | Runs TypeScript compiler checks without emitting build artifacts. |

### First-time setup (operator runbook)

Use this sequence when onboarding a new operator or setting up a new workstation.

1. **Install prerequisites**
   - Install Node.js 20+ and npm.
   - Install Wrangler CLI (`npm i -g wrangler`) or use `npx wrangler`.
   - Authenticate to Cloudflare: `wrangler login`.

2. **Install project dependencies**

   ```bash
   cd workers/api
   npm install
   ```

3. **Create D1 databases (one per environment)**

   ```bash
   wrangler d1 create slack_lms_staging
   wrangler d1 create slack_lms_production
   ```

4. **Bind D1 IDs in `workers/api/wrangler.toml`**
   - Replace placeholders:
     - `REPLACE_STAGING_D1_DATABASE_ID`
     - `REPLACE_PRODUCTION_D1_DATABASE_ID`

5. **Set environment secrets**

   ```bash
   # Staging
   wrangler secret put ADMIN_SYNC_TOKEN --env staging
   wrangler secret put SLACK_SIGNING_SECRET --env staging
   wrangler secret put SLACK_BOT_TOKEN --env staging

   # Production
   wrangler secret put ADMIN_SYNC_TOKEN --env production
   wrangler secret put SLACK_SIGNING_SECRET --env production
   wrangler secret put SLACK_BOT_TOKEN --env production
   ```

6. **Validate configuration and run quality checks**

   ```bash
   npm run predeploy
   npm run test
   npm run lint
   npm run typecheck
   ```

7. **Apply database migrations**

   ```bash
   npm run migrate:staging
   npm run migrate:production
   ```

8. **Deploy**

   ```bash
   npm run deploy:staging
   npm run deploy:production
   ```

9. **Optional local smoke test**

   ```bash
   npm run dev
   ```

### Placeholder values (must be replaced)
The following placeholders are intentionally unsafe defaults and must be replaced before deploy:
- `REPLACE_WITH_ENV_SPECIFIC_DB_NAME`
- `REPLACE_WITH_ENV_SPECIFIC_D1_DATABASE_ID`
- `REPLACE_WITH_ENV_SPECIFIC_QUEUE_NAME`
- `REPLACE_STAGING_D1_DATABASE_ID`
- `REPLACE_PRODUCTION_D1_DATABASE_ID`
