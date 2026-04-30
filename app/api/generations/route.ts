import { NextRequest, NextResponse } from 'next/server';
import { generateIdempotencyKey } from '@/app/lib/utils';
import { z } from 'zod';
import { getDb } from '@/app/lib/mongoClient';
import { ObjectId } from 'mongodb';
import { resolvePreset, PRESETS } from '@/app/lib/llm';
import { MAX_QUEUE_DEPTH } from '@/app/lib/workerConfig';

const PRESET_NAMES = ['fast', 'balanced', 'premium', 'custom'] as const;

const GenerationRequestSchema = z.object({
  productImageUrl: z.string().url(),
  modelImageUrl: z.string().url().nullable().optional(),
  basicIdea: z.string().min(10),
  engine: z.enum(['gpt-5.2', 'gemini-2.5-flash']).optional(),
  visualOverrides: z.string().nullable().optional(),
  modelConfig: z.object({
    preset: z.enum(PRESET_NAMES).optional(),
    vision: z.string().optional(),
    ideation: z.string().optional(),
    scripting: z.string().optional(),
    visualPrompt: z.string().optional(),
    ideas: z.string().optional(),
    expand: z.string().optional(),
  }).optional(),
});

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '10');
    const offset = parseInt(searchParams.get('offset') || '0');

    const db = await getDb();
    const generations = await db
      .collection('Generations')
      .find({}, { projection: { idempotency_key: 0 } })
      .sort({ created_at: -1 })
      .skip(offset)
      .limit(limit)
      .toArray();

    const genIds = generations.map((g: any) =>
      g._id instanceof ObjectId ? g._id.toString() : String(g._id)
    );

    // Script counts per generation
    const scriptAgg = await db.collection('Scripts')
      .aggregate([
        { $match: { generation_id: { $in: genIds } } },
        { $group: { _id: '$generation_id', count: { $sum: 1 } } },
      ])
      .toArray();
    const scriptCounts: Record<string, number> = {};
    scriptAgg.forEach((r: any) => { scriptCounts[r._id] = r.count; });

    // Asset counts: join Scripts → Scenes per generation
    const scripts = await db.collection('Scripts')
      .find({ generation_id: { $in: genIds } }, { projection: { _id: 1, generation_id: 1 } })
      .toArray();
    const scriptToGen: Record<string, string> = {};
    scripts.forEach((s: any) => { scriptToGen[s._id.toString()] = s.generation_id; });
    const scriptIds = scripts.map((s: any) => s._id.toString());

    const assetAgg = await db.collection('Scenes')
      .aggregate([
        { $match: { script_id: { $in: scriptIds } } },
        {
          $group: {
            _id: '$script_id',
            images: { $sum: { $cond: [{ $ifNull: ['$generated_image_path', false] }, 1, 0] } },
            videos: { $sum: { $cond: [{ $ifNull: ['$generated_video_path', false] }, 1, 0] } },
          },
        },
      ])
      .toArray();

    const imageCounts: Record<string, number> = {};
    const videoCounts: Record<string, number> = {};
    assetAgg.forEach((r: any) => {
      const gid = scriptToGen[r._id];
      if (!gid) return;
      imageCounts[gid] = (imageCounts[gid] ?? 0) + r.images;
      videoCounts[gid] = (videoCounts[gid] ?? 0) + r.videos;
    });

    return NextResponse.json({
      generations: (generations || []).map((g: any) => {
        const gid = g._id instanceof ObjectId ? g._id.toString() : String(g._id);
        const isV2 = Array.isArray(g.clips);
        const clips = isV2 ? (g.clips as any[]) : [];
        const v2Image = clips.filter((c) => c.generated_image_path).length;
        const v2Video = clips.filter((c) => c.generated_video_path).length;
        return {
          id: gid,
          format_version: g.format_version,
          status: g.status,
          progress: g.progress || 0,
          product_identifier: g.product_identifier,
          creative_idea_title: g.creative_idea_title ?? null,
          created_at: g.created_at,
          updated_at: g.updated_at,
          error_message: g.error_message,
          script_count: isV2 ? clips.length : (scriptCounts[gid] ?? 0),
          image_count: isV2 ? v2Image : (imageCounts[gid] ?? 0),
          video_count: isV2 ? v2Video : (videoCounts[gid] ?? 0),
        };
      }),
      total: generations?.length || 0,
      limit,
      offset
    });
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate request
    const validation = GenerationRequestSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid request' },
        { status: 400 }
      );
    }

    const payload = validation.data;
    const resolvedModelConfig = resolvePreset(validation.data.modelConfig?.preset ?? 'balanced');
    if (validation.data.modelConfig) {
      Object.assign(resolvedModelConfig, validation.data.modelConfig);
    }

    // Generate idempotency key
    const idempotencyKey = generateIdempotencyKey(payload);

    const db = await getDb();

    // Reject if queue is full
    const pendingCount = await db.collection('JobQueue').countDocuments({ status: 'pending' });
    if (pendingCount >= MAX_QUEUE_DEPTH) {
      return NextResponse.json({ error: 'Server sedang sibuk. Coba lagi dalam beberapa menit.' }, { status: 503 });
    }

    // Check if generation already exists
    const existing = await db.collection('Generations').findOne({ idempotency_key: idempotencyKey });

    if (existing) {
      return NextResponse.json({
        generationId: existing._id instanceof ObjectId ? existing._id.toString() : String(existing._id),
        status: existing.status,
        cached: true,
      });
    }

    const now = new Date();
    const insertResult = await db.collection('Generations').insertOne({
      idempotency_key: idempotencyKey,
      product_identifier: 'pending',
      product_image_url: payload.productImageUrl,
      model_image_url: payload.modelImageUrl || null,
      overrides: payload.visualOverrides || null,
      modelConfig: resolvedModelConfig,
      status: 'queued',
      progress: 0,
      error_message: null,
      created_at: now,
      updated_at: now,
    });

    if (!insertResult.acknowledged) {
      return NextResponse.json({ error: 'Failed to create generation' }, { status: 500 });
    }

    const generationId = insertResult.insertedId.toString();

    try {
      const { enqueueJob } = await import('@/app/lib/queue');
      await enqueueJob(generationId, payload);
    } catch (queueError) {
      return NextResponse.json({ error: 'Failed to enqueue job' }, { status: 500 });
    }

    return NextResponse.json({
      generationId,
      status: 'queued',
    });
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
