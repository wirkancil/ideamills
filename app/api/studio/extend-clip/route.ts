import { NextRequest, NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { z } from 'zod';
import { getDb } from '@/app/lib/mongoClient';
import { extendVideo, pollVideoJob } from '@/app/lib/useapi';
import { enqueueJob } from '@/app/lib/queue';
import type { Clip } from '@/app/lib/types';

const RequestSchema = z.object({
  generationId: z.string().min(1),
  sourceClipIndex: z.number().int().min(0),
  prompt: z.string().min(5).max(2000),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = RequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.format() },
        { status: 400 }
      );
    }

    const { generationId, sourceClipIndex, prompt } = parsed.data;

    let oid: ObjectId;
    try {
      oid = new ObjectId(generationId);
    } catch {
      return NextResponse.json({ error: 'Invalid generationId' }, { status: 400 });
    }

    const db = await getDb();
    const generation = await db.collection('Generations').findOne({ _id: oid });
    if (!generation) {
      return NextResponse.json({ error: 'Generation not found' }, { status: 404 });
    }

    const clips = (generation.clips ?? []) as Clip[];
    const sourceClip = clips.find((c) => c.index === sourceClipIndex);
    if (!sourceClip) {
      return NextResponse.json({ error: 'Source clip not found' }, { status: 404 });
    }
    if (sourceClip.video_status !== 'done') {
      return NextResponse.json({ error: 'Source clip video belum selesai' }, { status: 400 });
    }
    // Resolve video mediaGenerationId — poll job if DB value is stale/image ID
    let videoMediaId = sourceClip.media_generation_id ?? null;
    if (!videoMediaId && !sourceClip.video_job_id) {
      return NextResponse.json({ error: 'Source clip tidak punya mediaGenerationId maupun video_job_id' }, { status: 400 });
    }
    if (sourceClip.video_job_id) {
      const finalJob = await pollVideoJob(sourceClip.video_job_id);
      if (finalJob.mediaGenerationId) {
        videoMediaId = finalJob.mediaGenerationId;
        // Update DB agar berikutnya tidak perlu poll lagi
        await db.collection('Generations').updateOne(
          { _id: oid, 'clips.index': sourceClipIndex },
          { $set: { 'clips.$.media_generation_id': videoMediaId } }
        );
      }
    }
    if (!videoMediaId) {
      return NextResponse.json({ error: 'Tidak bisa mendapatkan video mediaGenerationId dari clip ini' }, { status: 400 });
    }

    const jobId = await extendVideo({
      mediaGenerationId: videoMediaId,
      prompt,
    });

    const newIndex = clips.length;
    const now = new Date();
    const newClip: Clip = {
      index: newIndex,
      prompt,
      imageMode: 'inherit',
      generated_image_path: null,
      generated_video_path: null,
      image_status: 'done',
      video_status: 'queued',
      image_error: null,
      video_error: null,
      media_generation_id: null,
      video_job_id: jobId,
      is_extended: true,
      extended_from_index: sourceClipIndex,
      created_at: now,
      updated_at: now,
    };

    await db.collection('Generations').updateOne(
      { _id: oid },
      {
        $push: { clips: newClip as any },
        $set: { status: 'queued', updated_at: now },
      }
    );

    await enqueueJob(generationId, {
      productImageUrl: generation.product_image_url,
      modelImageUrl: generation.model_image_url ?? null,
      basicIdea: generation.brief ?? '',
      storyboardCount: 1,
      product: generation.productAnalysis,
      model: generation.modelAnalysis ?? null,
      v2Studio: true,
      v2RegenerateClipIndex: newIndex,
    } as unknown as Parameters<typeof enqueueJob>[1]);

    return NextResponse.json({ clipIndex: newIndex });
  } catch (error) {
    console.error('/api/studio/extend-clip error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
