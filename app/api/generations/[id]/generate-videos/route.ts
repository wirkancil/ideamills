import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/app/lib/mongoClient';
import { ObjectId } from 'mongodb';
import { uploadImageAsset, createVideoJob, waitForVideo } from '@/app/lib/useapi';
import { downloadAndSaveVideo } from '@/app/lib/storage';
import { normalizeImage } from '@/app/lib/llm/middleware';

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

  if (!process.env.USEAPI_TOKEN) {
    return NextResponse.json({ error: 'Video generation not configured (USEAPI_TOKEN missing)' }, { status: 503 });
  }

  const db = await getDb();
  const generation = await db.collection('Generations').findOne({ _id: objectId });
  if (!generation) {
    return NextResponse.json({ error: 'Generation not found' }, { status: 404 });
  }

  // Build filter: scenes that have an image (generated or user-uploaded) + have vid prompt
  const sceneFilter: Record<string, unknown> = {
    generated_image_path: { $exists: true, $ne: '' },
    image_to_video: { $exists: true, $ne: '' },
  };

  if (body.sceneIds?.length) {
    sceneFilter._id = { $in: body.sceneIds.map((sid) => new ObjectId(sid)) };
  } else {
    const scripts = await db.collection('Scripts').find({ generation_id: id }).toArray();
    const scriptIds = scripts.map((s) => s._id.toString());
    sceneFilter.script_id = { $in: scriptIds };
  }

  const scenes = await db.collection('Scenes').find(sceneFilter).toArray();
  if (scenes.length === 0) {
    return NextResponse.json({ error: 'No scenes ready for video generation (need image + video prompt)' }, { status: 400 });
  }

  const sceneIds = scenes.map((s) => s._id.toString());

  await db.collection('Scenes').updateMany(
    { _id: { $in: scenes.map((s) => s._id) } },
    { $set: { video_status: 'queued', video_error: null, updated_at: new Date() } }
  );

  generateVideosBackground(db, id, scenes).catch((err) => {
    console.error('[generate-videos] background error:', err);
  });

  return NextResponse.json({ queued: sceneIds });
}

async function generateVideosBackground(
  db: Awaited<ReturnType<typeof import('@/app/lib/mongoClient').getDb>>,
  genId: string,
  scenes: any[]
) {
  const { default: pLimit } = await import('p-limit');
  const limit = pLimit(2);

  await Promise.allSettled(
    scenes.map((scene) =>
      limit(async () => {
        const sceneId = scene._id.toString();
        try {
          await db.collection('Scenes').updateOne(
            { _id: scene._id },
            { $set: { video_status: 'generating', updated_at: new Date() } }
          );
          const imageBase64 = await normalizeImage(scene.generated_image_path);
          const mediaId = await uploadImageAsset(imageBase64);
          const jobId = await createVideoJob({ imageUrl: mediaId, prompt: scene.image_to_video });
          const videoUrl = await waitForVideo(jobId);
          const videoPath = await downloadAndSaveVideo(videoUrl, genId, `${sceneId}.mp4`);
          await db.collection('Scenes').updateOne(
            { _id: scene._id },
            { $set: { generated_video_path: videoPath, video_status: 'done', updated_at: new Date() } }
          );
        } catch (err) {
          await db.collection('Scenes').updateOne(
            { _id: scene._id },
            { $set: { video_status: 'failed', video_error: (err as Error).message, updated_at: new Date() } }
          );
        }
      })
    )
  );
}
