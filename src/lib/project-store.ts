// Project management with Git provider auto-discovery
import { Project } from './types';
import { discoverAllRepos, GitRepo, getProviders } from './git-service';
import fs from 'fs/promises';
import path from 'path';
import { logActivity } from './activity-store';

const DATA_DIR = path.join(process.cwd(), 'data');
const PROJECTS_DIR = path.join(DATA_DIR, 'projects');
const REPOS_CACHE_FILE = path.join(DATA_DIR, 'repos-cache.json');

// Ensure projects directory exists
export async function ensureProjectsDir(): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.mkdir(PROJECTS_DIR, { recursive: true });
}

export interface RepoCache {
  repos: GitRepo[];
  last_updated: string;
}

// Convert GitRepo to Project interface
function repoToProject(repo: GitRepo): Project {
  return {
    id: repo.id.replace('/', '-'), // Convert owner/name to owner-name for file system
    name: repo.name,
    description: repo.description,
    repo_url: repo.url,
    repo_owner: repo.owner,
    repo_name: repo.name,
    created_at: repo.updated_at, // Use repo updated_at as created_at
    updated_at: repo.updated_at
  };
}

// Get cached repos or fetch fresh ones
async function getReposWithCache(maxAge = 5 * 60 * 1000): Promise<GitRepo[]> {
  try {
    // Try to read from cache
    const cacheContent = await fs.readFile(REPOS_CACHE_FILE, 'utf8');
    const cache: RepoCache = JSON.parse(cacheContent);
    
    // Check if cache is still fresh
    const cacheAge = Date.now() - new Date(cache.last_updated).getTime();
    if (cacheAge < maxAge) {
      return cache.repos;
    }
  } catch (error) {
    // Cache doesn't exist or is invalid, will fetch fresh
  }
  
  // Fetch fresh repos
  console.log('Refreshing repos cache...');
  const repos = await discoverAllRepos();
  
  // Save to cache
  const cache: RepoCache = {
    repos,
    last_updated: new Date().toISOString()
  };
  
  try {
    await fs.writeFile(REPOS_CACHE_FILE, JSON.stringify(cache, null, 2), 'utf8');
  } catch (error) {
    console.warn('Failed to save repos cache:', error);
  }
  
  return repos;
}

// Refresh repos cache (force fetch)
export async function refreshReposCache(): Promise<GitRepo[]> {
  const repos = await discoverAllRepos();
  
  const cache: RepoCache = {
    repos,
    last_updated: new Date().toISOString()
  };
  
  await fs.writeFile(REPOS_CACHE_FILE, JSON.stringify(cache, null, 2), 'utf8');
  
  await logActivity({
    action: 'repos_cache_refreshed',
    details: { count: repos.length }
  });
  
  return repos;
}

// List all available projects (from Git providers)
export async function listProjects(): Promise<Project[]> {
  const repos = await getReposWithCache();
  return repos.map(repoToProject).sort((a, b) => a.name.localeCompare(b.name));
}

// Get project by ID
export async function getProject(id: string): Promise<Project | null> {
  const projects = await listProjects();
  return projects.find(p => p.id === id) || null;
}

// Get project by repo full name (owner/name)
export async function getProjectByRepo(owner: string, name: string): Promise<Project | null> {
  const repoId = `${owner}-${name}`;
  return getProject(repoId);
}

// Get project statistics
export async function getProjectStats(): Promise<{
  total: number;
  by_provider: Record<string, number>;
  private_count: number;
  public_count: number;
}> {
  const repos = await getReposWithCache();
  const stats = {
    total: repos.length,
    by_provider: {} as Record<string, number>,
    private_count: repos.filter(r => r.is_private).length,
    public_count: repos.filter(r => !r.is_private).length
  };
  
  repos.forEach(repo => {
    stats.by_provider[repo.provider] = (stats.by_provider[repo.provider] || 0) + 1;
  });
  
  return stats;
}

// Search projects by name or description
export async function searchProjects(query: string): Promise<Project[]> {
  const projects = await listProjects();
  const lowerQuery = query.toLowerCase();
  
  return projects.filter(project => 
    project.name.toLowerCase().includes(lowerQuery) ||
    project.description?.toLowerCase().includes(lowerQuery) ||
    project.repo_owner?.toLowerCase().includes(lowerQuery)
  );
}

// Get projects by owner/org
export async function getProjectsByOwner(owner: string): Promise<Project[]> {
  const projects = await listProjects();
  return projects.filter(p => p.repo_owner === owner);
}

