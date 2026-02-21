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
  Download,
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
  const [expandedEditors, setExpandedEditors] = useState<Set<string>>(new Set());

  const toggleEditor = (branch: string) => {
    setExpandedEditors(prev => {
      const n = new Set(prev);
      if (n.has(branch)) n.delete(branch); else n.add(branch);
      return n;
    });
  };
  
  // Multi-console per worktree
  interface ConsoleTab {
    id: string;
    branch: string;
    label: string;
    command?: string; // last run command
  }
  const [consoleTabs, setConsoleTabs] = useState<Map<string, ConsoleTab[]>>(new Map()); // branch -> tabs
  const [activeConsoleTab, setActiveConsoleTab] = useState<Map<string, string>>(new Map()); // branch -> active tab id
  const nextConsoleId = useRef(1);

  const getOrCreateConsoles = (branch: string): ConsoleTab[] => {
    return consoleTabs.get(branch) || [];
  };

  const addConsoleTab = (branch: string) => {
    const id = `console-${nextConsoleId.current++}`;
    const tabs = getOrCreateConsoles(branch);
    const newTab: ConsoleTab = { id, branch, label: `Console ${tabs.length + 1}` };
    setConsoleTabs(prev => {
      const n = new Map(prev);
      n.set(branch, [...(n.get(branch) || []), newTab]);
      return n;
    });
    setActiveConsoleTab(prev => { const n = new Map(prev); n.set(branch, id); return n; });
    // Subscribe to logs for this console
    const logKey = `${branch}:${id}`;
    subscribeLogs(branch, id);
    return id;
  };

  const removeConsoleTab = (branch: string, tabId: string) => {
    setConsoleTabs(prev => {
      const n = new Map(prev);
      const tabs = (n.get(branch) || []).filter(t => t.id !== tabId);
      n.set(branch, tabs);
      return n;
    });
    unsubscribeLogs(branch, tabId);
    // Kill process for that console
    killProcess(branch, tabId);
    // Switch to another tab
    setActiveConsoleTab(prev => {
      const n = new Map(prev);
      if (n.get(branch) === tabId) {
        const remaining = (consoleTabs.get(branch) || []).filter(t => t.id !== tabId);
        n.set(branch, remaining.length > 0 ? remaining[0].id : '');
      }
      return n;
    });
    // Clear logs
    setLogs(prev => { const n = new Map(prev); n.delete(`${branch}:${tabId}`); return n; });
  };

  // Per-worktree logs (keyed by branch:consoleId)
  const [logs, setLogs] = useState<Map<string, LogEntry[]>>(new Map());
  const [autoScroll, setAutoScroll] = useState(true);
  const logRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const eventSourceRefs = useRef<Map<string, EventSource>>(new Map());
  const iframeRefs = useRef<Map<string, HTMLIFrameElement>>(new Map());
  
  // Per-console command input (keyed by branch:consoleId)
  const [commandInputs, setCommandInputs] = useState<Map<string, string>>(new Map());
  const [runningCommands, setRunningCommands] = useState<Set<string>>(new Set());
  const [startingServers, setStartingServers] = useState<Set<string>>(new Set());
  const [stoppingServers, setStoppingServers] = useState<Set<string>>(new Set());
  const [killingProcesses, setKillingProcesses] = useState<Set<string>>(new Set());
  
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
  const [previewDialog, setPreviewDialog] = useState<{ open: boolean; branch: string; command: string; cwd: string }>({ open: false, branch: '', command: '', cwd: '' });
  const [deleteBranchConfirm, setDeleteBranchConfirm] = useState<{ open: boolean; branch: string; isLocal: boolean; isRemote: boolean }>({ open: false, branch: '', isLocal: false, isRemote: false });
  const [deletingBranch, setDeletingBranch] = useState(false);

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

  // SSE log subscription per branch:consoleId
  const subscribeLogs = useCallback((branch: string, consoleId?: string) => {
    const key = consoleId ? `${branch}:${consoleId}` : branch;
    if (eventSourceRefs.current.has(key)) return;
    const url = `/api/git/worktrees/logs?project=${encodeURIComponent(selectedProject)}&branch=${encodeURIComponent(branch)}${consoleId ? `&consoleId=${encodeURIComponent(consoleId)}` : ''}`;
    const es = new EventSource(url);
    eventSourceRefs.current.set(key, es);
    
    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        // Handle tmux fullContent (initial load or output update)
        if (data.fullContent !== undefined) {
          const lines = data.fullContent.split('\n').filter((l: string) => l.trim());
          const entries: LogEntry[] = lines.map((line: string) => ({
            type: 'stdout' as const,
            message: line,
            timestamp: data.timestamp,
          }));
          setLogs(prev => {
            const updated = new Map(prev);
            updated.set(key, entries.slice(-1000));
            return updated;
          });
          return;
        }
        
        // Handle individual log entries (system messages, etc.)
        const entry: LogEntry = data;
        setLogs(prev => {
          const updated = new Map(prev);
          const entries = [...(updated.get(key) || []), entry];
          if (entries.length > 1000) entries.shift();
          updated.set(key, entries);
          return updated;
        });
      } catch { /* ignore */ }
    };
    es.onerror = () => {
      es.close();
      eventSourceRefs.current.delete(key);
    };
  }, [selectedProject]);

  const unsubscribeLogs = useCallback((branch: string, consoleId?: string) => {
    const key = consoleId ? `${branch}:${consoleId}` : branch;
    const es = eventSourceRefs.current.get(key);
    if (es) { es.close(); eventSourceRefs.current.delete(key); }
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
        // Unsubscribe all console SSE for this branch
        const tabs = consoleTabs.get(branch) || [];
        tabs.forEach(t => unsubscribeLogs(branch, t.id));
      } else {
        next.add(branch);
        // Create first console tab if none exist
        if (!consoleTabs.get(branch)?.length) {
          addConsoleTab(branch);
        } else {
          // Re-subscribe existing tabs
          const tabs = consoleTabs.get(branch) || [];
          tabs.forEach(t => subscribeLogs(branch, t.id));
        }
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
  interface DetectedApp { name: string; type: string; command: string; cwd: string; port?: number; packageManager?: string }
  const [detectedApps, setDetectedApps] = useState<DetectedApp[]>([]);
  const [detecting, setDetecting] = useState(false);

  const openPreviewDialog = async (branch: string) => {
    setPreviewDialog({ open: true, branch, command: '', cwd: '' });
    setDetectedApps([]);
    setDetecting(true);
    try {
      const res = await fetch(`/api/git/worktrees/detect?project=${encodeURIComponent(selectedProject)}&branch=${encodeURIComponent(branch)}`);
      if (res.ok) {
        const data = await res.json();
        const apps: DetectedApp[] = data.apps || [];
        setDetectedApps(apps);
        // Auto-select first app
        if (apps.length > 0) {
          setPreviewDialog(p => ({ ...p, command: apps[0].command, cwd: apps[0].cwd === '.' ? '' : apps[0].cwd }));
        }
      }
    } catch { /* ignore */ }
    setDetecting(false);
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

  // Run command in worktree console
  const runCommand = async (branch: string, consoleId?: string) => {
    const inputKey = consoleId ? `${branch}:${consoleId}` : branch;
    const cmd = commandInputs.get(inputKey)?.trim();
    if (!cmd) return;
    const key = `${branch}:${cmd}:${consoleId || ''}`;
    setRunningCommands(prev => new Set([...prev, key]));
    try {
      await fetch('/api/git/worktrees/logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project: selectedProject, branch, command: cmd, consoleId }),
      });
      setCommandInputs(prev => { const n = new Map(prev); n.set(inputKey, ''); return n; });
      // Update tab label with command
      if (consoleId) {
        setConsoleTabs(prev => {
          const n = new Map(prev);
          const tabs = (n.get(branch) || []).map(t => t.id === consoleId ? { ...t, command: cmd, label: cmd.length > 20 ? cmd.substring(0, 20) + '…' : cmd } : t);
          n.set(branch, tabs);
          return n;
        });
      }
      // Ensure logs panel is open
      if (!expandedLogs.has(branch)) toggleLogs(branch);
    } catch { alert('Failed to run command'); }
    finally { setRunningCommands(prev => { const n = new Set(prev); n.delete(key); return n; }); }
  };

  const killProcess = async (branch: string, consoleId?: string) => {
    const key = consoleId ? `${branch}:${consoleId}` : branch;
    if (killingProcesses.has(key)) return;
    setKillingProcesses(prev => new Set(prev).add(key));
    try {
      const res = await fetch('/api/git/worktrees/logs', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project: selectedProject, branch, consoleId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        if (res.status !== 404) alert(data.error || 'Failed to kill process');
      }
    } catch { alert('Failed to kill process'); }
    finally { setKillingProcesses(prev => { const n = new Set(prev); n.delete(key); return n; }); }
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
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={async () => {
              setLoading(true);
              try {
                const res = await fetch('/api/git/fetch', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ project: selectedProject }),
                });
                if (!res.ok) {
                  const data = await res.json();
                  console.error('Fetch failed:', data.error);
                }
                await loadProjectData();
              } catch (err) {
                console.error('Fetch error:', err);
                setLoading(false);
              }
            }} disabled={loading}>
              <Download className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Fetch
            </Button>
            <Button variant="outline" size="sm" onClick={loadProjectData} disabled={loading}>
              <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
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
                              
                              <Button 
                                variant={expandedEditors.has(wt.branch) ? 'default' : 'outline'}
                                size="sm" 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleEditor(wt.branch);
                                }} 
                                title="Code Editor"
                              >
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
                                      <Button variant="ghost" size="sm" onClick={() => window.open(`http://${window.location.hostname}:${server.port}`, '_blank')}>
                                        <ExternalLink className="w-3 h-3" />
                                      </Button>
                                      <Button variant="ghost" size="sm" onClick={() => stopPreview(wt.branch)} disabled={stoppingServers.has(wt.branch)}>
                                        <Square className="w-3 h-3" />
                                      </Button>
                                    </>
                                  ) : server?.status === 'starting' ? (
                                    <>
                                      <Badge variant="secondary" className="text-[10px]"><Loader2 className="w-3 h-3 mr-1 animate-spin inline" />Starting...</Badge>
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
                                    src={`http://${typeof window !== 'undefined' ? window.location.hostname : 'localhost'}:${server.port}`}
                                    className="w-full h-full border-0"
                                    title={`Preview: ${wt.branch}`}
                                    sandbox="allow-same-origin allow-scripts allow-forms allow-popups"
                                  />
                                </div>
                              ) : server?.status === 'starting' ? (
                                <div className="py-4 px-3">
                                  <div className="flex items-center gap-2 mb-2 text-sm text-muted-foreground">
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    Starting preview server...
                                    <code className="text-xs bg-muted px-1 py-0.5 rounded">{server.command}</code>
                                  </div>
                                  <div className="bg-black/90 rounded p-2 max-h-32 overflow-y-auto font-mono text-xs text-green-400">
                                    {(logs.get(wt.branch) || []).slice(-10).map((log, i) => (
                                      <div key={i} className={log.type === 'stderr' ? 'text-red-400' : log.type === 'system' ? 'text-yellow-400' : ''}>
                                        {log.message}
                                      </div>
                                    ))}
                                    {(!logs.get(wt.branch) || logs.get(wt.branch)!.length === 0) && (
                                      <div className="text-muted-foreground">Waiting for output...</div>
                                    )}
                                  </div>
                                </div>
                              ) : server?.status === 'error' ? (
                                <div className="py-4 px-3">
                                  <div className="flex items-center gap-2 mb-2 text-sm text-destructive">
                                    <AlertCircle className="w-4 h-4" />
                                    Preview server failed
                                  </div>
                                  <div className="bg-black/90 rounded p-2 max-h-32 overflow-y-auto font-mono text-xs text-red-400">
                                    {(logs.get(wt.branch) || []).slice(-10).map((log, i) => (
                                      <div key={i}>{log.message}</div>
                                    ))}
                                  </div>
                                  <Button size="sm" className="mt-2" onClick={() => openPreviewDialog(wt.branch)}>
                                    <Play className="w-3 h-3 mr-1" /> Retry
                                  </Button>
                                </div>
                              ) : (
                                <div className="py-8 text-center text-muted-foreground text-sm">
                                  No preview server running. Click &quot;Start Preview&quot; to launch.
                                </div>
                              )}
                            </div>
                          )}

                          {/* Multi-Console Logs panel (expanded) */}
                          {isLogsOpen && (() => {
                            const tabs = consoleTabs.get(wt.branch) || [];
                            const activeTabId = activeConsoleTab.get(wt.branch) || tabs[0]?.id || '';
                            const logKey = `${wt.branch}:${activeTabId}`;
                            const tabLogs = logs.get(logKey) || [];
                            const inputKey = `${wt.branch}:${activeTabId}`;

                            return (
                            <div className="border rounded-lg overflow-hidden">
                              {/* Console tabs bar */}
                              <div className="flex items-center bg-muted/50 border-b overflow-x-auto">
                                <div className="flex items-center flex-1 min-w-0">
                                  {tabs.map(tab => (
                                    <button
                                      key={tab.id}
                                      onClick={() => setActiveConsoleTab(prev => { const n = new Map(prev); n.set(wt.branch, tab.id); return n; })}
                                      className={cn(
                                        "flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-r transition-colors whitespace-nowrap",
                                        activeTabId === tab.id ? "bg-background text-foreground" : "text-muted-foreground hover:bg-muted/80"
                                      )}
                                    >
                                      <Terminal className="w-3 h-3" />
                                      {tab.label}
                                      {tabs.length > 1 && (
                                        <span
                                          onClick={(e) => { e.stopPropagation(); removeConsoleTab(wt.branch, tab.id); }}
                                          className="ml-1 hover:text-destructive cursor-pointer"
                                        >×</span>
                                      )}
                                    </button>
                                  ))}
                                </div>
                                <div className="flex items-center gap-1 px-2">
                                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => addConsoleTab(wt.branch)} title="New console">
                                    <Plus className="w-3 h-3" />
                                  </Button>
                                  <div className="flex items-center gap-1">
                                    <Switch id={`auto-scroll-${wt.branch}`} checked={autoScroll} onCheckedChange={setAutoScroll} />
                                    <Label htmlFor={`auto-scroll-${wt.branch}`} className="text-[10px]">Auto</Label>
                                  </div>
                                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => {
                                    navigator.clipboard.writeText(tabLogs.map(e => stripAnsi(`${e.type}: ${e.message}`)).join('\n'));
                                  }} title="Copy logs">
                                    <Copy className="w-3 h-3" />
                                  </Button>
                                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => {
                                    setLogs(prev => { const n = new Map(prev); n.set(logKey, []); return n; });
                                  }} title="Clear logs">
                                    <Trash2 className="w-3 h-3" />
                                  </Button>
                                </div>
                              </div>
                              
                              {/* Command input for active tab */}
                              <div className="flex gap-2 px-3 py-2 border-b bg-muted/30">
                                <Input
                                  value={commandInputs.get(inputKey) || ''}
                                  onChange={(e) => setCommandInputs(prev => { const n = new Map(prev); n.set(inputKey, e.target.value); return n; })}
                                  placeholder="Enter command..."
                                  className="flex-1 h-8 text-sm"
                                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); runCommand(wt.branch, activeTabId); } }}
                                />
                                <Button size="sm" className="h-8" onClick={() => runCommand(wt.branch, activeTabId)} disabled={!commandInputs.get(inputKey)?.trim()}>
                                  <Play className="w-3 h-3" />
                                </Button>
                                <Button size="sm" variant="destructive" className="h-8" onClick={() => killProcess(wt.branch, activeTabId)} disabled={killingProcesses.has(`${wt.branch}:${activeTabId}`)} title="Kill running process">
                                  <Square className="w-3 h-3" />
                                </Button>
                              </div>
                              
                              {/* Quick commands */}
                              <div className="flex flex-wrap gap-1 px-3 py-1.5 border-b bg-muted/20">
                                {commonCommands.map(cmd => (
                                  <Button key={cmd} variant="ghost" size="sm" className="h-6 text-xs px-2" onClick={() => {
                                    setCommandInputs(prev => { const n = new Map(prev); n.set(inputKey, cmd); return n; });
                                    setTimeout(() => {
                                      const key = `${wt.branch}:${cmd}:${activeTabId}`;
                                      setRunningCommands(prev => new Set([...prev, key]));
                                      fetch('/api/git/worktrees/logs', {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({ project: selectedProject, branch: wt.branch, command: cmd, consoleId: activeTabId }),
                                      }).finally(() => setRunningCommands(prev => { const n = new Set(prev); n.delete(key); return n; }));
                                      setCommandInputs(prev => { const n = new Map(prev); n.set(inputKey, ''); return n; });
                                      // Update tab label
                                      setConsoleTabs(prev => {
                                        const n = new Map(prev);
                                        const tabs = (n.get(wt.branch) || []).map(t => t.id === activeTabId ? { ...t, command: cmd, label: cmd.length > 20 ? cmd.substring(0, 20) + '…' : cmd } : t);
                                        n.set(wt.branch, tabs);
                                        return n;
                                      });
                                    }, 0);
                                  }}>
                                    {cmd}
                                  </Button>
                                ))}
                              </div>
                              
                              {/* Log output for active tab */}
                              <div
                                ref={(el) => { if (el) logRefs.current.set(logKey, el); }}
                                className="h-64 overflow-auto bg-[#0a0a0a] text-white p-3 font-mono text-xs"
                              >
                                {tabLogs.length === 0 ? (
                                  <div className="text-gray-500 italic">No logs yet. Run a command or start a preview server.</div>
                                ) : (
                                  tabLogs.map((entry, i) => (
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
                            );
                          })()}

                          {/* Editor panel (expanded) */}
                          {expandedEditors.has(wt.branch) && (
                            <div className="border rounded-lg overflow-hidden">
                              <div className="flex items-center justify-between px-3 py-2 bg-muted/50 border-b">
                                <span className="text-sm font-medium flex items-center gap-2">
                                  <FolderOpen className="w-4 h-4" /> Code Editor
                                </span>
                                <div className="flex items-center gap-1">
                                  <Button variant="ghost" size="sm" onClick={() => {
                                    const editorUrl = `/projects/editor?project=${selectedProject}&branch=${wt.branch}`;
                                    window.open(editorUrl, '_blank');
                                  }} title="Open in full page">
                                    <ExternalLink className="w-3 h-3" />
                                  </Button>
                                </div>
                              </div>
                              <iframe
                                src={`/projects/editor?project=${encodeURIComponent(selectedProject)}&branch=${encodeURIComponent(wt.branch)}&embedded=true`}
                                className="w-full border-0"
                                style={{ height: '500px' }}
                                title={`Editor: ${wt.branch}`}
                              />
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
                        {!b.hasWorktree && !b.isCurrent && !['main','master','develop','dev'].includes(b.name) && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs text-destructive hover:text-destructive"
                            onClick={() => setDeleteBranchConfirm({ open: true, branch: b.name, isLocal: b.isLocal, isRemote: b.isRemote })}
                          >
                            <Trash2 className="w-3 h-3" />
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
            {/* Auto-detected apps */}
            {detecting ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                <Loader2 className="w-4 h-4 animate-spin" /> Detecting project type...
              </div>
            ) : detectedApps.length > 0 ? (
              <div>
                <Label className="text-sm font-medium mb-2 block">Detected Apps</Label>
                <div className="space-y-1">
                  {detectedApps.map(app => (
                    <button key={`${app.cwd}-${app.name}`}
                      className={`w-full text-left p-2 rounded border text-sm hover:bg-muted/50 transition-colors ${
                        previewDialog.command === app.command && previewDialog.cwd === (app.cwd === '.' ? '' : app.cwd) ? 'border-primary bg-muted/50' : ''
                      }`}
                      onClick={() => setPreviewDialog(p => ({ ...p, command: app.command, cwd: app.cwd === '.' ? '' : app.cwd }))}>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-[10px]">{app.type}</Badge>
                        <span className="font-medium">{app.name}</span>
                        {app.port && <span className="text-muted-foreground text-xs">:{app.port}</span>}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {app.cwd !== '.' ? `${app.cwd} → ` : ''}{app.command}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {/* Manual override */}
            <div>
              <Label className="text-sm font-medium mb-1 block">Command {detectedApps.length > 0 && <span className="text-muted-foreground font-normal">(or override)</span>}</Label>
              <Input
                value={previewDialog.command}
                onChange={(e) => setPreviewDialog(p => ({ ...p, command: e.target.value }))}
                placeholder="e.g. pnpm dev, flutter run -d web-server, npm start"
              />
            </div>
            <div>
              <Label className="text-sm font-medium mb-1 block">Subdirectory <span className="text-muted-foreground font-normal">(for monorepos)</span></Label>
              <Input
                value={previewDialog.cwd}
                onChange={(e) => setPreviewDialog(p => ({ ...p, cwd: e.target.value }))}
                placeholder="e.g. apps/ala_app, packages/web"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPreviewDialog(p => ({ ...p, open: false }))}>Cancel</Button>
            <Button onClick={() => {
              const { branch, command, cwd } = previewDialog;
              setPreviewDialog(p => ({ ...p, open: false }));
              startPreview(branch, cwd ? `cd ${cwd} && ${command}` : command);
            }} disabled={!previewDialog.command.trim()}>
              <Play className="w-3 h-3 mr-1" /> Start
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Branch Confirmation */}
      <Dialog open={deleteBranchConfirm.open} onOpenChange={(open) => { if (!open) setDeleteBranchConfirm(p => ({ ...p, open: false })); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Branch</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete <strong>{deleteBranchConfirm.branch}</strong>? This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2 space-y-2 text-sm">
            {deleteBranchConfirm.isLocal && <div className="flex items-center gap-2"><Badge variant="secondary" className="text-[10px]">local</Badge> Will delete local branch</div>}
            {deleteBranchConfirm.isRemote && <div className="flex items-center gap-2"><Badge variant="outline" className="text-[10px]">remote</Badge> Will delete from origin</div>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteBranchConfirm(p => ({ ...p, open: false }))}>Cancel</Button>
            <Button variant="destructive" disabled={deletingBranch} onClick={async () => {
              setDeletingBranch(true);
              try {
                const res = await fetch('/api/git/branches', {
                  method: 'DELETE',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    project: selectedProject,
                    branch: deleteBranchConfirm.branch,
                    deleteLocal: deleteBranchConfirm.isLocal,
                    deleteRemote: deleteBranchConfirm.isRemote,
                  }),
                });
                const data = await res.json();
                if (data.success) {
                  setDeleteBranchConfirm(p => ({ ...p, open: false }));
                  loadProjectData();
                } else {
                  alert(data.error || data.errors?.join(', ') || 'Failed to delete branch');
                }
              } catch { alert('Failed to delete branch'); }
              setDeletingBranch(false);
            }}>
              {deletingBranch ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Trash2 className="w-3 h-3 mr-1" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
