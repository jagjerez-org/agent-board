// POST /api/projects/seed - Seed default projects
import { NextResponse } from 'next/server';
import { seedDefaultProjects } from '@/lib/project-store';

export async function POST() {
  try {
    const projects = await seedDefaultProjects();
    
    return NextResponse.json({
      success: true,
      seeded: projects.length,
      projects: projects.map(p => ({ id: p.id, name: p.name }))
    });
  } catch (error) {
    console.error('Error seeding default projects:', error);
    return NextResponse.json(
      { error: 'Failed to seed default projects' },
      { status: 500 }
    );
  }
}