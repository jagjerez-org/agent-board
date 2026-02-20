import { NextRequest, NextResponse } from 'next/server';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { resolve, dirname } from 'path';
import { existsSync } from 'fs';

// Security: Ensure path is within /tmp/ to prevent arbitrary file access
function validatePath(requestedPath: string): { isValid: boolean; fullPath?: string; error?: string } {
  // Resolve the full path
  const fullPath = resolve(requestedPath);
  
  // Check if resolved path is within /tmp/
  if (!fullPath.startsWith('/tmp/')) {
    return { isValid: false, error: 'Path outside /tmp/ not allowed for security' };
  }
  
  return { isValid: true, fullPath };
}

// GET /api/files/content?path=/tmp/some-worktree/src/index.ts
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
    
    if (!existsSync(fullPath)) {
      return NextResponse.json({ error: 'File does not exist' }, { status: 404 });
    }
    
    try {
      const content = await readFile(fullPath, 'utf-8');
      
      return NextResponse.json({
        path: requestedPath,
        content,
        exists: true
      });
    } catch (error) {
      // Handle binary files or encoding issues
      if ((error as any).code === 'ENOENT') {
        return NextResponse.json({ error: 'File not found' }, { status: 404 });
      } else {
        // Try to read as binary and return error for binary files
        try {
          const buffer = await readFile(fullPath);
          // Simple binary detection - if file contains null bytes, consider it binary
          const isBinary = buffer.includes(0);
          if (isBinary) {
            return NextResponse.json({ 
              error: 'Binary file not supported',
              isBinary: true
            }, { status: 415 });
          }
          // If not binary, it might be an encoding issue - try again as utf-8
          const content = buffer.toString('utf-8');
          return NextResponse.json({
            path: requestedPath,
            content,
            exists: true
          });
        } catch {
          return NextResponse.json({ error: 'Failed to read file' }, { status: 500 });
        }
      }
    }
    
  } catch (error) {
    console.error('File read error:', error);
    return NextResponse.json({ error: 'Failed to read file' }, { status: 500 });
  }
}

// PUT /api/files/content with body { path, content }
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
    const dirPath = dirname(fullPath);
    await mkdir(dirPath, { recursive: true });
    
    await writeFile(fullPath, content, 'utf-8');
    
    return NextResponse.json({ 
      success: true,
      path: requestedPath
    });
    
  } catch (error) {
    console.error('File write error:', error);
    return NextResponse.json({ error: 'Failed to write file' }, { status: 500 });
  }
}