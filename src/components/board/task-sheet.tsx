'use client';

import { useState, useEffect, useRef } from 'react';
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Trash2, GitBranch, Check, ChevronsUpDown, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

function RefinementMarkdown({ content }: { content: string }) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
  );
}

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
  interface BranchInfo { name: string; isLocal: boolean; isRemote: boolean; isCurrent: boolean; hasWorktree: boolean }
  const [branches, setBranches] = useState<BranchInfo[]>([]);
  const [branchOpen, setBranchOpen] = useState(false);
  const [branchSearch, setBranchSearch] = useState('');
  const [creatingBranch, setCreatingBranch] = useState(false);
  const [createBranchDialog, setCreateBranchDialog] = useState<{ open: boolean; name: string }>({ open: false, name: '' });
  const [baseBranchForCreate, setBaseBranchForCreate] = useState('');

  // Include saved branch in list even if not on remote/local
  const allBranches: BranchInfo[] = branch && !branches.some(b => b.name === branch)
    ? [{ name: branch, isLocal: false, isRemote: false, isCurrent: false, hasWorktree: false }, ...branches]
    : branches;
  const filteredBranches = branchSearch
    ? allBranches.filter(b => b.name.toLowerCase().includes(branchSearch.toLowerCase()))
    : allBranches;
  const [worktreeStatus, setWorktreeStatus] = useState<{ hasWorktree: boolean; path?: string } | null>(null);
  const [agents, setAgents] = useState<{ id: string; name: string; model?: string; status?: string }[]>([]);
  const [comments, setComments] = useState<{ id: string; author: string; text: string; created_at: string }[]>([]);
  const [newComment, setNewComment] = useState('');
  const [addingComment, setAddingComment] = useState(false);
  const [refinement, setRefinement] = useState('');
  const [refining, setRefining] = useState(false);
  const [chatMessages, setChatMessages] = useState<{ id: string; role: string; content: string; images?: string[]; timestamp: string; agent_id?: string }[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatSending, setChatSending] = useState(false);
  const [chatImages, setChatImages] = useState<{ file: File; preview: string }[]>([]);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load projects and agents
  useEffect(() => {
    if (open) {
      fetch('/api/projects')
        .then(r => r.json())
        .then(data => setProjects(data.projects || []))
        .catch(() => {});
      fetch('/api/agents')
        .then(r => r.json())
        .then(data => setAgents(Array.isArray(data) ? data : data.agents || []))
        .catch(() => {});
    }
  }, [open]);

  // Load branches when project changes
  useEffect(() => {
    if (projectId && open) {
      // Find the project to get repo owner/name for branch lookup
      const proj = projects.find(p => p.id === projectId);
      const branchProjectId = proj?.repo_owner && proj?.repo_name 
        ? `${proj.repo_owner}/${proj.repo_name}`
        : projectId;
      fetch(`/api/git/branches?project=${encodeURIComponent(branchProjectId)}`)
        .then(r => r.json())
        .then(data => {
          if (data.branches) {
            setBranches(data.branches.map((b: any) => ({
              name: b.name,
              isLocal: b.isLocal ?? false,
              isRemote: b.isRemote ?? true,
              isCurrent: b.isCurrent ?? false,
              hasWorktree: b.hasWorktree ?? false,
            })));
          }
        })
        .catch(() => setBranches([]));
    } else {
      setBranches([]);
    }
  }, [projectId, open, projects]);

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
          setRefinement((t as any).refinement || '');
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
      // Load comments
      fetch(`/api/tasks/${taskId}/comments`)
        .then(r => r.json())
        .then(data => setComments(data.comments || []))
        .catch(() => setComments([]));
      // Load chat
      fetch(`/api/tasks/${taskId}/chat`)
        .then(r => r.json())
        .then(data => setChatMessages(data.messages || []))
        .catch(() => setChatMessages([]));
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

  const handleCreateBranch = (branchName: string) => {
    setBranchOpen(false);
    setBranchSearch('');
    // Find default base branch (main or master or first branch)
    const defaultBase = allBranches.find(b => b.name === 'main')?.name
      || allBranches.find(b => b.name === 'master')?.name
      || allBranches[0]?.name || 'main';
    setBaseBranchForCreate(defaultBase);
    setCreateBranchDialog({ open: true, name: branchName });
  };

  const confirmCreateBranch = async () => {
    const branchName = createBranchDialog.name;
    setCreateBranchDialog({ open: false, name: '' });
    setCreatingBranch(true);
    try {
      const proj = projects.find(p => p.id === projectId);
      const branchProjectId = proj?.repo_owner && proj?.repo_name
        ? `${proj.repo_owner}/${proj.repo_name}`
        : projectId;
      const res = await fetch('/api/git/branches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project: branchProjectId, branch: branchName, baseBranch: baseBranchForCreate }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || 'Failed to create branch');
        setBranch(branchName);
        return;
      }
      setBranch(branchName);
      const listRes = await fetch(`/api/git/branches?project=${encodeURIComponent(branchProjectId)}`);
      const listData = await listRes.json();
      if (listData.branches) {
        setBranches(listData.branches.map((b: any) => ({
          name: b.name, isLocal: b.isLocal ?? false, isRemote: b.isRemote ?? true,
          isCurrent: b.isCurrent ?? false, hasWorktree: b.hasWorktree ?? false,
        })));
      }
    } catch {
      alert('Failed to create branch');
      setBranch(branchName);
    } finally {
      setCreatingBranch(false);
    }
  };

  const addLabel = () => {
    const l = labelInput.trim();
    if (l && !labels.includes(l)) {
      setLabels([...labels, l]);
      setLabelInput('');
    }
  };

  const removeLabel = (l: string) => setLabels(labels.filter((x) => x !== l));

  // Send chat message
  const sendChatMessage = async () => {
    if (!chatInput.trim() && chatImages.length === 0) return;
    setChatSending(true);
    try {
      // Upload images first
      const uploadedImages: string[] = [];
      for (const img of chatImages) {
        const formData = new FormData();
        formData.append('file', img.file);
        const r = await fetch(`/api/tasks/${taskId}/chat/upload`, { method: 'POST', body: formData });
        if (r.ok) {
          const data = await r.json();
          uploadedImages.push(data.path);
        }
      }
      // Send message
      const res = await fetch(`/api/tasks/${taskId}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: chatInput.trim() || '(image)', images: uploadedImages.length ? uploadedImages : undefined }),
      });
      if (res.ok) {
        const data = await res.json();
        setChatMessages(prev => [...prev, data.message]);
        setChatInput('');
        chatImages.forEach(img => URL.revokeObjectURL(img.preview));
        setChatImages([]);
        setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
      }
    } catch { /* ignore */ }
    finally { setChatSending(false); }
  };

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
    <>
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

            {/* Refinement Chat Section */}
            {(status === 'refinement' || refinement || chatMessages.length > 0) && mode === 'edit' && (
              <div className="border rounded-lg overflow-hidden bg-muted/20">
                <div className="flex items-center justify-between px-4 py-2 border-b bg-muted/40">
                  <label className="text-sm font-bold flex items-center gap-2">
                    🔍 Refinement
                    {refining && <span className="text-xs text-yellow-500 animate-pulse">Agent working...</span>}
                  </label>
                  <Button variant="outline" size="sm" disabled={refining || !assignee}
                    onClick={async () => {
                      setRefining(true);
                      try {
                        await fetch(`/api/tasks/${taskId}/refine`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
                        // Poll for updates
                        const poll = setInterval(async () => {
                          const [taskRes, chatRes] = await Promise.all([
                            fetch(`/api/tasks/${taskId}`), fetch(`/api/tasks/${taskId}/chat`),
                          ]);
                          const td = await taskRes.json(); const cd = await chatRes.json();
                          setChatMessages(cd.messages || []);
                          const ref = (td.task as any)?.refinement || '';
                          if (ref && !ref.includes('⏳')) { setRefinement(ref); setRefining(false); clearInterval(poll); }
                        }, 3000);
                        setTimeout(() => { clearInterval(poll); setRefining(false); }, 120000);
                      } catch { setRefining(false); }
                    }}>
                    {refinement ? '🔄 Re-refine' : '✨ Auto-refine'}
                  </Button>
                </div>

                {/* Refinement document */}
                {refinement && !refinement.includes('⏳') && (
                  <div className="px-4 py-3 border-b bg-background/50">
                    <div className="prose prose-sm prose-invert max-w-none [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:mt-3 [&_h3]:mb-1 [&_ul]:my-1 [&_li]:my-0 [&_p]:my-1 [&_input[type=checkbox]]:mr-1.5">
                      <RefinementMarkdown content={refinement} />
                    </div>
                  </div>
                )}

                {/* Chat messages */}
                <div className="max-h-64 overflow-y-auto px-4 py-2 space-y-3">
                  {chatMessages.map(msg => (
                    <div key={msg.id} className={cn("flex gap-2", msg.role === 'user' ? "justify-end" : "justify-start")}>
                      <div className={cn("rounded-lg px-3 py-2 max-w-[85%] text-sm",
                        msg.role === 'user' ? "bg-primary text-primary-foreground" : "bg-muted")}>
                        {msg.role === 'agent' && <span className="text-xs text-muted-foreground block mb-1">🤖 {msg.agent_id || 'Agent'}</span>}
                        <div className="whitespace-pre-wrap">{msg.content}</div>
                        {msg.images?.map((img, i) => (
                          <img key={i} src={img} alt="" className="mt-2 rounded max-h-40 max-w-full" />
                        ))}
                        <span className="text-[10px] opacity-50 block mt-1">
                          {new Date(msg.timestamp).toLocaleTimeString()}
                        </span>
                      </div>
                    </div>
                  ))}
                  <div ref={chatEndRef} />
                </div>

                {/* Image previews */}
                {chatImages.length > 0 && (
                  <div className="px-4 py-1 flex gap-2 border-t">
                    {chatImages.map((img, i) => (
                      <div key={i} className="relative">
                        <img src={img.preview} alt="" className="h-16 rounded" />
                        <button className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground rounded-full w-4 h-4 text-xs flex items-center justify-center"
                          onClick={() => { URL.revokeObjectURL(img.preview); setChatImages(prev => prev.filter((_, j) => j !== i)); }}>×</button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Chat input */}
                <div className="px-3 py-2 border-t flex gap-2 items-end">
                  <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden"
                    onChange={e => {
                      const files = Array.from(e.target.files || []);
                      setChatImages(prev => [...prev, ...files.map(f => ({ file: f, preview: URL.createObjectURL(f) }))]);
                      e.target.value = '';
                    }} />
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0 shrink-0" onClick={() => fileInputRef.current?.click()}>
                    📎
                  </Button>
                  <Textarea value={chatInput} onChange={e => setChatInput(e.target.value)}
                    placeholder="Message the agent..." rows={1} className="flex-1 min-h-[36px] max-h-24 resize-none"
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChatMessage(); } }} />
                  <Button size="sm" className="h-8 shrink-0" disabled={chatSending || (!chatInput.trim() && chatImages.length === 0)}
                    onClick={sendChatMessage}>
                    Send
                  </Button>
                </div>
              </div>
            )}

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
                <Select value={assignee || '__none__'} onValueChange={(v) => setAssignee(v === '__none__' ? '' : v)}>
                  <SelectTrigger><SelectValue placeholder="Select agent..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Unassigned</SelectItem>
                    <SelectItem value="jose-alejandro">👤 Jose Alejandro</SelectItem>
                    {agents.map((agent) => {
                      const shortModel = (agent.model || '').split('/').pop()?.replace(/-\d+$/, '') || '';
                      const label = `🤖 ${agent.name || agent.id} · ${shortModel}${agent.status === 'busy' ? ' (busy)' : ''}`;
                      return (
                        <SelectItem key={agent.id} value={agent.id}>{label}</SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
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
                      disabled={!projectId || creatingBranch}
                    >
                      <div className="flex items-center gap-2">
                        <GitBranch className="w-4 h-4" />
                        {branch ? (
                          <span className="flex items-center gap-1.5">
                            {branch}
                            {(() => {
                              const bi = allBranches.find(b => b.name === branch);
                              if (!bi || (!bi.isLocal && !bi.isRemote)) return <Badge variant="outline" className="text-[10px] px-1 py-0">saved</Badge>;
                              if (bi.isLocal && bi.isRemote) return <Badge variant="default" className="text-[10px] px-1 py-0">local + remote</Badge>;
                              if (bi.isLocal) return <Badge variant="secondary" className="text-[10px] px-1 py-0">local</Badge>;
                              return <Badge variant="outline" className="text-[10px] px-1 py-0">remote</Badge>;
                            })()}
                          </span>
                        ) : "Select branch..."}
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
                              onSelect={() => handleCreateBranch(branchSearch.trim())}
                              className="cursor-pointer"
                            >
                              <Plus className="mr-2 h-4 w-4" />
                              Create &amp; push &quot;{branchSearch.trim()}&quot;
                            </CommandItem>
                          ) : (
                            'No branches found.'
                          )}
                        </CommandEmpty>
                        <CommandGroup>
                          {branchSearch.trim() && !filteredBranches.some(b => b.name === branchSearch.trim()) && (
                            <CommandItem
                              value={`__create__${branchSearch.trim()}`}
                              onSelect={() => handleCreateBranch(branchSearch.trim())}
                              className="text-primary"
                            >
                              <Plus className="mr-2 h-4 w-4" />
                              Create &amp; push &quot;{branchSearch.trim()}&quot;
                            </CommandItem>
                          )}
                          {filteredBranches.map((bi) => (
                            <CommandItem
                              key={bi.name}
                              value={bi.name}
                              onSelect={() => {
                                setBranch(bi.name === branch ? "" : bi.name);
                                setBranchOpen(false);
                                setBranchSearch('');
                              }}
                            >
                              <Check
                                className={cn(
                                  "mr-2 h-4 w-4",
                                  branch === bi.name ? "opacity-100" : "opacity-0"
                                )}
                              />
                              <span className="flex items-center gap-1.5 flex-1">
                                {bi.name}
                                {bi.isLocal && bi.isRemote && <Badge variant="default" className="text-[10px] px-1 py-0 ml-auto">local + remote</Badge>}
                                {bi.isLocal && !bi.isRemote && <Badge variant="secondary" className="text-[10px] px-1 py-0 ml-auto">local</Badge>}
                                {!bi.isLocal && bi.isRemote && <Badge variant="outline" className="text-[10px] px-1 py-0 ml-auto">remote</Badge>}
                                {!bi.isLocal && !bi.isRemote && <Badge variant="outline" className="text-[10px] px-1 py-0 ml-auto opacity-50">saved</Badge>}
                              </span>
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
              {creatingBranch && (
                <p className="text-xs text-muted-foreground mt-1">Creating branch and pushing to remote...</p>
              )}
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

            {/* Comments section - only in edit mode */}
            {mode === 'edit' && taskId && (
              <div className="border-t pt-4">
                <label className="text-sm font-medium mb-2 block">Comments / Refinement</label>
                <div className="space-y-2 max-h-48 overflow-y-auto mb-3">
                  {comments.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No comments yet. Add notes for refinement.</p>
                  ) : (
                    comments.map((c) => (
                      <div key={c.id} className="bg-muted/50 rounded p-2 text-sm">
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-medium text-xs">{c.author}</span>
                          <span className="text-xs text-muted-foreground">{new Date(c.created_at).toLocaleString()}</span>
                        </div>
                        <p className="text-sm whitespace-pre-wrap">{c.text}</p>
                      </div>
                    ))
                  )}
                </div>
                <div className="flex gap-2">
                  <Textarea
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    placeholder="Add a comment for refinement..."
                    rows={2}
                    className="text-sm"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!newComment.trim() || addingComment}
                    onClick={async () => {
                      if (!newComment.trim()) return;
                      setAddingComment(true);
                      try {
                        const res = await fetch(`/api/tasks/${taskId}/comments`, {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ author: 'Jose Alejandro', text: newComment.trim() }),
                        });
                        if (res.ok) {
                          const data = await res.json();
                          setComments(prev => [...prev, data.comment]);
                          setNewComment('');
                        }
                      } catch { /* ignore */ }
                      finally { setAddingComment(false); }
                    }}
                    className="self-end"
                  >
                    {addingComment ? '...' : 'Add'}
                  </Button>
                </div>
              </div>
            )}

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

    {/* Create Branch Dialog — asks for base branch */}
    <Dialog open={createBranchDialog.open} onOpenChange={(open) => { if (!open) setCreateBranchDialog({ open: false, name: '' }); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Branch</DialogTitle>
          <DialogDescription>
            Create <strong>{createBranchDialog.name}</strong> and push to origin
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <label className="text-sm font-medium mb-1 block">Base Branch (create from)</label>
            <Select value={baseBranchForCreate} onValueChange={setBaseBranchForCreate}>
              <SelectTrigger>
                <SelectValue placeholder="Select base branch..." />
              </SelectTrigger>
              <SelectContent>
                {allBranches.filter(b => b.isLocal || b.isRemote).map((b) => (
                  <SelectItem key={b.name} value={b.name}>
                    <span className="flex items-center gap-1.5">
                      <GitBranch className="w-3 h-3" />
                      {b.name}
                      {b.isLocal && b.isRemote && <Badge variant="default" className="text-[10px] px-1 py-0">local + remote</Badge>}
                      {b.isLocal && !b.isRemote && <Badge variant="secondary" className="text-[10px] px-1 py-0">local</Badge>}
                      {!b.isLocal && b.isRemote && <Badge variant="outline" className="text-[10px] px-1 py-0">remote</Badge>}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setCreateBranchDialog({ open: false, name: '' })}>Cancel</Button>
          <Button onClick={confirmCreateBranch} disabled={!baseBranchForCreate}>
            Create &amp; Push
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}
