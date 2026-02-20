'use client';

import { useEffect, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Play,
  Square,
  RotateCcw,
  Plus,
  Trash2,
  Heart,
  HeartOff,
  RefreshCw,
  Settings,
  ExternalLink,
  Loader2,
  Pencil,
} from 'lucide-react';

interface ServiceStatus {
  id: string;
  name: string;
  healthUrl: string;
  workdir: string;
  startCommand: string;
  stopCommand?: string;
  logFile: string;
  autoRestart: boolean;
  status: 'up' | 'down' | 'unknown';
  httpCode?: number;
  pid?: number;
}

interface ServiceForm {
  id?: string;
  name: string;
  healthUrl: string;
  workdir: string;
  startCommand: string;
  stopCommand: string;
  logFile: string;
  autoRestart: boolean;
}

const emptyForm: ServiceForm = {
  name: '',
  healthUrl: 'http://127.0.0.1:',
  workdir: '',
  startCommand: '',
  stopCommand: '',
  logFile: '',
  autoRestart: true,
};

export default function ServicesPage() {
  const [services, setServices] = useState<ServiceStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<Record<string, string>>({});
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<ServiceForm>(emptyForm);
  const [editMode, setEditMode] = useState(false);

  const fetchServices = useCallback(async () => {
    try {
      const res = await fetch('/api/services');
      const data = await res.json();
      setServices(data);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchServices(); }, [fetchServices]);

  // Auto-refresh every 30s
  useEffect(() => {
    const interval = setInterval(fetchServices, 30000);
    return () => clearInterval(interval);
  }, [fetchServices]);

  const doAction = async (id: string, action: string) => {
    setActionLoading(prev => ({ ...prev, [id]: action }));
    try {
      await fetch(`/api/services/${id}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      await new Promise(r => setTimeout(r, 500));
      await fetchServices();
    } catch { alert(`Failed to ${action} service`); }
    finally { setActionLoading(prev => { const n = { ...prev }; delete n[id]; return n; }); }
  };

  const deleteService = async (id: string) => {
    if (!confirm('Delete this service?')) return;
    await fetch('/api/services', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    fetchServices();
  };

  const saveService = async () => {
    const res = await fetch('/api/services', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    if (res.ok) {
      setDialogOpen(false);
      setForm(emptyForm);
      setEditMode(false);
      fetchServices();
    }
  };

  const openEdit = (svc: ServiceStatus) => {
    setForm({
      id: svc.id,
      name: svc.name,
      healthUrl: svc.healthUrl,
      workdir: svc.workdir,
      startCommand: svc.startCommand,
      stopCommand: svc.stopCommand || '',
      logFile: svc.logFile,
      autoRestart: svc.autoRestart,
    });
    setEditMode(true);
    setDialogOpen(true);
  };

  const openNew = () => {
    setForm(emptyForm);
    setEditMode(false);
    setDialogOpen(true);
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Settings className="w-6 h-6" /> Services
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Monitor and manage background services. Auto-restart keeps them alive.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={fetchServices}>
            <RefreshCw className="w-4 h-4 mr-1" /> Refresh
          </Button>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" onClick={openNew}>
                <Plus className="w-4 h-4 mr-1" /> Add Service
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>{editMode ? 'Edit Service' : 'Add Service'}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>Name</Label>
                  <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Agent Board" />
                </div>
                <div>
                  <Label>Health URL</Label>
                  <Input value={form.healthUrl} onChange={e => setForm(f => ({ ...f, healthUrl: e.target.value }))} placeholder="http://127.0.0.1:9100/" />
                </div>
                <div>
                  <Label>Working Directory</Label>
                  <Input value={form.workdir} onChange={e => setForm(f => ({ ...f, workdir: e.target.value }))} placeholder="/tmp/agent-board" />
                </div>
                <div>
                  <Label>Start Command</Label>
                  <Input value={form.startCommand} onChange={e => setForm(f => ({ ...f, startCommand: e.target.value }))} placeholder="node node_modules/.bin/next start -p 9100 -H 0.0.0.0" />
                </div>
                <div>
                  <Label>Stop Command <span className="text-muted-foreground">(optional — kills by port if empty)</span></Label>
                  <Input value={form.stopCommand} onChange={e => setForm(f => ({ ...f, stopCommand: e.target.value }))} placeholder="fuser -k 9100/tcp" />
                </div>
                <div>
                  <Label>Log File</Label>
                  <Input value={form.logFile} onChange={e => setForm(f => ({ ...f, logFile: e.target.value }))} placeholder="/tmp/agent-board.log" />
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked={form.autoRestart} onCheckedChange={v => setForm(f => ({ ...f, autoRestart: v }))} />
                  <Label>Auto-restart when down (via watchdog)</Label>
                </div>
                <Button onClick={saveService} className="w-full" disabled={!form.name || !form.healthUrl || !form.startCommand}>
                  {editMode ? 'Update' : 'Add'} Service
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading services...
        </div>
      ) : services.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground">
          <Settings className="w-12 h-12 mx-auto mb-4 opacity-30" />
          <p className="text-lg font-medium">No services configured</p>
          <p className="text-sm mt-1">Add a service to start monitoring it.</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {services.map(svc => {
            const isLoading = !!actionLoading[svc.id];
            const currentAction = actionLoading[svc.id];
            return (
              <div
                key={svc.id}
                className={`border rounded-lg p-4 transition-colors ${
                  svc.status === 'up' ? 'border-green-500/30 bg-green-500/5' :
                  svc.status === 'down' ? 'border-red-500/30 bg-red-500/5' :
                  'border-border'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-3 h-3 rounded-full ${
                      svc.status === 'up' ? 'bg-green-500 animate-pulse' :
                      svc.status === 'down' ? 'bg-red-500' : 'bg-yellow-500'
                    }`} />
                    <div>
                      <h3 className="font-semibold text-lg">{svc.name}</h3>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                        <span>{svc.healthUrl}</span>
                        {svc.pid && <span>PID {svc.pid}</span>}
                        {svc.httpCode && <span>HTTP {svc.httpCode}</span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <Badge variant={svc.status === 'up' ? 'default' : 'destructive'} className="text-xs">
                      {svc.status === 'up' ? '● Running' : svc.status === 'down' ? '● Down' : '● Unknown'}
                    </Badge>
                    {svc.autoRestart && (
                      <Badge variant="outline" className="text-xs gap-1">
                        <Heart className="w-3 h-3" /> Auto-restart
                      </Badge>
                    )}
                    <div className="flex items-center gap-1">
                      {svc.status === 'down' && (
                        <Button size="sm" variant="default" onClick={() => doAction(svc.id, 'start')} disabled={isLoading}>
                          {currentAction === 'start' ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
                          <span className="ml-1">Start</span>
                        </Button>
                      )}
                      {svc.status === 'up' && (
                        <Button size="sm" variant="outline" onClick={() => doAction(svc.id, 'stop')} disabled={isLoading}>
                          {currentAction === 'stop' ? <Loader2 className="w-3 h-3 animate-spin" /> : <Square className="w-3 h-3" />}
                          <span className="ml-1">Stop</span>
                        </Button>
                      )}
                      <Button size="sm" variant="outline" onClick={() => doAction(svc.id, 'restart')} disabled={isLoading}>
                        {currentAction === 'restart' ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />}
                        <span className="ml-1">Restart</span>
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => window.open(svc.healthUrl, '_blank')}>
                        <ExternalLink className="w-3 h-3" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => openEdit(svc)}>
                        <Pencil className="w-3 h-3" />
                      </Button>
                      <Button size="sm" variant="ghost" className="text-destructive" onClick={() => deleteService(svc.id)}>
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                </div>
                <div className="mt-2 text-xs text-muted-foreground font-mono">
                  <span className="text-foreground/60">cmd:</span> {svc.startCommand}
                  <span className="ml-4 text-foreground/60">dir:</span> {svc.workdir}
                  <span className="ml-4 text-foreground/60">log:</span> {svc.logFile}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
