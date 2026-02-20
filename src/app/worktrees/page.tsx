'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { WorktreePanel } from '@/components/worktrees/worktree-panel';
import { Project } from '@/lib/types';
interface Worktree {
  path: string;
  branch: string;
  commit: string;
  isMain: boolean;
}

export default function WorktreesPage() {
  const [selectedProject, setSelectedProject] = useState<string>('');
  const [worktrees, setWorktrees] = useState<Worktree[]>([]);

  return (
    <div className="flex flex-col flex-1">
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
