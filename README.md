# Agent Board 📋

A Trello-like kanban board designed specifically for AI agent orchestration with OpenClaw.

## Features

- **📋 Kanban Board**: 7-column workflow optimized for agent task management
- **🤖 Agent Management**: View and organize your OpenClaw agents in a hierarchy
- **📝 File-based Storage**: Human-readable tasks stored as markdown files (no database!)
- **🔄 Activity Feed**: Track all task and agent activities across your workspace
- **🎯 Smart Filtering**: Filter by assignee, priority, labels, and status
- **🔗 GitHub Integration**: Link and track PR status for development tasks

## Quick Start

### Development
```bash
npm install
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000)

### Production
```bash
npm run build
npm start
```

## Task Workflow

```
📋 Backlog → 🔍 Refinement → ⏳ Pending Approval → 🔜 To Do → 🏃 In Progress → 👀 Review → ✅ Done
```

### Status Meanings
- **📋 Backlog**: New tasks, ideas, and requests
- **🔍 Refinement**: Tasks being clarified and scoped
- **⏳ Pending Approval**: Refined tasks waiting for approval to proceed
- **🔜 To Do**: Approved tasks ready to be picked up
- **🏃 In Progress**: Tasks currently being worked on by agents
- **👀 Review**: Completed work waiting for review
- **✅ Done**: Completed and approved tasks

## Storage System

Unlike traditional kanban tools, Agent Board uses a file-based storage system similar to OpenClaw's memory approach:

```
data/
├── tasks/
│   ├── task-abc123.md        # Each task is a markdown file
│   └── task-def456.md
├── agents/
│   ├── worker-opus.json      # Agent configs
│   └── worker-heavy.json
├── activity.jsonl             # Activity log
├── board-state.json           # Board preferences
└── index.json                 # Task index
```

### Benefits
- ✅ **Human-readable**: Edit tasks in any text editor
- ✅ **Git-friendly**: Version control, diffs, blame
- ✅ **No database**: Simple file-based persistence
- ✅ **Portable**: Easy backup and migration
- ✅ **Transparent**: See exactly how data is stored

## API

RESTful API for programmatic access:

### Tasks
- `GET /api/tasks` - List tasks with filtering
- `POST /api/tasks` - Create task
- `GET /api/tasks/{id}` - Get task details
- `PATCH /api/tasks/{id}` - Update task
- `POST /api/tasks/{id}/move` - Move to new status
- `POST /api/tasks/{id}/assign` - Assign to agent

### Agents
- `GET /api/agents` - List agents
- `POST /api/agents/seed` - Seed default OpenClaw agents

### Activity
- `GET /api/activity` - Activity feed

## OpenClaw Integration

### Default Agents
The board comes pre-configured with standard OpenClaw agents:
- **worker-opus**: Heavy reasoning and complex tasks
- **worker-heavy**: Coding and analysis
- **worker-light**: Quick tasks and formatting
- **worker-research**: Web research and reporting
- **worker-desktop**: UI automation
- **worker-code**: Code-specific tasks

Run `/api/agents/seed` to automatically create these agents.

### Agent Orchestration
- Assign tasks to specific agents based on capabilities
- Track agent status (idle/busy/offline)
- View agent hierarchy and relationships
- Monitor agent workload and activity

## Development

### Tech Stack
- **Next.js 15**: App Router, TypeScript
- **Tailwind CSS**: Styling with shadcn/ui components  
- **@dnd-kit**: Drag and drop functionality
- **File Storage**: Markdown + JSON (no database)
- **Vitest**: Unit testing

### Project Structure
```
src/
├── app/                    # Next.js pages
│   ├── page.tsx           # Main kanban board
│   ├── agents/            # Agent management
│   └── activity/          # Activity feed
├── components/
│   ├── board/             # Kanban components
│   ├── agents/            # Agent components
│   └── ui/                # shadcn/ui components
├── lib/
│   ├── storage.ts         # File operations
│   ├── task-store.ts      # Task business logic
│   ├── agent-store.ts     # Agent business logic
│   └── types.ts           # TypeScript definitions
└── __tests__/             # Tests
```

### Testing
```bash
npm test         # Run tests in watch mode
npm run test:run # Run tests once
```

### Linting
```bash
npm run lint
```

## OpenClaw Skill

This project includes an OpenClaw skill package in the `skill/` directory:

```bash
# Start as OpenClaw skill
./skill/scripts/start.sh
```

The skill will:
1. Install dependencies if needed
2. Build the application
3. Start on port 3100
4. Integrate with your OpenClaw workspace

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Ensure all tests pass: `npm run test:run`
6. Submit a pull request

## License

MIT License - see LICENSE file for details.

---

Built for the OpenClaw ecosystem 🤖