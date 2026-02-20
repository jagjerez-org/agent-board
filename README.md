# 📋 Agent Board

[![CI](https://github.com/jagjerez-org/agent-board/actions/workflows/ci.yml/badge.svg)](https://github.com/jagjerez-org/agent-board/actions/workflows/ci.yml)

**Trello-like task management for AI agent orchestration.**

A self-hosted project board built for managing tasks across AI agents (OpenClaw workers). Features drag-and-drop kanban, project-scoped boards with Git provider integration, real-time agent status, file editing, and activity tracking.

## Table of Contents

- [Quick Start](#quick-start)
- [Architecture](#architecture)
- [Database (File Storage)](#database-file-storage)
- [Sections & Features](#sections--features)
- [API Reference](#api-reference)
- [Configuration](#configuration)
- [Git Provider Integration](#git-provider-integration)
- [Deployment](#deployment)
  - [Standalone (Node.js)](#standalone-nodejs)
  - [Nginx Reverse Proxy](#nginx-reverse-proxy)
  - [Docker](#docker)
  - [Docker Compose](#docker-compose)
  - [Kubernetes](#kubernetes)
- [OpenClaw Skill Integration](#openclaw-skill-integration)
- [Development](#development)

---

## Quick Start

```bash
# Clone
git clone https://github.com/jagjerez-org/agent-board.git
cd agent-board

# Install & build
npm install
npm run build

# Start (production)
npm start
# → http://localhost:3100
```

---

## Architecture

```
agent-board/
├── src/
│   ├── app/                    # Next.js App Router pages + API routes
│   │   ├── page.tsx            # Board (kanban) page
│   │   ├── agents/page.tsx     # Agents page (list + org chart)
│   │   ├── activity/page.tsx   # Activity feed
│   │   └── api/                # REST API endpoints
│   ├── components/
│   │   ├── board/              # Kanban board, task cards, task sheet
│   │   ├── agents/             # Agent org chart, agent sheet, tree view
│   │   └── ui/                 # shadcn/ui components
│   ├── hooks/                  # Custom hooks (SSE events)
│   └── lib/                    # Storage, stores, types, utilities
├── data/                       # 📁 All persistent data (the "database")
│   ├── tasks/                  # Task markdown files
│   ├── agents/                 # Agent JSON files
│   ├── projects/               # Project JSON files
│   ├── config/                 # Configuration files
│   │   └── git-providers.json  # Git provider settings
│   ├── activity.jsonl          # Activity log (append-only)
│   ├── index.json              # Task index for fast queries
│   └── board-state.json        # Board UI state
└── package.json
```

**Tech Stack:**
- **Framework:** Next.js 16.1 (App Router) + React 19
- **UI:** shadcn/ui + Tailwind CSS + Radix Primitives
- **Storage:** File-based (Markdown + YAML frontmatter + JSON)
- **Realtime:** Server-Sent Events (SSE)
- **Drag & Drop:** Native HTML5 Drag API (no library — avoids React 19 incompatibilities)

---

## Database (File Storage)

Agent Board uses **no database**. All data lives as files in the `data/` directory. This is intentional — it's human-readable, git-friendly, and works like OpenClaw's own memory system.

### How It Works

#### Tasks → `data/tasks/{id}.md`

Each task is a **Markdown file with YAML frontmatter**:

```markdown
---
id: fb5ae89e-0723-441a-94dc-e0f83a42b9ac
title: Fix entity switching bug
status: refinement
priority: high
project_id: kadens
labels:
  - bug
  - kadens
assignee: worker-opus
sort_order: 0
created_at: '2026-02-20T05:35:53.508Z'
updated_at: '2026-02-20T06:47:20.798Z'
---
Redirect to parent page when switching entities

## Comments

### user — 2026-02-20 05:36:06
Check the redirect logic in entity-switcher.tsx
```

- **Frontmatter** = structured metadata (status, priority, assignee, etc.)
- **Body** = task description (free-form markdown)
- **Comments** = appended as markdown sections under `## Comments`
- Parsed using [`gray-matter`](https://github.com/jonschlinkert/gray-matter)

#### Agents → `data/agents/{id}.json`

```json
{
  "id": "worker-opus",
  "name": "Worker Opus",
  "model": "anthropic/claude-opus-4-6",
  "role": "heavy",
  "parent_agent_id": null,
  "capabilities": ["coding", "research", "writing", "analysis"],
  "status": "idle",
  "current_task_id": null
}
```

#### Projects → `data/projects/{id}.json`

```json
{
  "id": "kadens",
  "name": "Kadens",
  "description": "NestJS + Next.js monorepo",
  "repo_url": "https://github.com/hubdance/kadens",
  "repo_owner": "hubdance",
  "repo_name": "kadens",
  "created_at": "2026-02-20T06:00:00Z"
}
```

#### Activity Log → `data/activity.jsonl`

Append-only JSONL (one JSON object per line):

```jsonl
{"id":"abc123","task_id":"fb5ae89e...","agent_id":"worker-opus","action":"task:moved","details":{"from":"backlog","to":"refinement"},"created_at":"2026-02-20T06:00:00Z"}
```

#### Task Index → `data/index.json`

A denormalized index for fast queries (rebuilt automatically):

```json
{
  "tasks": [
    { "id": "...", "status": "backlog", "priority": "high", "assignee": "worker-opus", "title": "..." }
  ],
  "last_updated": "2026-02-20T06:00:00Z"
}
```

### Why Files Instead of a Database?

| Feature | File Storage | SQLite/Postgres |
|---------|-------------|-----------------|
| Human-readable | ✅ Open in any editor | ❌ Need client |
| Git-friendly | ✅ Diff, commit, PR | ❌ Binary blobs |
| Zero dependencies | ✅ No DB server | ❌ Need runtime |
| Backup | ✅ Just copy `data/` | ⚠️ pg_dump/etc |
| Performance at scale | ⚠️ 1000s of tasks OK | ✅ Millions |
| ACID transactions | ❌ No | ✅ Yes |

**For AI agent orchestration with <10K tasks, file storage is the right trade-off.**

### Backup & Restore

```bash
# Backup
tar -czf agent-board-backup.tar.gz data/

# Restore
tar -xzf agent-board-backup.tar.gz

# Or just git commit the data/ directory
cd data && git init && git add -A && git commit -m "backup"
```

---

## Sections & Features

### 📋 Board (Kanban)

The main view. A 7-column kanban board following the workflow:

**Backlog → Refinement → Pending Approval → To Do → In Progress → Review → Done**

Features:
- **Drag & drop** — grab any card and drop it on another column (native HTML5 Drag API)
- **Task cards** — show title, priority badge (color-coded), labels, assignee
- **Column + button** — create a task directly in that column
- **Click to edit** — opens a side sheet with full task details
- **Project filter** — dropdown in header to scope the board to a project
- **Real-time updates** — SSE connection, board refreshes when tasks change
- **Live indicator** — green dot when connected to SSE

### 👥 Agents

Two views (toggle between them):

**List View:**
- Hierarchical card list showing all agents
- Each card: avatar, name, role badge, status (live from OpenClaw), model, capabilities
- Parent → child indentation
- Live subagent sessions shown as dashed cards under their parent
- Click any agent to open detail sheet

**Org Chart View:**
- Visual tree layout with connecting lines
- Same info as list but spatial/visual hierarchy

**Agent Detail Sheet (3 tabs):**

| Tab | Description |
|-----|-------------|
| **Details** | View/edit agent info (name, model, role, parent, capabilities). Delete agent. Live status banner (idle/busy + token count). |
| **Logs** | Real-time transcript from OpenClaw sessions. Color-coded by role (user/assistant/tool). Auto-refresh toggle (5s polling). Shows tool calls, results, and which session/subagent. |
| **Files** | Browse and edit workspace files (SOUL.md, AGENTS.md, USER.md, MEMORY.md, IDENTITY.md, TOOLS.md, HEARTBEAT.md, openclaw.json). Monospace editor with Save button. |

### 📊 Activity

Chronological feed of all board events:
- Task created, moved, updated, deleted
- Agent assignments
- Comments added

### ⚙️ Settings

- Board info (storage path, API URL, SSE endpoint)
- Column order / workflow documentation
- Git provider configuration

---

## API Reference

### Tasks

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/tasks` | List tasks. Query: `?groupBy=status`, `?project=<id>` |
| `POST` | `/api/tasks` | Create task. Body: `{ title, status?, priority?, project_id?, ... }` |
| `GET` | `/api/tasks/[id]` | Get task with comments |
| `PATCH` | `/api/tasks/[id]` | Update task fields |
| `DELETE` | `/api/tasks/[id]` | Delete task |
| `POST` | `/api/tasks/[id]/move` | Move to status. Body: `{ status }` |
| `POST` | `/api/tasks/[id]/assign` | Assign agent. Body: `{ agent_id }` |
| `POST` | `/api/tasks/[id]/comments` | Add comment. Body: `{ author, content }` |
| `POST` | `/api/tasks/[id]/link-pr` | Link PR. Body: `{ pr_url }` |

### Agents

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/agents` | List agents. Query: `?format=hierarchy` |
| `POST` | `/api/agents` | Register agent. Body: `{ id, name, model?, role?, ... }` |
| `GET` | `/api/agents/[id]` | Get agent |
| `PATCH` | `/api/agents/[id]` | Update agent |
| `DELETE` | `/api/agents/[id]` | Delete agent |
| `POST` | `/api/agents/seed` | Seed default OpenClaw agents |
| `GET` | `/api/agents/live` | Live status from OpenClaw sessions |
| `GET` | `/api/agents/[id]/logs` | Agent transcripts. Query: `?limit=50` |

### Projects

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/projects` | List all projects |
| `POST` | `/api/projects` | Create project. Body: `{ name, repo_url?, ... }` |
| `GET` | `/api/projects/[id]` | Get project |
| `PATCH` | `/api/projects/[id]` | Update project |
| `DELETE` | `/api/projects/[id]` | Delete project |

### Git Integration

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/git/providers` | List configured Git providers |
| `GET` | `/api/git/repos` | List repos from all providers |

### Files

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/files?path=<path>` | Read workspace file |
| `PUT` | `/api/files` | Write workspace file. Body: `{ path, content }` |
| `GET` | `/api/files/list` | List available workspace files |

### Events

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/events` | SSE stream for real-time board updates |
| `GET` | `/api/activity` | Activity feed. Query: `?limit=100` |

---

## Configuration

### Git Provider Integration

Edit `data/config/git-providers.json` (or use the Settings UI):

```json
{
  "providers": [
    {
      "type": "github",
      "name": "GitHub - My Org",
      "cli": "gh",
      "orgs": ["my-org", "my-username"]
    },
    {
      "type": "gitlab",
      "name": "GitLab",
      "cli": "glab",
      "orgs": []
    },
    {
      "type": "bitbucket",
      "name": "Bitbucket",
      "cli": "bb",
      "orgs": ["my-workspace"]
    },
    {
      "type": "azure-devops",
      "name": "Azure DevOps",
      "cli": "az",
      "orgs": ["my-org"]
    }
  ]
}
```

**Supported providers:**

| Provider | CLI Tool | Auth Setup |
|----------|----------|------------|
| GitHub | `gh` | `gh auth login` |
| GitLab | `glab` | `glab auth login` |
| Bitbucket | `bb` | Bitbucket CLI or API token |
| Azure DevOps | `az` | `az login` + `az devops configure` |

### OpenClaw Integration

The board reads OpenClaw session data from:
- **Session stores:** `/home/jarvis/.openclaw/agents/*/sessions/sessions.json`
- **Transcripts:** `/home/jarvis/.openclaw/agents/*/sessions/*.jsonl`
- **Workspace files:** `/home/jarvis/.openclaw/workspace/`

Set the `OPENCLAW_DIR` env var if your OpenClaw installation is elsewhere:

```bash
OPENCLAW_DIR=/path/to/.openclaw npm start
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3100` | Server port |
| `HOSTNAME` | `0.0.0.0` | Bind address |
| `OPENCLAW_DIR` | `/home/jarvis/.openclaw` | OpenClaw data directory |
| `DATA_DIR` | `./data` | Agent Board data directory |
| `NODE_ENV` | `production` | Environment |

---

## Deployment

### Standalone (Node.js)

```bash
# Build
npm ci
npm run build

# Run
PORT=3100 npm start

# Or with pm2
pm2 start npm --name agent-board -- start
pm2 save
```

### Nginx Reverse Proxy

```nginx
# /etc/nginx/sites-available/agent-board
server {
    listen 80;
    server_name board.example.com;

    # Redirect to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name board.example.com;

    ssl_certificate     /etc/letsencrypt/live/board.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/board.example.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:3100;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;

        # SSE support (important for real-time updates)
        proxy_buffering off;
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
    }
}
```

```bash
# Enable site
sudo ln -s /etc/nginx/sites-available/agent-board /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

# SSL with Let's Encrypt
sudo certbot --nginx -d board.example.com
```

### Docker

```dockerfile
# Dockerfile
FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3100

# Copy build output
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# Create data directory
RUN mkdir -p /app/data

# Install git CLIs for provider integration (optional)
RUN apk add --no-cache git

EXPOSE 3100

# Mount data/ as a volume for persistence
VOLUME ["/app/data"]

CMD ["node", "server.js"]
```

> **Note:** For the standalone output, add to `next.config.ts`:
> ```ts
> const nextConfig = { output: 'standalone' };
> ```

```bash
# Build image
docker build -t agent-board .

# Run with data persistence
docker run -d \
  --name agent-board \
  -p 3100:3100 \
  -v $(pwd)/data:/app/data \
  -v /home/jarvis/.openclaw:/openclaw:ro \
  -e OPENCLAW_DIR=/openclaw \
  agent-board

# With Git CLI access (for provider integration)
docker run -d \
  --name agent-board \
  -p 3100:3100 \
  -v $(pwd)/data:/app/data \
  -v /home/jarvis/.openclaw:/openclaw:ro \
  -v $HOME/.config/gh:/root/.config/gh:ro \
  -e OPENCLAW_DIR=/openclaw \
  agent-board
```

### Docker Compose

```yaml
# docker-compose.yml
version: '3.8'

services:
  agent-board:
    build: .
    container_name: agent-board
    restart: unless-stopped
    ports:
      - "3100:3100"
    environment:
      - NODE_ENV=production
      - PORT=3100
      - OPENCLAW_DIR=/openclaw
    volumes:
      # Persistent data (tasks, agents, projects, config)
      - ./data:/app/data

      # OpenClaw integration (read-only)
      - /home/jarvis/.openclaw:/openclaw:ro

      # Git CLI configs (read-only, for provider integration)
      - ${HOME}/.config/gh:/root/.config/gh:ro        # GitHub CLI
      - ${HOME}/.config/glab-cli:/root/.config/glab-cli:ro  # GitLab CLI
    healthcheck:
      test: ["CMD", "wget", "--no-verbose", "--tries=1", "--spider", "http://localhost:3100/"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 10s

  # Optional: nginx reverse proxy
  nginx:
    image: nginx:alpine
    container_name: agent-board-nginx
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/conf.d/default.conf:ro
      - /etc/letsencrypt:/etc/letsencrypt:ro
    depends_on:
      - agent-board
```

```bash
# Start
docker compose up -d

# View logs
docker compose logs -f agent-board

# Backup data
docker compose exec agent-board tar -czf /tmp/backup.tar.gz /app/data
docker compose cp agent-board:/tmp/backup.tar.gz ./backup.tar.gz

# Update
git pull
docker compose build
docker compose up -d
```

### Kubernetes

```yaml
# k8s/namespace.yaml
apiVersion: v1
kind: Namespace
metadata:
  name: agent-board
---
# k8s/pvc.yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: agent-board-data
  namespace: agent-board
spec:
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: 1Gi
  storageClassName: standard
---
# k8s/configmap.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: agent-board-config
  namespace: agent-board
data:
  NODE_ENV: "production"
  PORT: "3100"
  OPENCLAW_DIR: "/openclaw"
---
# k8s/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: agent-board
  namespace: agent-board
  labels:
    app: agent-board
spec:
  replicas: 1  # Single replica (file-based storage)
  selector:
    matchLabels:
      app: agent-board
  template:
    metadata:
      labels:
        app: agent-board
    spec:
      containers:
        - name: agent-board
          image: ghcr.io/jagjerez-org/agent-board:latest
          ports:
            - containerPort: 3100
          envFrom:
            - configMapRef:
                name: agent-board-config
          volumeMounts:
            - name: data
              mountPath: /app/data
            - name: openclaw
              mountPath: /openclaw
              readOnly: true
          livenessProbe:
            httpGet:
              path: /
              port: 3100
            initialDelaySeconds: 10
            periodSeconds: 30
          readinessProbe:
            httpGet:
              path: /
              port: 3100
            initialDelaySeconds: 5
            periodSeconds: 10
          resources:
            requests:
              memory: "128Mi"
              cpu: "100m"
            limits:
              memory: "512Mi"
              cpu: "500m"
      volumes:
        - name: data
          persistentVolumeClaim:
            claimName: agent-board-data
        - name: openclaw
          hostPath:
            path: /home/jarvis/.openclaw
            type: Directory
---
# k8s/service.yaml
apiVersion: v1
kind: Service
metadata:
  name: agent-board
  namespace: agent-board
spec:
  selector:
    app: agent-board
  ports:
    - port: 80
      targetPort: 3100
  type: ClusterIP
---
# k8s/ingress.yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: agent-board
  namespace: agent-board
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt-prod
    nginx.ingress.kubernetes.io/proxy-buffering: "off"  # SSE support
    nginx.ingress.kubernetes.io/proxy-read-timeout: "86400"
spec:
  ingressClassName: nginx
  tls:
    - hosts:
        - board.example.com
      secretName: agent-board-tls
  rules:
    - host: board.example.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: agent-board
                port:
                  number: 80
```

```bash
# Deploy
kubectl apply -f k8s/

# Check status
kubectl -n agent-board get pods

# View logs
kubectl -n agent-board logs -f deployment/agent-board

# Port forward for local access
kubectl -n agent-board port-forward svc/agent-board 3100:80

# Backup PVC data
kubectl -n agent-board exec deployment/agent-board -- tar -czf /tmp/backup.tar.gz /app/data
kubectl -n agent-board cp deployment/agent-board:/tmp/backup.tar.gz ./backup.tar.gz
```

> ⚠️ **Important:** File-based storage requires `replicas: 1`. For multi-replica, you'd need shared storage (NFS/EFS) or migrate to a database.

---

## OpenClaw Skill Integration

Agent Board can run as an OpenClaw skill. The agent (Jarvis) can interact with it via the REST API.

### Skill Setup

```bash
# In your OpenClaw workspace
mkdir -p skills/agent-board
```

Create `skills/agent-board/SKILL.md`:

```markdown
# Agent Board Skill

Base URL: http://localhost:3100/api

## Tools

- List tasks: GET /api/tasks?project=<id>&groupBy=status
- Create task: POST /api/tasks { title, status, priority, project_id, labels }
- Move task: POST /api/tasks/{id}/move { status }
- Assign task: POST /api/tasks/{id}/assign { agent_id }
- Add comment: POST /api/tasks/{id}/comments { author, content }
- List projects: GET /api/projects
- List agents: GET /api/agents
- Agent status: GET /api/agents/live
```

Register in `openclaw.json`:

```json
{
  "skills": {
    "load": {
      "extraDirs": ["./workspace/skills"]
    }
  }
}
```

---

## Development

```bash
# Dev server (hot reload)
npm run dev

# Run tests
npm test

# Lint
npm run lint

# Type check
npx tsc --noEmit
```

### Adding a New Column/Status

1. Edit `src/lib/types.ts` — add to `TaskStatus` type, `TASK_STATUSES` array, `VALID_TRANSITIONS` map
2. Update `COLUMN_CONFIG` in `kanban-board-simple.tsx`
3. Rebuild & restart

### Adding a New Git Provider

1. Add to `data/config/git-providers.json`
2. Implement CLI commands in `/api/git/repos/route.ts`
3. Follow the pattern of existing providers (gh, glab)

---

## License

MIT
