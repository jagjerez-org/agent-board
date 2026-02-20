import { NextResponse } from 'next/server';
import { readdir } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';

const WORKSPACE_PATH = '/home/jarvis/.openclaw/workspace/';
const OPENCLAW_CONFIG_PATH = '/home/jarvis/.openclaw/openclaw.json';

interface FileInfo {
  path: string;
  name: string;
  type: 'config' | 'workspace' | 'memory';
}

// GET /api/files/list
export async function GET() {
  try {
    const files: FileInfo[] = [];
    
    // Add key workspace files
    const workspaceFiles = [
      'SOUL.md',
      'AGENTS.md', 
      'USER.md',
      'MEMORY.md',
      'IDENTITY.md',
      'TOOLS.md',
      'HEARTBEAT.md'
    ];
    
    for (const fileName of workspaceFiles) {
      const filePath = join(WORKSPACE_PATH, fileName);
      if (existsSync(filePath)) {
        files.push({
          path: fileName,
          name: fileName,
          type: 'workspace'
        });
      }
    }
    
    // Add openclaw.json config file
    if (existsSync(OPENCLAW_CONFIG_PATH)) {
      files.push({
        path: 'openclaw.json',
        name: 'openclaw.json',
        type: 'config'
      });
    }
    
    // Add memory/*.md files
    const memoryPath = join(WORKSPACE_PATH, 'memory');
    if (existsSync(memoryPath)) {
      try {
        const memoryFiles = await readdir(memoryPath);
        for (const fileName of memoryFiles) {
          if (fileName.endsWith('.md')) {
            files.push({
              path: `memory/${fileName}`,
              name: fileName,
              type: 'memory'
            });
          }
        }
      } catch (error) {
        console.warn('Could not read memory directory:', error);
      }
    }
    
    // Sort files: workspace files first, then config, then memory files
    files.sort((a, b) => {
      const typeOrder = { workspace: 0, config: 1, memory: 2 };
      const typeCompare = typeOrder[a.type] - typeOrder[b.type];
      if (typeCompare !== 0) return typeCompare;
      return a.name.localeCompare(b.name);
    });
    
    return NextResponse.json({ files });
    
  } catch (error) {
    console.error('File list error:', error);
    return NextResponse.json({ error: 'Failed to list files' }, { status: 500 });
  }
}