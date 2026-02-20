import { NextRequest, NextResponse } from 'next/server';
import { readFile, writeFile } from 'fs/promises';
import { join, resolve, relative } from 'path';
import { existsSync } from 'fs';

const WORKSPACE_PATH = '/home/jarvis/.openclaw/workspace/';
const ALLOWED_EXTENSIONS = ['.md', '.json', '.yml', '.yaml'];

// Security: Ensure path is within workspace and has allowed extension
function validatePath(requestedPath: string): { isValid: boolean; fullPath?: string; error?: string } {
  // Remove leading slash and resolve path
  const cleanPath = requestedPath.replace(/^\/+/, '');
  const fullPath = resolve(join(WORKSPACE_PATH, cleanPath));
  
  // Check if resolved path is within workspace (prevent path traversal)
  const relativePath = relative(WORKSPACE_PATH, fullPath);
  if (relativePath.startsWith('..') || relativePath === '') {
    return { isValid: false, error: 'Path outside workspace not allowed' };
  }
  
  // Check file extension
  const hasAllowedExtension = ALLOWED_EXTENSIONS.some(ext => fullPath.endsWith(ext));
  if (!hasAllowedExtension) {
    return { isValid: false, error: `Only ${ALLOWED_EXTENSIONS.join(', ')} files allowed` };
  }
  
  return { isValid: true, fullPath };
}

// GET /api/files?path=<relative-path>
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const requestedPath = searchParams.get('path');
    
    if (!requestedPath) {
      return NextResponse.json({ error: 'Path parameter required' }, { status: 400 });
    }
    
    const validation = validatePath(requestedPath);
    if (!validation.isValid) {
      return NextResponse.json({ error: validation.error }, { status: 403 });
    }
    
    const fullPath = validation.fullPath!;
    const exists = existsSync(fullPath);
    
    if (!exists) {
      return NextResponse.json({ 
        path: requestedPath, 
        content: '', 
        exists: false 
      });
    }
    
    const content = await readFile(fullPath, 'utf-8');
    
    return NextResponse.json({
      path: requestedPath,
      content,
      exists: true
    });
    
  } catch (error) {
    console.error('File read error:', error);
    return NextResponse.json({ error: 'Failed to read file' }, { status: 500 });
  }
}

// PUT /api/files with body { path, content }
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { path: requestedPath, content } = body;
    
    if (!requestedPath || content === undefined) {
      return NextResponse.json({ error: 'Path and content required' }, { status: 400 });
    }
    
    const validation = validatePath(requestedPath);
    if (!validation.isValid) {
      return NextResponse.json({ error: validation.error }, { status: 403 });
    }
    
    const fullPath = validation.fullPath!;
    
    // Ensure directory exists
    const { mkdir } = await import('fs/promises');
    const { dirname } = await import('path');
    await mkdir(dirname(fullPath), { recursive: true });
    
    await writeFile(fullPath, content, 'utf-8');
    
    return NextResponse.json({ success: true });
    
  } catch (error) {
    console.error('File write error:', error);
    return NextResponse.json({ error: 'Failed to write file' }, { status: 500 });
  }
}