import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/app/lib/mongoClient';
import { ObjectId } from 'mongodb';
import { storagePathToUrl } from '@/app/lib/storage';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

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

  const scripts = await db.collection('Scripts')
    .find({ generation_id: id })
    .sort({ idx: 1 })
    .toArray();

  const scriptIds = scripts.map((s) => s._id.toString());
  const scenes = await db.collection('Scenes')
    .find({ script_id: { $in: scriptIds } })
    .sort({ script_id: 1, order: 1 })
    .toArray();

  const result = scenes.map((s) => ({
    id: s._id.toString(),
    scriptId: s.script_id,
    order: s.order,
    struktur: s.struktur,
    naskah_vo: s.naskah_vo,
    visual_idea: s.visual_idea,
    text_to_image: s.text_to_image ?? '',
    image_to_video: s.image_to_video ?? '',
    image_status: s.image_status ?? (s.generated_image_path ? 'done' : 'pending'),
    image_source: s.image_source ?? (s.generated_image_path ? 'ai' : null),
    image_url: s.generated_image_path ? storagePathToUrl(s.generated_image_path) : null,
    image_error: s.image_error ?? null,
    video_status: s.video_status ?? (s.generated_video_path ? 'done' : 'pending'),
    video_url: s.generated_video_path ? storagePathToUrl(s.generated_video_path) : null,
    video_error: s.video_error ?? null,
  }));

  return NextResponse.json({ scenes: result });
}
