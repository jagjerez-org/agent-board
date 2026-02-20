import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

// POST /api/skills/create - create new workspace skill
export async function POST(request: Request) {
  try {
    const { name, content } = await request.json();
    
    if (!name || !content) {
      return NextResponse.json({ error: 'Name and content are required' }, { status: 400 });
    }
    
    // Validate skill name (alphanumeric, hyphens, underscores only)
    if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
      return NextResponse.json({ 
        error: 'Skill name can only contain letters, numbers, hyphens, and underscores' 
      }, { status: 400 });
    }
    
    const homeDir = process.env.HOME || '/root';
    const skillsDir = path.join(homeDir, '.openclaw/workspace/skills');
    const skillDir = path.join(skillsDir, name);
    
    // Check if skill already exists
    try {
      await fs.access(skillDir);
      return NextResponse.json({ error: 'Skill already exists' }, { status: 409 });
    } catch {
      // Good, skill doesn't exist
    }
    
    // Also check builtin skills
    const builtinDir = path.join(homeDir, '.npm-global/lib/node_modules/openclaw/skills', name);
    try {
      await fs.access(builtinDir);
      return NextResponse.json({ error: 'A builtin skill with this name already exists' }, { status: 409 });
    } catch {
      // Good, no builtin conflict
    }
    
    // Create skills directory if it doesn't exist
    await fs.mkdir(skillsDir, { recursive: true });
    
    // Create skill directory
    await fs.mkdir(skillDir, { recursive: true });
    
    // Write SKILL.md
    const skillMd = path.join(skillDir, 'SKILL.md');
    await fs.writeFile(skillMd, content, 'utf8');
    
    return NextResponse.json({ 
      message: 'Skill created successfully',
      name,
      location: skillDir
    });
  } catch (error) {
    console.error('Error in POST /api/skills/create:', error);
    return NextResponse.json({ error: 'Failed to create skill' }, { status: 500 });
  }
}