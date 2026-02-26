import { NextRequest, NextResponse } from 'next/server';
import { generateIdempotencyKey } from '@/app/lib/utils';
import { GenerationRequest } from '@/app/lib/types';
import { z } from 'zod';
import { getDb } from '@/app/lib/mongoClient';
import { ObjectId } from 'mongodb';

const GenerationRequestSchema = z.object({
  productImageUrl: z.string().url(),
  modelImageUrl: z.string().url().nullable().optional(),
  basicIdea: z.string().min(10),
  engine: z.enum(['gpt-5.2', 'gemini-2.5-flash']),
  visualOverrides: z.string().nullable().optional(),
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

    return NextResponse.json({
      generations: (generations || []).map((g: any) => ({
        id: g._id instanceof ObjectId ? g._id.toString() : String(g._id),
        status: g.status,
        progress: g.progress || 0,
        product_identifier: g.product_identifier,
        engine: g.engine,
        created_at: g.created_at,
        updated_at: g.updated_at,
        error_message: g.error_message,
      })),
      total: generations?.length || 0,
      limit,
      offset
    });
  } catch (error) {
    console.error('❌ Generations fetch error:', error);
    return NextResponse.json({
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate request
    const validation = GenerationRequestSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: validation.error.errors },
        { status: 400 }
      );
    }

    const payload: GenerationRequest = validation.data;

    // Generate idempotency key
    const idempotencyKey = generateIdempotencyKey(payload);

    // Check if generation already exists
    const db = await getDb();
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
      engine: payload.engine,
      product_image_url: payload.productImageUrl,
      model_image_url: payload.modelImageUrl || null,
      overrides: payload.visualOverrides || null,
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
      console.error('❌ Queue enqueue error:', queueError);
      console.error('Queue error details:', JSON.stringify(queueError, null, 2));
      return NextResponse.json({ 
        error: 'Failed to enqueue job',
        details: queueError instanceof Error ? queueError.message : 'Unknown queue error'
      }, { status: 500 });
    }

    return NextResponse.json({
      generationId,
      status: 'queued',
    });
  } catch (error) {
    console.error('❌ Generation creation error:', error);
    console.error('Full error stack:', error instanceof Error ? error.stack : 'No stack trace');
    console.error('Error type:', typeof error);
    console.error('Error details:', JSON.stringify(error, null, 2));
    
    return NextResponse.json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error',
      type: error instanceof Error ? error.constructor.name : typeof error
    }, { status: 500 });
  }
}
