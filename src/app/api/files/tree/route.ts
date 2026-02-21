import { NextRequest, NextResponse } from 'next/server';
import { readdir, stat } from 'fs/promises';
import { join, resolve, relative } from 'path';
import { existsSync } from 'fs';

interface TreeNode {
  name: string;
  path: string;
  type: 'file' | 'dir';
  children?: TreeNode[];
}

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

// Directories and files to exclude from the tree
const EXCLUDED_PATTERNS = [
  'node_modules',
  '.git',
  '.next',
  '.dart_tool',
  'build',
  '.flutter-plugins',
  '.flutter-plugins-dependencies',
  '.packages',
  'pubspec.lock',
  '.metadata',
  'ios',
  'android',
  'windows',
  'macos',
  'linux',
  'web/favicon.png',
  'coverage',
  'dist',
  'out',
  '.nyc_output',
  '*.log',
  '.DS_Store',
  'Thumbs.db'
];

function shouldExclude(name: string, path: string): boolean {
  return EXCLUDED_PATTERNS.some(pattern => {
    if (pattern.includes('*')) {
      // Simple wildcard matching
      const regex = new RegExp(pattern.replace('*', '.*'));
      return regex.test(name);
    }
    return name === pattern || path.endsWith(`/${pattern}`);
  });
}

async function buildTree(dirPath: string, maxDepth = 3, currentDepth = 0): Promise<TreeNode[]> {
  if (currentDepth >= maxDepth) {
    return [];
  }

  try {
    const entries = await readdir(dirPath, { withFileTypes: true });
    const nodes: TreeNode[] = [];

    for (const entry of entries) {
      const entryPath = join(dirPath, entry.name);
      
      // Skip excluded files/directories
      if (shouldExclude(entry.name, entryPath)) {
        continue;
      }

      const node: TreeNode = {
        name: entry.name,
        path: entryPath,
        type: entry.isDirectory() ? 'dir' : 'file'
      };

      // For directories, load children if within depth, otherwise mark as expandable
      if (entry.isDirectory()) {
        if (currentDepth < maxDepth - 1) {
          try {
            node.children = await buildTree(entryPath, maxDepth, currentDepth + 1);
          } catch {
            node.children = [];
          }
        } else {
          // Don't set children — frontend knows it can lazy-load
          node.children = undefined;
        }
      }

      nodes.push(node);
    }

    // Sort: directories first, then files, both alphabetically
    return nodes.sort((a, b) => {
      if (a.type !== b.type) {
        return a.type === 'dir' ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });

  } catch (error) {
    console.error('Error reading directory:', dirPath, error);
    return [];
  }
}

// GET /api/files/tree?path=/tmp/some-worktree&depth=2
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const requestedPath = searchParams.get('path');
    const depthParam = searchParams.get('depth');
    
    if (!requestedPath) {
      return NextResponse.json({ error: 'Path parameter required' }, { status: 400 });
    }
    
    const validation = validatePath(requestedPath);
    if (!validation.isValid) {
      return NextResponse.json({ error: validation.error }, { status: 403 });
    }
    
    const fullPath = validation.fullPath!;
    
    if (!existsSync(fullPath)) {
      return NextResponse.json({ error: 'Path does not exist' }, { status: 404 });
    }
    
    const pathStat = await stat(fullPath);
    if (!pathStat.isDirectory()) {
      return NextResponse.json({ error: 'Path is not a directory' }, { status: 400 });
    }
    
    const maxDepth = depthParam ? parseInt(depthParam, 10) : 4;
    const tree = await buildTree(fullPath, Math.min(maxDepth, 10));
    
    return NextResponse.json({
      path: requestedPath,
      tree
    });
    
  } catch (error) {
    console.error('File tree error:', error);
    return NextResponse.json({ error: 'Failed to read directory tree' }, { status: 500 });
  }
}