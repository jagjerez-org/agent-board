#!/bin/bash
# Stop Agent Board
pkill -f "next start.*9100" 2>/dev/null && echo "Agent Board stopped" || echo "Agent Board not running"
rm -f /tmp/agent-board.pid
