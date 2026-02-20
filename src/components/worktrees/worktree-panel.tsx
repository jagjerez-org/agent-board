'use client';

import { useState, useEffect } from 'react';
import { Project } from '@/lib/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { 
  GitBranch, 
  Plus, 
  Trash2, 
  FolderOpen, 
  Terminal,
  RefreshCw,
  AlertCircle
} from 'lucide-react';
import { Switch } from '@/components/ui/switch';

interface Worktree {
  path: string;
  branch: string;
  commit: string;
  isMain: boolean;
}

interface Branch {
  name: string;
  isRemote: boolean;
  isCurrent: boolean;
  hasWorktree: boolean;
}

interface WorktreePanelProps {
  projectId?: string;
  onProjectChange?: (projectId: string) => void;
  onWorktreesChange?: (worktrees: Worktree[]) => void;
}

export function WorktreePanel({ projectId, onProjectChange, onWorktreesChange }: WorktreePanelProps) {
  const [worktrees, setWorktrees] = useState<Worktree[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<string>(projectId || '');
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  
  // Create worktree dialog state
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newBranch, setNewBranch] = useState('');
  const [createNewBranch, setCreateNewBranch] = useState(false);
  const [selectedBranch, setSelectedBranch] = useState('');

  // Load projects
  useEffect(() => {
    fetch('/api/projects')
      .then(r => r.json())
      .then(data => setProjects(data.projects || []))
      .catch(() => {});
  }, []);

  // Load worktrees and branches when project changes
  useEffect(() => {
    if (selectedProject) {
      loadProjectData();
      onProjectChange?.(selectedProject);
    } else {
      setWorktrees([]);
      setBranches([]);
      onWorktreesChange?.([]);
    }
  }, [selectedProject, onProjectChange, onWorktreesChange]);

  const loadProjectData = async () => {
    if (!selectedProject) return;
    
    setLoading(true);
    try {
      // Load worktrees
      const worktreesRes = await fetch(`/api/git/worktrees?project=${encodeURIComponent(selectedProject)}`);
      if (worktreesRes.ok) {
        const worktreesData = await worktreesRes.json();
        const loadedWorktrees = worktreesData.worktrees || [];
        setWorktrees(loadedWorktrees);
        onWorktreesChange?.(loadedWorktrees);
      } else {
        setWorktrees([]);
        onWorktreesChange?.([]);
      }

      // Load branches
      const branchesRes = await fetch(`/api/git/branches?project=${encodeURIComponent(selectedProject)}`);
      if (branchesRes.ok) {
        const branchesData = await branchesRes.json();
        setBranches(branchesData.branches || []);
      } else {
        setBranches([]);
      }
    } catch (error) {
      console.error('Error loading project data:', error);
      setWorktrees([]);
      setBranches([]);
    } finally {
      setLoading(false);
    }
  };

  const createWorktree = async () => {
    if (!selectedProject || (!newBranch && !selectedBranch)) return;

    const branch = createNewBranch ? newBranch : selectedBranch;
    if (!branch) return;

    setCreating(true);
    try {
      const response = await fetch('/api/git/worktrees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project: selectedProject,
          branch: branch,
          createBranch: createNewBranch
        })
      });

      if (response.ok) {
        setCreateDialogOpen(false);
        setNewBranch('');
        setSelectedBranch('');
        setCreateNewBranch(false);
        await loadProjectData();
      } else {
        const errorData = await response.json();
        alert(errorData.error || 'Failed to create worktree');
      }
    } catch (error) {
      console.error('Error creating worktree:', error);
      alert('Failed to create worktree');
    } finally {
      setCreating(false);
    }
  };

  const removeWorktree = async (branch: string) => {
    if (!selectedProject) return;
    
    if (!confirm(`Remove worktree for branch '${branch}'? This will delete the working directory.`)) {
      return;
    }

    setDeleting(branch);
    try {
      const response = await fetch('/api/git/worktrees', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project: selectedProject,
          branch: branch
        })
      });

      if (response.ok) {
        await loadProjectData();
      } else {
        const errorData = await response.json();
        alert(errorData.error || 'Failed to remove worktree');
      }
    } catch (error) {
      console.error('Error removing worktree:', error);
      alert('Failed to remove worktree');
    } finally {
      setDeleting(null);
    }
  };

  const openTerminal = (worktree: Worktree) => {
    // This would need OS-specific implementation
    alert(`Open terminal in: ${worktree.path}`);
  };

  const availableBranches = branches.filter(b => !b.hasWorktree);

  return (
    <div className="space-y-6">
      {/* Project selector */}
      <div className="flex items-center gap-4">
        <div className="flex-1">
          <Select value={selectedProject} onValueChange={setSelectedProject}>
            <SelectTrigger>
              <SelectValue placeholder="Select a project..." />
            </SelectTrigger>
            <SelectContent>
              {projects.map((project) => (
                <SelectItem key={project.id} value={project.id}>
                  {project.name} {project.repo_owner && `(${project.repo_owner})`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        
        {selectedProject && (
          <Button 
            variant="outline" 
            size="sm" 
            onClick={loadProjectData}
            disabled={loading}
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        )}
      </div>

      {selectedProject && (
        <>
          {/* Create worktree section */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-lg">Active Worktrees</CardTitle>
                  <CardDescription>
                    Multiple branch checkouts for parallel development
                  </CardDescription>
                </div>
                
                <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
                  <DialogTrigger asChild>
                    <Button>
                      <Plus className="w-4 h-4 mr-2" />
                      Create Worktree
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Create New Worktree</DialogTitle>
                      <DialogDescription>
                        Create a new worktree for parallel development on a different branch.
                      </DialogDescription>
                    </DialogHeader>
                    
                    <div className="space-y-4 py-4">
                      <div className="flex items-center space-x-2">
                        <Switch
                          id="create-new-branch"
                          checked={createNewBranch}
                          onCheckedChange={setCreateNewBranch}
                        />
                        <label htmlFor="create-new-branch" className="text-sm font-medium">
                          Create new branch
                        </label>
                      </div>
                      
                      {createNewBranch ? (
                        <div>
                          <label className="text-sm font-medium">New Branch Name</label>
                          <Input
                            placeholder="feature/new-feature"
                            value={newBranch}
                            onChange={(e) => setNewBranch(e.target.value)}
                          />
                        </div>
                      ) : (
                        <div>
                          <label className="text-sm font-medium">Existing Branch</label>
                          <Select value={selectedBranch} onValueChange={setSelectedBranch}>
                            <SelectTrigger>
                              <SelectValue placeholder="Select branch..." />
                            </SelectTrigger>
                            <SelectContent>
                              {availableBranches.map((branch) => (
                                <SelectItem key={branch.name} value={branch.name}>
                                  <div className="flex items-center gap-2">
                                    <GitBranch className="w-4 h-4" />
                                    {branch.name}
                                    {branch.isRemote && <Badge variant="outline">remote</Badge>}
                                  </div>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {availableBranches.length === 0 && (
                            <p className="text-xs text-muted-foreground mt-1">
                              No available branches (all have worktrees)
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                    
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
                        Cancel
                      </Button>
                      <Button 
                        onClick={createWorktree} 
                        disabled={creating || (!newBranch && !selectedBranch)}
                      >
                        {creating ? 'Creating...' : 'Create Worktree'}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            </CardHeader>
            
            <CardContent>
              {loading ? (
                <div className="text-center py-8 text-muted-foreground">
                  <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2" />
                  Loading worktrees...
                </div>
              ) : worktrees.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <AlertCircle className="w-6 h-6 mx-auto mb-2" />
                  No worktrees found. Create one to get started.
                </div>
              ) : (
                <div className="space-y-3">
                  {worktrees.map((worktree) => (
                    <Card key={worktree.path} className="border">
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <GitBranch className="w-5 h-5 text-muted-foreground" />
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-medium">{worktree.branch}</span>
                                {worktree.isMain && <Badge variant="default">Main</Badge>}
                              </div>
                              <p className="text-sm text-muted-foreground">
                                {worktree.path}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {worktree.commit.substring(0, 7)}
                              </p>
                            </div>
                          </div>
                          
                          <div className="flex gap-2">
                            <Button 
                              variant="outline" 
                              size="sm"
                              onClick={() => openTerminal(worktree)}
                            >
                              <Terminal className="w-4 h-4" />
                            </Button>
                            
                            <Button 
                              variant="outline" 
                              size="sm"
                              onClick={() => alert(`Open in file manager: ${worktree.path}`)}
                            >
                              <FolderOpen className="w-4 h-4" />
                            </Button>
                            
                            {!worktree.isMain && (
                              <Button 
                                variant="destructive" 
                                size="sm"
                                onClick={() => removeWorktree(worktree.branch)}
                                disabled={deleting === worktree.branch}
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Branch status overview */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Branch Overview</CardTitle>
              <CardDescription>
                Status of all branches in this repository
              </CardDescription>
            </CardHeader>
            
            <CardContent>
              {branches.length === 0 ? (
                <div className="text-center py-4 text-muted-foreground">
                  No branches found
                </div>
              ) : (
                <div className="space-y-2">
                  {branches.map((branch) => (
                    <div key={branch.name} className="flex items-center justify-between py-2 px-3 rounded border">
                      <div className="flex items-center gap-2">
                        <GitBranch className="w-4 h-4 text-muted-foreground" />
                        <span>{branch.name}</span>
                        {branch.isCurrent && <Badge variant="default">Current</Badge>}
                        {branch.isRemote && <Badge variant="outline">Remote</Badge>}
                        {branch.hasWorktree && <Badge variant="secondary">Has Worktree</Badge>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}