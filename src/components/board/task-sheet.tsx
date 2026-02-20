'use client';

import { useState, useEffect } from 'react';
import { Task, TaskStatus, Priority, Project, TASK_STATUSES, PRIORITIES } from '@/lib/types';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import { Trash2, GitBranch, Check, ChevronsUpDown, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';

const STATUS_LABELS: Record<TaskStatus, string> = {
  backlog: '📋 Backlog',
  refinement: '🔍 Refinement',
  pending_approval: '⏳ Pending Approval',
  todo: '🔜 To Do',
  in_progress: '🏃 In Progress',
  review: '👀 Review',
  done: '✅ Done',
};

const PRIORITY_LABELS: Record<Priority, string> = {
  critical: '🔴 Critical',
  high: '🟠 High',
  medium: '🟡 Medium',
  low: '🟢 Low',
};

interface TaskSheetProps {
  taskId?: string | null;
  mode: 'create' | 'edit';
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
  defaultStatus?: TaskStatus;
  defaultProjectId?: string;
}

export function TaskSheet({ taskId, mode, open, onOpenChange, onSaved, defaultStatus, defaultProjectId }: TaskSheetProps) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<TaskStatus>(defaultStatus || 'backlog');
  const [priority, setPriority] = useState<Priority>('medium');
  const [assignee, setAssignee] = useState('');
  const [storyPoints, setStoryPoints] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [prUrl, setPrUrl] = useState('');
  const [branch, setBranch] = useState('');
  const [labelInput, setLabelInput] = useState('');
  const [labels, setLabels] = useState<string[]>([]);
  const [projectId, setProjectId] = useState<string>('');
  const [projects, setProjects] = useState<Project[]>([]);
  const [branches, setBranches] = useState<string[]>([]);
  const [branchOpen, setBranchOpen] = useState(false);
  const [branchSearch, setBranchSearch] = useState('');

  const filteredBranches = branchSearch
    ? branches.filter(b => b.toLowerCase().includes(branchSearch.toLowerCase()))
    : branches;
  const [worktreeStatus, setWorktreeStatus] = useState<{ hasWorktree: boolean; path?: string } | null>(null);

  // Load projects
  useEffect(() => {
    if (open) {
      fetch('/api/projects')
        .then(r => r.json())
        .then(data => setProjects(data.projects || []))
        .catch(() => {});
    }
  }, [open]);

  // Load branches when project changes
  useEffect(() => {
    if (projectId && open) {
      fetch(`/api/git/branches?project=${encodeURIComponent(projectId)}`)
        .then(r => r.json())
        .then(data => {
          if (data.branches) {
            setBranches(data.branches.map((b: any) => b.name));
          }
        })
        .catch(() => setBranches([]));
    } else {
      setBranches([]);
    }
  }, [projectId, open]);

  // Check worktree status when branch changes
  useEffect(() => {
    if (branch && projectId && open) {
      fetch(`/api/git/worktrees?project=${encodeURIComponent(projectId)}`)
        .then(r => r.json())
        .then(data => {
          if (data.worktrees) {
            const worktree = data.worktrees.find((w: any) => w.branch === branch);
            setWorktreeStatus(worktree ? { hasWorktree: true, path: worktree.path } : { hasWorktree: false });
          }
        })
        .catch(() => setWorktreeStatus(null));
    } else {
      setWorktreeStatus(null);
    }
  }, [branch, projectId, open]);

  // Load task data in edit mode
  useEffect(() => {
    if (mode === 'edit' && taskId && open) {
      setLoading(true);
      fetch(`/api/tasks/${taskId}`)
        .then((r) => r.json())
        .then((data: { task: Task }) => {
          const t = data.task;
          setTitle(t.title);
          setDescription(t.description || '');
          setStatus(t.status);
          setPriority(t.priority);
          setAssignee(t.assignee || '');
          setStoryPoints(t.story_points?.toString() || '');
          setDueDate(t.due_date || '');
          setPrUrl(t.pr_url || '');
          setBranch(t.branch || '');
          setLabels(t.labels || []);
          setProjectId(t.project_id || '');
        })
        .catch(() => {})
        .finally(() => setLoading(false));
    } else if (mode === 'create' && open) {
      // Reset form
      setTitle('');
      setDescription('');
      setStatus(defaultStatus || 'backlog');
      setPriority('medium');
      setAssignee('');
      setStoryPoints('');
      setDueDate('');
      setPrUrl('');
      setBranch('');
      setLabels([]);
      setProjectId(defaultProjectId || '');
    }
  }, [mode, taskId, open, defaultStatus]);

  const addLabel = () => {
    const l = labelInput.trim();
    if (l && !labels.includes(l)) {
      setLabels([...labels, l]);
      setLabelInput('');
    }
  };

  const removeLabel = (l: string) => setLabels(labels.filter((x) => x !== l));

  const handleSave = async () => {
    if (!title.trim()) return;
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        title: title.trim(),
        description: description.trim() || undefined,
        status,
        priority,
        labels,
      };
      if (assignee.trim()) body.assignee = assignee.trim();
      if (projectId.trim()) body.project_id = projectId.trim();
      if (storyPoints) body.story_points = parseInt(storyPoints, 10);
      if (dueDate) body.due_date = dueDate;
      if (prUrl.trim()) body.pr_url = prUrl.trim();
      if (branch.trim()) body.branch = branch.trim();

      const url = mode === 'edit' ? `/api/tasks/${taskId}` : '/api/tasks';
      const method = mode === 'edit' ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error('Save failed');
      onOpenChange(false);
      onSaved?.();
    } catch {
      alert('Failed to save task');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Delete this task?')) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/tasks/${taskId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Delete failed');
      onOpenChange(false);
      onSaved?.();
    } catch {
      alert('Failed to delete task');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{mode === 'create' ? 'New Task' : 'Edit Task'}</SheetTitle>
        </SheetHeader>

        {loading ? (
          <div className="py-8 text-center text-muted-foreground">Loading...</div>
        ) : (
          <div className="space-y-4 py-4">
            <div>
              <label className="text-sm font-medium mb-1 block">Title *</label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Task title" />
            </div>

            <div>
              <label className="text-sm font-medium mb-1 block">Description</label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Describe the task..." rows={4} />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium mb-1 block">Status</label>
                <Select value={status} onValueChange={(v) => setStatus(v as TaskStatus)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TASK_STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Priority</label>
                <Select value={priority} onValueChange={(v) => setPriority(v as Priority)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PRIORITIES.map((p) => (
                      <SelectItem key={p} value={p}>{PRIORITY_LABELS[p]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium mb-1 block">Assignee</label>
                <Input value={assignee} onChange={(e) => setAssignee(e.target.value)} placeholder="agent-id" />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Story Points</label>
                <Input type="number" value={storyPoints} onChange={(e) => setStoryPoints(e.target.value)} placeholder="0" />
              </div>
            </div>

            <div>
              <label className="text-sm font-medium mb-1 block">Project</label>
              <Select value={projectId || '__none__'} onValueChange={(v) => setProjectId(v === '__none__' ? '' : v)}>
                <SelectTrigger><SelectValue placeholder="Select project..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">No project</SelectItem>
                  {projects.map((project) => (
                    <SelectItem key={project.id} value={project.id}>
                      {project.name} {project.repo_owner && ` (${project.repo_owner})`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm font-medium mb-1 block">Branch</label>
              <div className="flex items-center gap-2">
                <Popover open={branchOpen} onOpenChange={setBranchOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={branchOpen}
                      className="flex-1 justify-between"
                      disabled={!projectId}
                    >
                      <div className="flex items-center gap-2">
                        <GitBranch className="w-4 h-4" />
                        {branch || "Select branch..."}
                      </div>
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-full p-0">
                    <Command shouldFilter={false}>
                      <CommandInput 
                        placeholder="Search or create branch..." 
                        value={branchSearch}
                        onValueChange={setBranchSearch}
                      />
                      <CommandList>
                        <CommandEmpty>
                          {branchSearch.trim() ? (
                            <CommandItem
                              value={branchSearch.trim()}
                              onSelect={() => {
                                setBranch(branchSearch.trim());
                                setBranchOpen(false);
                                setBranchSearch('');
                              }}
                              className="cursor-pointer"
                            >
                              <Plus className="mr-2 h-4 w-4" />
                              Create branch &quot;{branchSearch.trim()}&quot;
                            </CommandItem>
                          ) : (
                            'No branches found.'
                          )}
                        </CommandEmpty>
                        <CommandGroup>
                          {branchSearch.trim() && !filteredBranches.includes(branchSearch.trim()) && (
                            <CommandItem
                              value={`__create__${branchSearch.trim()}`}
                              onSelect={() => {
                                setBranch(branchSearch.trim());
                                setBranchOpen(false);
                                setBranchSearch('');
                              }}
                              className="text-primary"
                            >
                              <Plus className="mr-2 h-4 w-4" />
                              Create &quot;{branchSearch.trim()}&quot;
                            </CommandItem>
                          )}
                          {filteredBranches.map((branchName) => (
                            <CommandItem
                              key={branchName}
                              value={branchName}
                              onSelect={() => {
                                setBranch(branchName === branch ? "" : branchName);
                                setBranchOpen(false);
                                setBranchSearch('');
                              }}
                            >
                              <Check
                                className={cn(
                                  "mr-2 h-4 w-4",
                                  branch === branchName ? "opacity-100" : "opacity-0"
                                )}
                              />
                              {branchName}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
                {worktreeStatus?.hasWorktree && (
                  <Badge variant="secondary" className="text-xs">
                    Worktree Active
                  </Badge>
                )}
              </div>
              {!projectId && (
                <p className="text-xs text-muted-foreground mt-1">Select a project first to see branches</p>
              )}
            </div>

            <div>
              <label className="text-sm font-medium mb-1 block">Due Date</label>
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>

            <div>
              <label className="text-sm font-medium mb-1 block">PR URL</label>
              <Input value={prUrl} onChange={(e) => setPrUrl(e.target.value)} placeholder="https://github.com/..." />
            </div>

            <div>
              <label className="text-sm font-medium mb-1 block">Labels</label>
              <div className="flex gap-2">
                <Input
                  value={labelInput}
                  onChange={(e) => setLabelInput(e.target.value)}
                  placeholder="Add label..."
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addLabel(); } }}
                />
                <Button variant="outline" size="sm" onClick={addLabel} type="button">Add</Button>
              </div>
              {labels.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {labels.map((l) => (
                    <Badge key={l} variant="secondary" className="cursor-pointer" onClick={() => removeLabel(l)}>
                      {l} ×
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-between pt-4 border-t">
              {mode === 'edit' ? (
                <Button variant="destructive" size="sm" onClick={handleDelete} disabled={deleting}>
                  <Trash2 className="w-4 h-4 mr-1" />
                  {deleting ? 'Deleting...' : 'Delete'}
                </Button>
              ) : (
                <div />
              )}
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                <Button onClick={handleSave} disabled={saving || !title.trim()}>
                  {saving ? 'Saving...' : mode === 'create' ? 'Create' : 'Save'}
                </Button>
              </div>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
