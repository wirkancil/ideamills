import { NextRequest, NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { z } from 'zod';
import { getDb } from '@/app/lib/mongoClient';
import { enqueueJob } from '@/app/lib/queue';
import type { Clip } from '@/app/lib/types';

const RequestSchema = z.object({
  generationId: z.string().min(1),
  clipIndex: z.number().int().min(0).max(5),
  prompt: z.string().min(10).max(5000),
  imageMode: z.enum(['inherit', 'override', 'ai-generate']),
  imageDataUrl: z.string().nullable().optional(),
}).refine(
  (data) => data.imageMode !== 'override' || (typeof data.imageDataUrl === 'string' && data.imageDataUrl.length > 0),
  { message: 'Foto wajib di-upload untuk imageMode override' }
);

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

    const { generationId, clipIndex, prompt, imageMode, imageDataUrl } = parsed.data;
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
    const targetClip = clips.find((c) => c.index === clipIndex);
    if (!targetClip) {
      return NextResponse.json({ error: 'Clip not found' }, { status: 404 });
    }

    const now = new Date();
    const updatedClips = clips.map((c) => {
      if (c.index !== clipIndex) return c;
      // Reset veo_prompt hanya jika prompt berubah — jika sama, preserve hasil edit user
      const promptChanged = c.prompt !== prompt;
      return {
        ...c,
        prompt,
        imageMode,
        imageDataUrl: imageDataUrl ?? null,
        generated_image_path: null,
        generated_video_path: null,
        image_status: 'pending' as const,
        video_status: 'pending' as const,
        image_error: null,
        video_error: null,
        media_generation_id: null,
        video_job_id: null,
        veo_prompt: promptChanged ? null : (c.veo_prompt ?? null),
        updated_at: now,
      };
    });

    await db.collection('Generations').updateOne(
      { _id: oid },
      {
        $set: {
          clips: updatedClips,
          status: 'queued',
          progress_label: `Regenerating clip ${clipIndex + 1}`,
          updated_at: now,
        },
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
      v2RegenerateClipIndex: clipIndex,
    } as unknown as Parameters<typeof enqueueJob>[1]);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('/api/studio/regenerate-clip error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
