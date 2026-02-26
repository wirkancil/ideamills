import { NextRequest, NextResponse } from 'next/server';
import * as openai from '@/app/lib/adapters/openai';
import * as gemini from '@/app/lib/adapters/gemini';
import { z } from 'zod';

const AnalyzeImagesRequestSchema = z.object({
  productImageUrl: z.string().refine((val) => {
    return val.startsWith('data:image/') || z.string().url().safeParse(val).success;
  }, { message: "Must be a valid URL or Base64 data URI" }),
  modelImageUrl: z.string().nullable().optional().refine((val) => {
    if (!val) return true;
    return val.startsWith('data:image/') || z.string().url().safeParse(val).success;
  }, { message: "Must be a valid URL or Base64 data URI" }),
  engine: z.enum(['gpt-5.2', 'gemini-2.5-flash']),
});

export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    console.log('🔍 [API] Starting image analysis request...');

    const body = await request.json();
    console.log('🔍 [API] Request body received');

    // Validate request
    const validation = AnalyzeImagesRequestSchema.safeParse(body);
    if (!validation.success) {
      console.error('❌ [API] Validation failed:', validation.error.errors);
      return NextResponse.json(
        { error: 'Invalid request', details: validation.error.errors },
        { status: 400 }
      );
    }

    const { productImageUrl, modelImageUrl, engine } = validation.data;
    console.log(`🔍 [API] Product: ${productImageUrl.substring(0, 50)}...`);
    console.log(`🔍 [API] Model: ${modelImageUrl ? modelImageUrl.substring(0, 50) + '...' : 'None'}`);
    console.log(`🔍 [API] Engine: ${engine}`);

    // Set timeout for the entire operation (30 seconds)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      console.error('❌ [API] Analysis timeout after 30 seconds');
      controller.abort();
    }, 30000);

    try {
      // Analyze product image
      console.log('📦 [API] Starting product image analysis...');
      const productStartTime = Date.now();

      let productAnalysis;
      if (engine === 'gemini-2.5-flash') {
        productAnalysis = await gemini.visionDescribeProductGemini(
          productImageUrl,
          "Analyze this product image for advertising purposes",
          undefined
        );
      } else {
        productAnalysis = await openai.visionDescribeProduct(
          productImageUrl,
          "Analyze this product image for advertising purposes",
          undefined
        );
      }

      const productDuration = Date.now() - productStartTime;
      console.log(`✅ [API] Product analysis completed in ${productDuration}ms`);
      console.log('📊 [API] Product result:', JSON.stringify(productAnalysis, null, 2));

      let modelAnalysis = null;
      if (modelImageUrl) {
        console.log('👤 [API] Starting model image analysis...');
        const modelStartTime = Date.now();

        if (engine === 'gemini-2.5-flash') {
          modelAnalysis = await gemini.visionDescribeModelGemini(modelImageUrl);
        } else {
          modelAnalysis = await openai.visionDescribeModel(modelImageUrl);
        }

        const modelDuration = Date.now() - modelStartTime;
        console.log(`✅ [API] Model analysis completed in ${modelDuration}ms`);
        console.log('📊 [API] Model result:', JSON.stringify(modelAnalysis, null, 2));
      }

      clearTimeout(timeoutId);

      const totalDuration = Date.now() - startTime;
      console.log(`🎉 [API] Image analysis complete in ${totalDuration}ms`);

      return NextResponse.json({
        product: productAnalysis,
        model: modelAnalysis,
        analyzed_at: new Date().toISOString(),
        duration_ms: totalDuration,
      });

    } catch (analysisError) {
      clearTimeout(timeoutId);
      console.error('❌ [API] Analysis error:', analysisError);
      throw analysisError;
    }

  } catch (error) {
    console.error('❌ Image analysis failed:', error);
    return NextResponse.json(
      {
        error: 'Image analysis failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
