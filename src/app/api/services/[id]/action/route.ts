import { NextRequest, NextResponse } from 'next/server';
import { execSync, spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';

const SERVICES_FILE = path.join(process.cwd(), 'data', 'services.json');

async function loadServices() {
  try {
    const content = await fs.readFile(SERVICES_FILE, 'utf8');
    return JSON.parse(content);
  } catch { return []; }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { action } = await request.json();
    
    const services = await loadServices();
    const service = services.find((s: any) => s.id === id);
    if (!service) return NextResponse.json({ error: 'Service not found' }, { status: 404 });

    if (action === 'start') {
      // Start with setsid
      try {
        execSync(
          `cd "${service.workdir}" && setsid bash -c '${service.startCommand.replace(/'/g, "'\\''")}' >> "${service.logFile}" 2>&1 &`,
          { timeout: 10000 }
        );
        // Wait for startup
        await new Promise(r => setTimeout(r, 3000));
        
        // Verify
        try {
          const code = execSync(
            `curl -s -o /dev/null -w "%{http_code}" --connect-timeout 5 "${service.healthUrl}"`,
            { timeout: 8000 }
          ).toString().trim();
          const isUp = parseInt(code) >= 200 && parseInt(code) < 400;
          return NextResponse.json({ success: true, status: isUp ? 'up' : 'starting', httpCode: parseInt(code) });
        } catch {
          return NextResponse.json({ success: true, status: 'starting' });
        }
      } catch (error: any) {
        return NextResponse.json({ error: `Start failed: ${error.message}` }, { status: 500 });
      }
    }

    if (action === 'stop') {
      try {
        if (service.stopCommand) {
          execSync(`cd "${service.workdir}" && ${service.stopCommand}`, { timeout: 10000 });
        } else {
          // Kill by port
          const portMatch = service.healthUrl.match(/:(\d+)/);
          if (portMatch) {
            execSync(`fuser -k ${portMatch[1]}/tcp 2>/dev/null || true`, { timeout: 5000 });
          }
        }
        return NextResponse.json({ success: true, status: 'down' });
      } catch (error: any) {
        return NextResponse.json({ error: `Stop failed: ${error.message}` }, { status: 500 });
      }
    }

    if (action === 'restart') {
      try {
        // Stop first
        const portMatch = service.healthUrl.match(/:(\d+)/);
        if (service.stopCommand) {
          execSync(`cd "${service.workdir}" && ${service.stopCommand}`, { timeout: 10000 });
        } else if (portMatch) {
          execSync(`fuser -k ${portMatch[1]}/tcp 2>/dev/null || true`, { timeout: 5000 });
        }
        await new Promise(r => setTimeout(r, 1500));

        // Start
        execSync(
          `cd "${service.workdir}" && setsid bash -c '${service.startCommand.replace(/'/g, "'\\''")}' >> "${service.logFile}" 2>&1 &`,
          { timeout: 10000 }
        );
        await new Promise(r => setTimeout(r, 3000));

        try {
          const code = execSync(
            `curl -s -o /dev/null -w "%{http_code}" --connect-timeout 5 "${service.healthUrl}"`,
            { timeout: 8000 }
          ).toString().trim();
          const isUp = parseInt(code) >= 200 && parseInt(code) < 400;
          return NextResponse.json({ success: true, status: isUp ? 'up' : 'starting', httpCode: parseInt(code) });
        } catch {
          return NextResponse.json({ success: true, status: 'starting' });
        }
      } catch (error: any) {
        return NextResponse.json({ error: `Restart failed: ${error.message}` }, { status: 500 });
      }
    }

    if (action === 'health') {
      try {
        const code = execSync(
          `curl -s -o /dev/null -w "%{http_code}" --connect-timeout 3 "${service.healthUrl}"`,
          { timeout: 5000 }
        ).toString().trim();
        const httpCode = parseInt(code);
        return NextResponse.json({ status: httpCode >= 200 && httpCode < 400 ? 'up' : 'down', httpCode });
      } catch {
        return NextResponse.json({ status: 'down' });
      }
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: 'Action failed' }, { status: 500 });
  }
}
