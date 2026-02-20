import { NextRequest, NextResponse } from 'next/server';
import { 
  listWorktrees, 
  addWorktree, 
  removeWorktree, 
  getRepoPath 
} from '@/lib/worktree-service';

// GET /api/git/worktrees?project=<projectId>
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const project = searchParams.get('project');
    
    if (!project) {
      return NextResponse.json(
        { error: 'Project parameter is required' },
        { status: 400 }
      );
    }
    
    const repoPath = await getRepoPath(project);
    if (!repoPath) {
      return NextResponse.json(
        { error: `Repository not found for project: ${project}` },
        { status: 404 }
      );
    }
    
    const worktrees = await listWorktrees(repoPath);
    
    return NextResponse.json({ worktrees });
  } catch (error) {
    console.error('Error in GET /api/git/worktrees:', error);
    return NextResponse.json(
      { error: 'Failed to list worktrees' },
      { status: 500 }
    );
  }
}

// POST /api/git/worktrees
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { project, branch, createBranch = false } = body;
    
    if (!project || !branch) {
      return NextResponse.json(
        { error: 'Project and branch parameters are required' },
        { status: 400 }
      );
    }
    
    const repoPath = await getRepoPath(project);
    if (!repoPath) {
      return NextResponse.json(
        { error: `Repository not found for project: ${project}` },
        { status: 404 }
      );
    }
    
    const result = await addWorktree(repoPath, branch, createBranch);
    
    if (result.success) {
      return NextResponse.json({ 
        success: true, 
        path: result.path,
        message: `Worktree created for branch '${branch}'` 
      });
    } else {
      return NextResponse.json(
        { error: result.error || 'Failed to create worktree' },
        { status: 400 }
      );
    }
  } catch (error) {
    console.error('Error in POST /api/git/worktrees:', error);
    return NextResponse.json(
      { error: 'Failed to create worktree' },
      { status: 500 }
    );
  }
}

// DELETE /api/git/worktrees
export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const { project, branch } = body;
    
    if (!project || !branch) {
      return NextResponse.json(
        { error: 'Project and branch parameters are required' },
        { status: 400 }
      );
    }
    
    const repoPath = await getRepoPath(project);
    if (!repoPath) {
      return NextResponse.json(
        { error: `Repository not found for project: ${project}` },
        { status: 404 }
      );
    }
    
    const result = await removeWorktree(repoPath, branch);
    
    if (result.success) {
      return NextResponse.json({ 
        success: true,
        message: `Worktree removed for branch '${branch}'` 
      });
    } else {
      return NextResponse.json(
        { error: result.error || 'Failed to remove worktree' },
        { status: 400 }
      );
    }
  } catch (error) {
    console.error('Error in DELETE /api/git/worktrees:', error);
    return NextResponse.json(
      { error: 'Failed to remove worktree' },
      { status: 500 }
    );
  }
}