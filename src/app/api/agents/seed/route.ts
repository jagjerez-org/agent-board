// POST /api/agents/seed - Seed default OpenClaw agents
import { NextResponse } from 'next/server';
import { seedDefaultAgents } from '@/lib/agent-store';

export async function POST() {
  try {
    const newAgents = await seedDefaultAgents();
    
    return NextResponse.json({
      success: true,
      message: `Seeded ${newAgents.length} new agents`,
      agents: newAgents
    });
  } catch (error) {
    console.error('Error seeding agents:', error);
    return NextResponse.json(
      { error: 'Failed to seed agents' },
      { status: 500 }
    );
  }
}