// Seed default projects (creates them in the repos cache if they don't exist)
export async function seedDefaultProjects(): Promise<Project[]> {
  const defaultRepos: GitRepo[] = [
    {
      id: 'hubdance/kadens',
      name: 'kadens',
      full_name: 'hubdance/kadens',
      description: 'NestJS + Next.js monorepo',
      url: 'https://github.com/hubdance/kadens',
      clone_url: 'https://github.com/hubdance/kadens.git',
      default_branch: 'main',
      is_private: true,
      provider: 'GitHub - Jarvis',
      owner: 'hubdance',
      updated_at: new Date().toISOString()
    },
    {
      id: 'jagjerez-org/langopia',
      name: 'langopia',
      full_name: 'jagjerez-org/langopia',
      description: 'Language learning platform',
      url: 'https://github.com/jagjerez-org/langopia',
      clone_url: 'https://github.com/jagjerez-org/langopia.git',
      default_branch: 'main',
      is_private: false,
      provider: 'GitHub - Jarvis',
      owner: 'jagjerez-org',
      updated_at: new Date().toISOString()
    },
    {
      id: 'jagjerez-org/agent-board',
      name: 'agent-board',
      full_name: 'jagjerez-org/agent-board',
      description: 'Agent Board project management',
      url: 'https://github.com/jagjerez-org/agent-board',
      clone_url: 'https://github.com/jagjerez-org/agent-board.git',
      default_branch: 'main',
      is_private: false,
      provider: 'GitHub - Jarvis',
      owner: 'jagjerez-org',
      updated_at: new Date().toISOString()
    }
  ];

  // Try to get current cache
  let existingRepos: GitRepo[] = [];
  try {
    const cacheContent = await fs.readFile(REPOS_CACHE_FILE, 'utf8');
    const cache: RepoCache = JSON.parse(cacheContent);
    existingRepos = cache.repos;
  } catch (error) {
    // No existing cache
  }

  // Add default repos if they don't exist
  const existingIds = new Set(existingRepos.map(r => r.id));
  const newRepos = defaultRepos.filter(repo => !existingIds.has(repo.id));
  
  if (newRepos.length > 0) {
    const updatedRepos = [...existingRepos, ...newRepos];
    const cache: RepoCache = {
      repos: updatedRepos,
      last_updated: new Date().toISOString()
    };
    
    await fs.writeFile(REPOS_CACHE_FILE, JSON.stringify(cache, null, 2), 'utf8');
    
    await logActivity({
      action: 'default_projects_seeded',
      details: { seeded_count: newRepos.length, names: newRepos.map(r => r.name) }
    });
  }

  return defaultRepos.map(repoToProject);
}

// Create a manual project (not from git discovery)
export async function createManualProject(data: {
  name: string;
  description?: string;
  repo_url?: string;
  provider?: string;
}): Promise<Project> {
  // Generate an ID
  const id = data.name.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-');
  const now = new Date().toISOString();
  
  // Create the project
  const project: Project = {
    id,
    name: data.name,
    description: data.description,
    repo_url: data.repo_url,
    provider: data.provider || 'Manual',
    created_at: now,
    updated_at: now
  };
  
  // If repo URL is provided, try to extract owner and repo name
  if (data.repo_url) {
    const repoMatch = data.repo_url.match(/github\.com\/([^\/]+)\/([^\/]+?)(?:\.git)?$/i) ||
                     data.repo_url.match(/gitlab\.com\/([^\/]+)\/([^\/]+?)(?:\.git)?$/i);
    if (repoMatch) {
      project.repo_owner = repoMatch[1];
      project.repo_name = repoMatch[2];
    }
  }
  
  // Add to cache as a manual entry
  try {
    const cacheContent = await fs.readFile(REPOS_CACHE_FILE, 'utf8');
    const cache: RepoCache = JSON.parse(cacheContent);
    
    // Create a GitRepo entry for consistency
    const gitRepo: GitRepo = {
      id: project.repo_owner && project.repo_name ? `${project.repo_owner}/${project.repo_name}` : id,
      name: data.name,
      full_name: project.repo_owner && project.repo_name ? `${project.repo_owner}/${project.repo_name}` : data.name,
      description: data.description,
      url: data.repo_url || '',
      clone_url: data.repo_url || '',
      default_branch: 'main',
      is_private: false,
      provider: data.provider || 'Manual',
      owner: project.repo_owner || 'manual',
      updated_at: now
    };
    
    // Add to cache if not already exists
    const existingIndex = cache.repos.findIndex(r => r.id === gitRepo.id);
    if (existingIndex >= 0) {
      cache.repos[existingIndex] = gitRepo;
    } else {
      cache.repos.push(gitRepo);
    }
    
    cache.last_updated = now;
    await fs.writeFile(REPOS_CACHE_FILE, JSON.stringify(cache, null, 2), 'utf8');
  } catch (error) {
    // If no cache exists, create one with this project
    const cache: RepoCache = {
      repos: [{
        id: project.repo_owner && project.repo_name ? `${project.repo_owner}/${project.repo_name}` : id,
        name: data.name,
        full_name: project.repo_owner && project.repo_name ? `${project.repo_owner}/${project.repo_name}` : data.name,
        description: data.description,
        url: data.repo_url || '',
        clone_url: data.repo_url || '',
        default_branch: 'main',
        is_private: false,
        provider: data.provider || 'Manual',
        owner: project.repo_owner || 'manual',
        updated_at: now
      }],
      last_updated: now
    };
    
    await fs.writeFile(REPOS_CACHE_FILE, JSON.stringify(cache, null, 2), 'utf8');
  }
  
  await logActivity({
    action: 'manual_project_created',
    details: { name: data.name, provider: data.provider || 'Manual' }
  });
  
  return project;
}

// Get available Git providers and their status
export async function getProvidersStatus(): Promise<Array<{
  name: string;
  type: string;
  available: boolean;
  repo_count: number;
}>> {
  const providers = await getProviders();
  const repos = await getReposWithCache();
  
  return providers.map(provider => ({
    name: provider.name,
    type: provider.type,
    available: true, // We'll check this in the API
    repo_count: repos.filter(r => r.provider === provider.name).length
  }));
}