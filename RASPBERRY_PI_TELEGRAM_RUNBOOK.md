# Raspberry Pi + Telegram Runbook

This runbook originally described a standalone systemd runner. The MVP now runs as a Coolify-hosted Next.js application on the Raspberry Pi.

Use `COOLIFY_MVP_RUNBOOK.md` as the primary deployment guide.

## 1) Core goals
- Receive commands from Telegram
- Send Telegram alerts when action is needed
- Notify when updates are published
- Send PR URL and final production URL
- Keep live monitoring loop every 30 minutes

## 2) Required environment variables
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`
- `TELEGRAM_WEBHOOK_SECRET` (if webhook mode)
- `GITHUB_TOKEN`
- `GITHUB_REPO`
- `PIPELINE_ENV` (`prod` / `staging`)
- `LIVE_CYCLE_MINUTES=30`
- `FINAL_URL_BASE` (example: `https://diegodella.ar/landings`)
- `LANDINGS_INDEX_URL=https://diegodella.ar/landings`

Store these in a root-owned env file, example:
- `/etc/news-live/news-live.env`

## 3) Telegram command contract
- `/start_live <topic>`
- `/pause_live <topic_or_id>`
- `/resume_live <topic_or_id>`
- `/status <topic_or_id>`
- `/force_update <topic_or_id>`
- `/publish_now <topic_or_id>`
- `/final_url <topic_or_id>`
- `/landings`
- `/help`

## 4) Notification contract (outbound)
Must notify Telegram on:
1. project started
2. material update detected
3. update applied
4. PR opened (include PR URL)
5. critic requested changes
6. PR merged
7. final URL ready (include final URL and landings index URL)
8. blocker/outage (include action required)

## 5) Service model
Run as systemd service with restart policy.

Example unit (`/etc/systemd/system/news-live.service`):

```ini
[Unit]
Description=live news Live Pipeline
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=pi
WorkingDirectory=/opt/news-live
EnvironmentFile=/etc/news-live/news-live.env
ExecStart=/usr/bin/env bash -lc 'node ./runner/live-pipeline.js'
Restart=always
RestartSec=5
TimeoutStopSec=20

[Install]
WantedBy=multi-user.target
```

Then:

```bash
sudo systemctl daemon-reload
sudo systemctl enable news-live
sudo systemctl start news-live
sudo systemctl status news-live
```

## Quick start after copying to Raspberry Pi

From project root:

```bash
chmod +x ./scripts/raspberry_install.sh ./scripts/raspberry_start.sh
./scripts/raspberry_install.sh
sudo nano /etc/news-live/news-live.env
./scripts/raspberry_start.sh
```

If the service starts correctly, tail logs with:

```bash
journalctl -u news-live -f
```

## 6) Scheduler behavior
- Tick every 30 minutes
- Load last cycle state from persistent storage
- Run LiveMonitor -> LiveUpdater -> TVDesigner -> Publisher
- Emit Telegram events at each milestone
- Save state and timestamps after each stage

## 7) State persistence
Persist at minimum:
- active topic id
- last successful cycle UTC
- last applied delta id/hash
- latest PR URL
- final URL (once available)

Recommended storage:
- SQLite or JSON file under `/var/lib/news-live/`

## 8) Health and observability
- Heartbeat every cycle to Telegram in compact format (`OK` + timestamp)
- Expose local health endpoint or status command
- Use journal logs:

```bash
journalctl -u news-live -f
```

## 9) Final URL policy
Final completion is not "PR opened". Final completion requires:
1. PR merged
2. production URL reachable (HTTP 200)
3. Telegram "FINAL URL READY" message sent with `final_url`
4. Telegram message includes `index_url=https://diegodella.ar/landings`

## 11) Canonical public URL policy
- Landing list/index is always `https://diegodella.ar/landings`
- All Telegram responses that mention completion must include the index URL
- `/landings` command must always return the canonical index URL

## 10) Raspberry Pi hardening checklist
- Keep OS updated
- Restrict file permissions on env file
- Run service as non-root user
- Configure automatic reboot recovery
- Ensure clock sync (NTP) for reliable UTC timestamps
