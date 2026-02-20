'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Search, 
  Plus, 
  Edit, 
  Trash2, 
  Download, 
  RefreshCw, 
  FileText, 
  Code, 
  Package,
  ExternalLink,
  AlertCircle
} from 'lucide-react';
// Using alerts for now instead of toast

interface SkillInfo {
  name: string;
  description: string;
  location: string;
  source: 'builtin' | 'workspace';
}

interface SkillDetail extends SkillInfo {
  content: string;
}

interface ClawHubResult {
  name: string;
  description: string;
  raw: string;
}

export default function SkillsPage() {
  // Skills data
  const [skills, setSkills] = useState<SkillInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Create skill dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createContent, setCreateContent] = useState(`# New Skill

A brief description of what this skill does.

## Usage

Explain how to use this skill.

## Example

\`\`\`bash
# Example usage
\`\`\`
`);
  const [creating, setCreating] = useState(false);
  
  // Edit skill dialog
  const [editOpen, setEditOpen] = useState(false);
  const [editingSkill, setEditingSkill] = useState<SkillDetail | null>(null);
  const [editContent, setEditContent] = useState('');
  const [saving, setSaving] = useState(false);
  
  // View skill dialog
  const [viewOpen, setViewOpen] = useState(false);
  const [viewingSkill, setViewingSkill] = useState<SkillDetail | null>(null);
  
  // ClawHub
  const [clawHubQuery, setClawHubQuery] = useState('');
  const [clawHubResults, setClawHubResults] = useState<ClawHubResult[]>([]);
  const [clawHubSearching, setClawHubSearching] = useState(false);
  const [installing, setInstalling] = useState<string | null>(null);

  useEffect(() => {
    loadSkills();
  }, []);

  const loadSkills = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/skills');
      if (!res.ok) throw new Error('Failed to load skills');
      
      const data = await res.json();
      setSkills([...(data.builtin || []), ...(data.workspace || [])]);
    } catch (error) {
      console.error('Failed to load skills:', error);
      alert('Failed to load skills');
    } finally {
      setLoading(false);
    }
  };

  const filteredSkills = skills.filter(skill => 
    !searchTerm || 
    skill.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    skill.description.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const workspaceSkills = filteredSkills.filter(s => s.source === 'workspace');
  const builtinSkills = filteredSkills.filter(s => s.source === 'builtin');

  const loadSkillDetail = async (skillName: string): Promise<SkillDetail | null> => {
    try {
      const res = await fetch(`/api/skills/${skillName}`);
      if (!res.ok) throw new Error('Failed to load skill detail');
      
      return await res.json();
    } catch (error) {
      console.error('Failed to load skill detail:', error);
      alert('Failed to load skill detail');
      return null;
    }
  };

  const handleCreateSkill = async () => {
    if (!createName.trim()) {
      alert('Skill name is required');
      return;
    }

    setCreating(true);
    try {
      const res = await fetch('/api/skills/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: createName.trim(),
          content: createContent
        })
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to create skill');
      }

      alert('Skill created successfully');
      setCreateOpen(false);
      setCreateName('');
      setCreateContent(`# New Skill

A brief description of what this skill does.

## Usage

Explain how to use this skill.

## Example

\`\`\`bash
# Example usage
\`\`\`
`);
      loadSkills();
    } catch (error) {
      console.error('Failed to create skill:', error);
      alert(error instanceof Error ? error.message : 'Failed to create skill');
    } finally {
      setCreating(false);
    }
  };

  const handleEditSkill = async (skillName: string) => {
    const detail = await loadSkillDetail(skillName);
    if (!detail) return;

    if (detail.source !== 'workspace') {
      alert('Only workspace skills can be edited');
      return;
    }

    setEditingSkill(detail);
    setEditContent(detail.content);
    setEditOpen(true);
  };

  const handleSaveSkill = async () => {
    if (!editingSkill) return;

    setSaving(true);
    try {
      const res = await fetch(`/api/skills/${editingSkill.name}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: editContent })
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to save skill');
      }

      alert('Skill saved successfully');
      setEditOpen(false);
      setEditingSkill(null);
      loadSkills();
    } catch (error) {
      console.error('Failed to save skill:', error);
      alert(error instanceof Error ? error.message : 'Failed to save skill');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteSkill = async (skillName: string) => {
    const skill = skills.find(s => s.name === skillName);
    if (!skill) return;

    if (skill.source !== 'workspace') {
      alert('Only workspace skills can be deleted');
      return;
    }

    if (!confirm(`Are you sure you want to delete the skill "${skillName}"? This action cannot be undone.`)) {
      return;
    }

    try {
      const res = await fetch(`/api/skills/${skillName}`, {
        method: 'DELETE'
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to delete skill');
      }

      alert('Skill deleted successfully');
      loadSkills();
    } catch (error) {
      console.error('Failed to delete skill:', error);
      alert(error instanceof Error ? error.message : 'Failed to delete skill');
    }
  };

  const handleViewSkill = async (skillName: string) => {
    const detail = await loadSkillDetail(skillName);
    if (!detail) return;

    setViewingSkill(detail);
    setViewOpen(true);
  };

  const handleSearchClawHub = async () => {
    if (!clawHubQuery.trim()) {
      alert('Please enter a search term');
      return;
    }

    setClawHubSearching(true);
    try {
      const res = await fetch(`/api/skills/clawhub/search?q=${encodeURIComponent(clawHubQuery)}`);
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Search failed');
      }

      const data = await res.json();
      setClawHubResults(data.results || []);
      
      if (data.results.length === 0) {
        alert('No skills found matching your search');
      }
    } catch (error) {
      console.error('ClawHub search failed:', error);
      alert(error instanceof Error ? error.message : 'Search failed');
    } finally {
      setClawHubSearching(false);
    }
  };

  const handleInstallSkill = async (skillName: string) => {
    if (skills.some(s => s.name === skillName)) {
      alert('A skill with this name already exists');
      return;
    }

    setInstalling(skillName);
    try {
      const res = await fetch('/api/skills/clawhub/install', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: skillName })
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Installation failed');
      }

      alert('Skill installed successfully');
      loadSkills(); // Refresh the skills list
    } catch (error) {
      console.error('Installation failed:', error);
      alert(error instanceof Error ? error.message : 'Installation failed');
    } finally {
      setInstalling(null);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b">
        <div className="container mx-auto px-6 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold">Skills Management</h1>
              <p className="text-muted-foreground mt-1">
                Manage OpenClaw agent skills - builtin and workspace
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={loadSkills} disabled={loading}>
                <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
              <Dialog open={createOpen} onOpenChange={setCreateOpen}>
                <DialogTrigger asChild>
                  <Button>
                    <Plus className="w-4 h-4 mr-2" />
                    Create Skill
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl">
                  <DialogHeader>
                    <DialogTitle>Create New Skill</DialogTitle>
                    <DialogDescription>
                      Create a new skill in your workspace. Skills are directories with SKILL.md files.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div>
                      <Label htmlFor="name">Skill Name</Label>
                      <Input
                        id="name"
                        value={createName}
                        onChange={(e) => setCreateName(e.target.value)}
                        placeholder="my-awesome-skill"
                        className="mt-1"
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        Letters, numbers, hyphens, and underscores only
                      </p>
                    </div>
                    <div>
                      <Label htmlFor="content">SKILL.md Content</Label>
                      <Textarea
                        id="content"
                        value={createContent}
                        onChange={(e) => setCreateContent(e.target.value)}
                        rows={12}
                        className="mt-1 font-mono text-sm"
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setCreateOpen(false)}>
                      Cancel
                    </Button>
                    <Button onClick={handleCreateSkill} disabled={creating}>
                      {creating ? 'Creating...' : 'Create Skill'}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="container mx-auto px-6 py-6">
        <Tabs defaultValue="workspace" className="space-y-6">
          <TabsList>
            <TabsTrigger value="workspace" className="flex items-center gap-2">
              <Code className="w-4 h-4" />
              Workspace ({workspaceSkills.length})
            </TabsTrigger>
            <TabsTrigger value="builtin" className="flex items-center gap-2">
              <Package className="w-4 h-4" />
              Built-in ({builtinSkills.length})
            </TabsTrigger>
            <TabsTrigger value="clawhub" className="flex items-center gap-2">
              <Download className="w-4 h-4" />
              ClawHub
            </TabsTrigger>
          </TabsList>

          {/* Search */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
              <Input
                placeholder="Search skills..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>

          <TabsContent value="workspace" className="space-y-4">
            {workspaceSkills.length === 0 && !loading ? (
              <Card>
                <CardContent className="py-8 text-center">
                  <Code className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                  <h3 className="text-lg font-medium mb-2">No Workspace Skills</h3>
                  <p className="text-muted-foreground mb-4">
                    Create custom skills for your specific needs
                  </p>
                  <Button onClick={() => setCreateOpen(true)}>
                    <Plus className="w-4 h-4 mr-2" />
                    Create Your First Skill
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {workspaceSkills.map((skill) => (
                  <Card key={skill.name} className="hover:shadow-lg transition-shadow">
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <CardTitle className="text-lg">{skill.name}</CardTitle>
                        <Badge variant="default">Workspace</Badge>
                      </div>
                      <CardDescription className="line-clamp-3">
                        {skill.description || 'No description available'}
                      </CardDescription>
                    </CardHeader>
                    <CardFooter className="gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleViewSkill(skill.name)}
                      >
                        <FileText className="w-4 h-4 mr-1" />
                        View
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleEditSkill(skill.name)}
                      >
                        <Edit className="w-4 h-4 mr-1" />
                        Edit
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDeleteSkill(skill.name)}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="w-4 h-4 mr-1" />
                        Delete
                      </Button>
                    </CardFooter>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="builtin" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {builtinSkills.map((skill) => (
                <Card key={skill.name} className="hover:shadow-lg transition-shadow">
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <CardTitle className="text-lg">{skill.name}</CardTitle>
                      <Badge variant="outline">Built-in</Badge>
                    </div>
                    <CardDescription className="line-clamp-3">
                      {skill.description || 'No description available'}
                    </CardDescription>
                  </CardHeader>
                  <CardFooter>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleViewSkill(skill.name)}
                    >
                      <FileText className="w-4 h-4 mr-1" />
                      View
                    </Button>
                  </CardFooter>
                </Card>
              ))}
            </div>
            {builtinSkills.length === 0 && !loading && (
              <Card>
                <CardContent className="py-8 text-center">
                  <AlertCircle className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                  <h3 className="text-lg font-medium mb-2">No Built-in Skills Found</h3>
                  <p className="text-muted-foreground">
                    Make sure OpenClaw is properly installed
                  </p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="clawhub" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ExternalLink className="w-5 h-5" />
                  ClawHub Skill Repository
                </CardTitle>
                <CardDescription>
                  Search and install skills from the ClawHub community
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex gap-2">
                  <Input
                    placeholder="Search ClawHub skills..."
                    value={clawHubQuery}
                    onChange={(e) => setClawHubQuery(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSearchClawHub()}
                    className="flex-1"
                  />
                  <Button onClick={handleSearchClawHub} disabled={clawHubSearching}>
                    <Search className={`w-4 h-4 mr-2 ${clawHubSearching ? 'animate-spin' : ''}`} />
                    Search
                  </Button>
                </div>
              </CardContent>
            </Card>

            {clawHubResults.length > 0 && (
              <div className="space-y-4">
                <h3 className="text-lg font-medium">Search Results ({clawHubResults.length})</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {clawHubResults.map((result, index) => (
                    <Card key={index}>
                      <CardHeader>
                        <CardTitle className="text-lg">{result.name}</CardTitle>
                        <CardDescription className="line-clamp-3">
                          {result.description || 'No description available'}
                        </CardDescription>
                      </CardHeader>
                      <CardFooter>
                        <Button
                          onClick={() => handleInstallSkill(result.name)}
                          disabled={installing === result.name}
                          size="sm"
                        >
                          <Download className={`w-4 h-4 mr-2 ${installing === result.name ? 'animate-spin' : ''}`} />
                          {installing === result.name ? 'Installing...' : 'Install'}
                        </Button>
                      </CardFooter>
                    </Card>
                  ))}
                </div>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* Edit Skill Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>Edit Skill: {editingSkill?.name}</DialogTitle>
            <DialogDescription>
              Modify the SKILL.md content for this workspace skill
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="flex-1 py-4">
            <Textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              rows={20}
              className="font-mono text-sm resize-none"
            />
          </ScrollArea>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveSkill} disabled={saving}>
              {saving ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Skill Dialog */}
      <Dialog open={viewOpen} onOpenChange={setViewOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {viewingSkill?.name}
              <Badge variant={viewingSkill?.source === 'workspace' ? 'default' : 'outline'}>
                {viewingSkill?.source}
              </Badge>
            </DialogTitle>
            <DialogDescription>
              {viewingSkill?.location}
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="flex-1 py-4">
            <pre className="whitespace-pre-wrap text-sm bg-muted p-4 rounded-lg">
              {viewingSkill?.content}
            </pre>
          </ScrollArea>
          <DialogFooter>
            {viewingSkill?.source === 'workspace' && (
              <Button
                variant="outline"
                onClick={() => {
                  setViewOpen(false);
                  handleEditSkill(viewingSkill.name);
                }}
              >
                <Edit className="w-4 h-4 mr-2" />
                Edit
              </Button>
            )}
            <Button variant="outline" onClick={() => setViewOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}