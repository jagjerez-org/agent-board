import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

interface OpenClawConfig {
  agents?: Record<string, {
    skills?: {
      load?: {
        only?: string[];
      };
    };
    [key: string]: any;
  }>;
  [key: string]: any;
}

// GET /api/skills/agents - get per-agent skill assignments
export async function GET() {
  try {
    const homeDir = process.env.HOME || '/root';
    const configPath = path.join(homeDir, '.openclaw/openclaw.json');
    
    const agentSkills: Record<string, string[]> = {};
    
    try {
      const configContent = await fs.readFile(configPath, 'utf8');
      const config: OpenClawConfig = JSON.parse(configContent);
      
      if (config.agents) {
        for (const [agentName, agentConfig] of Object.entries(config.agents)) {
          const skills = agentConfig.skills?.load?.only;
          if (skills && Array.isArray(skills)) {
            agentSkills[agentName] = skills;
          }
        }
      }
    } catch (error) {
      // Config file doesn't exist or is invalid - return empty assignments
    }
    
    return NextResponse.json({ agentSkills });
  } catch (error) {
    console.error('Error in GET /api/skills/agents:', error);
    return NextResponse.json({ error: 'Failed to get agent skill assignments' }, { status: 500 });
  }
}

// POST /api/skills/agents - update per-agent skill assignments
export async function POST(request: Request) {
  try {
    const { agentId, skills } = await request.json();
    
    if (!agentId) {
      return NextResponse.json({ error: 'Agent ID is required' }, { status: 400 });
    }
    
    if (!Array.isArray(skills)) {
      return NextResponse.json({ error: 'Skills must be an array' }, { status: 400 });
    }
    
    const homeDir = process.env.HOME || '/root';
    const configPath = path.join(homeDir, '.openclaw/openclaw.json');
    
    // Load existing config or create new one
    let config: OpenClawConfig = {};
    
    try {
      const configContent = await fs.readFile(configPath, 'utf8');
      config = JSON.parse(configContent);
    } catch {
      // Config doesn't exist, create new one
      config = {};
    }
    
    // Ensure agents object exists
    if (!config.agents) {
      config.agents = {};
    }
    
    // Ensure agent config exists
    if (!config.agents[agentId]) {
      config.agents[agentId] = {};
    }
    
    // Update skills configuration
    if (skills.length === 0) {
      // Remove skills config if empty
      if (config.agents[agentId].skills?.load) {
        delete config.agents[agentId].skills.load.only;
        if (Object.keys(config.agents[agentId].skills.load).length === 0) {
          delete config.agents[agentId].skills.load;
        }
        if (Object.keys(config.agents[agentId].skills || {}).length === 0) {
          delete config.agents[agentId].skills;
        }
      }
    } else {
      // Set skills
      if (!config.agents[agentId].skills) {
        config.agents[agentId].skills = {};
      }
      if (!config.agents[agentId].skills.load) {
        config.agents[agentId].skills.load = {};
      }
      config.agents[agentId].skills.load.only = skills;
    }
    
    // Write config back
    await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf8');
    
    return NextResponse.json({ 
      message: 'Agent skill assignments updated successfully',
      agentId,
      skills
    });
  } catch (error) {
    console.error('Error in POST /api/skills/agents:', error);
    return NextResponse.json({ error: 'Failed to update agent skill assignments' }, { status: 500 });
  }
}