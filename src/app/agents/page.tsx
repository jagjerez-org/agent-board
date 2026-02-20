'use client';

import { useState, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Plus, Activity, Users, GitBranch, FolderOpen } from 'lucide-react';
import Link from 'next/link';
import { AgentOrgChart } from '@/components/agents/agent-org-chart';
import { AgentTree } from '@/components/agents/agent-tree';
import { Agent } from '@/lib/types';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

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

type ViewMode = 'list' | 'tree';

export default function AgentsPage() {
  const [refreshKey, setRefreshKey] = useState(0);
  const [seeding, setSeeding] = useState(false);
  const [showRegister, setShowRegister] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>('list');

  // Register form state
  const [formId, setFormId] = useState('');
  const [formName, setFormName] = useState('');
  const [formModel, setFormModel] = useState('');
  const [formRole, setFormRole] = useState('');
  const [formParent, setFormParent] = useState('');
  const [formCaps, setFormCaps] = useState<string[]>([]);

  const reload = useCallback(() => setRefreshKey((k) => k + 1), []);

  // Load agents for parent dropdown
  useEffect(() => {
    fetch('/api/agents')
      .then((r) => r.json())
      .then((data: Agent[]) => setAgents(data))
      .catch(() => {});
  }, [refreshKey]);

  const handleSeed = async () => {
    setSeeding(true);
    try {
      const res = await fetch('/api/agents/seed', { method: 'POST' });
      if (!res.ok) throw new Error('Seed failed');
      const data = await res.json();
      alert(data.message);
      reload();
    } catch {
      alert('Failed to seed agents');
    } finally {
      setSeeding(false);
    }
  };

  const resetForm = () => {
    setFormId('');
    setFormName('');
    setFormModel('');
    setFormRole('');
    setFormParent('');
    setFormCaps([]);
  };

  const toggleCap = (cap: string) => {
    setFormCaps((prev) =>
      prev.includes(cap) ? prev.filter((c) => c !== cap) : [...prev, cap]
    );
  };

  const handleRegister = async () => {
    if (!formId.trim() || !formName.trim()) {
      alert('ID and Name are required');
      return;
    }
    setRegistering(true);
    try {
      const body: Record<string, unknown> = {
        id: formId.trim(),
        name: formName.trim(),
      };
      if (formModel) body.model = formModel;
      if (formRole) body.role = formRole;
      if (formParent) body.parent_agent_id = formParent;
      if (formCaps.length > 0) body.capabilities = formCaps;

      const res = await fetch('/api/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to register');
      }
      setShowRegister(false);
      resetForm();
      reload();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Failed to register agent');
    } finally {
      setRegistering(false);
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
                <Link href="/agents" className="bg-accent text-accent-foreground">
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
                <Link href="/worktrees">
                  <GitBranch className="w-4 h-4 mr-2" />
                  Worktrees
                </Link>
              </Button>
            </nav>
          </div>

          <div className="flex items-center space-x-2">
            <Button variant="outline" size="sm" onClick={handleSeed} disabled={seeding}>
              {seeding ? 'Seeding...' : 'Seed Agents'}
            </Button>
            <Button size="sm" onClick={() => setShowRegister(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Register Agent
            </Button>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 overflow-hidden p-6">
        <div className="h-full">
          <div className="mb-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-xl font-semibold mb-2">Agent Organization</h2>
                <p className="text-muted-foreground">
                  View and manage AI agents in your OpenClaw system.
                </p>
              </div>
              
              {/* View Toggle */}
              <div className="flex items-center bg-muted rounded-lg p-1">
                <Button
                  size="sm"
                  variant={viewMode === 'list' ? 'default' : 'ghost'}
                  className="rounded-md"
                  onClick={() => setViewMode('list')}
                >
                  List
                </Button>
                <Button
                  size="sm"
                  variant={viewMode === 'tree' ? 'default' : 'ghost'}
                  className="rounded-md"
                  onClick={() => setViewMode('tree')}
                >
                  Org Chart
                </Button>
              </div>
            </div>
          </div>
          
          {/* Render appropriate view */}
          {viewMode === 'list' ? (
            <AgentOrgChart key={refreshKey} />
          ) : (
            <AgentTree key={refreshKey} />
          )}
        </div>
      </main>

      {/* Register Agent Dialog */}
      <Dialog open={showRegister} onOpenChange={setShowRegister}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Register Agent</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-sm font-medium mb-1 block">ID *</label>
              <Input
                placeholder="worker-custom"
                value={formId}
                onChange={(e) => setFormId(e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Name *</label>
              <Input
                placeholder="Worker Custom"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Model</label>
              <Select value={formModel} onValueChange={setFormModel}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a model..." />
                </SelectTrigger>
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
                <SelectTrigger>
                  <SelectValue placeholder="Select a role..." />
                </SelectTrigger>
                <SelectContent>
                  {ROLES.map((r) => (
                    <SelectItem key={r} value={r}>{r}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Parent Agent</label>
              <Select value={formParent} onValueChange={setFormParent}>
                <SelectTrigger>
                  <SelectValue placeholder="None (root agent)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None (root agent)</SelectItem>
                  {agents.map((a) => (
                    <SelectItem key={a.id} value={a.id}>{a.name} ({a.id})</SelectItem>
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
              {formCaps.length > 0 && (
                <p className="text-xs text-muted-foreground mt-2">
                  Selected: {formCaps.join(', ')}
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRegister(false)}>
              Cancel
            </Button>
            <Button onClick={handleRegister} disabled={registering}>
              {registering ? 'Registering...' : 'Register'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
