import { NextRequest, NextResponse } from 'next/server';
import { generateIdempotencyKey } from '@/app/lib/utils';
import { enqueueJob } from '@/app/lib/queue';
import { z } from 'zod';
import { getDb } from '@/app/lib/mongoClient';
import { ObjectId } from 'mongodb';
import { resolvePreset } from '@/app/lib/llm';
import { MAX_QUEUE_DEPTH } from '@/app/lib/workerConfig';

const PRESET_NAMES = ['fast', 'balanced', 'premium', 'custom'] as const;

const ModelConfigSchema = z.object({
  preset: z.enum(PRESET_NAMES).optional(),
  vision: z.string().optional(),
  ideation: z.string().optional(),
  embedding: z.string().optional(),
  scripting: z.string().optional(),
  visualPrompt: z.string().optional(),
  text2img: z.string().optional(),
}).optional();

const GenerateEnhancedRequestSchema = z.object({
  // Images
  productImageUrl: z.string().url(),
  modelImageUrl: z.string().url().nullable().optional(),

  // User inputs
  basicIdea: z.string().min(1),
  storyboardCount: z.number().min(1).max(10).default(5),

  // Structured context from UI steps
  product: z.record(z.unknown()),
  model: z.record(z.unknown()).nullable().optional(),
  creativeIdea: z.object({
    title: z.string(),
    concept: z.string(),
    storyline: z.string(),
    key_message: z.string().optional(),
    why_effective: z.string().optional(),
  }),

  modelConfig: ModelConfigSchema,
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const validation = GenerateEnhancedRequestSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid request' },
        { status: 400 }
      );
    }

    const {
      productImageUrl,
      modelImageUrl,
      basicIdea,
      storyboardCount,
      product,
      model,
      creativeIdea,
      modelConfig: rawModelConfig,
    } = validation.data;

    const resolvedModelConfig = resolvePreset(rawModelConfig?.preset ?? 'balanced');
    if (rawModelConfig) Object.assign(resolvedModelConfig, rawModelConfig);

    const idempotencyKey = generateIdempotencyKey({
      productImageUrl,
      modelImageUrl,
      basicIdea,
      storyboardCount,
      creativeIdea,
    });

    const db = await getDb();

    // Reject if queue is full
    const pendingCount = await db.collection('JobQueue').countDocuments({ status: 'pending' });
    if (pendingCount >= MAX_QUEUE_DEPTH) {
      return NextResponse.json({ error: 'Server sedang sibuk. Coba lagi dalam beberapa menit.' }, { status: 503 });
    }

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
      product_identifier: 'enhanced-flow',
      creative_idea_title: creativeIdea.title,
      product_image_url: productImageUrl,
      model_image_url: modelImageUrl || null,
      status: 'queued',
      progress: 0,
      modelConfig: resolvedModelConfig,
      error_message: null,
      created_at: now,
      updated_at: now,
    });

    if (!insertResult.acknowledged) {
      return NextResponse.json({ error: 'Failed to create generation' }, { status: 500 });
    }

    const generationId = insertResult.insertedId.toString();

    await enqueueJob(generationId, {
      productImageUrl,
      modelImageUrl: modelImageUrl || null,
      basicIdea,
      storyboardCount,
      product,
      model: model ?? null,
      creativeIdea,
    });

    return NextResponse.json({ generationId, status: 'queued' });

  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
