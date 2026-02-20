'use client';

import { useEffect, useState, useRef } from 'react';
import { Agent } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { AgentSheet } from './agent-sheet';

interface AgentHierarchy {
  roots: Agent[];
  children: Record<string, Agent[]>;
}

const CARD_W = 180;
const CARD_H = 80;
const GAP_X = 24;
const GAP_Y = 60;

interface NodePos {
  id: string;
  x: number;
  y: number;
  agent: Agent;
  parentId?: string;
}

export function AgentTree() {
  const [hierarchy, setHierarchy] = useState<AgentHierarchy | null>(null);
  const [allAgents, setAllAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [liveStatuses, setLiveStatuses] = useState<Record<string, string>>({});
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadAgents();
    const interval = setInterval(loadLiveStatus, 10000);
    loadLiveStatus();
    return () => clearInterval(interval);
  }, []);

  const loadAgents = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/agents?format=hierarchy');
      if (!response.ok) throw new Error('Failed');
      const data = await response.json();
      setHierarchy(data);
      const flat: Agent[] = [...data.roots];
      for (const children of Object.values(data.children) as Agent[][]) {
        flat.push(...children);
      }
      setAllAgents(flat);
    } catch {
      setError('Failed to load agents');
    } finally {
      setLoading(false);
    }
  };

  const loadLiveStatus = async () => {
    try {
      const res = await fetch('/api/agents/live');
      const data = await res.json();
      const map: Record<string, string> = {};
      for (const a of data.agents || []) map[a.id] = a.status;
      setLiveStatuses(map);
    } catch { /* ignore */ }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'idle': return '#22c55e';
      case 'busy': return '#eab308';
      default: return '#6b7280';
    }
  };

  const getInitials = (name: string) =>
    name.split(' ').map(w => w[0]?.toUpperCase()).join('').slice(0, 2);

  if (loading) return <div className="flex items-center justify-center h-64"><LoadingSpinner size="lg" /></div>;
  if (error) return <div className="text-center text-destructive py-8">{error}</div>;
  if (!hierarchy || hierarchy.roots.length === 0) return <div className="text-center text-muted-foreground py-8">No agents found.</div>;

  // Layout calculation: position each node
  const nodes: NodePos[] = [];

  const layoutSubtree = (agentId: string, depth: number, parentId?: string): { width: number; positions: NodePos[] } => {
    const agent = allAgents.find(a => a.id === agentId);
    if (!agent) return { width: 0, positions: [] };

    const children = hierarchy.children[agentId] || [];
    
    if (children.length === 0) {
      const pos: NodePos = { id: agentId, x: 0, y: depth * (CARD_H + GAP_Y), agent, parentId };
      return { width: CARD_W, positions: [pos] };
    }

    // Layout children first
    const childLayouts = children.map(child => layoutSubtree(child.id, depth + 1, agentId));
    const totalChildrenWidth = childLayouts.reduce((sum, c) => sum + c.width, 0) + (children.length - 1) * GAP_X;
    const myWidth = Math.max(CARD_W, totalChildrenWidth);

    // Position children
    let offsetX = (myWidth - totalChildrenWidth) / 2;
    const allPositions: NodePos[] = [];

    for (const childLayout of childLayouts) {
      for (const pos of childLayout.positions) {
        allPositions.push({ ...pos, x: pos.x + offsetX });
      }
      offsetX += childLayout.width + GAP_X;
    }

    // Position self centered above children
    const selfPos: NodePos = {
      id: agentId,
      x: (myWidth - CARD_W) / 2,
      y: depth * (CARD_H + GAP_Y),
      agent,
      parentId,
    };
    allPositions.push(selfPos);

    return { width: myWidth, positions: allPositions };
  };

  // Layout all roots side by side
  let totalOffset = 0;
  for (const root of hierarchy.roots) {
    const result = layoutSubtree(root.id, 0);
    for (const pos of result.positions) {
      nodes.push({ ...pos, x: pos.x + totalOffset });
    }
    totalOffset += result.width + GAP_X * 2;
  }

  // Calculate SVG size
  const maxX = Math.max(...nodes.map(n => n.x + CARD_W));
  const maxY = Math.max(...nodes.map(n => n.y + CARD_H));
  const svgW = maxX + 40;
  const svgH = maxY + 40;

  // Build node map for drawing lines
  const nodeMap: Record<string, NodePos> = {};
  for (const n of nodes) nodeMap[n.id] = n;

  // Draw connector lines
  const lines: { x1: number; y1: number; x2: number; y2: number }[] = [];
  for (const n of nodes) {
    if (n.parentId && nodeMap[n.parentId]) {
      const parent = nodeMap[n.parentId];
      lines.push({
        x1: parent.x + CARD_W / 2 + 20,
        y1: parent.y + CARD_H + 20,
        x2: n.x + CARD_W / 2 + 20,
        y2: n.y + 20,
      });
    }
  }

  return (
    <div className="space-y-4">
      <div className="text-sm text-muted-foreground">
        {hierarchy.roots.length} root agent(s) • Tree view
      </div>

      <div ref={containerRef} className="overflow-auto pb-8" style={{ maxHeight: '70vh' }}>
        <div className="relative" style={{ width: svgW, height: svgH }}>
          {/* SVG connector lines */}
          <svg
            className="absolute top-0 left-0 pointer-events-none"
            width={svgW}
            height={svgH}
          >
            {lines.map((line, i) => {
              const midY = (line.y1 + line.y2) / 2;
              return (
                <path
                  key={i}
                  d={`M ${line.x1} ${line.y1} C ${line.x1} ${midY}, ${line.x2} ${midY}, ${line.x2} ${line.y2}`}
                  fill="none"
                  stroke="rgba(255,255,255,0.15)"
                  strokeWidth={2}
                />
              );
            })}
          </svg>

          {/* Agent cards */}
          {nodes.map(node => {
            const status = liveStatuses[node.id] || node.agent.status;
            return (
              <div
                key={node.id}
                className="absolute cursor-pointer group"
                style={{
                  left: node.x + 20,
                  top: node.y + 20,
                  width: CARD_W,
                  height: CARD_H,
                }}
                onClick={() => {
                  setSelectedAgentId(node.id);
                  setSheetOpen(true);
                }}
              >
                <div className="h-full rounded-lg border bg-card p-3 hover:shadow-lg hover:border-primary/30 transition-all flex items-center gap-3">
                  <div className="relative flex-shrink-0">
                    <Avatar className="h-10 w-10">
                      <AvatarFallback className="bg-primary/10 text-xs">
                        {getInitials(node.agent.name)}
                      </AvatarFallback>
                    </Avatar>
                    <div
                      className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-background"
                      style={{ backgroundColor: getStatusColor(status) }}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{node.agent.name}</p>
                    <div className="flex items-center gap-1 mt-1">
                      <Badge variant="outline" className="text-[10px] px-1 py-0">
                        {node.agent.role || 'general'}
                      </Badge>
                      <Badge
                        variant={status === 'busy' ? 'secondary' : 'default'}
                        className="text-[10px] px-1 py-0"
                      >
                        {status}
                      </Badge>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <AgentSheet
        agentId={selectedAgentId}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        onUpdated={loadAgents}
        agents={allAgents}
      />
    </div>
  );
}
