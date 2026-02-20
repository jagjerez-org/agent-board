// GET /api/projects - List all projects (auto-discovered from Git providers)
// POST /api/projects - Create a new manual project
import { NextRequest, NextResponse } from 'next/server';
import { listProjects, searchProjects, getProjectsByOwner, refreshReposCache, getProjectStats, createManualProject } from '@/lib/project-store';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const refresh = searchParams.get('refresh') === 'true';
    const search = searchParams.get('search');
    const owner = searchParams.get('owner');
    const stats = searchParams.get('stats') === 'true';

    // Refresh cache if requested
    if (refresh) {
      await refreshReposCache();
    }

    // Return stats
    if (stats) {
      const projectStats = await getProjectStats();
      return NextResponse.json(projectStats);
    }

    let projects;
    
    // Apply filters
    if (search) {
      projects = await searchProjects(search);
    } else if (owner) {
      projects = await getProjectsByOwner(owner);
    } else {
      projects = await listProjects();
    }

    return NextResponse.json({
      projects,
      total: projects.length
    });
  } catch (error) {
    console.error('Error fetching projects:', error);
    return NextResponse.json(
      { error: 'Failed to fetch projects' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const data = await request.json();
    
    // Validate required fields
    if (!data.name) {
      return NextResponse.json(
        { error: 'Name is required' },
        { status: 400 }
      );
    }
    
    // Create manual project
    const project = await createManualProject({
      name: data.name,
      description: data.description,
      repo_url: data.repo_url,
      provider: data.provider || 'Manual'
    });
    
    return NextResponse.json(project, { status: 201 });
  } catch (error) {
    console.error('Error creating project:', error);
    return NextResponse.json(
      { error: 'Failed to create project' },
      { status: 500 }
    );
  }
}