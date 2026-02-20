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

async function checkHealth(service: ServiceConfig): Promise<ServiceStatus> {
  try {
    const result = execSync(
      `curl -s -o /dev/null -w "%{http_code}" --connect-timeout 3 "${service.healthUrl}"`,
      { timeout: 5000 }
    ).toString().trim();
    const code = parseInt(result);
    const isUp = code >= 200 && code < 400;
    
    let pid: number | undefined;
    try {
      // Try to find PID by port
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
