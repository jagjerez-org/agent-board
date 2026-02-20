// GET /api/git/providers - List available Git providers and their status
// POST /api/git/providers - Add a new Git provider
// DELETE /api/git/providers - Remove a Git provider
import { NextRequest, NextResponse } from 'next/server';
import { getProviders, addProvider, removeProvider, checkCliAvailable, getAvailableOrgs } from '@/lib/git-service';

export async function GET() {
  try {
    const providers = await getProviders();
    
    // Check availability of each provider
    const providersWithStatus = await Promise.all(
      providers.map(async (provider) => {
        const available = await checkCliAvailable(provider.cli);
        let orgs: string[] = [];
        
        if (available) {
          try {
            orgs = await getAvailableOrgs(provider);
          } catch (error) {
            console.warn(`Failed to get orgs for ${provider.name}:`, error);
          }
        }
        
        return {
          ...provider,
          available,
          discovered_orgs: orgs
        };
      })
    );
    
    return NextResponse.json(providersWithStatus);
  } catch (error) {
    console.error('Error fetching Git providers:', error);
    return NextResponse.json(
      { error: 'Failed to fetch Git providers' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const data = await request.json();
    
    // Validate required fields
    if (!data.type || !data.name || !data.cli) {
      return NextResponse.json(
        { error: 'type, name, and cli are required fields' },
        { status: 400 }
      );
    }
    
    // Check if CLI is available
    const available = await checkCliAvailable(data.cli);
    if (!available) {
      return NextResponse.json(
        { error: `CLI tool '${data.cli}' is not available on this system` },
        { status: 400 }
      );
    }
    
    const provider = {
      type: data.type,
      name: data.name,
      cli: data.cli,
      orgs: data.orgs || []
    };
    
    await addProvider(provider);
    
    return NextResponse.json(provider, { status: 201 });
  } catch (error) {
    console.error('Error adding Git provider:', error);
    return NextResponse.json(
      { error: 'Failed to add Git provider' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const name = searchParams.get('name');
    
    if (!name) {
      return NextResponse.json(
        { error: 'Provider name is required' },
        { status: 400 }
      );
    }
    
    await removeProvider(name);
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error removing Git provider:', error);
    return NextResponse.json(
      { error: 'Failed to remove Git provider' },
      { status: 500 }
    );
  }
}