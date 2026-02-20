# Agent Board

A Trello-like kanban board for AI agent orchestration with OpenClaw.

## Features

- **Kanban Board** — drag-and-drop task management with customizable columns
- **Git Worktree Integration** — manage multiple branches simultaneously via `git worktree`
- **Preview Visualizer** — side-by-side iframe previews of running dev servers per branch
- **Real-Time Logs** — SSE streaming of build/test output with terminal-like viewer
- **Multi-Provider Git** — GitHub, GitLab, and Azure DevOps support
- **Agent Management** — register agents, view live status, read logs and edit workspace files
- **Project Discovery** — auto-discover repos from configured git providers
- **File-Based Storage** — markdown + YAML frontmatter, no database required

## Setup

```bash
cd agent-board
npm install
npm run build
PORT=3100 npm start
```

## Usage

Open `http://localhost:3100` in your browser.

- **Board** — create and manage tasks, drag between columns
- **Projects** — discover repos, configure git providers
- **Agents** — register AI agents, view org chart, monitor status
- **Worktrees** — manage git worktrees, run previews, view logs
- **Activity** — real-time feed of all board events

## Configuration

Git providers are configured in `data/config/git-providers.json`:

```json
{
  "providers": [
    { "type": "github", "name": "GitHub", "cli": "gh", "orgs": ["my-org"] },
    { "type": "gitlab", "name": "GitLab", "cli": "glab", "orgs": [] },
    { "type": "azure-devops", "name": "Azure", "cli": "", "azureOrg": "my-org", "azurePat": "..." }
  ]
}
```

## API Reference

See README.md for full API documentation.
