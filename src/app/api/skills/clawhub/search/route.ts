import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// GET /api/skills/clawhub/search?q=query
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q');
    
    if (!query) {
      return NextResponse.json({ error: 'Query parameter "q" is required' }, { status: 400 });
    }
    
    // Run clawhub search command
    const { stdout, stderr } = await execAsync(`clawhub search "${query}"`, {
      timeout: 10000, // 10 second timeout
    });
    
    if (stderr && !stdout) {
      return NextResponse.json({ 
        error: 'ClawHub search failed',
        details: stderr 
      }, { status: 500 });
    }
    
    // Parse the output - assuming it returns JSON or structured data
    // For now, return raw output, can be enhanced later
    const results = stdout.trim().split('\n').filter(line => line.trim()).map(line => {
      // Basic parsing - enhance this based on actual clawhub search output format
      const parts = line.split(' - ');
      return {
        name: parts[0]?.trim() || line.trim(),
        description: parts[1]?.trim() || '',
        raw: line
      };
    });
    
    return NextResponse.json({
      query,
      results,
      count: results.length
    });
  } catch (error) {
    console.error('Error in GET /api/skills/clawhub/search:', error);
    
    if (error instanceof Error && error.message.includes('timeout')) {
      return NextResponse.json({ error: 'Search timed out' }, { status: 504 });
    }
    
    if (error instanceof Error && error.message.includes('Command failed')) {
      return NextResponse.json({ 
        error: 'ClawHub command not found or failed',
        details: error.message 
      }, { status: 500 });
    }
    
    return NextResponse.json({ error: 'Failed to search ClawHub' }, { status: 500 });
  }
}