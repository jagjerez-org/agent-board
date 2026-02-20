'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Project } from '@/lib/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
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
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { 
  GitBranch, 
  Plus, 
  Trash2, 
  FolderOpen, 
  Terminal,
  RefreshCw,
  AlertCircle,
  Monitor,
  Play,
  Square,
  ExternalLink,
  Copy,
  Loader2,
  ChevronsUpDown,
  Check,
  Search,
} from 'lucide-react';

interface Worktree {
  path: string;
  branch: string;
  commit: string;
  isMain: boolean;
}

interface Branch {
  name: string;
  isLocal: boolean;
  isRemote: boolean;
  isCurrent: boolean;
  hasWorktree: boolean;
}

interface PreviewServer {
  branch: string;
  port: number;
  pid: number;
  status: 'starting' | 'running' | 'stopped' | 'error';
  startedAt: string;
  command?: string;
  project: string;
}

interface LogEntry {
  timestamp: string;
  type: 'stdout' | 'stderr' | 'system' | 'error';
  message: string;
  exitCode?: number;
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
  
  // Preview servers state
  const [servers, setServers] = useState<PreviewServer[]>([]);
  
  // Per-worktree expanded panels
  const [expandedPreviews, setExpandedPreviews] = useState<Set<string>>(new Set());
  const [expandedLogs, setExpandedLogs] = useState<Set<string>>(new Set());
  
  // Per-worktree logs
  const [logs, setLogs] = useState<Map<string, LogEntry[]>>(new Map());
  const [autoScroll, setAutoScroll] = useState(true);
  const logRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const eventSourceRefs = useRef<Map<string, EventSource>>(new Map());
  const iframeRefs = useRef<Map<string, HTMLIFrameElement>>(new Map());
  
  // Per-worktree command input
  const [commandInputs, setCommandInputs] = useState<Map<string, string>>(new Map());
  const [runningCommands, setRunningCommands] = useState<Set<string>>(new Set());
  const [startingServers, setStartingServers] = useState<Set<string>>(new Set());
  const [stoppingServers, setStoppingServers] = useState<Set<string>>(new Set());
  
