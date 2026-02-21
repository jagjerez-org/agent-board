import { NextRequest, NextResponse } from 'next/server';
import { execSync } from 'child_process';
import fs from 'fs/promises';
import path from 'path';

const SERVICES_FILE = path.join(process.cwd(), 'data', 'services.json');

export interface ServiceConfig {
  id: string;
  name: string;
  healthUrl: string;
  workdir: string;
  startCommand: string;
  stopCommand?: string;
  logFile: string;
  autoRestart: boolean;
  createdAt: string;
}

interface ServiceStatus extends ServiceConfig {
  status: 'up' | 'down' | 'unknown';
  httpCode?: number;
  pid?: number;
  uptime?: string;
}

async function loadServices(): Promise<ServiceConfig[]> {
  try {
    const content = await fs.readFile(SERVICES_FILE, 'utf8');
    return JSON.parse(content);
  } catch {
    return [];
  }
}

async function saveServices(services: ServiceConfig[]) {
  await fs.mkdir(path.dirname(SERVICES_FILE), { recursive: true });
  await fs.writeFile(SERVICES_FILE, JSON.stringify(services, null, 2));
}

function isSelfUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname;
    const port = parsed.port || (parsed.protocol === 'https:' ? '443' : '80');
    const isSelf = (host === '127.0.0.1' || host === 'localhost' || host === '0.0.0.0') && port === '9100';
    return isSelf;
  } catch { return false; }
}

async function checkHealth(service: ServiceConfig): Promise<ServiceStatus> {
  // Self-referential check: if this service points to ourselves, check via port listener instead of HTTP
  // (curl to self deadlocks because Next.js blocks on the synchronous execSync)
  if (isSelfUrl(service.healthUrl)) {
    try {
      const portMatch = service.healthUrl.match(/:(\d+)/);
      if (portMatch) {
        const result = execSync(`ss -tlnp | grep -q ":${portMatch[1]} " && echo "up" || echo "down"`, { timeout: 3000 }).toString().trim();
        let pid: number | undefined;
        try {
          const pidResult = execSync(`fuser ${portMatch[1]}/tcp 2>/dev/null || true`, { timeout: 3000 }).toString().trim();
          if (pidResult) pid = parseInt(pidResult.split(/\s+/)[0]);
        } catch { /* ignore */ }
        return { ...service, status: result === 'up' ? 'up' : 'down', pid };
      }
    } catch { /* fallthrough */ }
    return { ...service, status: 'unknown' };
  }

  try {
    const result = execSync(
      `curl -s -o /dev/null -w "%{http_code}" --connect-timeout 3 --max-time 6 "${service.healthUrl}"`,
      { timeout: 8000 }
    ).toString().trim();
    const code = parseInt(result);
    const isUp = code >= 200 && code < 400;
    
    let pid: number | undefined;
    try {
      const portMatch = service.healthUrl.match(/:(\d+)/);
      if (portMatch) {
        const pidResult = execSync(`fuser ${portMatch[1]}/tcp 2>/dev/null || true`, { timeout: 3000 }).toString().trim();
        if (pidResult) pid = parseInt(pidResult.split(/\s+/)[0]);
      }
    } catch { /* ignore */ }

    return { ...service, status: isUp ? 'up' : 'down', httpCode: code, pid };
  } catch {
    return { ...service, status: 'down' };
  }
}

// GET — list services with health status
export async function GET() {
  try {
    const services = await loadServices();
    const statuses = await Promise.all(services.map(checkHealth));
    return NextResponse.json(statuses);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to load services' }, { status: 500 });
  }
}

// POST — add or update a service
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, name, healthUrl, workdir, startCommand, stopCommand, logFile, autoRestart } = body;

    if (!name || !healthUrl || !workdir || !startCommand) {
      return NextResponse.json({ error: 'name, healthUrl, workdir, startCommand required' }, { status: 400 });
    }

    const services = await loadServices();
    const serviceId = id || `svc-${Date.now()}`;
    const existing = services.findIndex(s => s.id === serviceId);

    const service: ServiceConfig = {
      id: serviceId,
      name,
      healthUrl,
      workdir,
      startCommand,
      stopCommand: stopCommand || undefined,
      logFile: logFile || `/tmp/${name.toLowerCase().replace(/\s+/g, '-')}.log`,
      autoRestart: autoRestart ?? true,
      createdAt: existing >= 0 ? services[existing].createdAt : new Date().toISOString(),
    };

    if (existing >= 0) {
      services[existing] = service;
    } else {
      services.push(service);
    }

    await saveServices(services);
    return NextResponse.json(service, { status: existing >= 0 ? 200 : 201 });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to save service' }, { status: 500 });
  }
}

// DELETE — remove a service
export async function DELETE(request: NextRequest) {
  try {
    const { id } = await request.json();
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
    
    const services = await loadServices();
    const filtered = services.filter(s => s.id !== id);
    await saveServices(filtered);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to delete service' }, { status: 500 });
  }
}
