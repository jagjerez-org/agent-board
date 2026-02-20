'use client';

import { useEffect, useState } from 'react';
import { Agent } from '@/lib/types';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { Button } from '@/components/ui/button';

interface AgentHierarchy {
  roots: Agent[];
  children: Record<string, Agent[]>;
}

export function AgentOrgChart() {
  const [hierarchy, setHierarchy] = useState<AgentHierarchy | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadAgents();
  }, []);

  const loadAgents = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch('/api/agents?format=hierarchy');
      if (!response.ok) {
        throw new Error('Failed to fetch agents');
      }
      const data = await response.json();
      setHierarchy(data);
    } catch (error) {
      console.error('Error loading agents:', error);
      setError('Failed to load agents. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const seedAgents = async () => {
    try {
      const response = await fetch('/api/agents/seed', {
        method: 'POST',
      });
      if (!response.ok) {
        throw new Error('Failed to seed agents');
      }
      const result = await response.json();
      alert(result.message);
      loadAgents(); // Reload agents
    } catch (error) {
      console.error('Error seeding agents:', error);
      alert('Failed to seed agents');
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'idle': return 'bg-green-500';
      case 'busy': return 'bg-yellow-500';
      case 'offline': return 'bg-gray-500';
      default: return 'bg-gray-500';
    }
  };

  const getAgentInitials = (name: string) => {
    return name.split(' ').map(word => word.charAt(0).toUpperCase()).join('').slice(0, 2);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <p className="text-destructive text-lg mb-4">{error}</p>
          <Button onClick={loadAgents} variant="outline">
            Retry
          </Button>
        </div>
      </div>
    );
  }

  if (!hierarchy || hierarchy.roots.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <p className="text-muted-foreground text-lg mb-4">No agents found</p>
          <p className="text-sm text-muted-foreground mb-4">
            Seed your workspace with default OpenClaw agents
          </p>
          <Button onClick={seedAgents}>
            Seed Default Agents
          </Button>
        </div>
      </div>
    );
  }

  const renderAgent = (agent: Agent, level = 0) => (
    <div key={agent.id} className="mb-4" style={{ marginLeft: level * 24 }}>
      <Card className="p-4 hover:shadow-md transition-shadow">
        <div className="flex items-start justify-between">
          <div className="flex items-center space-x-3">
            <div className="relative">
              <Avatar className="h-10 w-10">
                <AvatarFallback className="bg-primary/10">
                  {getAgentInitials(agent.name)}
                </AvatarFallback>
              </Avatar>
              <div 
                className={`absolute -bottom-1 -right-1 w-3 h-3 rounded-full border-2 border-background ${getStatusColor(agent.status)}`}
              />
            </div>
            
            <div className="flex-1 min-w-0">
              <h3 className="font-medium truncate">{agent.name}</h3>
              <div className="flex items-center space-x-2 mt-1">
                <Badge variant="outline" className="text-xs">
                  {agent.role || 'general'}
                </Badge>
                <Badge 
                  variant={agent.status === 'idle' ? 'default' : 
                          agent.status === 'busy' ? 'secondary' : 'outline'}
                  className="text-xs"
                >
                  {agent.status}
                </Badge>
              </div>
              {agent.model && (
                <p className="text-xs text-muted-foreground mt-1">
                  {agent.model}
                </p>
              )}
            </div>
          </div>

          <div className="flex flex-col items-end">
            {agent.current_task_id && (
              <Badge variant="secondary" className="text-xs mb-1">
                Task: {agent.current_task_id.slice(0, 8)}...
              </Badge>
            )}
            {agent.capabilities && agent.capabilities.length > 0 && (
              <div className="flex flex-wrap gap-1 justify-end">
                {agent.capabilities.slice(0, 3).map(cap => (
                  <Badge key={cap} variant="outline" className="text-xs">
                    {cap}
                  </Badge>
                ))}
                {agent.capabilities.length > 3 && (
                  <Badge variant="outline" className="text-xs">
                    +{agent.capabilities.length - 3}
                  </Badge>
                )}
              </div>
            )}
          </div>
        </div>
      </Card>

      {/* Render children */}
      {hierarchy.children[agent.id]?.map(childAgent => 
        renderAgent(childAgent, level + 1)
      )}
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          {hierarchy.roots.length} root agent(s) found
        </div>
        <Button onClick={seedAgents} variant="outline" size="sm">
          Seed Default Agents
        </Button>
      </div>

      <div className="max-h-[600px] overflow-y-auto">
        {hierarchy.roots.map(agent => renderAgent(agent))}
      </div>
    </div>
  );
}