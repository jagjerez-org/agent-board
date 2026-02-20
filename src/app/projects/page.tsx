'use client';

import { useState, useEffect } from 'react';
import { Project } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { 
  Activity, 
  Users, 
  FolderOpen, 
  RefreshCw, 
  Search, 
  ExternalLink,
  GitBranch,
  Clock,
  Filter,
  Plus,
  Settings,
  Building2,
  Github,
  GitlabIcon,
  Trash2,
  Edit,
  TestTube,
  X,
  Cloud
} from 'lucide-react';
import Link from 'next/link';
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
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface ProjectStats {
  total: number;
  by_provider: Record<string, number>;
  private_count: number;
  public_count: number;
}

interface ProjectWithTaskCount extends Project {
  task_count?: number;
}

interface GitOrg {
  name: string;
  provider: string;
  repoCount: number;
}

interface GitProvider {
  type: 'github' | 'gitlab' | 'azure-devops';
  name: string;
  cli: string;
  orgs: string[];
  available?: boolean;
  discovered_orgs?: string[];
  azureOrg?: string;
  azurePat?: string;
  azureProjects?: string[];
}

interface CreateProjectForm {
  name: string;
  description: string;
  repo_url: string;
  provider: string;
}

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [stats, setStats] = useState<ProjectStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [ownerFilter, setOwnerFilter] = useState<string>('');
  const [selectedProject, setSelectedProject] = useState<string | null>(null);
  
  // New state for organizations and providers
  const [orgs, setOrgs] = useState<GitOrg[]>([]);
  const [providers, setProviders] = useState<GitProvider[]>([]);
  const [orgsLoading, setOrgsLoading] = useState(true);
  const [providersLoading, setProvidersLoading] = useState(true);
  
  // New project dialog state
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createForm, setCreateForm] = useState<CreateProjectForm>({
    name: '',
    description: '',
    repo_url: '',
    provider: 'Manual'
  });
  const [creating, setCreating] = useState(false);
  
  // Settings sheet state
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [editingProvider, setEditingProvider] = useState<GitProvider | null>(null);
  const [newProviderForm, setNewProviderForm] = useState({
    type: 'github' as 'github' | 'gitlab' | 'azure-devops',
    name: '',
    cli: '',
    orgs: [] as string[],
    azureOrg: '',
    azurePat: '',
    azureProjects: [] as string[],
  });

  const loadProjects = async (refresh = false) => {
    try {
      setLoading(!refresh);
      setRefreshing(refresh);
      
      // Load both saved projects and discovered repos
      const [projectsRes, reposRes] = await Promise.all([
        fetch(`/api/projects${refresh ? '?refresh=true' : ''}`),
        fetch('/api/git/repos'),
      ]);
      const projectsData = await projectsRes.json();
      const reposData = await reposRes.json();
      
      const savedProjects: Project[] = projectsData.projects || [];
      const repos = reposData.repos || [];
      const savedIds = new Set(savedProjects.map((p: Project) => p.id));
      
      // Convert repos to Project format, skip already saved
      const repoProjects: Project[] = repos
        .filter((r: { id: string }) => !savedIds.has(r.id))
        .map((r: { id: string; name: string; full_name: string; description?: string; url: string; clone_url: string; default_branch: string; is_private: boolean; provider: string; owner: string; updated_at: string }) => ({
          id: r.id,
          name: r.name,
          description: r.description || '',
          repo_url: r.url,
          repo_owner: r.owner,
          repo_name: r.name,
          default_branch: r.default_branch,
          provider: r.provider,
          is_private: r.is_private,
          created_at: r.updated_at,
          updated_at: r.updated_at,
        }));
      
      const allProjects = [...savedProjects, ...repoProjects];
      setProjects(allProjects);
      
      // Compute stats client-side
      const byProvider: Record<string, number> = {};
      for (const p of allProjects) {
        const provider = p.provider || 'unknown';
        byProvider[provider] = (byProvider[provider] || 0) + 1;
      }
      setStats({
        total: allProjects.length,
        by_provider: byProvider,
        private_count: allProjects.filter((p: Project) => p.is_private).length,
        public_count: allProjects.filter((p: Project) => !p.is_private).length,
      });
    } catch (error) {
      console.error('Error loading projects:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const loadOrgs = async () => {
    try {
      setOrgsLoading(true);
      const orgsRes = await fetch('/api/git/orgs');
      const orgsData = await orgsRes.json();
      setOrgs(orgsData.orgs || []);
    } catch (error) {
      console.error('Error loading organizations:', error);
    } finally {
      setOrgsLoading(false);
    }
  };

  const loadProviders = async () => {
    try {
      setProvidersLoading(true);
      const providersRes = await fetch('/api/git/providers');
      const providersData = await providersRes.json();
      setProviders(providersData || []);
    } catch (error) {
      console.error('Error loading providers:', error);
    } finally {
      setProvidersLoading(false);
    }
  };

  const createProject = async () => {
    if (!createForm.name.trim()) return;

    try {
      setCreating(true);
      const response = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(createForm)
      });

      if (response.ok) {
        setCreateDialogOpen(false);
        setCreateForm({ name: '', description: '', repo_url: '', provider: 'Manual' });
        await loadProjects(); // Refresh project list
      } else {
        const errorData = await response.json();
        alert(errorData.error || 'Failed to create project');
      }
    } catch (error) {
      console.error('Error creating project:', error);
      alert('Failed to create project');
    } finally {
      setCreating(false);
    }
  };

  const addProvider = async () => {
    if (!newProviderForm.name.trim()) return;
    if (newProviderForm.type !== 'azure-devops' && !newProviderForm.cli.trim()) return;
    if (newProviderForm.type === 'azure-devops' && (!newProviderForm.azureOrg.trim() || !newProviderForm.azurePat.trim())) return;

    try {
      const body = newProviderForm.type === 'azure-devops'
        ? { type: newProviderForm.type, name: newProviderForm.name, cli: '', orgs: [], azureOrg: newProviderForm.azureOrg, azurePat: newProviderForm.azurePat, azureProjects: newProviderForm.azureProjects.filter(Boolean) }
        : { type: newProviderForm.type, name: newProviderForm.name, cli: newProviderForm.cli, orgs: newProviderForm.orgs };

      const response = await fetch('/api/git/providers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      if (response.ok) {
        setNewProviderForm({ type: 'github', name: '', cli: '', orgs: [], azureOrg: '', azurePat: '', azureProjects: [] });
        await loadProviders();
        await loadOrgs(); // Refresh orgs too
      } else {
        const errorData = await response.json();
        alert(errorData.error || 'Failed to add provider');
      }
    } catch (error) {
      console.error('Error adding provider:', error);
      alert('Failed to add provider');
    }
  };

  const removeProvider = async (providerName: string) => {
    if (!confirm(`Remove provider "${providerName}"?`)) return;

    try {
      const response = await fetch(`/api/git/providers?name=${encodeURIComponent(providerName)}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        await loadProviders();
        await loadOrgs();
      } else {
        const errorData = await response.json();
        alert(errorData.error || 'Failed to remove provider');
      }
    } catch (error) {
      console.error('Error removing provider:', error);
      alert('Failed to remove provider');
    }
  };

  const testProvider = async (provider: GitProvider) => {
    try {
      // This would need to be implemented in the API
      alert(`Testing ${provider.name}... (Implementation needed)`);
    } catch (error) {
      console.error('Error testing provider:', error);
    }
  };

  useEffect(() => {
    loadProjects();
    loadOrgs();
    loadProviders();
  }, []);

  // Get unique owners for filter
  const owners = Array.from(new Set(projects.map(p => p.repo_owner).filter(Boolean))) as string[];
  owners.sort();

  // Filter projects
  const filteredProjects = projects.filter(project => {
    const matchesSearch = !searchQuery || 
      project.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      project.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      project.repo_owner?.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesOwner = !ownerFilter || project.repo_owner === ownerFilter;
    
    return matchesSearch && matchesOwner;
  });

  const handleOrgClick = (orgName: string) => {
    setOwnerFilter(ownerFilter === orgName ? '' : orgName);
  };

  const handleProjectSelect = (projectId: string) => {
    setSelectedProject(projectId);
    localStorage.setItem('selectedProjectId', projectId);
    // Navigate to board
    window.location.href = '/';
  };

  if (loading) {
    return (
      <div className="flex flex-col h-screen">
        <header className="border-b border-border bg-card">
          <div className="flex items-center justify-between px-6 py-3">
            <div className="flex items-center space-x-4">
              <h1 className="text-2xl font-bold">📋 Agent Board</h1>
              <nav className="flex space-x-1">
                <Button variant="ghost" size="sm" asChild>
                  <Link href="/">Board</Link>
                </Button>
                <Button variant="ghost" size="sm" asChild>
                  <Link href="/projects" className="bg-accent text-accent-foreground">
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
              </nav>
            </div>
          </div>
        </header>
        
        <main className="flex-1 p-6">
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-4" />
              <p>Loading projects...</p>
            </div>
          </div>
        </main>
      </div>
    );
  }

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
                <Link href="/projects" className="bg-accent text-accent-foreground">
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
                <Link href="/worktrees">
                  <GitBranch className="w-4 h-4 mr-2" />
                  Worktrees
                </Link>
              </Button>
            </nav>
          </div>
          
          <div className="flex items-center space-x-2">
            {/* Settings Sheet */}
            <Sheet open={settingsOpen} onOpenChange={setSettingsOpen}>
              <SheetTrigger asChild>
                <Button variant="outline" size="sm">
                  <Settings className="w-4 h-4 mr-2" />
                  Settings
                </Button>
              </SheetTrigger>
              <SheetContent className="w-[600px] sm:w-[600px]">
                <SheetHeader>
                  <SheetTitle>Git Provider Settings</SheetTitle>
                  <SheetDescription>
                    Configure your Git providers for automatic repository discovery
                  </SheetDescription>
                </SheetHeader>
                
                <Tabs defaultValue="providers" className="mt-6">
                  <TabsList>
                    <TabsTrigger value="providers">Providers</TabsTrigger>
                    <TabsTrigger value="add">Add New</TabsTrigger>
                  </TabsList>
                  
                  <TabsContent value="providers" className="space-y-4">
                    {providersLoading ? (
                      <div className="text-center py-8">Loading providers...</div>
                    ) : providers.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground">
                        No providers configured
                      </div>
                    ) : (
                      providers.map((provider) => (
                        <Card key={provider.name}>
                          <CardHeader>
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                {provider.type === 'github' ? (
                                  <Github className="w-5 h-5" />
                                ) : provider.type === 'azure-devops' ? (
                                  <Cloud className="w-5 h-5" />
                                ) : (
                                  <GitlabIcon className="w-5 h-5" />
                                )}
                                <CardTitle className="text-lg">{provider.name}</CardTitle>
                                <Badge variant={provider.available ? 'default' : 'destructive'}>
                                  {provider.available ? 'Available' : 'Unavailable'}
                                </Badge>
                              </div>
                              <div className="flex gap-2">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => testProvider(provider)}
                                >
                                  <TestTube className="w-4 h-4" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => setEditingProvider(provider)}
                                >
                                  <Edit className="w-4 h-4" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  onClick={() => removeProvider(provider.name)}
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </div>
                            </div>
                          </CardHeader>
                          <CardContent>
                            <div className="space-y-2 text-sm">
                              <div><span className="font-medium">CLI:</span> {provider.cli}</div>
                              <div><span className="font-medium">Organizations:</span> {provider.orgs.join(', ') || 'None'}</div>
                              {provider.discovered_orgs && provider.discovered_orgs.length > 0 && (
                                <div><span className="font-medium">Discovered:</span> {provider.discovered_orgs.join(', ')}</div>
                              )}
                            </div>
                          </CardContent>
                        </Card>
                      ))
                    )}
                  </TabsContent>
                  
                  <TabsContent value="add" className="space-y-4">
                    <div className="space-y-4">
                      <div>
                        <label className="text-sm font-medium">Type</label>
                        <Select value={newProviderForm.type} onValueChange={(value: 'github' | 'gitlab' | 'azure-devops') => 
                          setNewProviderForm({ ...newProviderForm, type: value })
                        }>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="github">GitHub</SelectItem>
                            <SelectItem value="gitlab">GitLab</SelectItem>
                            <SelectItem value="azure-devops">Azure DevOps</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      
                      <div>
                        <label className="text-sm font-medium">Name</label>
                        <Input
                          placeholder={newProviderForm.type === 'azure-devops' ? 'e.g., Azure DevOps - Work' : 'e.g., GitHub - Personal'}
                          value={newProviderForm.name}
                          onChange={(e) => setNewProviderForm({ ...newProviderForm, name: e.target.value })}
                        />
                      </div>
                      
                      {newProviderForm.type === 'azure-devops' ? (
                        <>
                          <div>
                            <label className="text-sm font-medium">Azure Organization</label>
                            <Input
                              placeholder="e.g., my-azure-org"
                              value={newProviderForm.azureOrg}
                              onChange={(e) => setNewProviderForm({ ...newProviderForm, azureOrg: e.target.value })}
                            />
                            <p className="text-xs text-muted-foreground mt-1">The org name from dev.azure.com/YOUR-ORG</p>
                          </div>
                          <div>
                            <label className="text-sm font-medium">Personal Access Token (PAT)</label>
                            <Input
                              type="password"
                              placeholder="Your Azure DevOps PAT"
                              value={newProviderForm.azurePat}
                              onChange={(e) => setNewProviderForm({ ...newProviderForm, azurePat: e.target.value })}
                            />
                            <p className="text-xs text-muted-foreground mt-1">Generate at Azure DevOps → User Settings → Personal Access Tokens (scope: Code Read)</p>
                          </div>
                          <div>
                            <label className="text-sm font-medium">Projects (comma-separated, leave empty for all)</label>
                            <Input
                              placeholder="Project1, Project2"
                              value={newProviderForm.azureProjects.join(', ')}
                              onChange={(e) => setNewProviderForm({ ...newProviderForm, azureProjects: e.target.value.split(',').map(s => s.trim()) })}
                            />
                          </div>
                        </>
                      ) : (
                        <>
                          <div>
                            <label className="text-sm font-medium">CLI Path</label>
                            <Input
                              placeholder={newProviderForm.type === 'github' ? 'gh' : '~/.local/bin/glab'}
                              value={newProviderForm.cli}
                              onChange={(e) => setNewProviderForm({ ...newProviderForm, cli: e.target.value })}
                            />
                          </div>
                        </>
                      )}
                      
                      <div>
                        <label className="text-sm font-medium">Organizations (comma-separated)</label>
                        <Input
                          placeholder="org1, org2, org3"
                          value={newProviderForm.orgs.join(', ')}
                          onChange={(e) => setNewProviderForm({ 
                            ...newProviderForm, 
                            orgs: e.target.value.split(',').map(s => s.trim()).filter(Boolean)
                          })}
                        />
                      </div>
                      
                      <Button onClick={addProvider} className="w-full">
                        Add Provider
                      </Button>
                    </div>
                  </TabsContent>
                </Tabs>
              </SheetContent>
            </Sheet>
            
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => loadProjects(true)}
              disabled={refreshing}
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
              Refresh from Git
            </Button>
          </div>
        </div>
      </header>

      {/* Main content with sidebar */}
      <main className="flex flex-1 overflow-hidden">
        {/* Organizations Sidebar */}
        <div className="w-80 border-r bg-card p-4 overflow-y-auto">
          <div className="mb-4">
            <h3 className="text-lg font-semibold mb-2 flex items-center gap-2">
              <Building2 className="w-5 h-5" />
              Organizations
            </h3>
            {orgsLoading ? (
              <div className="text-sm text-muted-foreground">Loading organizations...</div>
            ) : (
              <div className="space-y-2">
                {orgs.length === 0 ? (
                  <div className="text-sm text-muted-foreground">
                    No organizations found. Configure Git providers to discover organizations.
                  </div>
                ) : (
                  <>
                    <Card 
                      className={`cursor-pointer transition-colors ${!ownerFilter ? 'bg-accent' : 'hover:bg-accent/50'}`}
                      onClick={() => setOwnerFilter('')}
                    >
                      <CardContent className="p-3">
                        <div className="flex items-center justify-between">
                          <span className="font-medium">All Organizations</span>
                          <Badge variant="outline">{projects.length}</Badge>
                        </div>
                      </CardContent>
                    </Card>
                    
                    {orgs.map((org) => (
                      <Card 
                        key={`${org.name}-${org.provider}`}
                        className={`cursor-pointer transition-colors ${ownerFilter === org.name ? 'bg-accent' : 'hover:bg-accent/50'}`}
                        onClick={() => handleOrgClick(org.name)}
                      >
                        <CardContent className="p-3">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              {org.provider.toLowerCase().includes('github') ? (
                                <Github className="w-4 h-4" />
                              ) : org.provider.toLowerCase().includes('azure') ? (
                                <Cloud className="w-4 h-4" />
                              ) : (
                                <GitlabIcon className="w-4 h-4" />
                              )}
                              <span className="font-medium">{org.name}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge variant="outline">{org.repoCount}</Badge>
                              {ownerFilter === org.name && <X className="w-4 h-4" />}
                            </div>
                          </div>
                          <div className="text-xs text-muted-foreground mt-1">
                            {org.provider}
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Main projects content */}
        <div className="flex-1 overflow-auto p-6">
          <div className="max-w-6xl mx-auto">
            {/* Header and stats */}
            <div className="mb-6">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-3xl font-bold">Projects</h2>
                
                {/* Create Project Dialog */}
                <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
                  <DialogTrigger asChild>
                    <Button>
                      <Plus className="w-4 h-4 mr-2" />
                      New Project
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                      <DialogTitle>Create New Project</DialogTitle>
                      <DialogDescription>
                        Add a project manually. This will be saved alongside auto-discovered repositories.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                      <div>
                        <label className="text-sm font-medium">Name *</label>
                        <Input
                          placeholder="Project name"
                          value={createForm.name}
                          onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                        />
                      </div>
                      
                      <div>
                        <label className="text-sm font-medium">Repository URL</label>
                        <Input
                          placeholder="https://github.com/user/repo (optional)"
                          value={createForm.repo_url}
                          onChange={(e) => setCreateForm({ ...createForm, repo_url: e.target.value })}
                        />
                      </div>
                      
                      <div>
                        <label className="text-sm font-medium">Provider</label>
                        <Select value={createForm.provider} onValueChange={(value) => 
                          setCreateForm({ ...createForm, provider: value })
                        }>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Manual">Manual</SelectItem>
                            <SelectItem value="GitHub">GitHub</SelectItem>
                            <SelectItem value="GitLab">GitLab</SelectItem>
                            <SelectItem value="Azure DevOps">Azure DevOps</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      
                      <div>
                        <label className="text-sm font-medium">Description</label>
                        <Textarea
                          placeholder="Project description (optional)"
                          value={createForm.description}
                          onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })}
                        />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
                        Cancel
                      </Button>
                      <Button onClick={createProject} disabled={creating || !createForm.name.trim()}>
                        {creating ? 'Creating...' : 'Create Project'}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
              
              <p className="text-muted-foreground mb-4">
                {ownerFilter ? `Showing projects from ${ownerFilter}` : 'Auto-discovered repositories from your Git providers'}
              </p>
              
              {stats && (
                <div className="flex gap-4 mb-4">
                  <Badge variant="outline">{filteredProjects.length} shown</Badge>
                  <Badge variant="outline">{stats.total} total</Badge>
                  <Badge variant="outline">{stats.private_count} private</Badge>
                  <Badge variant="outline">{stats.public_count} public</Badge>
                  {Object.entries(stats.by_provider).map(([provider, count]) => (
                    <Badge key={provider} variant="secondary">
                      {provider}: {count}
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            {/* Filters */}
            <div className="flex gap-4 mb-6">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search projects..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
              
              <Select value={ownerFilter || 'all'} onValueChange={(v) => setOwnerFilter(v === 'all' ? '' : v)}>
                <SelectTrigger className="w-48">
                  <Filter className="w-4 h-4 mr-2" />
                  <SelectValue placeholder="All owners" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All owners</SelectItem>
                  {owners.map(owner => (
                    <SelectItem key={owner} value={owner}>
                      {owner}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Projects grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredProjects.map((project) => (
                <Card 
                  key={project.id} 
                  className="cursor-pointer hover:shadow-md transition-shadow"
                  onClick={() => handleProjectSelect(project.id)}
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <CardTitle className="text-lg truncate">{project.name}</CardTitle>
                        {project.repo_owner && (
                          <Badge variant="outline" className="mt-1">
                            {project.repo_owner}
                          </Badge>
                        )}
                        {project.provider && (
                          <Badge variant="secondary" className="mt-1 ml-2">
                            {project.provider}
                          </Badge>
                        )}
                      </div>
                      
                      {project.repo_url && (
                        <Button
                          variant="ghost"
                          size="sm"
                          asChild
                          onClick={(e) => e.stopPropagation()}
                        >
                          <a 
                            href={project.repo_url} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            title="Open repository"
                          >
                            <ExternalLink className="w-4 h-4" />
                          </a>
                        </Button>
                      )}
                    </div>
                    
                    {project.description && (
                      <CardDescription className="line-clamp-2">
                        {project.description}
                      </CardDescription>
                    )}
                  </CardHeader>
                  
                  <CardContent className="pt-0">
                    <div className="flex items-center justify-between text-sm text-muted-foreground">
                      <div className="flex items-center">
                        <GitBranch className="w-4 h-4 mr-1" />
                        <span>{project.repo_name || project.name}</span>
                      </div>
                      
                      <div className="flex items-center">
                        <Clock className="w-4 h-4 mr-1" />
                        <span>
                          {new Date(project.updated_at).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {filteredProjects.length === 0 && (
              <div className="text-center py-12">
                <FolderOpen className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium mb-2">No projects found</h3>
                <p className="text-muted-foreground">
                  {searchQuery || ownerFilter 
                    ? 'Try adjusting your filters'
                    : 'Configure your Git providers to discover repositories'
                  }
                </p>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}