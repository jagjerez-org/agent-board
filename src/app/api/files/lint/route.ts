import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import { resolve, dirname } from 'path';
import { access } from 'fs/promises';

const execAsync = promisify(exec);

async function fileExists(p: string): Promise<boolean> {
  try { await access(p); return true; } catch { return false; }
}

function validatePath(requestedPath: string): { isValid: boolean; fullPath?: string; error?: string } {
  const fullPath = resolve(requestedPath);
  if (!fullPath.startsWith('/tmp/')) {
    return { isValid: false, error: 'Path outside /tmp/ not allowed' };
  }
  return { isValid: true, fullPath };
}

// Find project root (where eslint config lives)
async function findProjectRoot(filePath: string): Promise<string | null> {
  let current = dirname(filePath);
  for (let i = 0; i < 15; i++) {
    for (const cfg of ['eslint.config.js', 'eslint.config.mjs', 'eslint.config.cjs', '.eslintrc.js', '.eslintrc.json', '.eslintrc.yml', '.eslintrc']) {
      if (await fileExists(`${current}/${cfg}`)) return current;
    }
    // Also check package.json for eslintConfig
    if (await fileExists(`${current}/package.json`)) {
      try {
        const pkg = JSON.parse(await require('fs').readFileSync(`${current}/package.json`, 'utf8'));
        if (pkg.eslintConfig) return current;
      } catch { /* skip */ }
    }
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return null;
}

interface LintMessage {
  line: number;
  column: number;
  endLine?: number;
  endColumn?: number;
  severity: 1 | 2; // 1=warning, 2=error
  message: string;
  ruleId: string | null;
}

// GET /api/files/lint?path=/tmp/worktree/src/file.ts
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const filePath = searchParams.get('path');

    if (!filePath) {
      return NextResponse.json({ error: 'path required' }, { status: 400 });
    }

    const validation = validatePath(filePath);
    if (!validation.isValid) {
      return NextResponse.json({ error: validation.error }, { status: 403 });
    }

    const fullPath = validation.fullPath!;
    const projectRoot = await findProjectRoot(fullPath);
    
    if (!projectRoot) {
      return NextResponse.json({ diagnostics: [], info: 'No ESLint config found' });
    }

    // Determine the eslint binary
    let eslintBin = '';
    const localEslint = `${projectRoot}/node_modules/.bin/eslint`;
    if (await fileExists(localEslint)) {
      eslintBin = localEslint;
    } else {
      // Try npx
      eslintBin = 'npx eslint';
    }

    // Run ESLint with JSON output
    try {
      const { stdout } = await execAsync(
        `${eslintBin} --format json --no-error-on-unmatched-pattern "${fullPath}"`,
        { 
          cwd: projectRoot, 
          maxBuffer: 5 * 1024 * 1024, 
          timeout: 15000,
          env: { ...process.env, NODE_ENV: 'development' }
        }
      );

      const results = JSON.parse(stdout);
      const fileResult = results[0];
      
      if (!fileResult) {
        return NextResponse.json({ diagnostics: [] });
      }

      const diagnostics: LintMessage[] = (fileResult.messages || []).map((msg: any) => ({
        line: msg.line || 1,
        column: msg.column || 1,
        endLine: msg.endLine || msg.line || 1,
        endColumn: msg.endColumn || msg.column || 1,
        severity: msg.severity || 1,
        message: msg.message || '',
        ruleId: msg.ruleId || null,
      }));

      return NextResponse.json({ 
        diagnostics,
        errorCount: fileResult.errorCount || 0,
        warningCount: fileResult.warningCount || 0,
      });
    } catch (execError: any) {
      // ESLint exits with code 1 when there are lint errors — parse stdout anyway
      if (execError.stdout) {
        try {
          const results = JSON.parse(execError.stdout);
          const fileResult = results[0];
          if (fileResult) {
            const diagnostics: LintMessage[] = (fileResult.messages || []).map((msg: any) => ({
              line: msg.line || 1,
              column: msg.column || 1,
              endLine: msg.endLine || msg.line || 1,
              endColumn: msg.endColumn || msg.column || 1,
              severity: msg.severity || 1,
              message: msg.message || '',
              ruleId: msg.ruleId || null,
            }));
            return NextResponse.json({ 
              diagnostics,
              errorCount: fileResult.errorCount || 0,
              warningCount: fileResult.warningCount || 0,
            });
          }
        } catch { /* parse failed */ }
      }
      return NextResponse.json({ diagnostics: [], info: 'ESLint execution failed' });
    }
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Lint failed' }, { status: 500 });
  }
}
