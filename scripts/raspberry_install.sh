#!/usr/bin/env bash
set -euo pipefail

echo "[1/4] Installing base packages for Coolify-hosted MVP..."
sudo apt-get update
sudo apt-get install -y curl ca-certificates git jq

echo "[2/4] Creating persistent data directory..."
sudo mkdir -p /data
sudo chmod 755 /data

echo "[3/4] Writing env template for Coolify reference..."
sudo mkdir -p /etc/news-live
if [[ ! -f /etc/news-live/news-live.env ]]; then
  sudo tee /etc/news-live/news-live.env >/dev/null <<'EOF'
OPENAI_API_KEY=REPLACE_ME
TELEGRAM_BOT_TOKEN=REPLACE_ME
TELEGRAM_CHAT_ID=REPLACE_ME
TELEGRAM_WEBHOOK_SECRET=REPLACE_ME
FINAL_URL_BASE=https://diegodella.ar/landings
LANDINGS_INDEX_URL=https://diegodella.ar/landings
DATABASE_URL=file:/data/news-live.db
LIVE_CYCLE_MINUTES=30
PIPELINE_ENV=prod
INTERNAL_CRON_SECRET=REPLACE_ME
DEFAULT_MODEL=gpt-5.4-mini
RESEARCH_MODEL=gpt-5.4
WRITER_MODEL=gpt-5.4
DESIGNER_MODEL=gpt-5.4
CRITIC_MODEL=gpt-5.4
LIVE_MONITOR_MODEL=gpt-5.4-mini
LIVE_UPDATER_MODEL=gpt-5.4
EOF
  sudo chmod 600 /etc/news-live/news-live.env
fi

echo "[4/4] Done."
echo
echo "Next:"
echo "  1. Create a Coolify app from this project."
echo "  2. Mount a persistent volume to /data."
echo "  3. Copy env values from /etc/news-live/news-live.env into Coolify."
echo "  4. Follow COOLIFY_MVP_RUNBOOK.md for webhook and live-cycle setup."
