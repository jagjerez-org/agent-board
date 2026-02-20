// Git Worktree service for managing parallel branch checkouts
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs/promises';

const execAsync = promisify(exec);
const PROJECTS_DIR = path.join(process.cwd(), 'data', 'projects');

export interface Worktree {
  path: string;
  branch: string;
  commit: string;
  isMain: boolean;
}

export interface Branch {
  name: string;
  isRemote: boolean;
  isCurrent: boolean;
  hasWorktree: boolean;
}

// Parse git worktree list --porcelain output
export async function listWorktrees(repoPath: string): Promise<Worktree[]> {
  try {
    const { stdout } = await execAsync('git worktree list --porcelain', { cwd: repoPath });
    const worktrees: Worktree[] = [];
    
    const lines = stdout.trim().split('\n');
    let currentWorktree: Partial<Worktree> = {};
    
    for (const line of lines) {
      if (line.startsWith('worktree ')) {
        // Start of new worktree
        if (currentWorktree.path) {
          worktrees.push(currentWorktree as Worktree);
        }
        currentWorktree = {
          path: line.substring('worktree '.length),
          isMain: false
        };
      } else if (line.startsWith('HEAD ')) {
        currentWorktree.commit = line.substring('HEAD '.length);
      } else if (line.startsWith('branch ')) {
        currentWorktree.branch = line.substring('branch refs/heads/'.length);
      } else if (line === 'bare') {
        // Skip bare repositories
        currentWorktree = {};
      } else if (line === 'detached') {
        currentWorktree.branch = 'HEAD';
      }
    }
    
    // Add the last worktree
    if (currentWorktree.path) {
      worktrees.push(currentWorktree as Worktree);
    }
    
    // Mark main worktree
    if (worktrees.length > 0) {
      worktrees[0].isMain = true;
    }
    
    return worktrees;
  } catch (error) {
    console.error('Error listing worktrees:', error);
    return [];
  }
}

// Create a new worktree
export async function addWorktree(
  repoPath: string, 
  branch: string, 
  createBranch: boolean = false
): Promise<{ success: boolean; path?: string; error?: string }> {
  try {
    // Sanitize branch name for directory
    const safeBranchName = branch.replace(/[^a-zA-Z0-9\-_]/g, '-');
    const worktreePath = `${repoPath}-worktrees/${safeBranchName}`;
    
    // Create worktrees directory if it doesn't exist
    const worktreesDir = path.dirname(worktreePath);
    await fs.mkdir(worktreesDir, { recursive: true });
    
    let command: string;
    if (createBranch) {
      command = `git worktree add -b "${branch}" "${worktreePath}"`;
    } else {
      command = `git worktree add "${worktreePath}" "${branch}"`;
    }
    
    await execAsync(command, { cwd: repoPath });
    
    return { success: true, path: worktreePath };
  } catch (error: any) {
    console.error('Error creating worktree:', error);
    return { 
      success: false, 
      error: error.message || 'Failed to create worktree' 
    };
  }
}

// Remove a worktree
export async function removeWorktree(
  repoPath: string, 
  branch: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const safeBranchName = branch.replace(/[^a-zA-Z0-9\-_]/g, '-');
    const worktreePath = `${repoPath}-worktrees/${safeBranchName}`;
    
    await execAsync(`git worktree remove "${worktreePath}"`, { cwd: repoPath });
    
    return { success: true };
  } catch (error: any) {
    console.error('Error removing worktree:', error);
    return { 
      success: false, 
      error: error.message || 'Failed to remove worktree' 
    };
  }
}

// List all branches (local + remote)
export async function listBranches(repoPath: string): Promise<Branch[]> {
  try {
    const { stdout } = await execAsync('git branch -a --format=\'%(refname:short)|%(if)%(HEAD)%(then)current%(else)%(end)\'', { cwd: repoPath });
    const worktrees = await listWorktrees(repoPath);
    const worktreeBranches = new Set(worktrees.map(w => w.branch));
    
    const branches: Branch[] = [];
    
    for (const line of stdout.trim().split('\n').filter(Boolean)) {
      const [name, currentFlag] = line.split('|');
      if (!name) continue;
      
      // Skip HEAD pointer
      if (name.includes(' -> ')) continue;
      
      const isRemote = name.startsWith('origin/');
      const cleanName = isRemote ? name.substring('origin/'.length) : name;
      
      // Skip if we already have this branch (avoid duplicates between local and remote)
      if (branches.some(b => b.name === cleanName)) continue;
      
      branches.push({
        name: cleanName,
        isRemote,
        isCurrent: currentFlag === 'current',
        hasWorktree: worktreeBranches.has(cleanName)
      });
    }
    
    return branches.sort((a, b) => a.name.localeCompare(b.name));
  } catch (error) {
    console.error('Error listing branches:', error);
    return [];
  }
}

// Get local repository path for a project
export async function getRepoPath(projectId: string): Promise<string | null> {
  try {
    // Try to read project data
    const projectFile = path.join(PROJECTS_DIR, `${projectId}.json`);
    
    try {
      const content = await fs.readFile(projectFile, 'utf8');
      const project = JSON.parse(content);
      
      // Return local_path if it exists
      if (project.local_path) {
        return project.local_path;
      }
      
      // Try to infer from repo_url or name
      if (project.repo_url) {
        const repoName = project.repo_url.split('/').pop()?.replace('.git', '') || project.name;
        const potentialPaths = [
          `/tmp/${repoName}`,
          `/home/${process.env.USER}/${repoName}`,
          path.join(process.cwd(), 'repos', repoName),
        ];
        
        // Check which path exists
        for (const potentialPath of potentialPaths) {
          try {
            await fs.access(path.join(potentialPath, '.git'));
            // Update project with local_path
            project.local_path = potentialPath;
            await fs.writeFile(projectFile, JSON.stringify(project, null, 2));
            return potentialPath;
          } catch {
            // Path doesn't exist, continue
          }
        }
      }
    } catch {
      // Project file doesn't exist, this might be a direct project ID
    }
    
    // Try direct paths based on project ID
    const safeName = projectId.split('/').pop()?.toLowerCase().replace(/\s+/g, '-') || projectId;
    const directPaths = [
      `/tmp/${projectId}`,
      `/tmp/${safeName}`,
    ];
    
    for (const directPath of directPaths) {
      try {
        await fs.access(path.join(directPath, '.git'));
        return directPath;
      } catch {
        // Path doesn't exist, continue
      }
    }
    
    return null;
  } catch (error) {
    console.error('Error getting repo path:', error);
    return null;
  }
}

// Helper to check if a directory is a git repository
export async function isGitRepo(path: string): Promise<boolean> {
  try {
    await execAsync('git rev-parse --git-dir', { cwd: path });
    return true;
  } catch {
    return false;
  }
}

// Get worktree info for a specific branch
export async function getWorktreeForBranch(repoPath: string, branch: string): Promise<Worktree | null> {
  const worktrees = await listWorktrees(repoPath);
  return worktrees.find(w => w.branch === branch) || null;
}