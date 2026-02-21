import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import { resolve } from 'path';

const execAsync = promisify(exec);

function validatePath(requestedPath: string): { isValid: boolean; fullPath?: string; error?: string } {
  const fullPath = resolve(requestedPath);
  if (!fullPath.startsWith('/tmp/')) {
    return { isValid: false, error: 'Path outside /tmp/ not allowed' };
  }
  return { isValid: true, fullPath };
}

// GET /api/files/search?path=/tmp/worktree&q=searchTerm&type=content|filename
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const requestedPath = searchParams.get('path');
    const query = searchParams.get('q');
    const type = searchParams.get('type') || 'filename';

    if (!requestedPath || !query) {
      return NextResponse.json({ error: 'path and q required' }, { status: 400 });
    }

    const validation = validatePath(requestedPath);
    if (!validation.isValid) {
      return NextResponse.json({ error: validation.error }, { status: 403 });
    }

    const cwd = validation.fullPath!;

    if (type === 'filename') {
      // Find files by name (fuzzy-ish via find + grep)
      const safeQuery = query.replace(/['"\\]/g, '');
      const { stdout } = await execAsync(
        `find . -type f -not -path '*/node_modules/*' -not -path '*/.git/*' -not -path '*/build/*' -not -path '*/.dart_tool/*' -not -path '*/.next/*' -not -path '*/dist/*' -not -path '*/.turbo/*' | grep -i "${safeQuery}" | head -50`,
        { cwd, maxBuffer: 5 * 1024 * 1024 }
      );

      const files = stdout.trim().split('\n').filter(Boolean).map(f => ({
        path: f.replace(/^\.\//, ''),
        fullPath: `${cwd}/${f.replace(/^\.\//, '')}`,
      }));

      return NextResponse.json({ files });
    } else {
      // Content search via ripgrep or grep
      const safeQuery = query.replace(/['"\\]/g, '');
      let results: Array<{ path: string; fullPath: string; line: number; text: string }> = [];

      try {
        // Try ripgrep first
        const { stdout } = await execAsync(
          `rg --no-heading --line-number --color never --max-count 5 --max-filesize 1M -g '!node_modules' -g '!.git' -g '!build' -g '!.next' -g '!dist' -g '!.turbo' -g '!.dart_tool' -g '!*.lock' -g '!pnpm-lock.yaml' -- "${safeQuery}" .`,
          { cwd, maxBuffer: 10 * 1024 * 1024, timeout: 10000 }
        );
        results = stdout.trim().split('\n').filter(Boolean).slice(0, 100).map(line => {
          const match = line.match(/^(.+?):(\d+):(.*)$/);
          if (!match) return null;
          const [, file, lineNum, text] = match;
          const filePath = file.replace(/^\.\//, '');
          return { path: filePath, fullPath: `${cwd}/${filePath}`, line: parseInt(lineNum), text: text.trim() };
        }).filter(Boolean) as any;
      } catch {
        // Fallback to grep
        try {
          const { stdout } = await execAsync(
            `grep -rn --include='*.ts' --include='*.tsx' --include='*.js' --include='*.jsx' --include='*.dart' --include='*.json' --include='*.yaml' --include='*.yml' --include='*.md' --include='*.css' --include='*.html' --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=build --exclude-dir=.next --exclude-dir=dist -- "${safeQuery}" .`,
            { cwd, maxBuffer: 10 * 1024 * 1024, timeout: 10000 }
          );
          results = stdout.trim().split('\n').filter(Boolean).slice(0, 100).map(line => {
            const match = line.match(/^(.+?):(\d+):(.*)$/);
            if (!match) return null;
            const [, file, lineNum, text] = match;
            const filePath = file.replace(/^\.\//, '');
            return { path: filePath, fullPath: `${cwd}/${filePath}`, line: parseInt(lineNum), text: text.trim() };
          }).filter(Boolean) as any;
        } catch { /* no results */ }
      }

      // Group by file
      const grouped: Record<string, { path: string; fullPath: string; matches: Array<{ line: number; text: string }> }> = {};
      for (const r of results) {
        if (!grouped[r.path]) grouped[r.path] = { path: r.path, fullPath: r.fullPath, matches: [] };
        grouped[r.path].matches.push({ line: r.line, text: r.text });
      }

      return NextResponse.json({ results: Object.values(grouped), total: results.length });
    }
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Search failed' }, { status: 500 });
  }
}
