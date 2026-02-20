import { Button } from '@/components/ui/button';
import { Settings, Activity, Users, GitBranch, FolderOpen } from 'lucide-react';
import Link from 'next/link';
import { ActivityFeed } from '@/components/activity/activity-feed';

export default function ActivityPage() {
  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="flex items-center justify-between px-6 py-3">
          <div className="flex items-center space-x-4">
            <h1 className="text-2xl font-bold">📋 Agent Board</h1>
            <nav className="flex space-x-1">
              <Button variant="ghost" size="sm" asChild>
                <Link href="/">Board</Link>
              </Button>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/projects">
                  <FolderOpen className="w-4 h-4 mr-2" />
                  Projects
                </Link>
              </Button>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/agents">
                  <Users className="w-4 h-4 mr-2" />
                  Agents
                </Link>
              </Button>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/activity" className="bg-accent text-accent-foreground">
                  <Activity className="w-4 h-4 mr-2" />
                  Activity
                </Link>
              </Button>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/worktrees">
                  <GitBranch className="w-4 h-4 mr-2" />
                  Worktrees
                </Link>
              </Button>
            </nav>
          </div>
          
          <div className="flex items-center space-x-2">
            <Button variant="outline" size="sm">
              <Settings className="w-4 h-4 mr-2" />
              Filters
            </Button>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 overflow-hidden p-6">
        <div className="h-full">
          <div className="mb-6">
            <h2 className="text-xl font-semibold mb-2">Activity Feed</h2>
            <p className="text-muted-foreground">
              Track all task and agent activities across your workspace.
            </p>
          </div>
          
          <ActivityFeed />
        </div>
      </main>
    </div>
  );
}