  // Create worktree dialog state
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newBranch, setNewBranch] = useState('');
  const [createNewBranch, setCreateNewBranch] = useState(false);
  const [selectedBranch, setSelectedBranch] = useState('');
  const [baseBranch, setBaseBranch] = useState('main');
  const [branchSearch, setBranchSearch] = useState('');
  const [projectSearch, setProjectSearch] = useState('');
  const [projectOpen, setProjectOpen] = useState(false);
  const [loadingBranches, setLoadingBranches] = useState(false);
  const [previewDialog, setPreviewDialog] = useState<{ open: boolean; branch: string; command: string }>({ open: false, branch: '', command: '' });

  // Resolve project ID to repo-style path
  const getRepoProjectId = useCallback((pid: string) => {
    const proj = projects.find(p => p.id === pid);
    if (proj?.repo_owner && proj?.repo_name) return `${proj.repo_owner}/${proj.repo_name}`;
    return pid;
  }, [projects]);

  // Load projects
  useEffect(() => {
    fetch('/api/projects')
      .then(r => r.json())
      .then(data => setProjects(data.projects || []))
      .catch(() => {});
  }, []);

  // Load worktrees, branches, and servers when project changes
  useEffect(() => {
    if (selectedProject) {
      loadProjectData();
      onProjectChange?.(selectedProject);
    } else {
      setWorktrees([]);
      setBranches([]);
      setServers([]);
      onWorktreesChange?.([]);
    }
  }, [selectedProject]);

  const loadProjectData = async () => {
    if (!selectedProject) return;
    setLoading(true);
    setLoadingBranches(true);
    try {
      const repoId = getRepoProjectId(selectedProject);
      const [wtRes, brRes, pvRes] = await Promise.all([
        fetch(`/api/git/worktrees?project=${encodeURIComponent(repoId)}`),
        fetch(`/api/git/branches?project=${encodeURIComponent(repoId)}`),
        fetch(`/api/git/worktrees/preview?project=${encodeURIComponent(selectedProject)}`).catch(() => null),
      ]);
      
      if (wtRes.ok) {
        const data = await wtRes.json();
        const wt = data.worktrees || [];
        setWorktrees(wt);
        onWorktreesChange?.(wt);
      } else {
        setWorktrees([]);
        onWorktreesChange?.([]);
      }
      
      if (brRes.ok) {
        const data = await brRes.json();
        setBranches(data.branches || []);
      } else {
        setBranches([]);
      }
      
      if (pvRes && pvRes.ok) {
        const data = await pvRes.json();
        setServers(data.servers || []);
      }
    } catch {
      setWorktrees([]);
      setBranches([]);
    } finally {
      setLoading(false);
      setLoadingBranches(false);
    }
  };

  // Poll preview server status
  useEffect(() => {
    if (!selectedProject) return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/git/worktrees/preview?project=${encodeURIComponent(selectedProject)}`);
        if (res.ok) {
          const data = await res.json();
          setServers(data.servers || []);
        }
      } catch { /* ignore */ }
    }, 5000);
    return () => clearInterval(interval);
  }, [selectedProject]);

  // SSE log subscription per branch
  const subscribeLogs = useCallback((branch: string) => {
    if (eventSourceRefs.current.has(branch)) return;
    const url = `/api/git/worktrees/logs?project=${encodeURIComponent(selectedProject)}&branch=${encodeURIComponent(branch)}`;
    const es = new EventSource(url);
    eventSourceRefs.current.set(branch, es);
    
    es.onmessage = (event) => {
      try {
        const entry: LogEntry = JSON.parse(event.data);
        setLogs(prev => {
          const updated = new Map(prev);
          const entries = [...(updated.get(branch) || []), entry];
          if (entries.length > 1000) entries.shift();
          updated.set(branch, entries);
          return updated;
        });
      } catch { /* ignore */ }
    };
    es.onerror = () => {
      es.close();
      eventSourceRefs.current.delete(branch);
    };
  }, [selectedProject]);

  const unsubscribeLogs = useCallback((branch: string) => {
    const es = eventSourceRefs.current.get(branch);
    if (es) { es.close(); eventSourceRefs.current.delete(branch); }
  }, []);

  // Subscribe/unsubscribe logs when panels expand/collapse
  useEffect(() => {
    expandedLogs.forEach(branch => subscribeLogs(branch));
    return () => {
      eventSourceRefs.current.forEach((es) => es.close());
      eventSourceRefs.current.clear();
    };
  }, []);

  const toggleLogs = (branch: string) => {
    setExpandedLogs(prev => {
      const next = new Set(prev);
      if (next.has(branch)) {
        next.delete(branch);
        unsubscribeLogs(branch);
      } else {
        next.add(branch);
        subscribeLogs(branch);
      }
      return next;
    });
  };

  const togglePreview = (branch: string) => {
    setExpandedPreviews(prev => {
      const next = new Set(prev);
      if (next.has(branch)) next.delete(branch);
      else next.add(branch);
      return next;
    });
  };

  // Auto-scroll effect
  useEffect(() => {
    if (!autoScroll) return;
    expandedLogs.forEach(branch => {
      const ref = logRefs.current.get(branch);
      if (ref) ref.scrollTop = ref.scrollHeight;
    });
  }, [logs, autoScroll, expandedLogs]);

  // Preview server actions
  const openPreviewDialog = (branch: string) => {
    setPreviewDialog({ open: true, branch, command: 'pnpm dev' });
  };

  const startPreview = async (branch: string, command = 'pnpm dev') => {
    setStartingServers(prev => new Set([...prev, branch]));
    try {
      const res = await fetch('/api/git/worktrees/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project: selectedProject, branch, command }),
      });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || 'Failed to start preview');
      }
      // Status will update via polling
      await loadProjectData();
    } catch { alert('Failed to start preview'); }
    finally { setStartingServers(prev => { const n = new Set(prev); n.delete(branch); return n; }); }
  };

  const stopPreview = async (branch: string) => {
    setStoppingServers(prev => new Set([...prev, branch]));
    try {
      await fetch('/api/git/worktrees/preview', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project: selectedProject, branch }),
      });
      await loadProjectData();
    } catch { alert('Failed to stop preview'); }
    finally { setStoppingServers(prev => { const n = new Set(prev); n.delete(branch); return n; }); }
  };

  // Run command in worktree
  const runCommand = async (branch: string) => {
    const cmd = commandInputs.get(branch)?.trim();
    if (!cmd) return;
    const key = `${branch}:${cmd}`;
    setRunningCommands(prev => new Set([...prev, key]));
    try {
      await fetch('/api/git/worktrees/logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project: selectedProject, branch, command: cmd }),
      });
      setCommandInputs(prev => { const n = new Map(prev); n.set(branch, ''); return n; });
      // Ensure logs panel is open
      if (!expandedLogs.has(branch)) toggleLogs(branch);
    } catch { alert('Failed to run command'); }
    finally { setRunningCommands(prev => { const n = new Set(prev); n.delete(key); return n; }); }
  };

  const createWorktree = async () => {
    if (!selectedProject || (!newBranch && !selectedBranch)) return;
    const branch = createNewBranch ? newBranch : selectedBranch;
    if (!branch) return;
    setCreating(true);
    try {
      const res = await fetch('/api/git/worktrees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project: getRepoProjectId(selectedProject),
          branch,
          createBranch: createNewBranch,
          baseBranch: createNewBranch ? baseBranch : undefined,
        }),
      });
      if (res.ok) {
        setCreateDialogOpen(false);
        setNewBranch('');
        setSelectedBranch('');
        setCreateNewBranch(false);
        await loadProjectData();
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to create worktree');
      }
    } catch { alert('Failed to create worktree'); }
    finally { setCreating(false); }
  };

  const removeWorktree = async (branch: string) => {
    if (!confirm(`Remove worktree for '${branch}'? This deletes the working directory.`)) return;
    setDeleting(branch);
    try {
      const res = await fetch('/api/git/worktrees', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project: getRepoProjectId(selectedProject), branch }),
      });
      if (res.ok) await loadProjectData();
      else { const d = await res.json(); alert(d.error || 'Failed'); }
    } catch { alert('Failed to remove worktree'); }
    finally { setDeleting(null); }
  };

  const getServerForBranch = (branch: string) => servers.find(s => s.branch === branch);
  const availableBranches = branches.filter(b => !b.hasWorktree);
  const commonCommands = ['pnpm build', 'pnpm test', 'pnpm lint', 'git status', 'git log --oneline -10'];

  const stripAnsi = (s: string) => s.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '');

  return (
    <div className="space-y-6">
      {/* Project selector */}
      <div className="flex items-center gap-4">
        <div className="flex-1">
          <Popover open={projectOpen} onOpenChange={setProjectOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" role="combobox" aria-expanded={projectOpen} className="w-full justify-between">
                {selectedProject ? (() => {
                  const p = projects.find(pr => pr.id === selectedProject);
                  return p ? `${p.name} (${p.repo_owner || ''})` : selectedProject;
                })() : "Select a project..."}
                {loading ? <Loader2 className="ml-2 h-4 w-4 shrink-0 animate-spin" /> : <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[400px] p-0">
              <Command shouldFilter={false}>
                <CommandInput placeholder="Search projects..." value={projectSearch} onValueChange={setProjectSearch} />
                <CommandList>
                  <CommandEmpty>
                    {projects.length === 0 ? (
                      <div className="flex items-center justify-center gap-2 py-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Loading projects...
                      </div>
                    ) : 'No projects match your search.'}
                  </CommandEmpty>
                  <CommandGroup>
                    {projects
                      .filter(p => !projectSearch || 
                        p.name.toLowerCase().includes(projectSearch.toLowerCase()) ||
                        (p.repo_owner || '').toLowerCase().includes(projectSearch.toLowerCase()))
                      .map((project) => (
                        <CommandItem
                          key={project.id}
                          value={project.id}
                          onSelect={() => {
                            setSelectedProject(project.id === selectedProject ? '' : project.id);
                            setProjectOpen(false);
                            setProjectSearch('');
                          }}
                        >
                          <Check className={cn("mr-2 h-4 w-4", selectedProject === project.id ? "opacity-100" : "opacity-0")} />
                          {project.name} {project.repo_owner && `(${project.repo_owner})`}
                        </CommandItem>
                      ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </div>
        {selectedProject && (
          <Button variant="outline" size="sm" onClick={loadProjectData} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        )}
      </div>

      {selectedProject && (
        <>
          {/* Active Worktrees */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-lg">Active Worktrees</CardTitle>
                  <CardDescription>Each worktree is an independent branch checkout with its own preview and logs</CardDescription>
                </div>
                <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
                  <DialogTrigger asChild>
                    <Button><Plus className="w-4 h-4 mr-2" />Create Worktree</Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Create New Worktree</DialogTitle>
                      <DialogDescription>Create a new worktree for parallel development on a different branch.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                      <div className="flex items-center space-x-2">
                        <Switch id="create-new-branch" checked={createNewBranch} onCheckedChange={setCreateNewBranch} />
                        <label htmlFor="create-new-branch" className="text-sm font-medium">Create new branch</label>
                      </div>
                      {createNewBranch ? (
                        <>
                          <div>
                            <label className="text-sm font-medium">New Branch Name</label>
                            <Input placeholder="feature/new-feature" value={newBranch} onChange={(e) => setNewBranch(e.target.value)} />
                          </div>
                          <div>
                            <label className="text-sm font-medium">Base Branch</label>
                            <Select value={baseBranch} onValueChange={setBaseBranch}>
                              <SelectTrigger><SelectValue placeholder="Select base branch..." /></SelectTrigger>
                              <SelectContent>
                                {branches.map((b) => (
                                  <SelectItem key={b.name} value={b.name}>
                                    <div className="flex items-center gap-2">
                                      <GitBranch className="w-4 h-4" />{b.name}
                                      {b.isLocal && b.isRemote && <Badge variant="default" className="text-[10px] px-1 py-0">local + remote</Badge>}
                                      {b.isLocal && !b.isRemote && <Badge variant="secondary" className="text-[10px] px-1 py-0">local</Badge>}
                                      {!b.isLocal && b.isRemote && <Badge variant="outline" className="text-[10px] px-1 py-0">remote</Badge>}
                                    </div>
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </>
                      ) : (
                        <div>
                          <label className="text-sm font-medium">Existing Branch</label>
                          <Select value={selectedBranch} onValueChange={setSelectedBranch}>
                            <SelectTrigger><SelectValue placeholder="Select branch..." /></SelectTrigger>
                            <SelectContent>
                              {availableBranches.map((b) => (
                                <SelectItem key={b.name} value={b.name}>
                                  <div className="flex items-center gap-2">
                                    <GitBranch className="w-4 h-4" />{b.name}
                                    {b.isLocal && b.isRemote && <Badge variant="default" className="text-[10px] px-1 py-0">local + remote</Badge>}
                                    {b.isLocal && !b.isRemote && <Badge variant="secondary" className="text-[10px] px-1 py-0">local</Badge>}
                                    {!b.isLocal && b.isRemote && <Badge variant="outline" className="text-[10px] px-1 py-0">remote</Badge>}
                                  </div>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {availableBranches.length === 0 && (
                            <p className="text-xs text-muted-foreground mt-1">No available branches (all have worktrees)</p>
                          )}
                        </div>
                      )}
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>Cancel</Button>
                      <Button onClick={createWorktree} disabled={creating || (!newBranch && !selectedBranch)}>
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
                  <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2" />Loading worktrees...
                </div>
              ) : worktrees.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <AlertCircle className="w-6 h-6 mx-auto mb-2" />No worktrees found. Create one to get started.
                </div>
              ) : (
                <div className="space-y-4">
                  {worktrees.map((wt) => {
                    const server = getServerForBranch(wt.branch);
                    const isPreviewOpen = expandedPreviews.has(wt.branch);
                    const isLogsOpen = expandedLogs.has(wt.branch);
                    const branchLogs = logs.get(wt.branch) || [];
                    const branchInfo = branches.find(b => b.name === wt.branch);
                    
                    return (
                      <Card key={wt.path} className="border">
                        <CardContent className="p-4 space-y-3">
                          {/* Worktree header */}
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <GitBranch className="w-5 h-5 text-muted-foreground" />
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="font-medium">{wt.branch}</span>
                                  
                                  {branchInfo?.isLocal && branchInfo?.isRemote && <Badge variant="default" className="text-[10px] px-1 py-0">local + remote</Badge>}
                                  {branchInfo?.isLocal && !branchInfo?.isRemote && <Badge variant="secondary" className="text-[10px] px-1 py-0">local only</Badge>}
                                  {branchInfo && !branchInfo.isLocal && branchInfo.isRemote && <Badge variant="outline" className="text-[10px] px-1 py-0">remote only</Badge>}
                                  {server?.status === 'running' && <Badge variant="default" className="bg-green-600 text-[10px] px-1 py-0">Preview :{server.port}</Badge>}
                                </div>
                                <p className="text-sm text-muted-foreground">{wt.path}</p>
                                <p className="text-xs text-muted-foreground">{wt.commit.substring(0, 7)}</p>
                              </div>
                            </div>
                            
                            <div className="flex gap-1">
                              {/* Preview toggle */}
                              <Button
                                variant={isPreviewOpen ? 'default' : 'outline'}
                                size="sm"
                                onClick={() => togglePreview(wt.branch)}
                                title="Preview"
                              >
                                <Monitor className="w-4 h-4" />
                              </Button>
                              
                              {/* Logs toggle */}
                              <Button
                                variant={isLogsOpen ? 'default' : 'outline'}
                                size="sm"
                                onClick={() => toggleLogs(wt.branch)}
                                title="Logs"
                              >
                                <Terminal className="w-4 h-4" />
                              </Button>
                              
                              <Button variant="outline" size="sm" onClick={() => alert(`Open: ${wt.path}`)} title="Open folder">
                                <FolderOpen className="w-4 h-4" />
                              </Button>
                              
                              <Button variant="destructive" size="sm" onClick={() => removeWorktree(wt.branch)} disabled={deleting === wt.branch} title="Remove worktree">
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </div>

                          {/* Preview panel (expanded) */}
                          {isPreviewOpen && (
                            <div className="border rounded-lg overflow-hidden">
                              <div className="flex items-center justify-between px-3 py-2 bg-muted/50 border-b">
                                <span className="text-sm font-medium flex items-center gap-2">
                                  <Monitor className="w-4 h-4" /> Preview Server
                                </span>
                                <div className="flex items-center gap-2">
                                  {server?.status === 'running' ? (
                                    <>
                                      <Badge variant="default" className="bg-green-600">Running on :{server.port}</Badge>
                                      <Button variant="ghost" size="sm" onClick={() => {
                                        const iframe = iframeRefs.current.get(wt.branch);
                                        if (iframe) iframe.src = iframe.src;
                                      }}>
                                        <RefreshCw className="w-3 h-3" />
                                      </Button>
                                      <Button variant="ghost" size="sm" onClick={() => window.open(`http://localhost:${server.port}`, '_blank')}>
                                        <ExternalLink className="w-3 h-3" />
                                      </Button>
                                      <Button variant="ghost" size="sm" onClick={() => stopPreview(wt.branch)} disabled={stoppingServers.has(wt.branch)}>
                                        <Square className="w-3 h-3" />
                                      </Button>
                                    </>
                                  ) : (
                                    <Button size="sm" onClick={() => openPreviewDialog(wt.branch)} disabled={startingServers.has(wt.branch)}>
                                      {startingServers.has(wt.branch) ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Play className="w-3 h-3 mr-1" />}
                                      Start Preview
                                    </Button>
                                  )}
                                </div>
                              </div>
                              {server?.status === 'running' ? (
                                <div className="aspect-video bg-gray-100">
                                  <iframe
                                    ref={(el) => { if (el) iframeRefs.current.set(wt.branch, el); }}
                                    src={`http://localhost:${server.port}`}
                                    className="w-full h-full border-0"
                                    title={`Preview: ${wt.branch}`}
                                    sandbox="allow-same-origin allow-scripts allow-forms allow-popups"
                                  />
                                </div>
                              ) : (
                                <div className="py-8 text-center text-muted-foreground text-sm">
                                  {startingServers.has(wt.branch) ? 'Starting preview server...' : 'No preview server running. Click "Start Preview" to launch.'}
                                </div>
                              )}
                            </div>
                          )}

                          {/* Logs panel (expanded) */}
                          {isLogsOpen && (
                            <div className="border rounded-lg overflow-hidden">
                              <div className="flex items-center justify-between px-3 py-2 bg-muted/50 border-b">
                                <span className="text-sm font-medium flex items-center gap-2">
                                  <Terminal className="w-4 h-4" /> Logs & Commands
                                </span>
                                <div className="flex items-center gap-2">
                                  <div className="flex items-center gap-1">
                                    <Switch id={`auto-scroll-${wt.branch}`} checked={autoScroll} onCheckedChange={setAutoScroll} />
                                    <Label htmlFor={`auto-scroll-${wt.branch}`} className="text-[10px]">Auto-scroll</Label>
                                  </div>
                                  <Button variant="ghost" size="sm" onClick={() => {
                                    const entries = logs.get(wt.branch) || [];
                                    navigator.clipboard.writeText(entries.map(e => stripAnsi(`${e.type}: ${e.message}`)).join('\n'));
                                  }}>
                                    <Copy className="w-3 h-3" />
                                  </Button>
                                  <Button variant="ghost" size="sm" onClick={() => {
                                    setLogs(prev => { const n = new Map(prev); n.set(wt.branch, []); return n; });
                                  }}>
                                    <Trash2 className="w-3 h-3" />
                                  </Button>
                                </div>
                              </div>
                              
                              {/* Command input */}
                              <div className="flex gap-2 px-3 py-2 border-b bg-muted/30">
                                <Input
                                  value={commandInputs.get(wt.branch) || ''}
                                  onChange={(e) => setCommandInputs(prev => { const n = new Map(prev); n.set(wt.branch, e.target.value); return n; })}
                                  placeholder="Enter command..."
                                  className="flex-1 h-8 text-sm"
                                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); runCommand(wt.branch); } }}
                                />
                                <Button size="sm" className="h-8" onClick={() => runCommand(wt.branch)} disabled={!commandInputs.get(wt.branch)?.trim()}>
                                  <Play className="w-3 h-3" />
                                </Button>
                              </div>
                              
                              {/* Quick commands */}
                              <div className="flex flex-wrap gap-1 px-3 py-1.5 border-b bg-muted/20">
                                {commonCommands.map(cmd => (
                                  <Button key={cmd} variant="ghost" size="sm" className="h-6 text-xs px-2" onClick={() => {
                                    setCommandInputs(prev => { const n = new Map(prev); n.set(wt.branch, cmd); return n; });
                                    // Auto-run
                                    setTimeout(() => {
                                      const key = `${wt.branch}:${cmd}`;
                                      setRunningCommands(prev => new Set([...prev, key]));
                                      fetch('/api/git/worktrees/logs', {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({ project: selectedProject, branch: wt.branch, command: cmd }),
                                      }).finally(() => setRunningCommands(prev => { const n = new Set(prev); n.delete(key); return n; }));
                                      setCommandInputs(prev => { const n = new Map(prev); n.set(wt.branch, ''); return n; });
                                    }, 0);
                                  }}>
                                    {cmd}
                                  </Button>
                                ))}
                              </div>
                              
                              {/* Log output */}
                              <div
                                ref={(el) => { if (el) logRefs.current.set(wt.branch, el); }}
                                className="h-64 overflow-auto bg-[#0a0a0a] text-white p-3 font-mono text-xs"
                              >
                                {branchLogs.length === 0 ? (
                                  <div className="text-gray-500 italic">No logs yet. Run a command or start a preview server.</div>
                                ) : (
                                  branchLogs.map((entry, i) => (
                                    <div key={i} className="flex leading-5">
                                      <span className="text-gray-500 mr-2 flex-shrink-0">
                                        {new Date(entry.timestamp).toLocaleTimeString()}
                                      </span>
                                      <span className={`mr-2 flex-shrink-0 font-bold ${
                                        entry.type === 'stdout' ? 'text-green-400' :
                                        entry.type === 'stderr' ? 'text-red-400' :
                                        entry.type === 'system' ? 'text-blue-400' : 'text-red-500'
                                      }`}>
                                        {entry.type === 'stdout' ? '[OUT]' : entry.type === 'stderr' ? '[ERR]' : entry.type === 'system' ? '[SYS]' : '[ERR]'}
                                      </span>
                                      <span className={
                                        entry.type === 'stderr' ? 'text-red-300' :
                                        entry.type === 'system' ? 'text-blue-300' : 'text-gray-200'
                                      }>
                                        {stripAnsi(entry.message)}
                                      </span>
                                      {entry.exitCode !== undefined && (
                                        <Badge variant={entry.exitCode === 0 ? "default" : "destructive"} className="ml-2 text-[10px]">
                                          Exit {entry.exitCode}
                                        </Badge>
                                      )}
                                    </div>
                                  ))
                                )}
                              </div>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Branch overview */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-lg">Branch Overview</CardTitle>
                  <CardDescription>Status of all branches in this repository</CardDescription>
                </div>
                <Badge variant="secondary">{branches.length} branches</Badge>
              </div>
              <Input
                placeholder="Search branches..."
                value={branchSearch}
                onChange={(e) => setBranchSearch(e.target.value)}
                className="mt-2"
              />
            </CardHeader>
            <CardContent>
              {loadingBranches ? (
                <div className="flex items-center justify-center py-8 text-muted-foreground gap-2">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>Loading branches...</span>
                </div>
              ) : branches.length === 0 ? (
                <div className="text-center py-4 text-muted-foreground">No branches found</div>
              ) : (
                <div className="space-y-2">
                  {branches.filter(b => !branchSearch || b.name.toLowerCase().includes(branchSearch.toLowerCase())).map((b) => (
                    <div key={b.name} className="flex items-center justify-between py-2 px-3 rounded border hover:bg-muted/50 transition-colors">
                      <div className="flex items-center gap-2">
                        <GitBranch className="w-4 h-4 text-muted-foreground" />
                        <span className="font-medium">{b.name}</span>
                        {b.isCurrent && <Badge variant="default">Current</Badge>}
                        {b.isLocal && b.isRemote && <Badge variant="default" className="text-[10px] px-1 py-0">local + remote</Badge>}
                        {b.isLocal && !b.isRemote && <Badge variant="secondary" className="text-[10px] px-1 py-0">local</Badge>}
                        {!b.isLocal && b.isRemote && <Badge variant="outline" className="text-[10px] px-1 py-0">remote</Badge>}
                        {b.hasWorktree && <Badge variant="secondary">Has Worktree</Badge>}
                      </div>
                      <div className="flex items-center gap-1">
                        {!b.hasWorktree && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() => {
                              setCreateNewBranch(false);
                              setSelectedBranch(b.name);
                              setCreateDialogOpen(true);
                            }}
                          >
                            <Plus className="w-3 h-3 mr-1" />
                            Worktree
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* Preview Command Dialog */}
      <Dialog open={previewDialog.open} onOpenChange={(open) => { if (!open) setPreviewDialog(p => ({ ...p, open: false })); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Start Preview Server</DialogTitle>
            <DialogDescription>
              Run a dev server for <strong>{previewDialog.branch}</strong>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label className="text-sm font-medium mb-1 block">Command</Label>
              <Input
                value={previewDialog.command}
                onChange={(e) => setPreviewDialog(p => ({ ...p, command: e.target.value }))}
                placeholder="e.g. pnpm dev, flutter run -d web-server, npm start"
              />
            </div>
            <div className="flex flex-wrap gap-1">
              {['pnpm dev', 'npm run dev', 'flutter run -d web-server --web-port=3200', 'yarn dev'].map(cmd => (
                <Button key={cmd} variant="outline" size="sm" className="text-xs h-7"
                  onClick={() => setPreviewDialog(p => ({ ...p, command: cmd }))}>
                  {cmd}
                </Button>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPreviewDialog(p => ({ ...p, open: false }))}>Cancel</Button>
            <Button onClick={() => {
              const { branch, command } = previewDialog;
              setPreviewDialog(p => ({ ...p, open: false }));
              startPreview(branch, command);
            }} disabled={!previewDialog.command.trim()}>
              <Play className="w-3 h-3 mr-1" /> Start
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
