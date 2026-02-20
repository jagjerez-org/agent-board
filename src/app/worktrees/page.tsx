'use client';

import Link from 'next/link';
import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { FolderOpen, Users, Activity, GitBranch } from 'lucide-react';
import { WorktreePanel } from '@/components/worktrees/worktree-panel';
import { Project } from '@/lib/types';
import { Worktree } from '@/lib/worktree-service';

export default function WorktreesPage() {
  const [selectedProject, setSelectedProject] = useState<string>('');
  const [worktrees, setWorktrees] = useState<Worktree[]>([]);

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
                <Link href="/activity">
                  <Activity className="w-4 h-4 mr-2" />
                  Activity
                </Link>
              </Button>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/worktrees" className="bg-accent text-accent-foreground">
                  <GitBranch className="w-4 h-4 mr-2" />
                  Worktrees
                </Link>
              </Button>
            </nav>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 overflow-auto p-6">
        <div className="max-w-7xl mx-auto">
          <div className="mb-6">
            <h2 className="text-3xl font-bold mb-2">Git Worktrees</h2>
            <p className="text-muted-foreground">
              Manage multiple branch checkouts for parallel development. Each worktree has its own preview server and logs.
            </p>
          </div>
          
          <WorktreePanel 
            onProjectChange={setSelectedProject}
            onWorktreesChange={setWorktrees}
          />
        </div>
      </main>
    </div>
  );
}
