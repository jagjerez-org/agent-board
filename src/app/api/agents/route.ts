// GET /api/agents - List all agents with status
// POST /api/agents - Create/register agent
import { NextRequest, NextResponse } from 'next/server';
import { listAgents, createAgent, getAgentHierarchy } from '@/lib/agent-store';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const format = searchParams.get('format');

    if (format === 'hierarchy') {
      const hierarchy = await getAgentHierarchy();
      return NextResponse.json(hierarchy);
    }

    const agents = await listAgents();
    return NextResponse.json(agents);
  } catch (error) {
    console.error('Error fetching agents:', error);
    return NextResponse.json(
      { error: 'Failed to fetch agents' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const data = await request.json();
    
    // Validate required fields
    if (!data.id || typeof data.id !== 'string') {
      return NextResponse.json(
        { error: 'Agent ID is required and must be a string' },
        { status: 400 }
      );
    }

    if (!data.name || typeof data.name !== 'string') {
      return NextResponse.json(
        { error: 'Agent name is required and must be a string' },
        { status: 400 }
      );
    }

    const agent = await createAgent(data);
    return NextResponse.json(agent, { status: 201 });
  } catch (error) {
    console.error('Error creating agent:', error);
    return NextResponse.json(
      { error: 'Failed to create agent' },
      { status: 500 }
    );
  }
}