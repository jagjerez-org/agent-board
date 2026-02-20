'use client';

import { useState, useEffect } from 'react';
import { Agent } from '@/lib/types';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Trash2, Pencil, Save, FileText, Terminal, RefreshCw } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';

const MODELS = [
  'anthropic/claude-opus-4-6',
  'anthropic/claude-sonnet-4-20250514',
  'anthropic/claude-sonnet-3.5',
  'openai/gpt-4o',
  'openai/gpt-4o-mini',
  'google/gemini-2.5-pro',
  'google/gemini-2.5-flash',
];

const ROLES = ['heavy', 'light', 'code', 'research', 'desktop', 'general'];

const CAPABILITY_OPTIONS = [
  'coding', 'debugging', 'testing', 'deployment',
  'research', 'analysis', 'writing', 'reporting',
  'web-search', 'ui-automation', 'file-management', 'system-tasks',
  'quick-tasks', 'formatting', 'basic-queries',
];

interface AgentSheetProps {
  agentId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdated?: () => void;
  agents: Agent[]; // for parent dropdown
}

interface FileInfo {
  path: string;
  name: string;
  type: 'config' | 'workspace' | 'memory';
}

interface LogEntry {
  timestamp: string;
  role?: string;
  type: string;
  content?: string;
  toolName?: string;
  label?: string;
}

interface LiveStatus {
  status: 'idle' | 'busy' | 'offline';
  model?: string;
  totalTokens?: number;
  updatedAt?: number;
  activeSessions: {
    key: string;
    label?: string;
    model?: string;
    isSubagent: boolean;
  }[];
}

