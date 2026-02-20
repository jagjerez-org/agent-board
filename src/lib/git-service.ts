// Git provider integration service
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';

const execAsync = promisify(exec);
const CONFIG_DIR = path.join(process.cwd(), 'data', 'config');
const PROVIDERS_CONFIG = path.join(CONFIG_DIR, 'git-providers.json');

export interface GitProvider {
  type: 'github' | 'gitlab' | 'azure-devops';
  name: string;
  cli: string;
  account?: string;
  orgs: string[];
  // Azure DevOps specific
  azureOrg?: string;      // e.g. "my-azure-org"
  azurePat?: string;       // Personal Access Token
  azureProjects?: string[]; // specific projects to list repos from (optional, all if empty)
}

export interface GitRepo {
  id: string; // owner/name format
  name: string;
  full_name: string;
  description?: string;
  url: string;
  clone_url: string;
  default_branch: string;
  is_private: boolean;
  provider: string;
  owner: string;
  updated_at: string;
}

export interface ProvidersConfig {
  providers: GitProvider[];
}

// Ensure config directory exists
async function ensureConfigDir(): Promise<void> {
  await fs.mkdir(CONFIG_DIR, { recursive: true });
}

// Read providers configuration
export async function getProviders(): Promise<GitProvider[]> {
  try {
    const content = await fs.readFile(PROVIDERS_CONFIG, 'utf8');
    const config: ProvidersConfig = JSON.parse(content);
    return config.providers;
  } catch (error) {
    console.warn('No git providers config found, using defaults');
    return [];
  }
}

// Write providers configuration
export async function saveProviders(providers: GitProvider[]): Promise<void> {
  await ensureConfigDir();
  const config: ProvidersConfig = { providers };
  await fs.writeFile(PROVIDERS_CONFIG, JSON.stringify(config, null, 2), 'utf8');
}

// Add a new provider
export async function addProvider(provider: GitProvider): Promise<void> {
  const providers = await getProviders();
  providers.push(provider);
  await saveProviders(providers);
}

// Remove a provider
export async function removeProvider(providerName: string): Promise<void> {
  const providers = await getProviders();
  const filtered = providers.filter(p => p.name !== providerName);
  await saveProviders(filtered);
}

// Discover repos from GitHub
async function discoverGitHubRepos(provider: GitProvider): Promise<GitRepo[]> {
  const repos: GitRepo[] = [];
  
  try {
    // Get user repos
    const userCmd = `${provider.cli} repo list --json name,url,description,defaultBranchRef,isPrivate,owner,updatedAt --limit 50`;
    const { stdout: userOutput } = await execAsync(userCmd);
    const userRepos = JSON.parse(userOutput);
    
    for (const repo of userRepos) {
      repos.push({
        id: `${repo.owner.login}/${repo.name}`,
        name: repo.name,
        full_name: `${repo.owner.login}/${repo.name}`,
        description: repo.description,
        url: repo.url,
        clone_url: repo.url + '.git',
        default_branch: repo.defaultBranchRef?.name || 'main',
        is_private: repo.isPrivate,
        provider: provider.name,
        owner: repo.owner.login,
        updated_at: repo.updatedAt
      });
    }

    // Get org repos
    for (const org of provider.orgs) {
      try {
        const orgCmd = `${provider.cli} repo list ${org} --json name,url,description,defaultBranchRef,isPrivate,owner,updatedAt --limit 50`;
        const { stdout: orgOutput } = await execAsync(orgCmd);
        const orgRepos = JSON.parse(orgOutput);
        
        for (const repo of orgRepos) {
          repos.push({
            id: `${repo.owner.login}/${repo.name}`,
            name: repo.name,
            full_name: `${repo.owner.login}/${repo.name}`,
            description: repo.description,
            url: repo.url,
            clone_url: repo.url + '.git',
            default_branch: repo.defaultBranchRef?.name || 'main',
            is_private: repo.isPrivate,
            provider: provider.name,
            owner: repo.owner.login,
            updated_at: repo.updatedAt
          });
        }
      } catch (error) {
        console.warn(`Failed to fetch repos for org ${org}:`, error);
      }
    }
  } catch (error) {
    console.error(`Failed to fetch GitHub repos for ${provider.name}:`, error);
  }
  
  return repos;
}

