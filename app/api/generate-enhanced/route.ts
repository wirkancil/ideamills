import { NextRequest, NextResponse } from 'next/server';
import { generateIdempotencyKey } from '@/app/lib/utils';
import { enqueueJob } from '@/app/lib/queue';
import { z } from 'zod';
import { getDb } from '@/app/lib/mongoClient';
import { ObjectId } from 'mongodb';

const GenerateEnhancedRequestSchema = z.object({
  enhancedPrompt: z.string().min(50),
  productImageUrl: z.string().url(),
  modelImageUrl: z.string().url().nullable().optional(),
  engine: z.enum(['gpt-5.2', 'gemini-2.5-flash']),
  basicIdea: z.string().optional(), // Optional for backward compatibility
  storyboardCount: z.number().min(1).max(20).optional().default(5),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate request
    const validation = GenerateEnhancedRequestSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: validation.error.errors },
        { status: 400 }
      );
    }

    const { enhancedPrompt, productImageUrl, modelImageUrl, engine, basicIdea, storyboardCount } = validation.data;

    console.log('🚀 Starting enhanced generation...');
    console.log(`   Prompt length: ${enhancedPrompt.length} chars`);
    console.log(`   Engine: ${engine}`);
    console.log(`   Count: ${storyboardCount}`);

    // Generate idempotency key based on enhanced prompt and count
    const idempotencyKey = generateIdempotencyKey({
      enhancedPrompt,
      productImageUrl,
      modelImageUrl,
      engine,
      storyboardCount,
    });

    // Check if generation already exists
    const db = await getDb();
    const existing = await db.collection('Generations').findOne({ idempotency_key: idempotencyKey });

    if (existing) {
      const existingId = existing._id instanceof ObjectId ? existing._id.toString() : String(existing._id);
      console.log('✅ Found existing generation:', existingId);
      return NextResponse.json({
        generationId: existingId,
        status: existing.status,
        cached: true,
      });
    }

    const now = new Date();
    const insertResult = await db.collection('Generations').insertOne({
      idempotency_key: idempotencyKey,
      product_identifier: 'enhanced-flow',
      engine: engine,
      status: 'queued',
      progress: 0,
      overrides: enhancedPrompt,
      error_message: null,
      created_at: now,
      updated_at: now,
    });

    if (!insertResult.acknowledged) {
      return NextResponse.json({ error: 'Failed to create generation' }, { status: 500 });
    }

    const generationId = insertResult.insertedId.toString();

    // Enqueue job with enhanced prompt
    try {
      await enqueueJob(generationId, {
        productImageUrl: 'enhanced-flow', // Special marker for enhanced flow
        modelImageUrl: modelImageUrl || null,
        basicIdea: 'Enhanced Flow',
        engine,
        enhancedPrompt, // Include in payload for backward compatibility
        storyboardCount,
      });
      console.log(`✅ Enhanced job enqueued for generation ${generationId}`);
    } catch (queueError) {
      console.error('❌ Queue enqueue error:', queueError);
      return NextResponse.json({
        error: 'Failed to enqueue job',
        details: queueError instanceof Error ? queueError.message : 'Unknown queue error'
      }, { status: 500 });
    }

    return NextResponse.json({
      generationId,
      status: 'queued',
      enhanced: true,
    });

  } catch (error) {
    console.error('❌ Enhanced generation error:', error);
    return NextResponse.json({
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}
