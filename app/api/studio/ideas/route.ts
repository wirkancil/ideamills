import { NextRequest, NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { z } from 'zod';
import { getDb } from '@/app/lib/mongoClient';
import { resolvePreset, visionCombined, ideateFromImages } from '@/app/lib/llm';
import { generateIdempotencyKey } from '@/app/lib/utils';

const PRESET_NAMES = ['fast', 'balanced', 'premium', 'custom'] as const;

const RequestSchema = z.object({
  generationId: z.string().nullable().optional(),
  productImageUrl: z.string().min(1),
  modelImageUrl: z.string().nullable().optional(),
  brief: z.string().max(5000).nullable().optional().default(''),
  preset: z.enum(PRESET_NAMES).optional().default('fast'),
  textModel: z.string().nullable().optional(),
  visionModel: z.string().nullable().optional(),
  veoModel: z.string().nullable().optional(),
  aspectRatio: z.enum(['landscape', 'portrait']).nullable().optional(),
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

    const { generationId, productImageUrl, modelImageUrl, preset, textModel, visionModel, veoModel, aspectRatio } = parsed.data;
    const brief = parsed.data.brief ?? '';
    const baseConfig = resolvePreset(preset);

    // Vision config — kalau user pilih visionModel, override default preset.
    const visionConfig = {
      ...baseConfig,
      ...(visionModel ? { vision: visionModel } : {}),
    };
    const textConfig = {
      ...baseConfig,
      ...(textModel ? { ideas: textModel, expand: textModel } : {}),
    };

    const ctx = generationId ? { generationId } : undefined;
    const visionResult = await visionCombined(
      productImageUrl,
      modelImageUrl ?? null,
      brief,
      visionConfig,
      ctx
    );
    const ideas = await ideateFromImages(
      visionResult.productAnalysis,
      visionResult.modelAnalysis,
      brief,
      textConfig,
      ctx
    );

    const db = await getDb();
    const now = new Date();
    let id: string;

    if (generationId) {
      let oid: ObjectId;
      try {
        oid = new ObjectId(generationId);
      } catch {
        return NextResponse.json({ error: 'Invalid generationId' }, { status: 400 });
      }
      const updateResult = await db.collection('Generations').updateOne(
        { _id: oid },
        {
          $set: {
            productAnalysis: visionResult.productAnalysis,
            modelAnalysis: visionResult.modelAnalysis,
            ideas,
            selectedIdeaIndex: null,
            styleNotes: null,
            clips: [],
            status: 'queued',
            progress: 0,
            progress_label: 'Ide regenerated',
            modelConfig: textConfig,
            ...(veoModel ? { veo_model: veoModel } : {}),
            ...(aspectRatio ? { aspect_ratio: aspectRatio } : {}),
            updated_at: now,
          },
        }
      );
      if (updateResult.matchedCount === 0) {
        return NextResponse.json({ error: 'Generation not found' }, { status: 404 });
      }
      id = generationId;
    } else {
      const idempotencyKey = generateIdempotencyKey({
        productImageUrl,
        modelImageUrl,
        brief,
        ts: now.getTime(),
      });
      const insertResult = await db.collection('Generations').insertOne({
        idempotency_key: idempotencyKey,
        product_image_url: productImageUrl,
        model_image_url: modelImageUrl ?? null,
        brief,
        productAnalysis: visionResult.productAnalysis,
        modelAnalysis: visionResult.modelAnalysis,
        ideas,
        product_identifier: visionResult.productAnalysis.brand ?? 'Unknown',
        source: 'studio',
        status: 'queued',
        progress: 0,
        progress_label: 'Ide siap',
        modelConfig: textConfig,
        ...(veoModel ? { veo_model: veoModel } : {}),
        ...(aspectRatio ? { aspect_ratio: aspectRatio } : {}),
        created_at: now,
        updated_at: now,
      });
      id = insertResult.insertedId.toString();
    }

    return NextResponse.json({
      generationId: id,
      productAnalysis: visionResult.productAnalysis,
      modelAnalysis: visionResult.modelAnalysis,
      ideas,
    });
  } catch (error) {
    console.error('/api/studio/ideas error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
