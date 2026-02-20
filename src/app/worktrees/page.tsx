'use client';

import Link from 'next/link';
import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FolderOpen, Users, Activity, GitBranch, Monitor, Terminal } from 'lucide-react';
import { WorktreePanel } from '@/components/worktrees/worktree-panel';
import { PreviewPanel } from '@/components/worktrees/preview-panel';
import { LogViewer } from '@/components/worktrees/log-viewer';
import { Project } from '@/lib/types';
import { Worktree } from '@/lib/worktree-service';

export default function WorktreesPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<string>('');
  const [worktrees, setWorktrees] = useState<Worktree[]>([]);
  const [activeTab, setActiveTab] = useState('worktrees');

  // Load projects
  useEffect(() => {
    fetch('/api/projects')
      .then(r => r.json())
      .then(data => setProjects(data.projects || []))
      .catch(() => {});
  }, []);

  // Load worktrees when project changes
  useEffect(() => {
    if (selectedProject) {
      loadWorktrees();
    }
  }, [selectedProject]);

  const loadWorktrees = async () => {
    if (!selectedProject) return;
    
    try {
      const response = await fetch(`/api/git/worktrees?project=${encodeURIComponent(selectedProject)}`);
      if (response.ok) {
        const data = await response.json();
        setWorktrees(data.worktrees || []);
      } else {
        setWorktrees([]);
      }
    } catch (error) {
      console.error('Error loading worktrees:', error);
      setWorktrees([]);
    }
  };

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
              Manage multiple branch checkouts for parallel development. Each worktree allows you to work on different branches simultaneously without switching.
            </p>
          </div>
          
          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="worktrees" className="flex items-center gap-2">
                <GitBranch className="w-4 h-4" />
                Worktrees
              </TabsTrigger>
              <TabsTrigger value="previews" className="flex items-center gap-2">
                <Monitor className="w-4 h-4" />
                Previews
              </TabsTrigger>
              <TabsTrigger value="logs" className="flex items-center gap-2">
                <Terminal className="w-4 h-4" />
                Logs
              </TabsTrigger>
            </TabsList>
            
            <TabsContent value="worktrees" className="space-y-6">
              <WorktreePanel 
                onProjectChange={setSelectedProject}
                onWorktreesChange={setWorktrees}
              />
            </TabsContent>
            
            <TabsContent value="previews" className="space-y-6">
              {selectedProject ? (
                <PreviewPanel 
                  projectId={selectedProject}
                  worktrees={worktrees}
                />
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  Please select a project from the Worktrees tab first
                </div>
              )}
            </TabsContent>
            
            <TabsContent value="logs" className="space-y-6">
              {selectedProject ? (
                <LogViewer 
                  projectId={selectedProject}
                  worktrees={worktrees}
                />
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  Please select a project from the Worktrees tab first
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </main>
    </div>
  );
}