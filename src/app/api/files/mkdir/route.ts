import { NextRequest, NextResponse } from 'next/server';
import { mkdir } from 'fs/promises';
import { resolve } from 'path';
import { existsSync } from 'fs';

function validatePath(requestedPath: string): { isValid: boolean; fullPath?: string; error?: string } {
  const fullPath = resolve(requestedPath);
  if (!fullPath.startsWith('/tmp/')) {
    return { isValid: false, error: 'Path outside /tmp/ not allowed for security' };
  }
  return { isValid: true, fullPath };
}

export async function POST(request: NextRequest) {
  try {
    const { path: requestedPath } = await request.json();
    if (!requestedPath) {
      return NextResponse.json({ error: 'Path required' }, { status: 400 });
    }
    const validation = validatePath(requestedPath);
    if (!validation.isValid) {
      return NextResponse.json({ error: validation.error }, { status: 403 });
    }
    const fullPath = validation.fullPath!;
    if (existsSync(fullPath)) {
      return NextResponse.json({ error: 'Already exists' }, { status: 409 });
    }
    await mkdir(fullPath, { recursive: true });
    return NextResponse.json({ success: true, path: requestedPath });
  } catch (error) {
    console.error('mkdir error:', error);
    return NextResponse.json({ error: 'Failed to create directory' }, { status: 500 });
  }
}
