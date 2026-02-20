import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';

interface Props {
  params: Promise<{ id: string; filename: string }>;
}

const UPLOADS_DIR = join(process.cwd(), 'data', 'uploads');

export async function GET(_request: NextRequest, { params }: Props) {
  const { id, filename } = await params;
  const filePath = join(UPLOADS_DIR, id, filename);
  
  if (!existsSync(filePath)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const buffer = await readFile(filePath);
  const ext = filename.split('.').pop()?.toLowerCase();
  const mimeMap: Record<string, string> = {
    'png': 'image/png', 'jpg': 'image/jpeg', 'jpeg': 'image/jpeg',
    'gif': 'image/gif', 'webp': 'image/webp',
  };

  return new NextResponse(buffer, {
    headers: { 'Content-Type': mimeMap[ext || ''] || 'application/octet-stream' },
  });
}
