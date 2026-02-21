#!/bin/bash
# Start Agent Board if not already running
set -e

APP_DIR="/tmp/agent-board"
PORT=9100
LOG_FILE="/tmp/agent-board.log"
PID_FILE="/tmp/agent-board.pid"

# Check if already running AND responding
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 3 --max-time 8 "http://localhost:$PORT" 2>/dev/null)
if [[ "$HTTP_CODE" =~ ^2 ]]; then
  echo "Agent Board already running on port $PORT"
  exit 0
fi

if [ ! -d "$APP_DIR" ]; then
  echo "ERROR: Agent Board not found at $APP_DIR"
  echo "Clone it: git clone https://github.com/jagjerez-org/agent-board.git $APP_DIR"
  exit 1
fi

cd "$APP_DIR"

# Install deps if needed
if [ ! -d "node_modules" ]; then
  echo "Installing dependencies..."
  npm install
fi

# Build if needed
if [ ! -d ".next" ]; then
  echo "Building..."
  npx next build
fi

# Kill any orphan on the port
fuser -k $PORT/tcp 2>/dev/null || true
sleep 1

# Start in background with setsid (survives shell exit)
echo "Starting Agent Board on port $PORT..."
setsid node node_modules/.bin/next start -p $PORT -H 0.0.0.0 >> "$LOG_FILE" 2>&1 &
echo $! > "$PID_FILE"

# Wait for it to be ready
for i in $(seq 1 15); do
  if curl -s -o /dev/null --connect-timeout 3 "http://localhost:$PORT" 2>/dev/null; then
    echo "Agent Board ready at http://0.0.0.0:$PORT"
    exit 0
  fi
  sleep 1
done

echo "Agent Board started (PID $(cat $PID_FILE)) but may still be warming up"
