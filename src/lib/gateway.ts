import { readFile } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';

const AUTH_FILE = join(process.cwd(), 'data', 'config', 'openclaw-auth.json');

export async function getGatewayConfig(): Promise<{ url: string; token: string } | null> {
  // First try the board's own auth config
  try {
    if (existsSync(AUTH_FILE)) {
      const config = JSON.parse(await readFile(AUTH_FILE, 'utf8'));
      if (config.token && config.gatewayUrl) {
        return { url: config.gatewayUrl, token: config.token };
      }
    }
  } catch { /* fall through */ }

  // Fallback: try reading openclaw.json directly (backward compat)
  try {
    const configPath = join(process.env.HOME || '/root', '.openclaw/openclaw.json');
    const config = JSON.parse(await readFile(configPath, 'utf8'));
    const port = config.gateway?.port || 18789;
    const token = config.gateway?.auth?.token;
    if (!token) return null;
    return { url: `http://localhost:${port}`, token };
  } catch { return null; }
}
