import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const MIME: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  mp4: 'video/mp4',
  webm: 'video/webm',
};

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path: segments } = await params;
  const storagePath = process.env.STORAGE_PATH ?? path.join(process.cwd(), 'storage');
  const filePath = path.join(storagePath, ...segments);

  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(path.resolve(storagePath))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  if (!fs.existsSync(resolved)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const ext = path.extname(resolved).slice(1).toLowerCase();
  const contentType = MIME[ext] ?? 'application/octet-stream';
  const buffer = fs.readFileSync(resolved);

  return new NextResponse(buffer, {
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=86400',
    },
  });
}
