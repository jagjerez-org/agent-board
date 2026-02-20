import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// POST /api/skills/clawhub/install
export async function POST(request: Request) {
  try {
    const { name } = await request.json();
    
    if (!name) {
      return NextResponse.json({ error: 'Skill name is required' }, { status: 400 });
    }
    
    // Validate skill name
    if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
      return NextResponse.json({ 
        error: 'Invalid skill name format' 
      }, { status: 400 });
    }
    
    // Run clawhub install command
    const { stdout, stderr } = await execAsync(`clawhub install "${name}"`, {
      timeout: 30000, // 30 second timeout for install
    });
    
    // Check for common error indicators
    if (stderr && (stderr.includes('error') || stderr.includes('failed') || stderr.includes('not found'))) {
      return NextResponse.json({ 
        error: 'Installation failed',
        details: stderr,
        output: stdout
      }, { status: 400 });
    }
    
    return NextResponse.json({
      message: 'Skill installed successfully',
      name,
      output: stdout,
      warnings: stderr || undefined
    });
  } catch (error) {
    console.error('Error in POST /api/skills/clawhub/install:', error);
    
    if (error instanceof Error && error.message.includes('timeout')) {
      return NextResponse.json({ error: 'Installation timed out' }, { status: 504 });
    }
    
    if (error instanceof Error && error.message.includes('Command failed')) {
      const execError = error as any;
      return NextResponse.json({ 
        error: 'ClawHub install failed',
        details: execError.stderr || error.message,
        output: execError.stdout
      }, { status: 500 });
    }
    
    return NextResponse.json({ error: 'Failed to install skill' }, { status: 500 });
  }
}