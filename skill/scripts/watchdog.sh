#!/bin/bash
# Agent Board watchdog — check health, restart if down
# Intended to be called by cron or heartbeat every ~2 min

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PORT=9100
URL="http://127.0.0.1:$PORT/"

HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 5 "$URL" 2>/dev/null)

if [[ "$HTTP_CODE" =~ ^2 ]]; then
  echo "OK"
  exit 0
fi

echo "Agent Board DOWN (${HTTP_CODE:-refused}). Restarting..."
bash "$SCRIPT_DIR/start.sh"
