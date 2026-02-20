import { NextRequest, NextResponse } from 'next/server';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';

const CONFIG_DIR = join(process.cwd(), 'data', 'config');
const AUTH_FILE = join(CONFIG_DIR, 'openclaw-auth.json');

interface AuthConfig {
  gatewayUrl: string;
  token: string;
  validatedAt: string;
}

async function loadAuth(): Promise<AuthConfig | null> {
  try {
    if (!existsSync(AUTH_FILE)) return null;
    return JSON.parse(await readFile(AUTH_FILE, 'utf8'));
  } catch { return null; }
}

async function saveAuth(config: AuthConfig) {
  await mkdir(CONFIG_DIR, { recursive: true });
  await writeFile(AUTH_FILE, JSON.stringify(config, null, 2), 'utf8');
}

// GET /api/auth — check if configured
export async function GET() {
  const auth = await loadAuth();
  if (!auth) return NextResponse.json({ configured: false });

  // Verify token is still valid
  try {
    const res = await fetch(`${auth.gatewayUrl}/api/v1/cron/status`, {
      headers: { 'Authorization': `Bearer ${auth.token}` },
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) {
      return NextResponse.json({ configured: true, gatewayUrl: auth.gatewayUrl });
    }
    return NextResponse.json({ configured: false, error: 'Token expired or invalid' });
  } catch {
    // Gateway might be down but token was previously valid — allow it
    return NextResponse.json({ configured: true, gatewayUrl: auth.gatewayUrl, offline: true });
  }
}

// POST /api/auth — validate and save token
export async function POST(request: NextRequest) {
  try {
    const { token, gatewayUrl } = await request.json();

    if (!token) {
      return NextResponse.json({ error: 'API key is required' }, { status: 400 });
    }

    const url = gatewayUrl || 'http://localhost:18789';

    // Validate against gateway
    try {
      const res = await fetch(`${url}/api/v1/cron/status`, {
        headers: { 'Authorization': `Bearer ${token}` },
        signal: AbortSignal.timeout(5000),
      });

      if (!res.ok) {
        return NextResponse.json({ error: 'Invalid API key or gateway unreachable' }, { status: 401 });
      }
    } catch (err: unknown) {
      return NextResponse.json({ error: `Cannot reach gateway at ${url}. Is OpenClaw running?` }, { status: 502 });
    }

    // Save
    await saveAuth({ gatewayUrl: url, token, validatedAt: new Date().toISOString() });

    return NextResponse.json({ success: true, gatewayUrl: url });
  } catch (error: unknown) {
    return NextResponse.json({ error: 'Failed to save configuration' }, { status: 500 });
  }
}

// DELETE /api/auth — disconnect
export async function DELETE() {
  try {
    if (existsSync(AUTH_FILE)) {
      const { unlink } = await import('fs/promises');
      await unlink(AUTH_FILE);
    }
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Failed to disconnect' }, { status: 500 });
  }
}
