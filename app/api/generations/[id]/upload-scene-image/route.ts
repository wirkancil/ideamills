import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/app/lib/mongoClient';
import { ObjectId } from 'mongodb';
import { saveImage } from '@/app/lib/storage';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  let objectId: ObjectId;
  try {
    objectId = new ObjectId(id);
  } catch {
    return NextResponse.json({ error: 'Invalid generation ID' }, { status: 400 });
  }

  const formData = await req.formData();
  const sceneId = formData.get('sceneId') as string;
  const file = formData.get('file') as File | null;

  if (!sceneId || !file) {
    return NextResponse.json({ error: 'sceneId and file are required' }, { status: 400 });
  }

  let sceneObjectId: ObjectId;
  try {
    sceneObjectId = new ObjectId(sceneId);
  } catch {
    return NextResponse.json({ error: 'Invalid scene ID' }, { status: 400 });
  }

  const db = await getDb();
  const generation = await db.collection('Generations').findOne({ _id: objectId });
  if (!generation) {
    return NextResponse.json({ error: 'Generation not found' }, { status: 404 });
  }

  const bytes = await file.arrayBuffer();
  const base64 = Buffer.from(bytes).toString('base64');
  const ext = file.type === 'image/png' ? 'png' : 'jpg';
  const base64DataUrl = `data:${file.type};base64,${base64}`;

  const imagePath = await saveImage(base64DataUrl, id, `${sceneId}_custom.${ext}`);

  await db.collection('Scenes').updateOne(
    { _id: sceneObjectId },
    {
      $set: {
        generated_image_path: imagePath,
        image_status: 'done',
        image_source: 'user',
        updated_at: new Date(),
      },
    }
  );

  return NextResponse.json({ imagePath, sceneId });
}
