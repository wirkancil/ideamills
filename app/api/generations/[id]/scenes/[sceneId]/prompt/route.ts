import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/app/lib/mongoClient';
import { ObjectId } from 'mongodb';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; sceneId: string }> }
) {
  const { sceneId } = await params;
  const body = await req.json() as { text_to_image?: string; image_to_video?: string };

  let sceneObjectId: ObjectId;
  try {
    sceneObjectId = new ObjectId(sceneId);
  } catch {
    return NextResponse.json({ error: 'Invalid scene ID' }, { status: 400 });
  }

  const updates: Record<string, unknown> = { updated_at: new Date() };
  if (body.text_to_image !== undefined) updates.text_to_image = body.text_to_image;
  if (body.image_to_video !== undefined) updates.image_to_video = body.image_to_video;

  const db = await getDb();
  await db.collection('Scenes').updateOne({ _id: sceneObjectId }, { $set: updates });

  return NextResponse.json({ ok: true });
}
