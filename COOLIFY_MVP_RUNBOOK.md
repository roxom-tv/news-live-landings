# Coolify MVP Runbook

This app is the MVP runtime for Telegram-operated live news landings.

## What It Runs

- Next.js App Router app.
- Separate orchestrator process for pipeline advancement.
- Separate worker process for agent step execution.
- Public URLs under `https://diegodella.ar/landings`.
- Telegram webhook at `/api/telegram` and alias `/landings/api/telegram`.
- Live update cycle at `/api/internal/live-cycle` and alias `/landings/api/internal/live-cycle`.
- SQLite database in a persistent Coolify volume.
- OpenAI agent routing with local fallbacks when `OPENAI_API_KEY` is missing.

## Coolify App

Run three processes from this repository/folder that share the same `/data` volume:

- `web`: Dockerfile / port `3000` / health check `/api/health`
- `orchestrator`: `npm run orchestrator`
- `worker`: `npm run worker`

All three must use the same environment and persistent volume mount to `/data`.

If Coolify path routing cannot directly map `/landings/*`, route the full app through Cloudflare/Coolify and keep the app paths as-is. The app already exposes `/landings` and `/landings/[slug]`.

## Required Environment

```bash
OPENAI_API_KEY=
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
TELEGRAM_WEBHOOK_SECRET=
FINAL_URL_BASE=https://diegodella.ar/landings
LANDINGS_INDEX_URL=https://diegodella.ar/landings
DATABASE_URL=file:/data/news-live.db
LIVE_CYCLE_MINUTES=30
PIPELINE_ENV=prod
INTERNAL_CRON_SECRET=
ADMIN_TOKEN=
CRITIC_REPAIR_ATTEMPTS=8
DEFAULT_MODEL=gpt-5.4-mini
RESEARCH_MODEL=gpt-5.4
WRITER_MODEL=gpt-5.4
DESIGNER_MODEL=gpt-5.4
CRITIC_MODEL=gpt-5.4
LIVE_MONITOR_MODEL=gpt-5.4-mini
LIVE_UPDATER_MODEL=gpt-5.4
```

## Telegram Webhook

After deployment, register the webhook:

```bash
PUBLIC_BASE_URL=https://diegodella.ar ./scripts/set_telegram_webhook.sh
```

If Cloudflare/Coolify routes the app only under `/landings`, use:

```bash
PUBLIC_BASE_URL=https://diegodella.ar API_PREFIX=/landings ./scripts/set_telegram_webhook.sh
```

## Live Update Cycle

The web app scheduler now enqueues live update runs. The orchestrator and worker processes consume those runs asynchronously.

Add a Coolify scheduled task every 30 minutes:

```bash
curl -sS -X POST "https://diegodella.ar/api/internal/live-cycle" \
  -H "x-internal-cron-secret: $INTERNAL_CRON_SECRET"
```

Use `/landings/api/internal/live-cycle` if the app is path-mounted under `/landings`.

## Telegram Commands

```text
/start_live <topic>
/status <slug_or_topic>
/force_update <slug_or_topic>
/pause_live <slug_or_topic>
/resume_live <slug_or_topic>
/final_url <slug_or_topic>
/landings
/help
```

## Admin Agent Editor

Set `ADMIN_TOKEN` in production, then open:

```text
https://diegodella.ar/landings/admin?token=YOUR_ADMIN_TOKEN
```

The editor saves runtime overrides for Research, Writer, Designer, and Critic in `/data/admin-agent-overrides.json` by default. Set `AGENT_OVERRIDES_DIR` to use a different persistent directory. Overrides apply to new agent runs without a rebuild. They do not rewrite the source files in Git.
If the full root app is routed to this service, `/admin` also works. With the current `/landings` path mount, use `/landings/admin`.

## Acceptance Smoke Test

Local or deployed app:

```bash
BASE_URL=http://localhost:3000 ./scripts/smoke_mvp.sh
```

For production:

```bash
BASE_URL=https://diegodella.ar ./scripts/smoke_mvp.sh
```

Make sure `npm run orchestrator` and `npm run worker` are running.

Then send `/start_live bitcoin etf record inflows` in Telegram. Telegram should first return a queued message and later:
   `FINAL URL READY | final_url=https://diegodella.ar/landings/bitcoin-etf-record-inflows`

Open the final URL and trigger `/force_update bitcoin-etf-record-inflows`. Confirm no update is published for `NO_MATERIAL_CHANGE`, and important/critical updates pass Critic before publish.
