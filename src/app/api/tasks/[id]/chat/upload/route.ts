import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import { v4 as uuidv4 } from 'uuid';

interface Props {
  params: Promise<{ id: string }>;
}

const UPLOADS_DIR = join(process.cwd(), 'data', 'uploads');

// POST /api/tasks/[id]/chat/upload — upload an image
export async function POST(request: NextRequest, { params }: Props) {
  try {
    const { id } = await params;
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const taskDir = join(UPLOADS_DIR, id);
    if (!existsSync(taskDir)) await mkdir(taskDir, { recursive: true });

    const ext = file.name.split('.').pop() || 'png';
    const filename = `${uuidv4()}.${ext}`;
    const filePath = join(taskDir, filename);

    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(filePath, buffer);

    return NextResponse.json({
      filename,
      path: `/api/tasks/${id}/chat/upload/${filename}`,
      size: buffer.length,
    });
  } catch (error: any) {
    console.error('Upload error:', error);
    return NextResponse.json({ error: error.message || 'Failed' }, { status: 500 });
  }
}
