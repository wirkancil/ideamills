import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/app/lib/mongoClient';
import { ObjectId } from 'mongodb';
import { generateImage } from '@/app/lib/llm';
import { saveImage } from '@/app/lib/storage';
import type { ModelConfig } from '@/app/lib/llm';
import { resolvePreset } from '@/app/lib/llm';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json() as { sceneIds?: string[] };

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

  const modelConfig: ModelConfig = (generation.modelConfig as ModelConfig) ?? resolvePreset('balanced');

  // Build filter: specific scenes or all scenes with text_to_image
  const sceneFilter: Record<string, unknown> = { text_to_image: { $exists: true, $ne: '' } };
  if (body.sceneIds?.length) {
    sceneFilter._id = { $in: body.sceneIds.map((sid) => new ObjectId(sid)) };
  } else {
    // Scope to this generation's scripts
    const scripts = await db.collection('Scripts').find({ generation_id: id }).toArray();
    const scriptIds = scripts.map((s) => s._id.toString());
    sceneFilter.script_id = { $in: scriptIds };
  }

  const rawScenes = await db.collection('Scenes').find(sceneFilter).toArray();
  if (rawScenes.length === 0) {
    return NextResponse.json({ error: 'No scenes found to generate images for' }, { status: 400 });
  }

  const scenes = rawScenes.map((s) => ({ _id: s._id as ObjectId, text_to_image: String(s.text_to_image ?? '') }));

  // Fire off async — return immediately with queued scene IDs
  const sceneIds = scenes.map((s) => s._id.toString());

  // Mark scenes as queued immediately
  await db.collection('Scenes').updateMany(
    { _id: { $in: scenes.map((s) => s._id) } },
    { $set: { image_status: 'queued', image_error: null, updated_at: new Date() } }
  );

  // Run generation in background (no await)
  generateImagesBackground(db, id, scenes, modelConfig).catch((err) => {
    console.error('[generate-images] background error:', err);
  });

  return NextResponse.json({ queued: sceneIds });
}

async function generateImagesBackground(
  db: Awaited<ReturnType<typeof import('@/app/lib/mongoClient').getDb>>,
  genId: string,
  scenes: { _id: ObjectId; text_to_image: string }[],
  modelConfig: ModelConfig
) {
  const { default: pLimit } = await import('p-limit');
  const limit = pLimit(3);

  await Promise.allSettled(
    scenes.map((scene) =>
      limit(async () => {
        const sceneId = scene._id.toString();
        try {
          await db.collection('Scenes').updateOne(
            { _id: scene._id },
            { $set: { image_status: 'generating', updated_at: new Date() } }
          );
          const res = await generateImage(scene.text_to_image, { aspectRatio: '16:9', size: '1K' }, modelConfig, genId);
          const base64 = res.images[0];
          const imagePath = await saveImage(base64, genId, `${sceneId}.jpg`);
          await db.collection('Scenes').updateOne(
            { _id: scene._id },
            { $set: { generated_image_path: imagePath, image_status: 'done', updated_at: new Date() } }
          );
        } catch (err) {
          await db.collection('Scenes').updateOne(
            { _id: scene._id },
            { $set: { image_status: 'failed', image_error: (err as Error).message, updated_at: new Date() } }
          );
        }
      })
    )
  );
}
