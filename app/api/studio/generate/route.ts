import { NextRequest, NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { z } from 'zod';
import { getDb } from '@/app/lib/mongoClient';
import { enqueueJob } from '@/app/lib/queue';
import { MAX_QUEUE_DEPTH } from '@/app/lib/workerConfig';
import type { Clip } from '@/app/lib/types';

const ClipDraftSchema = z.object({
  index: z.number().int().min(0).max(5),
  prompt: z.string().min(10).max(2000),
  imageMode: z.enum(['inherit', 'override', 'ai-generate']),
  imageDataUrl: z.string().nullable().optional(),
}).refine(
  (clip) => clip.imageMode !== 'override' || (typeof clip.imageDataUrl === 'string' && clip.imageDataUrl.length > 0),
  { message: 'Foto wajib di-upload untuk imageMode override' }
);

const RequestSchema = z.object({
  generationId: z.string().min(1),
  styleNotes: z.string().max(1500).default(''),
  clips: z.array(ClipDraftSchema).min(2).max(6),
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

    const { generationId, styleNotes, clips: clipDrafts } = parsed.data;
    let oid: ObjectId;
    try {
      oid = new ObjectId(generationId);
    } catch {
      return NextResponse.json({ error: 'Invalid generationId' }, { status: 400 });
    }

    const db = await getDb();

    const pendingCount = await db.collection('JobQueue').countDocuments({ status: 'pending' });
    if (pendingCount >= MAX_QUEUE_DEPTH) {
      return NextResponse.json({ error: 'Server sedang sibuk. Coba lagi sebentar.' }, { status: 503 });
    }

    const generation = await db.collection('Generations').findOne({ _id: oid });
    if (!generation) {
      return NextResponse.json({ error: 'Generation not found' }, { status: 404 });
    }

    const now = new Date();
    const existingClips = (generation.clips ?? []) as Clip[];
    const clips: Clip[] = clipDrafts
      .map((draft) => {
        const existing = existingClips.find((c) => c.index === draft.index);
        return {
          index: draft.index,
          prompt: draft.prompt,
          imageMode: draft.imageMode,
          imageDataUrl: draft.imageDataUrl ?? null,
          generated_image_path: null,
          generated_video_path: null,
          image_status: 'pending' as const,
          video_status: 'pending' as const,
          image_error: null,
          video_error: null,
          media_generation_id: null,
          video_job_id: null,
          created_at: existing?.created_at ?? now,
          updated_at: now,
        };
      })
      .sort((a, b) => a.index - b.index);

    await db.collection('Generations').updateOne(
      { _id: oid },
      {
        $set: {
          styleNotes,
          clips,
          status: 'queued',
          progress: 0,
          progress_label: 'Antrian video',
          updated_at: now,
        },
      }
    );

    await enqueueJob(generationId, {
      productImageUrl: generation.product_image_url,
      modelImageUrl: generation.model_image_url ?? null,
      basicIdea: generation.brief ?? '',
      storyboardCount: clips.length,
      product: generation.productAnalysis,
      model: generation.modelAnalysis ?? null,
      v2Studio: true,
    } as unknown as Parameters<typeof enqueueJob>[1]);

    return NextResponse.json({ generationId, status: 'queued' });
  } catch (error) {
    console.error('/api/studio/generate error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
