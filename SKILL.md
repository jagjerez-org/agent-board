---
name: agent-board
description: AI-driven Kanban board for task management, Git worktrees, code editing, and agent orchestration. Auto-starts on skill load. Includes built-in watchdog to keep the service alive.
---

# Agent Board

Trello-like task management board for AI agent orchestration. Next.js app at port 9100.

## Setup (on first load)

1. Start the service:
```bash
bash skills/agent-board/scripts/start.sh
```

2. Register the watchdog cron job to keep it alive (run once):
```bash
# The agent should create this cron job automatically:
```
Use `cron add` with:
- `name`: `watchdog:agent-board`
- `schedule`: `{"kind": "every", "everyMs": 120000}`
- `sessionTarget`: `"isolated"`
- `delivery`: `{"mode": "none"}`
- `payload`: `{"kind": "agentTurn", "message": "Run: bash $HOME/.openclaw/workspace/skills/agent-board/scripts/watchdog.sh — if output contains 'Restarting', report to user. Otherwise reply OK.", "timeoutSeconds": 30}`

Before creating, check `cron list` for existing `watchdog:agent-board`. Update if exists, create if not.

3. Add to HEARTBEAT.md as backup (optional):
```markdown
## Agent Board Health Check
Check if http://127.0.0.1:9100/ is responding. If not:
\`\`\`bash
bash skills/agent-board/scripts/start.sh
\`\`\`
Report to user only if it was down and you restarted it.
```

## Access

- **Local:** http://localhost:9100
- **LAN:** http://<host-ip>:9100

## Features

- **Kanban Board** — drag-and-drop tasks across status columns
- **Git Worktrees** — branch management, worktree creation, per-branch preview/logs
- **Code Editor** — Monaco editor with TypeScript lint, autocomplete, file creation
- **Skills Management** — CRUD skills, ClawHub integration, per-agent assignment
- **Agents** — view agent hierarchy, status, skill assignments
- **Projects** — auto-discovered from GitHub/GitLab providers
- **Preview** — auto-detect project type (Flutter/Node/monorepo), spawn dev servers per worktree
- **Multi-Console** — multiple terminal tabs per worktree branch

## Scripts

| Script | Purpose |
|--------|---------|
| `scripts/start.sh` | Start if not running (idempotent, uses `setsid`) |
| `scripts/stop.sh` | Stop the service |
| `scripts/watchdog.sh` | Health check + auto-restart if down |

## Rebuild after code changes

```bash
cd /tmp/agent-board && npx next build
bash skills/agent-board/scripts/stop.sh
bash skills/agent-board/scripts/start.sh
```

## Source

- Repo: https://github.com/jagjerez-org/agent-board
- Local: /tmp/agent-board
- Storage: /tmp/agent-board/data/ (markdown + YAML frontmatter)