// Discover repos from GitLab
async function discoverGitLabRepos(provider: GitProvider): Promise<GitRepo[]> {
  const repos: GitRepo[] = [];
  
  try {
    // Resolve ~ to HOME for CLI path
    const cli = provider.cli.startsWith('~/')
      ? path.join(process.env.HOME || '/root', provider.cli.slice(2))
      : provider.cli;
    const cmd = `${cli} repo list --mine --output json`;
    const { stdout } = await execAsync(cmd);
    const gitlabRepos = JSON.parse(stdout);
    
    for (const repo of gitlabRepos) {
      repos.push({
        id: `${repo.namespace?.full_path || repo.namespace?.name || 'unknown'}/${repo.name}`,
        name: repo.name,
        full_name: `${repo.namespace?.full_path || repo.namespace?.name || 'unknown'}/${repo.name}`,
        description: repo.description,
        url: repo.web_url,
        clone_url: repo.ssh_url_to_repo,
        default_branch: repo.default_branch,
        is_private: repo.visibility === 'private',
        provider: provider.name,
        owner: repo.namespace?.full_path || repo.namespace?.name || 'unknown',
        updated_at: repo.last_activity_at
      });
    }
  } catch (error) {
    console.error(`Failed to fetch GitLab repos for ${provider.name}:`, error);
  }

  // Fetch repos from configured orgs (groups or users)
  const cli = provider.cli.startsWith('~/')
    ? path.join(process.env.HOME || '/root', provider.cli.slice(2))
    : provider.cli;
  
  for (const org of (provider.orgs || [])) {
    try {
      // Try as group first
      const groupRes = await execAsync(`${cli} api "/groups?search=${encodeURIComponent(org)}" 2>/dev/null`);
      const groups = JSON.parse(groupRes.stdout);
      const group = groups.find((g: { full_path: string }) => g.full_path === org);
      
      if (group) {
        // It's a group — fetch group projects
        const projRes = await execAsync(`${cli} api "/groups/${group.id}/projects?per_page=100"`);
        const projects = JSON.parse(projRes.stdout);
        for (const repo of projects) {
          const id = `${repo.namespace?.full_path || org}/${repo.name}`;
          if (!repos.find(r => r.id === id)) {
            repos.push({
              id,
              name: repo.name,
              full_name: id,
              description: repo.description || '',
              url: repo.web_url,
              clone_url: repo.ssh_url_to_repo,
              default_branch: repo.default_branch || 'main',
              is_private: repo.visibility === 'private',
              provider: provider.name,
              owner: repo.namespace?.full_path || org,
              updated_at: repo.last_activity_at || new Date().toISOString(),
            });
          }
        }
      } else {
        // Try as user
        const userRes = await execAsync(`${cli} api "/users?username=${encodeURIComponent(org)}" 2>/dev/null`);
        const users = JSON.parse(userRes.stdout);
        if (users.length > 0) {
          const projRes = await execAsync(`${cli} api "/users/${users[0].id}/projects?per_page=100"`);
          const projects = JSON.parse(projRes.stdout);
          for (const repo of projects) {
            const id = `${repo.namespace?.full_path || org}/${repo.name}`;
            if (!repos.find(r => r.id === id)) {
              repos.push({
                id,
                name: repo.name,
                full_name: id,
                description: repo.description || '',
                url: repo.web_url,
                clone_url: repo.ssh_url_to_repo,
                default_branch: repo.default_branch || 'main',
                is_private: repo.visibility === 'private',
                provider: provider.name,
                owner: repo.namespace?.full_path || org,
                updated_at: repo.last_activity_at || new Date().toISOString(),
              });
            }
          }
        }
      }
    } catch (error) {
      console.warn(`Failed to fetch GitLab repos for org/user ${org}:`, error);
    }
  }
  
  return repos;
}

// Discover repos from Azure DevOps
async function discoverAzureDevOpsRepos(provider: GitProvider): Promise<GitRepo[]> {
  const repos: GitRepo[] = [];
  
  if (!provider.azureOrg || !provider.azurePat) {
    console.warn(`Azure DevOps provider "${provider.name}" missing azureOrg or azurePat`);
    return repos;
  }
  
  const headers = {
    'Authorization': `Basic ${Buffer.from(`:${provider.azurePat}`).toString('base64')}`,
    'Content-Type': 'application/json',
  };
  const baseUrl = `https://dev.azure.com/${provider.azureOrg}`;
  
  try {
    // Get projects first
    let projectNames: string[] = provider.azureProjects || [];
    
    if (projectNames.length === 0) {
      const projRes = await fetch(`${baseUrl}/_apis/projects?api-version=7.1`, { headers });
      if (!projRes.ok) throw new Error(`Azure API error: ${projRes.status}`);
      const projData = await projRes.json();
      projectNames = projData.value.map((p: { name: string }) => p.name);
    }
    
    // Get repos for each project
    for (const project of projectNames) {
      try {
        const repoRes = await fetch(
          `${baseUrl}/${encodeURIComponent(project)}/_apis/git/repositories?api-version=7.1`,
          { headers }
        );
        if (!repoRes.ok) continue;
        const repoData = await repoRes.json();
        
        for (const repo of repoData.value) {
          repos.push({
            id: `${provider.azureOrg}/${project}/${repo.name}`,
            name: repo.name,
            full_name: `${project}/${repo.name}`,
            description: repo.project?.description || '',
            url: repo.webUrl,
            clone_url: repo.remoteUrl,
            default_branch: (repo.defaultBranch || 'refs/heads/main').replace('refs/heads/', ''),
            is_private: true, // Azure DevOps repos are always private by default
            provider: provider.name,
            owner: project,
            updated_at: repo.project?.lastUpdateTime || new Date().toISOString(),
          });
        }
      } catch (error) {
        console.warn(`Failed to fetch Azure repos for project ${project}:`, error);
      }
    }
  } catch (error) {
    console.error(`Failed to fetch Azure DevOps repos for ${provider.name}:`, error);
  }
  
  return repos;
}

