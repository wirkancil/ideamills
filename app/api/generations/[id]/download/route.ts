import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/app/lib/mongoClient';
import { ObjectId } from 'mongodb';
import fs from 'fs';
import path from 'path';

// Inline zip writer — no external dependency needed for simple cases
// Uses Node.js built-ins only

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const type = searchParams.get('type') ?? 'all'; // 'images' | 'videos' | 'all'

  let objectId: ObjectId;
  try {
    objectId = new ObjectId(id);
  } catch {
    return NextResponse.json({ error: 'Invalid generation ID' }, { status: 400 });
  }

  const db = await getDb();
  const generation = await db.collection('Generations').findOne({ _id: objectId });
  if (!generation) {
    return NextResponse.json({ error: 'Generation not found' }, { status: 404 });
  }

  const scripts = await db.collection('Scripts').find({ generation_id: id }).toArray();
  const scriptIds = scripts.map((s) => s._id.toString());
  const scenes = await db.collection('Scenes')
    .find({ script_id: { $in: scriptIds } })
    .sort({ script_id: 1, order: 1 })
    .toArray();

  type FileEntry = { name: string; path: string };
  const files: FileEntry[] = [];

  for (const scene of scenes) {
    const sceneId = scene._id.toString();
    if ((type === 'images' || type === 'all') && scene.generated_image_path) {
      const absPath = scene.generated_image_path as string;
      if (fs.existsSync(absPath)) {
        const ext = path.extname(absPath) || '.jpg';
        files.push({ name: `${scene.struktur}_${sceneId}${ext}`, path: absPath });
      }
    }
    if ((type === 'videos' || type === 'all') && scene.generated_video_path) {
      const absPath = scene.generated_video_path as string;
      if (fs.existsSync(absPath)) {
        const ext = path.extname(absPath) || '.mp4';
        files.push({ name: `${scene.struktur}_${sceneId}${ext}`, path: absPath });
      }
    }
  }

  if (files.length === 0) {
    return NextResponse.json({ error: 'No files to download' }, { status: 404 });
  }

  // Build zip in memory using fflate (already available as sub-dep, or use archiver)
  // Fallback: if only 1 file, stream it directly
  if (files.length === 1) {
    const f = files[0];
    const buffer = fs.readFileSync(f.path);
    const ext = path.extname(f.name).slice(1);
    const contentType = ext === 'mp4' ? 'video/mp4' : 'image/jpeg';
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${f.name}"`,
      },
    });
  }

  // Multiple files — build zip with JSZip-compatible manual format
  const AdmZip = (await import('adm-zip')).default;
  const zip = new AdmZip();

  for (const f of files) {
    zip.addLocalFile(f.path, '', f.name);
  }

  const zipBuffer = zip.toBuffer();
  const zipName = `ideamills_${id.slice(-6)}_${type}.zip`;

  return new NextResponse(zipBuffer, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${zipName}"`,
    },
  });
}
