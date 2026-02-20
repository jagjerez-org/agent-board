import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

// GET /api/skills/[name] - get skill detail
export async function GET(request: Request, { params }: { params: Promise<{ name: string }> }) {
  try {
    const { name } = await params;
    const homeDir = process.env.HOME || '/root';
    
    // Try workspace first, then builtin
    const workspaceDir = path.join(homeDir, '.openclaw/workspace/skills', name);
    const builtinDir = path.join(homeDir, '.npm-global/lib/node_modules/openclaw/skills', name);
    
    let skillDir: string;
    let source: 'workspace' | 'builtin';
    
    try {
      await fs.access(workspaceDir);
      skillDir = workspaceDir;
      source = 'workspace';
    } catch {
      try {
        await fs.access(builtinDir);
        skillDir = builtinDir;
        source = 'builtin';
      } catch {
        return NextResponse.json({ error: 'Skill not found' }, { status: 404 });
      }
    }
    
    // Read SKILL.md
    const skillMd = path.join(skillDir, 'SKILL.md');
    let content = '';
    let description = '';
    
    try {
      content = await fs.readFile(skillMd, 'utf8');
      // Extract description from first non-header, non-empty line
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#') && trimmed !== '---') {
          description = trimmed;
          break;
        }
      }
    } catch {
      content = '# Skill not found\n\nSKILL.md file is missing or unreadable.';
    }
    
    return NextResponse.json({
      name,
      source,
      location: skillDir,
      description,
      content,
    });
  } catch (error) {
    console.error('Error in GET /api/skills/[name]:', error);
    return NextResponse.json({ error: 'Failed to get skill' }, { status: 500 });
  }
}

// PUT /api/skills/[name] - update workspace skill
export async function PUT(request: Request, { params }: { params: Promise<{ name: string }> }) {
  try {
    const { name } = await params;
    const { content } = await request.json();
    
    if (!content) {
      return NextResponse.json({ error: 'Content is required' }, { status: 400 });
    }
    
    const homeDir = process.env.HOME || '/root';
    const skillDir = path.join(homeDir, '.openclaw/workspace/skills', name);
    
    // Check if it's a workspace skill (only workspace skills can be edited)
    try {
      await fs.access(skillDir);
    } catch {
      return NextResponse.json({ error: 'Only workspace skills can be edited' }, { status: 400 });
    }
    
    // Write SKILL.md
    const skillMd = path.join(skillDir, 'SKILL.md');
    await fs.writeFile(skillMd, content, 'utf8');
    
    return NextResponse.json({ message: 'Skill updated successfully' });
  } catch (error) {
    console.error('Error in PUT /api/skills/[name]:', error);
    return NextResponse.json({ error: 'Failed to update skill' }, { status: 500 });
  }
}

// DELETE /api/skills/[name] - delete workspace skill
export async function DELETE(request: Request, { params }: { params: Promise<{ name: string }> }) {
  try {
    const { name } = await params;
    const homeDir = process.env.HOME || '/root';
    const skillDir = path.join(homeDir, '.openclaw/workspace/skills', name);
    
    // Check if it's a workspace skill (only workspace skills can be deleted)
    try {
      await fs.access(skillDir);
    } catch {
      return NextResponse.json({ error: 'Skill not found or not a workspace skill' }, { status: 404 });
    }
    
    // Delete the entire skill directory
    await fs.rm(skillDir, { recursive: true, force: true });
    
    return NextResponse.json({ message: 'Skill deleted successfully' });
  } catch (error) {
    console.error('Error in DELETE /api/skills/[name]:', error);
    return NextResponse.json({ error: 'Failed to delete skill' }, { status: 500 });
  }
}