import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/app/lib/mongoClient';
import { enqueueJob } from '@/app/lib/queue';
import { MAX_QUEUE_DEPTH } from '@/app/lib/workerConfig';
import { generateIdempotencyKey } from '@/app/lib/utils';
import type { Clip } from '@/app/lib/types';

const RequestSchema = z.object({
  productImageUrl: z.string().min(1),
  scriptContent: z.string().min(10).max(5000),
  scriptTitle: z.string().max(200).optional(),
  veoModel: z.string().optional().default('veo-3.1-fast'),
  aspectRatio: z.enum(['landscape', 'portrait']).optional().default('landscape'),
});

/**
 * Quick Generate — skip ideation/expand. User punya prompt matang dari Script Bank.
 * Direct: foto + script.content + Veo → 1 video clip 8 detik.
 */
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

    const { productImageUrl, scriptContent, scriptTitle, veoModel, aspectRatio } = parsed.data;
    const db = await getDb();

    const pendingCount = await db.collection('JobQueue').countDocuments({ status: 'pending' });
    if (pendingCount >= MAX_QUEUE_DEPTH) {
      return NextResponse.json({ error: 'Server sedang sibuk. Coba lagi sebentar.' }, { status: 503 });
    }

    const now = new Date();
    const idempotencyKey = generateIdempotencyKey({
      productImageUrl,
      scriptContent,
      ts: now.getTime(),
    });

    // Build single clip from script content
    const clips: Clip[] = [
      {
        index: 0,
        prompt: scriptContent,
        imageMode: 'inherit',
        imageDataUrl: null,
        generated_image_path: null,
        generated_video_path: null,
        image_status: 'pending',
        video_status: 'pending',
        image_error: null,
        video_error: null,
        media_generation_id: null,
        video_job_id: null,
        created_at: now,
      },
    ];

    const insertResult = await db.collection('Generations').insertOne({
      idempotency_key: idempotencyKey,
      product_image_url: productImageUrl,
      brief: '',
      product_identifier: scriptTitle ?? 'Quick Generate',
      creative_idea_title: scriptTitle ?? null,
      styleNotes: '',
      clips,
      source: 'quick',
      status: 'queued',
      progress: 0,
      progress_label: 'Antrian video',
      veo_model: veoModel,
      aspect_ratio: aspectRatio,
      created_at: now,
      updated_at: now,
    });

    const generationId = insertResult.insertedId.toString();

    await enqueueJob(generationId, {
      productImageUrl,
      modelImageUrl: null,
      basicIdea: '',
      storyboardCount: 1,
      product: null,
      model: null,
      v2Studio: true,
    } as unknown as Parameters<typeof enqueueJob>[1]);

    return NextResponse.json({ generationId, status: 'queued' });
  } catch (error) {
    console.error('/api/studio/quick-generate error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
