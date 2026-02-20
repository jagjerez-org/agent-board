'use client';

import { useState, useEffect } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { X, Filter } from 'lucide-react';
import { Priority, Agent } from '@/lib/types';

interface Filters {
  assignee?: string;
  priority?: Priority;
  labels?: string[];
}

interface TaskFiltersProps {
  onFilterChange: (filters: Filters) => void;
}

export function TaskFilters({ onFilterChange }: TaskFiltersProps) {
  const [filters, setFilters] = useState<Filters>({});
  const [agents, setAgents] = useState<Agent[]>([]);

  // Load agents for assignee filter
  useEffect(() => {
    fetch('/api/agents')
      .then(res => res.json())
      .then(setAgents)
      .catch(console.error);
  }, []);

  // Load common labels (could be improved to get from tasks)
  const [commonLabels] = useState<string[]>(['bug', 'feature', 'enhancement', 'documentation', 'urgent']);

  const updateFilters = (newFilters: Filters) => {
    setFilters(newFilters);
    onFilterChange(newFilters);
  };

  const clearFilters = () => {
    const emptyFilters = {};
    setFilters(emptyFilters);
    onFilterChange(emptyFilters);
  };

  const removeFilter = (key: keyof Filters, value?: string) => {
    const newFilters = { ...filters };
    
    if (key === 'labels' && value) {
      newFilters.labels = filters.labels?.filter(label => label !== value) || [];
      if (newFilters.labels.length === 0) delete newFilters.labels;
    } else {
      delete newFilters[key];
    }
    
    updateFilters(newFilters);
  };

  const addLabel = (label: string) => {
    const currentLabels = filters.labels || [];
    if (!currentLabels.includes(label)) {
      updateFilters({
        ...filters,
        labels: [...currentLabels, label]
      });
    }
  };

  const hasActiveFilters = Object.keys(filters).length > 0;

  return (
    <div className="space-y-3">
      {/* Filter Controls */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium">Filters:</span>
        </div>

        {/* Assignee Filter */}
        <Select
          value={filters.assignee || ""}
          onValueChange={(value) => 
            updateFilters({ ...filters, assignee: value || undefined })
          }
        >
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Assignee" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">All agents</SelectItem>
            <SelectItem value="unassigned">Unassigned</SelectItem>
            {agents.map((agent) => (
              <SelectItem key={agent.id} value={agent.id}>
                {agent.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Priority Filter */}
        <Select
          value={filters.priority || ""}
          onValueChange={(value) =>
            updateFilters({ ...filters, priority: (value as Priority) || undefined })
          }
        >
          <SelectTrigger className="w-32">
            <SelectValue placeholder="Priority" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">All priorities</SelectItem>
            <SelectItem value="critical">🔥 Critical</SelectItem>
            <SelectItem value="high">⚡ High</SelectItem>
            <SelectItem value="medium">➡️ Medium</SelectItem>
            <SelectItem value="low">⬇️ Low</SelectItem>
          </SelectContent>
        </Select>

        {/* Label Filter */}
        <Select onValueChange={addLabel}>
          <SelectTrigger className="w-32">
            <SelectValue placeholder="Add label" />
          </SelectTrigger>
          <SelectContent>
            {commonLabels
              .filter(label => !filters.labels?.includes(label))
              .map((label) => (
                <SelectItem key={label} value={label}>
                  {label}
                </SelectItem>
              ))
            }
          </SelectContent>
        </Select>

        {/* Clear Filters */}
        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            <X className="w-4 h-4 mr-1" />
            Clear all
          </Button>
        )}
      </div>

      {/* Active Filters Display */}
      {hasActiveFilters && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-muted-foreground">Active:</span>
          
          {filters.assignee && (
            <Badge variant="secondary" className="text-xs">
              Assignee: {filters.assignee === 'unassigned' ? 'Unassigned' : 
                agents.find(a => a.id === filters.assignee)?.name || filters.assignee}
              <Button
                variant="ghost"
                size="sm"
                className="ml-1 h-3 w-3 p-0 hover:bg-transparent"
                onClick={() => removeFilter('assignee')}
              >
                <X className="w-2 h-2" />
              </Button>
            </Badge>
          )}

          {filters.priority && (
            <Badge variant="secondary" className="text-xs">
              Priority: {filters.priority}
              <Button
                variant="ghost"
                size="sm"
                className="ml-1 h-3 w-3 p-0 hover:bg-transparent"
                onClick={() => removeFilter('priority')}
              >
                <X className="w-2 h-2" />
              </Button>
            </Badge>
          )}

          {filters.labels?.map((label) => (
            <Badge key={label} variant="secondary" className="text-xs">
              Label: {label}
              <Button
                variant="ghost"
                size="sm"
                className="ml-1 h-3 w-3 p-0 hover:bg-transparent"
                onClick={() => removeFilter('labels', label)}
              >
                <X className="w-2 h-2" />
              </Button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}