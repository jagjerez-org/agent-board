import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

interface SkillInfo {
  name: string;
  description: string;
  location: string;
  source: 'builtin' | 'workspace' | 'agent';
}

async function getSkillDescription(skillDir: string): Promise<string> {
  try {
    const skillMd = path.join(skillDir, 'SKILL.md');
    const content = await fs.readFile(skillMd, 'utf8');
    // Get first non-empty, non-header line
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#') && trimmed !== '---') {
        return trimmed.slice(0, 150);
      }
    }
    return '';
  } catch {
    return '';
  }
}

async function discoverSkills(dir: string, source: SkillInfo['source']): Promise<SkillInfo[]> {
  const skills: SkillInfo[] = [];
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const skillPath = path.join(dir, entry.name);
        const description = await getSkillDescription(skillPath);
        skills.push({
          name: entry.name,
          description,
          location: skillPath,
          source,
        });
      }
    }
  } catch { /* dir doesn't exist */ }
  return skills.sort((a, b) => a.name.localeCompare(b.name));
}

// GET /api/skills
export async function GET() {
  try {
    const homeDir = process.env.HOME || '/root';
    
    // Built-in skills (OpenClaw package)
    const builtinDir = path.join(homeDir, '.npm-global/lib/node_modules/openclaw/skills');
    const builtin = await discoverSkills(builtinDir, 'builtin');
    
    // Workspace skills (custom)
    const workspaceDir = path.join(homeDir, '.openclaw/workspace/skills');
    const workspace = await discoverSkills(workspaceDir, 'workspace');
    
    // Read openclaw.json for agent-specific skill configs
    let agentSkills: Record<string, string[]> = {};
    try {
      const configPath = path.join(homeDir, '.openclaw/openclaw.json');
      const config = JSON.parse(await fs.readFile(configPath, 'utf8'));
      
      // Check which skills are available (from available_skills in agent system prompt)
      // All agents inherit global skills unless overridden
      const agents = config.agents || {};
      for (const [agentName, agentConfig] of Object.entries(agents)) {
        const ac = agentConfig as Record<string, unknown>;
        const skills = ac.skills as Record<string, unknown> | undefined;
        if (skills?.load) {
          const load = skills.load as Record<string, unknown>;
          agentSkills[agentName] = (load.only as string[]) || [];
        }
      }
    } catch { /* no config */ }
    
    return NextResponse.json({
      builtin,
      workspace,
      agentSkills,
      total: builtin.length + workspace.length,
    });
  } catch (error) {
    console.error('Error in GET /api/skills:', error);
    return NextResponse.json({ error: 'Failed to list skills' }, { status: 500 });
  }
}
