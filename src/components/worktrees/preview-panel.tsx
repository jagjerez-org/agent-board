'use client';

import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
  Play, 
  Square, 
  RefreshCw,
  ExternalLink,
  Grid3X3,
  Grid2X2,
  Maximize2,
  Minimize2,
  AlertCircle,
  Loader2
} from 'lucide-react';
interface Worktree {
  path: string;
  branch: string;
  commit: string;
  isMain: boolean;
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

interface PreviewPanelProps {
  projectId: string;
  worktrees: Worktree[];
}

export function PreviewPanel({ projectId, worktrees }: PreviewPanelProps) {
  const [servers, setServers] = useState<PreviewServer[]>([]);
  const [loading, setLoading] = useState(false);
  const [startingServers, setStartingServers] = useState<Set<string>>(new Set());
  const [stoppingServers, setStoppingServers] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<'2up' | '3up' | 'full'>('2up');
  const [selectedBranch, setSelectedBranch] = useState<string | null>(null);
  
  // Start server dialog state
  const [startDialogOpen, setStartDialogOpen] = useState(false);
  const [newServerBranch, setNewServerBranch] = useState('');
  const [newServerCommand, setNewServerCommand] = useState('pnpm dev');
  const [newServerPort, setNewServerPort] = useState('');

  const iframeRefs = useRef<Map<string, HTMLIFrameElement>>(new Map());

  // Load preview servers
  const loadServers = async () => {
    if (!projectId) return;
    
    setLoading(true);
    try {
      const response = await fetch(`/api/git/worktrees/preview?project=${encodeURIComponent(projectId)}`);
      if (response.ok) {
        const data = await response.json();
        setServers(data.servers || []);
      }
    } catch (error) {
      console.error('Error loading preview servers:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadServers();
    
    // Set up polling for server status updates
    const interval = setInterval(loadServers, 5000);
    return () => clearInterval(interval);
  }, [projectId]);

  const startPreviewServer = async (branch?: string, command?: string, port?: string) => {
    const targetBranch = branch || newServerBranch;
    const targetCommand = command || newServerCommand;
    const targetPort = port || newServerPort;
    
    if (!projectId || !targetBranch) return;

    setStartingServers(prev => new Set([...prev, targetBranch]));
    
    try {
      const response = await fetch('/api/git/worktrees/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project: projectId,
          branch: targetBranch,
          command: targetCommand,
          ...(targetPort && { port: parseInt(targetPort) })
        })
      });

      if (response.ok) {
        setStartDialogOpen(false);
        setNewServerBranch('');
        setNewServerCommand('pnpm dev');
        setNewServerPort('');
        await loadServers();
      } else {
        const errorData = await response.json();
        alert(errorData.error || 'Failed to start preview server');
      }
    } catch (error) {
      console.error('Error starting preview server:', error);
      alert('Failed to start preview server');
    } finally {
      setStartingServers(prev => {
        const updated = new Set(prev);
        updated.delete(targetBranch);
        return updated;
      });
    }
  };

  const stopPreviewServer = async (branch: string) => {
    if (!projectId) return;

    if (!confirm(`Stop preview server for branch '${branch}'?`)) return;

    setStoppingServers(prev => new Set([...prev, branch]));
    
    try {
      const response = await fetch('/api/git/worktrees/preview', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project: projectId,
          branch
        })
      });

      if (response.ok) {
        await loadServers();
      } else {
        const errorData = await response.json();
        alert(errorData.error || 'Failed to stop preview server');
      }
    } catch (error) {
      console.error('Error stopping preview server:', error);
      alert('Failed to stop preview server');
    } finally {
      setStoppingServers(prev => {
        const updated = new Set(prev);
        updated.delete(branch);
        return updated;
      });
    }
  };

  const refreshIframe = (branch: string) => {
    const iframe = iframeRefs.current.get(branch);
    if (iframe) {
      iframe.src = iframe.src;
    }
  };

  const openInNewTab = (port: number) => {
    window.open(`http://localhost:${port}`, '_blank');
  };

  const availableWorktrees = worktrees.filter(w => !servers.some(s => s.branch === w.branch));
  const runningServers = servers.filter(s => s.status === 'running');

  const getGridClass = () => {
    if (selectedBranch) return 'grid-cols-1';
    
    switch (viewMode) {
      case '2up':
        return 'grid-cols-1 md:grid-cols-2';
      case '3up':
        return 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3';
      case 'full':
        return 'grid-cols-1';
      default:
        return 'grid-cols-1 md:grid-cols-2';
    }
  };

  const getStatusBadge = (server: PreviewServer) => {
    const isStarting = startingServers.has(server.branch);
    const isStopping = stoppingServers.has(server.branch);
    
    if (isStarting) {
      return <Badge variant="outline" className="text-blue-600"><Loader2 className="w-3 h-3 mr-1 animate-spin" />Starting</Badge>;
    }
    
    if (isStopping) {
      return <Badge variant="outline" className="text-orange-600"><Loader2 className="w-3 h-3 mr-1 animate-spin" />Stopping</Badge>;
    }
    
    switch (server.status) {
      case 'running':
        return <Badge variant="default" className="bg-green-600">Running</Badge>;
      case 'starting':
        return <Badge variant="outline" className="text-blue-600">Starting</Badge>;
      case 'stopped':
        return <Badge variant="secondary">Stopped</Badge>;
      case 'error':
        return <Badge variant="destructive">Error</Badge>;
      default:
        return <Badge variant="outline">Unknown</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h3 className="text-lg font-semibold">Preview Servers</h3>
          
          {runningServers.length > 0 && (
            <div className="flex items-center gap-2">
              <Label>View:</Label>
              <Select value={viewMode} onValueChange={(value: '2up' | '3up' | 'full') => setViewMode(value)}>
                <SelectTrigger className="w-24">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="2up">
                    <div className="flex items-center gap-2">
                      <Grid2X2 className="w-4 h-4" />
                      2-up
                    </div>
                  </SelectItem>
                  <SelectItem value="3up">
                    <div className="flex items-center gap-2">
                      <Grid3X3 className="w-4 h-4" />
                      3-up
                    </div>
                  </SelectItem>
                  <SelectItem value="full">
                    <div className="flex items-center gap-2">
                      <Maximize2 className="w-4 h-4" />
                      Full
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
              
              {selectedBranch && (
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => setSelectedBranch(null)}
                >
                  <Minimize2 className="w-4 h-4 mr-2" />
                  Show All
                </Button>
              )}
            </div>
          )}
        </div>

        <div className="flex gap-2">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={loadServers}
            disabled={loading}
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          
          <Dialog open={startDialogOpen} onOpenChange={setStartDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Play className="w-4 h-4 mr-2" />
                Start Preview
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Start Preview Server</DialogTitle>
                <DialogDescription>
                  Start a development server for a worktree branch
                </DialogDescription>
              </DialogHeader>
              
              <div className="space-y-4 py-4">
                <div>
                  <Label htmlFor="branch">Branch</Label>
                  <Select value={newServerBranch} onValueChange={setNewServerBranch}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select branch..." />
                    </SelectTrigger>
                    <SelectContent>
                      {availableWorktrees.map((worktree) => (
                        <SelectItem key={worktree.branch} value={worktree.branch}>
                          {worktree.branch}
                          {worktree.isMain && <span className="text-xs text-muted-foreground ml-2">(main)</span>}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {availableWorktrees.length === 0 && (
                    <p className="text-xs text-muted-foreground mt-1">
                      All worktrees already have preview servers
                    </p>
                  )}
                </div>
                
                <div>
                  <Label htmlFor="command">Command</Label>
                  <Input
                    id="command"
                    value={newServerCommand}
                    onChange={(e) => setNewServerCommand(e.target.value)}
                    placeholder="pnpm dev"
                  />
                </div>
                
                <div>
                  <Label htmlFor="port">Port (optional)</Label>
                  <Input
                    id="port"
                    type="number"
                    value={newServerPort}
                    onChange={(e) => setNewServerPort(e.target.value)}
                    placeholder="Auto-assign from 3200"
                  />
                </div>
              </div>
              
              <DialogFooter>
                <Button variant="outline" onClick={() => setStartDialogOpen(false)}>
                  Cancel
                </Button>
                <Button 
                  onClick={() => startPreviewServer()}
                  disabled={!newServerBranch}
                >
                  Start Server
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Server List */}
      {servers.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <AlertCircle className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-medium mb-2">No Preview Servers</h3>
            <p className="text-muted-foreground mb-4">
              Start a preview server to see live previews of your worktree branches
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {/* Server cards for non-running servers */}
          {servers.filter(s => s.status !== 'running').map((server) => (
            <Card key={server.branch} className="border">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <CardTitle className="text-base">{server.branch}</CardTitle>
                    {getStatusBadge(server)}
                  </div>
                  
                  <div className="flex gap-2">
                    {server.status === 'stopped' || server.status === 'error' ? (
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => startPreviewServer(server.branch, server.command)}
                        disabled={startingServers.has(server.branch)}
                      >
                        <Play className="w-4 h-4" />
                      </Button>
                    ) : (
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => stopPreviewServer(server.branch)}
                        disabled={stoppingServers.has(server.branch)}
                      >
                        <Square className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </div>
                
                <div className="text-sm text-muted-foreground">
                  <p>Port: {server.port}</p>
                  <p>Command: {server.command}</p>
                  <p>Started: {new Date(server.startedAt).toLocaleString()}</p>
                </div>
              </CardHeader>
            </Card>
          ))}
          
          {/* Preview Grid */}
          {runningServers.length > 0 && (
            <div className={`grid gap-4 ${getGridClass()}`}>
              {runningServers
                .filter(server => !selectedBranch || server.branch === selectedBranch)
                .map((server) => (
                <Card key={server.branch} className="border">
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <CardTitle className="text-base">{server.branch}</CardTitle>
                        {getStatusBadge(server)}
                      </div>
                      
                      <div className="flex gap-1">
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={() => refreshIframe(server.branch)}
                        >
                          <RefreshCw className="w-4 h-4" />
                        </Button>
                        
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={() => openInNewTab(server.port)}
                        >
                          <ExternalLink className="w-4 h-4" />
                        </Button>
                        
                        {!selectedBranch ? (
                          <Button 
                            variant="ghost" 
                            size="sm"
                            onClick={() => setSelectedBranch(server.branch)}
                          >
                            <Maximize2 className="w-4 h-4" />
                          </Button>
                        ) : (
                          <Button 
                            variant="ghost" 
                            size="sm"
                            onClick={() => setSelectedBranch(null)}
                          >
                            <Minimize2 className="w-4 h-4" />
                          </Button>
                        )}
                        
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={() => stopPreviewServer(server.branch)}
                          disabled={stoppingServers.has(server.branch)}
                        >
                          <Square className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                    
                    <div className="text-xs text-muted-foreground">
                      localhost:{server.port}
                    </div>
                  </CardHeader>
                  
                  <CardContent className="p-0">
                    <div className={`aspect-video bg-gray-100 rounded-b-lg overflow-hidden ${selectedBranch ? 'aspect-[16/10]' : ''}`}>
                      <iframe
                        ref={(el) => {
                          if (el) iframeRefs.current.set(server.branch, el);
                        }}
                        src={`http://localhost:${server.port}`}
                        className="w-full h-full border-0"
                        title={`Preview: ${server.branch}`}
                        sandbox="allow-same-origin allow-scripts allow-forms allow-popups"
                      />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Quick Actions */}
      {availableWorktrees.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Quick Start</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {availableWorktrees.slice(0, 6).map((worktree) => (
                <Button
                  key={worktree.branch}
                  variant="outline"
                  size="sm"
                  onClick={() => startPreviewServer(worktree.branch)}
                  disabled={startingServers.has(worktree.branch)}
                >
                  {startingServers.has(worktree.branch) && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}
                  <Play className="w-3 h-3 mr-1" />
                  {worktree.branch}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}