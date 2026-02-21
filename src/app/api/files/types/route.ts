import { NextRequest, NextResponse } from 'next/server';
import { resolve, join, dirname } from 'path';
import { readFile, readdir, stat, access } from 'fs/promises';

function validatePath(requestedPath: string): { isValid: boolean; fullPath?: string; error?: string } {
  const fullPath = resolve(requestedPath);
  if (!fullPath.startsWith('/tmp/')) {
    return { isValid: false, error: 'Path outside /tmp/ not allowed' };
  }
  return { isValid: true, fullPath };
}

async function fileExists(p: string): Promise<boolean> {
  try { await access(p); return true; } catch { return false; }
}

// Find the node_modules directory by walking up from the project path
async function findNodeModules(projectPath: string): Promise<string | null> {
  let current = projectPath;
  for (let i = 0; i < 10; i++) {
    const nm = join(current, 'node_modules');
    if (await fileExists(nm)) return nm;
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return null;
}

// Resolve a package's type entry point
async function resolvePackageTypes(nodeModules: string, packageName: string): Promise<{ files: Array<{ path: string; content: string }> }> {
  const files: Array<{ path: string; content: string }> = [];
  
  // Handle scoped packages
  const pkgDir = join(nodeModules, packageName);
  
  // Check @types package first
  const atTypesName = packageName.startsWith('@') 
    ? `@types/${packageName.slice(1).replace('/', '__')}` 
    : `@types/${packageName}`;
  const atTypesDir = join(nodeModules, atTypesName);
  
  // Try @types first
  let typesDir = '';
  if (await fileExists(join(atTypesDir, 'index.d.ts'))) {
    typesDir = atTypesDir;
  } else if (await fileExists(pkgDir)) {
    typesDir = pkgDir;
  } else {
    return { files };
  }

  // Read package.json to find types entry
  let typesEntry = 'index.d.ts';
  try {
    const pkgJson = JSON.parse(await readFile(join(typesDir, 'package.json'), 'utf8'));
    typesEntry = pkgJson.types || pkgJson.typings || pkgJson.exports?.['.']?.types || 'index.d.ts';
    // Remove leading ./
    typesEntry = typesEntry.replace(/^\.\//, '');
  } catch { /* use default */ }

  // Read the main types file
  const mainTypesPath = join(typesDir, typesEntry);
  if (await fileExists(mainTypesPath)) {
    try {
      const content = await readFile(mainTypesPath, 'utf8');
      const uri = `file:///node_modules/${typesDir === atTypesDir ? atTypesName : packageName}/${typesEntry}`;
      files.push({ path: uri, content });
      
      // Also load referenced files (basic: look for /// <reference and imports)
      const refs = content.matchAll(/(?:\/\/\/\s*<reference\s+path="([^"]+)"|from\s+['"]\.\/([^'"]+)['"])/g);
      for (const ref of refs) {
        const refPath = ref[1] || ref[2];
        if (refPath) {
          let fullRef = join(dirname(mainTypesPath), refPath);
          if (!fullRef.endsWith('.d.ts') && !fullRef.endsWith('.ts')) fullRef += '.d.ts';
          if (await fileExists(fullRef)) {
            try {
              const refContent = await readFile(fullRef, 'utf8');
              const refUri = `file:///node_modules/${typesDir === atTypesDir ? atTypesName : packageName}/${join(dirname(typesEntry), refPath)}`;
              files.push({ path: refUri, content: refContent });
            } catch { /* skip */ }
          }
        }
      }
    } catch { /* skip */ }
  }

  return { files };
}

// GET /api/files/types?path=/tmp/worktree&packages=react,next,@nestjs/common
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const requestedPath = searchParams.get('path');
    const packages = searchParams.get('packages');

    if (!requestedPath || !packages) {
      return NextResponse.json({ error: 'path and packages required' }, { status: 400 });
    }

    const validation = validatePath(requestedPath);
    if (!validation.isValid) {
      return NextResponse.json({ error: validation.error }, { status: 403 });
    }

    const nodeModules = await findNodeModules(validation.fullPath!);
    if (!nodeModules) {
      return NextResponse.json({ error: 'node_modules not found' }, { status: 404 });
    }

    const pkgList = packages.split(',').map(p => p.trim()).filter(Boolean);
    const allFiles: Array<{ path: string; content: string }> = [];

    for (const pkg of pkgList) {
      const result = await resolvePackageTypes(nodeModules, pkg);
      allFiles.push(...result.files);
    }

    return NextResponse.json({ files: allFiles });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed' }, { status: 500 });
  }
}
