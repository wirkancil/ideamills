import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import * as llm from '@/app/lib/llm';
import { MODEL_REGISTRY } from '@/app/lib/llm';

export const config = { api: { bodyParser: { sizeLimit: '10mb' } } };

const AnalyzeImagesRequestSchema = z.object({
  productImageUrl: z.string().refine(
    (val) => val.startsWith('data:image/') || z.string().url().safeParse(val).success,
    { message: 'Must be a valid URL or Base64 data URI' }
  ),
  modelImageUrl: z
    .string()
    .nullable()
    .optional()
    .refine(
      (val) => !val || val.startsWith('data:image/') || z.string().url().safeParse(val).success,
      { message: 'Must be a valid URL or Base64 data URI' }
    ),
  visionModel: z.string().optional(),
});

export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    const body = await request.json();
    const validation = AnalyzeImagesRequestSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid request' },
        { status: 400 }
      );
    }

    const { productImageUrl, modelImageUrl, visionModel } = validation.data;

    // Reject oversized base64 payloads before hitting the LLM (~7.5MB base64 = ~5MB binary)
    const MAX_BASE64_BYTES = 7.5 * 1024 * 1024;
    if (productImageUrl.startsWith('data:') && productImageUrl.length > MAX_BASE64_BYTES) {
      return NextResponse.json({ error: 'Gambar produk terlalu besar. Maksimal ~5MB.' }, { status: 413 });
    }
    if (modelImageUrl?.startsWith('data:') && modelImageUrl.length > MAX_BASE64_BYTES) {
      return NextResponse.json({ error: 'Gambar model terlalu besar. Maksimal ~5MB.' }, { status: 413 });
    }

    const vision =
      visionModel && MODEL_REGISTRY.vision.some((m) => m.id === visionModel)
        ? visionModel
        : undefined;

    const product = await llm.visionDescribeProduct(
      productImageUrl,
      'Analyze this product image for advertising purposes',
      undefined,
      vision ? { vision } : undefined
    );

    const model = modelImageUrl
      ? await llm.visionDescribeModel(modelImageUrl, vision ? { vision } : undefined)
      : null;

    return NextResponse.json({
      product,
      model,
      analyzed_at: new Date().toISOString(),
      duration_ms: Date.now() - startTime,
    });
  } catch (error) {
    return NextResponse.json({ error: 'Image analysis failed' }, { status: 500 });
  }
}
