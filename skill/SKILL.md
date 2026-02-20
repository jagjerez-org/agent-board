---
name: agent-board
description: Kanban board UI for managing tasks and AI agent orchestration. Create, refine, assign, and track tasks across agents.
metadata:
  openclaw:
    emoji: "📋"
    requires:
      bins: ["node", "npm"]
---

# Agent Board Skill

A Trello-like kanban board designed specifically for AI agent orchestration with OpenClaw.

## Features

- **📋 Kanban Board**: 7-column workflow (Backlog → Refinement → Pending Approval → To Do → In Progress → Review → Done)
- **🤖 Agent Management**: Org chart view of agent hierarchy with status tracking
- **📝 File-based Storage**: Human-readable tasks stored as markdown with YAML frontmatter
- **🔄 Activity Feed**: Track all task and agent activities
- **🎯 Smart Filtering**: Filter tasks by assignee, priority, labels, and status
- **📊 Real-time Updates**: Live board updates as tasks move through workflow
- **🔗 GitHub Integration**: Link and track PR status for each task

## Task Workflow

### Status Transitions
```
📋 Backlog → 🔍 Refinement → ⏳ Pending Approval → 🔜 To Do → 🏃 In Progress → 👀 Review → ✅ Done
```

Valid transitions:
- **Backlog** → Refinement (needs clarification)
- **Refinement** → Pending Approval (refined and ready) or back to Backlog
- **Pending Approval** → To Do (approved) or back to Refinement (needs rework)
- **To Do** → In Progress (agent picks up) or back to Backlog
- **In Progress** → Review (ready for review) or back to Backlog
- **Review** → Done (approved) or back to Refinement (needs rework) or back to Backlog
- Any status → Backlog (deprioritize/archive)

## File Structure

```
data/
├── tasks/
│   ├── {task-id}.md          # Task with YAML frontmatter + comments
│   └── ...
├── agents/
│   ├── {agent-id}.json       # Agent config and status
│   └── ...
├── activity.jsonl             # Append-only activity log
├── board-state.json           # Board preferences
└── index.json                 # Task index for fast queries
```

### Task File Format

```markdown
---
id: abc123
title: Fix entity switching bug
status: in_progress
priority: high
assignee: worker-opus
story_points: 5
due_date: 2026-03-01
pr_url: https://github.com/user/repo/pull/188
pr_status: open
labels: [bug, urgent]
sort_order: 0
created_at: 2026-02-20T01:00:00Z
updated_at: 2026-02-20T02:00:00Z
---

## Description

Fix the entity switching behavior when navigating between detail pages...

## Comments

### user — 2026-02-20 01:30:00
Please check the redirect logic in entity-switcher.tsx

### worker-opus — 2026-02-20 01:45:00
Found the issue. The `routeCapabilityMap` wasn't checking nested routes...
```

## API Endpoints

### Tasks
- `GET /api/tasks` - List tasks (supports filtering)
- `POST /api/tasks` - Create task
- `GET /api/tasks/{id}` - Get task with comments
- `PATCH /api/tasks/{id}` - Update task
- `DELETE /api/tasks/{id}` - Delete task
- `POST /api/tasks/{id}/move` - Move to new status
- `POST /api/tasks/{id}/assign` - Assign to agent
- `POST /api/tasks/{id}/comments` - Add comment
- `POST /api/tasks/{id}/link-pr` - Link GitHub PR

### Agents
- `GET /api/agents` - List agents
- `POST /api/agents` - Register agent
- `PATCH /api/agents/{id}` - Update agent
- `POST /api/agents/seed` - Seed default OpenClaw agents

### Activity
- `GET /api/activity` - Activity feed (supports filtering)

## Usage

### Start the Board
```bash
# Development mode
npm run dev

# Production mode
npm run build && npm start
```

### Create Tasks
1. Click "+" button on any column
2. Fill out task details (title, description, priority, etc.)
3. Assign to agent or leave unassigned
4. Task starts in Backlog unless created in specific column

### Manage Agents
1. Go to Agents page
2. Click "Seed Agents" to add default OpenClaw agents
3. View agent hierarchy and current status
4. Agents auto-update to "busy" when assigned tasks

### Track Activity
- View global activity feed on Activity page
- Filter by agent, task, or time period
- See task state transitions, assignments, comments, etc.

## Integration with OpenClaw

### Agent Names
The board recognizes standard OpenClaw agents:
- `worker-opus` - Heavy reasoning tasks
- `worker-heavy` - Complex coding/analysis
- `worker-light` - Quick tasks
- `worker-research` - Web research
- `worker-desktop` - UI automation
- `worker-code` - Code-specific tasks

### File Storage Philosophy
Like OpenClaw's memory system:
- Human-readable files (can edit tasks in any text editor)
- Git-friendly (version control, diffs, blame)
- No database dependencies
- Easy backup and portability

## Development

### Run Tests
```bash
npm test
```

### Lint Code
```bash
npm run lint
```

### Project Structure
```
src/
├── app/                  # Next.js app router pages
├── components/           # React components
│   ├── board/           # Kanban board components
│   ├── agents/          # Agent management
│   └── ui/              # shadcn/ui components
├── lib/                 # Core logic
│   ├── storage.ts       # File-based storage
│   ├── task-store.ts    # Task operations
│   ├── agent-store.ts   # Agent operations
│   └── types.ts         # TypeScript definitions
└── __tests__/           # Test files
```

## Customization

### Add Custom Statuses
1. Update `TaskStatus` type in `src/lib/types.ts`
2. Add to `TASK_STATUSES` array
3. Update `VALID_TRANSITIONS` mapping
4. Add column title in `COLUMN_TITLES`

### Add Custom Fields
1. Update `Task` interface in `src/lib/types.ts`
2. Modify task forms in components
3. Update storage serialization if needed

### Custom Agent Types
1. Update `DEFAULT_AGENTS` in `src/lib/types.ts`
2. Add custom capabilities and roles
3. Update agent display logic

The Agent Board grows with your workflow needs while maintaining the simplicity and transparency of file-based storage.