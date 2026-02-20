'use client';

import { useState, useRef } from 'react';
import { KanbanBoard } from '@/components/board/kanban-board-simple';
import { ProjectSelector } from '@/components/board/project-selector';
import { Button } from '@/components/ui/button';
import { Plus, Settings } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';

export default function BoardPage() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [selectedProject, setSelectedProject] = useState<string | undefined>();
  const createTaskRef = useRef<(() => void) | null>(null);

  return (
    <div className="flex flex-col flex-1">
      {/* Board toolbar */}
      <div className="border-b border-border bg-card">
        <div className="flex items-center justify-between px-6 py-2">
          <div className="flex-1 flex justify-center">
            <ProjectSelector
              value={selectedProject}
              onValueChange={setSelectedProject}
            />
          </div>
          <div className="flex items-center space-x-2">
            <Button variant="ghost" size="icon" onClick={() => setSettingsOpen(true)} title="Settings">
              <Settings className="w-4 h-4" />
            </Button>
            <Button size="sm" onClick={() => createTaskRef.current?.()}>
              <Plus className="w-4 h-4 mr-2" />
              New Task
            </Button>
          </div>
        </div>
      </div>

      {/* Main content */}
      <main className="flex-1 overflow-hidden">
        <KanbanBoard projectId={selectedProject} onCreateRef={createTaskRef} />
      </main>

      {/* Settings Sheet */}
      <Sheet open={settingsOpen} onOpenChange={setSettingsOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Board Settings</SheetTitle>
          </SheetHeader>
          <div className="space-y-6 py-4">
            <div>
              <h3 className="text-sm font-medium mb-2">Storage</h3>
              <p className="text-sm text-muted-foreground">
                Tasks stored as markdown in <code className="bg-muted px-1 py-0.5 rounded text-xs">data/tasks/</code>
              </p>
            </div>
            <div>
              <h3 className="text-sm font-medium mb-2">API</h3>
              <p className="text-sm text-muted-foreground font-mono">
                {typeof window !== 'undefined' ? window.location.origin : ''}/api
              </p>
            </div>
            <div>
              <h3 className="text-sm font-medium mb-2">Realtime</h3>
              <p className="text-sm text-muted-foreground">
                SSE at <code className="bg-muted px-1 py-0.5 rounded text-xs">/api/events</code>
              </p>
            </div>
            <div>
              <h3 className="text-sm font-medium mb-2">Columns</h3>
              <p className="text-sm text-muted-foreground">
                Backlog → Refinement → Pending Approval → To Do → In Progress → Review → Done
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Column order follows the workflow. Tasks can only move to valid next states.
              </p>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
