# Agent Board Watchdog

Check the board status and recover stuck tasks:

1. Check if Agent Board is running on port 9100
2. Call recovery endpoint to handle stuck tasks
3. Report any issues

## Checks

- **Board status**: `curl -s http://localhost:9100/api/projects` (should return JSON)
- **Task recovery**: `curl -s -X POST http://localhost:9100/api/tasks/recover` (recovers stuck tasks)

If board is down, restart it:
```bash
fuser -k 9100/tcp; sleep 2; cd /tmp/agent-board && setsid node node_modules/.bin/next start -p 9100 -H 0.0.0.0 > /tmp/agent-board.log 2>&1 &
```