// Discover all repos from all providers
export async function discoverAllRepos(): Promise<GitRepo[]> {
  const providers = await getProviders();
  const allRepos: GitRepo[] = [];
  
  for (const provider of providers) {
    let repos: GitRepo[] = [];
    
    if (provider.type === 'github') {
      repos = await discoverGitHubRepos(provider);
    } else if (provider.type === 'gitlab') {
      repos = await discoverGitLabRepos(provider);
    } else if (provider.type === 'azure-devops') {
      repos = await discoverAzureDevOpsRepos(provider);
    }
    
    allRepos.push(...repos);
  }
  
  // Remove duplicates based on full_name
  const uniqueRepos = allRepos.filter((repo, index, self) => 
    index === self.findIndex(r => r.full_name === repo.full_name)
  );
  
  // Sort by updated date (most recent first)
  return uniqueRepos.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
}

// Create a new repository
export async function createRepo(
  provider: GitProvider,
  owner: string,
  name: string,
  options: {
    private?: boolean;
    description?: string;
  } = {}
): Promise<GitRepo | null> {
  try {
    if (provider.type === 'github') {
      const privateFlag = options.private ? '--private' : '--public';
      const descFlag = options.description ? `--description "${options.description}"` : '';
      
      const createCmd = `${provider.cli} repo create ${owner}/${name} ${privateFlag} ${descFlag} --confirm`;
      await execAsync(createCmd);
      
      // Set up branch protection
      try {
        const protectionCmd = `${provider.cli} api repos/${owner}/${name}/branches/main/protection -X PUT --input - << 'EOF'
{
  "required_status_checks": null,
  "enforce_admins": false,
  "required_pull_request_reviews": {
    "required_approving_review_count": 1,
    "dismiss_stale_reviews": true
  },
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false
}
EOF`;
        await execAsync(protectionCmd);
      } catch (error) {
        console.warn('Failed to set up branch protection:', error);
      }
      
      // Return the created repo
      const repos = await discoverGitHubRepos(provider);
      return repos.find(r => r.full_name === `${owner}/${name}`) || null;
    }
    
    if (provider.type === 'gitlab') {
      const privateFlag = options.private ? '--private' : '--public';
      const descFlag = options.description ? `--description "${options.description}"` : '';
      
      const createCmd = `${provider.cli} repo create ${name} ${privateFlag} ${descFlag}`;
      await execAsync(createCmd);
      
      // Return the created repo
      const repos = await discoverGitLabRepos(provider);
      return repos.find(r => r.name === name) || null;
    }
  } catch (error) {
    console.error(`Failed to create repo ${owner}/${name}:`, error);
    return null;
  }
  
  return null;
}

// Check if a CLI tool is available
export async function checkCliAvailable(cli: string): Promise<boolean> {
  try {
    await execAsync(`which ${cli}`);
    return true;
  } catch {
    return false;
  }
}

// Get available Git orgs/accounts for a provider
export async function getAvailableOrgs(provider: GitProvider): Promise<string[]> {
  try {
    if (provider.type === 'github') {
      // Get user info and orgs
      const userCmd = `${provider.cli} api /user --jq '.login'`;
      const orgsCmd = `${provider.cli} api /user/orgs --jq '.[].login'`;
      
      const [userResult, orgsResult] = await Promise.allSettled([
        execAsync(userCmd),
        execAsync(orgsCmd)
      ]);
      
      const orgs: string[] = [];
      
      if (userResult.status === 'fulfilled') {
        orgs.push(userResult.value.stdout.trim());
      }
      
      if (orgsResult.status === 'fulfilled') {
        const orgList = orgsResult.value.stdout.trim().split('\n').filter(Boolean);
        orgs.push(...orgList);
      }
      
      return orgs;
    }
    
    if (provider.type === 'gitlab') {
      // For GitLab, we typically work with the authenticated user's namespace
      const cmd = `${provider.cli} api user --jq '.username'`;
      const { stdout } = await execAsync(cmd);
      return [stdout.trim()];
    }
  } catch (error) {
    console.error(`Failed to get orgs for ${provider.name}:`, error);
  }
  
  return [];
}