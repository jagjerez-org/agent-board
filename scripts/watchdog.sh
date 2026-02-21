#!/bin/bash
# Agent Board watchdog — check health, restart if down
# Intended to be called by cron or heartbeat every ~2 min

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PORT=9100
URL="http://127.0.0.1:$PORT/"

HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 3 --max-time 8 "$URL" 2>/dev/null)

if [[ "$HTTP_CODE" =~ ^2 ]]; then
  echo "OK"
  exit 0
fi

echo "Agent Board DOWN (HTTP=${HTTP_CODE:-refused}). Killing zombie processes..."

# Kill any process on the port (handles zombie/unresponsive servers)
fuser -k $PORT/tcp 2>/dev/null || true
sleep 2

# Double-check port is free, force kill if needed
if ss -tlnp | grep -q ":$PORT "; then
  PID=$(ss -tlnp | grep ":$PORT " | grep -oP 'pid=\K\d+')
  if [ -n "$PID" ]; then
    echo "Force killing PID $PID"
    kill -9 "$PID" 2>/dev/null || true
    sleep 2
  fi
fi

echo "Restarting..."
bash "$SCRIPT_DIR/start.sh"
