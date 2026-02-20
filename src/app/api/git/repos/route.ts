// GET /api/git/repos - List all repos across providers
// POST /api/git/repos - Create a new repository
import { NextRequest, NextResponse } from 'next/server';
import { discoverAllRepos, createRepo, getProviders } from '@/lib/git-service';
import { refreshReposCache } from '@/lib/project-store';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const refresh = searchParams.get('refresh') === 'true';
    const provider = searchParams.get('provider');
    const owner = searchParams.get('owner');
    const search = searchParams.get('search');

    let repos;
    if (refresh) {
      repos = await refreshReposCache();
    } else {
      repos = await discoverAllRepos();
    }

    // Apply filters
    let filteredRepos = repos;
    
    if (provider) {
      filteredRepos = filteredRepos.filter(r => r.provider === provider);
    }
    
    if (owner) {
      filteredRepos = filteredRepos.filter(r => r.owner === owner);
    }
    
    if (search) {
      const searchLower = search.toLowerCase();
      filteredRepos = filteredRepos.filter(r =>
        r.name.toLowerCase().includes(searchLower) ||
        r.description?.toLowerCase().includes(searchLower) ||
        r.owner.toLowerCase().includes(searchLower)
      );
    }

    return NextResponse.json({
      repos: filteredRepos,
      total: repos.length,
      filtered: filteredRepos.length,
      last_updated: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error fetching Git repos:', error);
    return NextResponse.json(
      { error: 'Failed to fetch Git repos' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const data = await request.json();
    
    // Validate required fields
    if (!data.provider_name || !data.owner || !data.name) {
      return NextResponse.json(
        { error: 'provider_name, owner, and name are required' },
        { status: 400 }
      );
    }
    
    // Find the provider
    const providers = await getProviders();
    const provider = providers.find(p => p.name === data.provider_name);
    
    if (!provider) {
      return NextResponse.json(
        { error: `Provider '${data.provider_name}' not found` },
        { status: 404 }
      );
    }
    
    // Create the repository
    const repo = await createRepo(provider, data.owner, data.name, {
      private: data.private || false,
      description: data.description
    });
    
    if (!repo) {
      return NextResponse.json(
        { error: 'Failed to create repository' },
        { status: 500 }
      );
    }
    
    // Refresh cache to include new repo
    await refreshReposCache();
    
    return NextResponse.json(repo, { status: 201 });
  } catch (error) {
    console.error('Error creating Git repo:', error);
    return NextResponse.json(
      { error: 'Failed to create Git repo' },
      { status: 500 }
    );
  }
}