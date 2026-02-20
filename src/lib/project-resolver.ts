import fs from 'fs/promises';
import path from 'path';

const PROJECTS_DIR = path.join(process.cwd(), 'data', 'projects');

/**
 * Resolve a project ID (dash-format like "educabrera1997-ALA APP") 
 * to repo-style path (slash-format like "educabrera1997/ALA APP").
 * If already in slash format, returns as-is.
 */
export async function resolveProjectId(projectId: string): Promise<string> {
  // Already in owner/name format
  if (projectId.includes('/')) return projectId;
  
  // Try to find in saved projects
  try {
    const files = await fs.readdir(PROJECTS_DIR);
    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      try {
        const content = await fs.readFile(path.join(PROJECTS_DIR, file), 'utf8');
        const proj = JSON.parse(content);
        if (proj.id === projectId && proj.repo_owner) {
          return `${proj.repo_owner}/${proj.repo_name || proj.name}`;
        }
      } catch { /* skip invalid files */ }
    }
  } catch { /* no saved projects dir */ }
  
  // Fallback: convert first dash to slash
  const dashIdx = projectId.indexOf('-');
  if (dashIdx > 0) {
    return projectId.substring(0, dashIdx) + '/' + projectId.substring(dashIdx + 1);
  }
  
  return projectId;
}