export function AgentSheet({ agentId, open, onOpenChange, onUpdated, agents }: AgentSheetProps) {
  const [agent, setAgent] = useState<Agent | null>(null);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Files functionality
  const [files, setFiles] = useState<FileInfo[]>([]);
  const [filesLoading, setFilesLoading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState('');
  const [fileExists, setFileExists] = useState(false);
  const [fileSaving, setFileSaving] = useState(false);

  // Logs
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);

  // Skills
  interface SkillInfo { name: string; description: string; location: string; source: 'builtin' | 'workspace' | 'agent' }
  const [skills, setSkills] = useState<SkillInfo[]>([]);
  const [skillsLoading, setSkillsLoading] = useState(false);
  const [skillSearch, setSkillSearch] = useState('');

  // Live status
  const [liveStatus, setLiveStatus] = useState<LiveStatus | null>(null);

  // Edit form
  const [formName, setFormName] = useState('');
  const [formModel, setFormModel] = useState('');
  const [formRole, setFormRole] = useState('');
  const [formParent, setFormParent] = useState('');
  const [formCaps, setFormCaps] = useState<string[]>([]);

  useEffect(() => {
    if (agentId && open) {
      setLoading(true);
      setEditing(false);
      setSelectedFile(null);
      setFileContent('');
      
      // Load agent data
      fetch(`/api/agents/${agentId}`)
        .then((r) => r.json())
        .then((data: Agent) => {
          setAgent(data);
          setFormName(data.name);
          setFormModel(data.model || '');
          setFormRole(data.role || '');
          setFormParent(data.parent_agent_id || '');
          setFormCaps(data.capabilities || []);
        })
        .catch(() => {})
        .finally(() => setLoading(false));
        
      // Load files list
      loadFiles();
    }
  }, [agentId, open]);

  const loadFiles = async () => {
    setFilesLoading(true);
    try {
      const res = await fetch('/api/files/list');
      const data = await res.json();
      setFiles(data.files || []);
    } catch (error) {
      console.error('Failed to load files:', error);
    } finally {
      setFilesLoading(false);
    }
  };

  const loadFile = async (filePath: string) => {
    try {
      const res = await fetch(`/api/files?path=${encodeURIComponent(filePath)}`);
      const data = await res.json();
      setFileContent(data.content || '');
      setFileExists(data.exists);
      setSelectedFile(filePath);
    } catch (error) {
      console.error('Failed to load file:', error);
      alert('Failed to load file');
    }
  };

  const saveFile = async () => {
    if (!selectedFile) return;
    
    setFileSaving(true);
    try {
      const res = await fetch('/api/files', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: selectedFile,
          content: fileContent,
        }),
      });
      
      if (!res.ok) throw new Error('Save failed');
      
      setFileExists(true);
      alert('File saved successfully');
    } catch (error) {
      console.error('Failed to save file:', error);
      alert('Failed to save file');
    } finally {
      setFileSaving(false);
    }
  };

  const loadLogs = async () => {
    if (!agentId) return;
    setLogsLoading(true);
    try {
      const res = await fetch(`/api/agents/${agentId}/logs?limit=100`);
      const data = await res.json();
      setLogs(data.logs || []);
    } catch {
      console.error('Failed to load logs');
    } finally {
      setLogsLoading(false);
    }
  };

  const loadSkills = async () => {
    setSkillsLoading(true);
    try {
      const res = await fetch('/api/skills');
      const data = await res.json();
      setSkills([...(data.builtin || []), ...(data.workspace || [])]);
    } catch {
      console.error('Failed to load skills');
    } finally {
      setSkillsLoading(false);
    }
  };

  const loadLiveStatus = async () => {
    if (!agentId) return;
    try {
      const res = await fetch('/api/agents/live');
      const data = await res.json();
      const agentLive = (data.agents || []).find((a: LiveStatus & { id: string }) => a.id === agentId);
      if (agentLive) setLiveStatus(agentLive);
    } catch { /* ignore */ }
  };

  // Auto-refresh logs
  useEffect(() => {
    if (!autoRefresh || !open || !agentId) return;
    const interval = setInterval(() => {
      loadLogs();
      loadLiveStatus();
    }, 5000);
    return () => clearInterval(interval);
  }, [autoRefresh, open, agentId]);

  // Load live status when sheet opens
  useEffect(() => {
    if (agentId && open) loadLiveStatus();
  }, [agentId, open]);

  const toggleCap = (cap: string) => {
    setFormCaps((prev) =>
      prev.includes(cap) ? prev.filter((c) => c !== cap) : [...prev, cap]
    );
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'idle': return 'bg-green-500';
      case 'busy': return 'bg-yellow-500';
      default: return 'bg-gray-500';
    }
  };

  const getInitials = (name: string) =>
    name.split(' ').map((w) => w[0]?.toUpperCase()).join('').slice(0, 2);

  const handleSave = async () => {
    if (!agentId || !formName.trim()) return;
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        name: formName.trim(),
        model: formModel || undefined,
        role: formRole || undefined,
        parent_agent_id: formParent && formParent !== 'none' ? formParent : undefined,
        capabilities: formCaps,
      };
      const res = await fetch(`/api/agents/${agentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error('Save failed');
      const updated = await res.json();
      setAgent(updated);
      setEditing(false);
      onUpdated?.();
    } catch {
      alert('Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm(`Delete agent "${agent?.name}"?`)) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/agents/${agentId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Delete failed');
      onOpenChange(false);
      onUpdated?.();
    } catch {
      alert('Failed to delete agent');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Agent Details</SheetTitle>
        </SheetHeader>

        {loading ? (
          <div className="py-8 text-center text-muted-foreground">Loading...</div>
        ) : !agent ? (
          <div className="py-8 text-center text-muted-foreground">Agent not found</div>
        ) : (
          <Tabs defaultValue="details" className="py-4">
            <TabsList>
              <TabsTrigger value="details">Details</TabsTrigger>
              <TabsTrigger value="logs" onClick={() => { if (logs.length === 0) loadLogs(); }}>
                <Terminal className="w-3.5 h-3.5 mr-1" />
                Logs
              </TabsTrigger>
              <TabsTrigger value="files">Files</TabsTrigger>
              <TabsTrigger value="skills" onClick={() => { if (skills.length === 0 && !skillsLoading) loadSkills(); }}>
                Skills
              </TabsTrigger>
            </TabsList>

            <TabsContent value="details" className="space-y-6">
              {editing ? (
          /* ---------- EDIT MODE ---------- */
          <div className="space-y-4 py-4">
            <div>
              <label className="text-sm font-medium mb-1 block">Name</label>
              <Input value={formName} onChange={(e) => setFormName(e.target.value)} />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Model</label>
              <Select value={formModel} onValueChange={setFormModel}>
                <SelectTrigger><SelectValue placeholder="Select model..." /></SelectTrigger>
                <SelectContent>
                  {MODELS.map((m) => (
                    <SelectItem key={m} value={m}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Role</label>
              <Select value={formRole} onValueChange={setFormRole}>
                <SelectTrigger><SelectValue placeholder="Select role..." /></SelectTrigger>
                <SelectContent>
                  {ROLES.map((r) => (
                    <SelectItem key={r} value={r}>{r}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Parent Agent</label>
              <Select value={formParent || 'none'} onValueChange={setFormParent}>
                <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None (root)</SelectItem>
                  {agents.filter((a) => a.id !== agentId).map((a) => (
                    <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Capabilities</label>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {CAPABILITY_OPTIONS.map((cap) => (
                  <Badge
                    key={cap}
                    variant={formCaps.includes(cap) ? 'default' : 'outline'}
                    className="cursor-pointer select-none"
                    onClick={() => toggleCap(cap)}
                  >
                    {cap}
                  </Badge>
                ))}
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-4 border-t">
              <Button variant="outline" onClick={() => setEditing(false)}>Cancel</Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? 'Saving...' : 'Save'}
              </Button>
            </div>
          </div>
        ) : (
          /* ---------- VIEW MODE ---------- */
          <div className="space-y-6 py-4">
            {/* Header */}
            <div className="flex items-center gap-4">
              <div className="relative">
                <Avatar className="h-14 w-14">
                  <AvatarFallback className="bg-primary/10 text-lg">
                    {getInitials(agent.name)}
                  </AvatarFallback>
                </Avatar>
                <div className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-background ${getStatusColor(agent.status)}`} />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold">{agent.name}</h3>
                <p className="text-sm text-muted-foreground font-mono">{agent.id}</p>
              </div>
            </div>

            {/* Info grid */}
            <div className="space-y-3">
              <div className="flex justify-between items-center py-2 border-b">
                <span className="text-sm text-muted-foreground">Status</span>
                <Badge variant={agent.status === 'idle' ? 'default' : agent.status === 'busy' ? 'secondary' : 'outline'}>
                  {agent.status}
                </Badge>
              </div>
              <div className="flex justify-between items-center py-2 border-b">
                <span className="text-sm text-muted-foreground">Model</span>
                <span className="text-sm font-mono">{agent.model || '—'}</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b">
                <span className="text-sm text-muted-foreground">Role</span>
                <Badge variant="outline">{agent.role || 'general'}</Badge>
              </div>
              <div className="flex justify-between items-center py-2 border-b">
                <span className="text-sm text-muted-foreground">Parent</span>
                <span className="text-sm">{agent.parent_agent_id || 'None (root)'}</span>
              </div>
              {agent.current_task_id && (
                <div className="flex justify-between items-center py-2 border-b">
                  <span className="text-sm text-muted-foreground">Current Task</span>
                  <Badge variant="secondary">{agent.current_task_id}</Badge>
                </div>
              )}
            </div>

            {/* Capabilities */}
            {agent.capabilities && agent.capabilities.length > 0 && (
              <div>
                <h4 className="text-sm font-medium mb-2">Capabilities</h4>
                <div className="flex flex-wrap gap-1.5">
                  {agent.capabilities.map((cap) => (
                    <Badge key={cap} variant="outline">{cap}</Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Actions */}
                {/* Actions */}
                <div className="flex justify-between pt-4 border-t">
                  <Button variant="destructive" size="sm" onClick={handleDelete} disabled={deleting}>
                    <Trash2 className="w-4 h-4 mr-1" />
                    {deleting ? 'Deleting...' : 'Delete'}
                  </Button>
                  <Button size="sm" onClick={() => setEditing(true)}>
                    <Pencil className="w-4 h-4 mr-1" />
                    Edit
                  </Button>
                </div>
              </div>
              )}
            </TabsContent>

            <TabsContent value="logs" className="space-y-4">
              {/* Live status banner */}
              {liveStatus && (
                <div className={`p-3 rounded-lg border ${
                  liveStatus.status === 'busy' ? 'bg-yellow-500/10 border-yellow-500/30' :
                  'bg-green-500/10 border-green-500/30'
                }`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={`inline-block w-2.5 h-2.5 rounded-full ${
                        liveStatus.status === 'busy' ? 'bg-yellow-500 animate-pulse' : 'bg-green-500'
                      }`} />
                      <span className="text-sm font-medium capitalize">{liveStatus.status}</span>
                      {liveStatus.model && (
                        <span className="text-xs text-muted-foreground">{liveStatus.model}</span>
                      )}
                    </div>
                    {liveStatus.totalTokens && (
                      <span className="text-xs text-muted-foreground">
                        {(liveStatus.totalTokens / 1000).toFixed(1)}k tokens
                      </span>
                    )}
                  </div>
                  {liveStatus.activeSessions.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {liveStatus.activeSessions.filter(s => s.isSubagent).map((s) => (
                        <div key={s.key} className="flex items-center gap-2 text-xs">
                          <Badge variant="secondary" className="text-xs">subagent</Badge>
                          <span>{s.label || s.key.split(':').pop()?.slice(0, 8)}</span>
                          {s.model && <span className="text-muted-foreground">{s.model}</span>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Controls */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={loadLogs} disabled={logsLoading}>
                    <RefreshCw className={`w-3.5 h-3.5 mr-1 ${logsLoading ? 'animate-spin' : ''}`} />
                    Refresh
                  </Button>
                  <Button
                    variant={autoRefresh ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setAutoRefresh(!autoRefresh)}
                  >
                    {autoRefresh ? '⏸ Auto' : '▶ Auto'}
                  </Button>
                </div>
                <span className="text-xs text-muted-foreground">{logs.length} entries</span>
              </div>

              {/* Log entries */}
              <ScrollArea className="h-[500px] rounded-md border">
                <div className="p-2 space-y-1 font-mono text-xs">
                  {logs.length === 0 && !logsLoading && (
                    <div className="py-8 text-center text-muted-foreground text-sm">
                      No logs found. Click Refresh to load.
                    </div>
                  )}
                  {logs.map((entry, i) => (
                    <div key={i} className={`px-2 py-1.5 rounded ${
                      entry.role === 'user' ? 'bg-blue-500/10' :
                      entry.role === 'assistant' ? 'bg-green-500/10' :
                      entry.role === 'toolResult' ? 'bg-orange-500/10' :
                      'bg-muted/50'
                    }`}>
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-muted-foreground">
                          {new Date(entry.timestamp).toLocaleTimeString()}
                        </span>
                        <Badge variant="outline" className="text-[10px] py-0 px-1">
                          {entry.role || entry.type}
                        </Badge>
                        {entry.toolName && (
                          <Badge variant="secondary" className="text-[10px] py-0 px-1">
                            {entry.toolName}
                          </Badge>
                        )}
                        {entry.label && (
                          <span className="text-muted-foreground text-[10px]">[{entry.label}]</span>
                        )}
                      </div>
                      {entry.content && (
                        <div className="text-xs whitespace-pre-wrap break-all leading-relaxed">
                          {entry.content}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="files" className="space-y-4">
              {selectedFile ? (
                /* ---------- FILE EDITOR ---------- */
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4" />
                      <span className="font-medium">{selectedFile}</span>
                      {!fileExists && <Badge variant="outline">New</Badge>}
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => setSelectedFile(null)}>
                        Back
                      </Button>
                      <Button size="sm" onClick={saveFile} disabled={fileSaving}>
                        <Save className="w-4 h-4 mr-1" />
                        {fileSaving ? 'Saving...' : 'Save'}
                      </Button>
                    </div>
                  </div>
                  <textarea
                    className="w-full h-96 p-3 border rounded-md font-mono text-sm resize-none"
                    value={fileContent}
                    onChange={(e) => setFileContent(e.target.value)}
                    placeholder="File content..."
                  />
                </div>
              ) : (
                /* ---------- FILE LIST ---------- */
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="font-medium">Workspace Files</h4>
                    {filesLoading && (
                      <span className="text-sm text-muted-foreground">Loading...</span>
                    )}
                  </div>
                  
                  <div className="space-y-2">
                    {files.map((file) => (
                      <div
                        key={file.path}
                        className="flex items-center justify-between p-3 border rounded-lg cursor-pointer hover:bg-accent"
                        onClick={() => loadFile(file.path)}
                      >
                        <div className="flex items-center gap-2">
                          <FileText className="w-4 h-4 text-muted-foreground" />
                          <span className="font-medium">{file.name}</span>
                          <Badge 
                            variant="outline" 
                            className={
                              file.type === 'workspace' ? 'bg-blue-50 text-blue-700' :
                              file.type === 'config' ? 'bg-orange-50 text-orange-700' :
                              'bg-gray-50 text-gray-700'
                            }
                          >
                            {file.type}
                          </Badge>
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {file.path}
                        </span>
                      </div>
                    ))}
                    
                    {!filesLoading && files.length === 0 && (
                      <div className="py-8 text-center text-muted-foreground">
                        No files found
                      </div>
                    )}
                  </div>
                </div>
              )}
            </TabsContent>

            <TabsContent value="skills" className="space-y-4">
              <Input
                placeholder="Search skills..."
                value={skillSearch}
                onChange={(e) => setSkillSearch(e.target.value)}
              />
              {skillsLoading ? (
                <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground">
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Loading skills...
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Workspace skills */}
                  {(() => {
                    const ws = skills.filter(s => s.source === 'workspace' && (!skillSearch || s.name.toLowerCase().includes(skillSearch.toLowerCase())));
                    return ws.length > 0 ? (
                      <div>
                        <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                          <Badge variant="default" className="text-[10px]">Workspace</Badge>
                          {ws.length} skills
                        </h4>
                        <div className="space-y-1">
                          {ws.map(s => (
                            <div key={s.name} className="flex items-center justify-between py-1.5 px-2 rounded border text-sm hover:bg-muted/50">
                              <div>
                                <span className="font-medium">{s.name}</span>
                                {s.description && <p className="text-xs text-muted-foreground truncate max-w-[300px]">{s.description}</p>}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null;
                  })()}
                  {/* Built-in skills */}
                  {(() => {
                    const bi = skills.filter(s => s.source === 'builtin' && (!skillSearch || s.name.toLowerCase().includes(skillSearch.toLowerCase())));
                    return bi.length > 0 ? (
                      <div>
                        <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                          <Badge variant="outline" className="text-[10px]">Built-in</Badge>
                          {bi.length} skills
                        </h4>
                        <div className="space-y-1">
                          {bi.map(s => (
                            <div key={s.name} className="flex items-center justify-between py-1.5 px-2 rounded border text-sm hover:bg-muted/50">
                              <div>
                                <span className="font-medium">{s.name}</span>
                                {s.description && <p className="text-xs text-muted-foreground truncate max-w-[300px]">{s.description}</p>}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null;
                  })()}
                  {skills.length > 0 && (
                    <p className="text-xs text-muted-foreground text-center">{skills.length} total skills available</p>
                  )}
                </div>
              )}
            </TabsContent>
          </Tabs>
        )}
      </SheetContent>
    </Sheet>
  );
}
