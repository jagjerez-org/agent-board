'use client';

import { useState, useEffect } from 'react';
import { Check, ChevronsUpDown, RefreshCw, FolderGit2, Plus, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
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
import { Badge } from '@/components/ui/badge';
import { Project } from '@/lib/types';

interface ProjectSelectorProps {
  value?: string;
  onValueChange: (value: string | undefined) => void;
  className?: string;
}

export function ProjectSelector({ value, onValueChange, className }: ProjectSelectorProps) {
  const [open, setOpen] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const selectedProject = projects.find((project) => project.id === value);

  const fetchProjects = async (refresh = false) => {
    try {
      setLoading(true);
      if (refresh) setRefreshing(true);
      
      const response = await fetch(`/api/projects${refresh ? '?refresh=true' : ''}`);
      if (!response.ok) throw new Error('Failed to fetch projects');
      
      const data = await response.json();
      setProjects(data.projects || []);
    } catch (error) {
      console.error('Error fetching projects:', error);
    } finally {
      setLoading(false);
      if (refresh) setRefreshing(false);
    }
  };

  // Seed default projects on mount
  const seedDefaultProjects = async () => {
    try {
      await fetch('/api/projects/seed', { method: 'POST' });
      fetchProjects();
    } catch (error) {
      console.error('Error seeding projects:', error);
    }
  };

  useEffect(() => {
    seedDefaultProjects();
  }, []);

  const handleProjectSelect = (projectId: string) => {
    if (projectId === 'all') {
      onValueChange(undefined);
      localStorage.removeItem('selectedProjectId');
    } else {
      onValueChange(projectId);
      localStorage.setItem('selectedProjectId', projectId);
    }
    setOpen(false);
  };

  // No longer loading from localStorage here — parent initializes from localStorage directly

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(
            'w-[280px] justify-between',
            className
          )}
        >
          <div className="flex items-center truncate">
            {loading ? (
              <Loader2 className="mr-2 h-4 w-4 shrink-0 animate-spin" />
            ) : (
              <FolderGit2 className="mr-2 h-4 w-4 shrink-0" />
            )}
            <span className="truncate">
              {selectedProject ? selectedProject.name : 'All Projects'}
            </span>
          </div>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[320px] p-0">
        <Command>
          <CommandInput placeholder="Search projects..." />
          <CommandList>
            <CommandEmpty>
              {loading ? (
                <div className="flex items-center justify-center gap-2 py-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Loading projects...</span>
                </div>
              ) : 'No projects found.'}
            </CommandEmpty>
            <CommandGroup>
              {loading && projects.length === 0 && (
                <div className="flex items-center justify-center gap-2 py-4 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-sm">Loading projects...</span>
                </div>
              )}
              <CommandItem onSelect={() => handleProjectSelect('all')}>
                <Check
                  className={cn(
                    'mr-2 h-4 w-4',
                    !value ? 'opacity-100' : 'opacity-0'
                  )}
                />
                All Projects
              </CommandItem>
              {projects.map((project) => (
                <CommandItem
                  key={project.id}
                  onSelect={() => handleProjectSelect(project.id)}
                >
                  <Check
                    className={cn(
                      'mr-2 h-4 w-4',
                      value === project.id ? 'opacity-100' : 'opacity-0'
                    )}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center">
                      <span className="truncate">{project.name}</span>
                      {project.repo_owner && (
                        <Badge variant="outline" className="ml-2 text-xs shrink-0">
                          {project.repo_owner}
                        </Badge>
                      )}
                    </div>
                    {project.description && (
                      <p className="text-xs text-muted-foreground truncate">
                        {project.description}
                      </p>
                    )}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
            {projects.length > 0 && (
              <CommandGroup>
                <CommandItem onSelect={() => fetchProjects(true)} disabled={refreshing}>
                  <RefreshCw className={cn(
                    'mr-2 h-4 w-4',
                    refreshing && 'animate-spin'
                  )} />
                  Refresh from Git
                </CommandItem>
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}