import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { generateImage, uploadImageAsset } from '@/app/lib/useapi';
import { logAssetUsage } from '@/app/lib/monitoring/assetUsage';
import { GOOGLE_FLOW_CREDIT_COSTS, GOOGLE_FLOW_CREDIT_PRICE_USD } from '@/app/lib/monitoring/creditCosts';

const RequestSchema = z.object({
  prompt: z.string().min(10).max(5000),
  productNotes: z.string().max(2000).optional().default(''),
  styleNotes: z.string().max(2000).optional().default(''),
  aspectRatio: z.enum(['portrait', 'landscape']).optional().default('portrait'),
  model: z.enum(['imagen-4', 'nano-banana-2', 'nano-banana-pro']).optional().default('imagen-4'),
  generationId: z.string().optional(),
  clipIndex: z.number().int().optional(),
  referenceDataUrls: z.array(z.string()).max(3).optional(),
});

/**
 * Strip video-specific instructions from clip prompt for static image generation.
 * Imagen tidak butuh tahu soal motion, lipsync, atau timing.
 */
function stripVideoInstructions(prompt: string): string {
  const videoPatterns = [
    /model berbicara langsung ke kamera[^.]*\./gi,
    /bibir bergerak sinkron[^.]*\./gi,
    /single continuous \d+-second take/gi,
    /static camera, fixed tripod position[^.]*\./gi,
    /clean video frame[^.]*\./gi,
    /model berbicara:\s*"[^"]*"/gi,
    /lipsync[^.]*\./gi,
    /eye-level framing/gi,
    /no on-screen graphics/gi,
  ];
  let cleaned = prompt;
  for (const pattern of videoPatterns) {
    cleaned = cleaned.replace(pattern, '');
  }
  // Cleanup: collapse multiple spaces, trim
  return cleaned.replace(/\s+/g, ' ').trim();
}

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

    const { prompt, productNotes, styleNotes, aspectRatio, model, generationId, clipIndex, referenceDataUrls } = parsed.data;
    const cleanedPrompt = stripVideoInstructions(prompt);
    const hasReferences = referenceDataUrls && referenceDataUrls.length > 0;
    // productNotes tidak dikirim ke Imagen — visual produk di-cover oleh reference image atau prompt
    // Satu-satunya exception: kalau user isi manual label text (dikirim dari ImageSlot sebagai productNotes)
    // dan ada reference image → kirim sebagai hint label teks saja
    const productSection = hasReferences && productNotes
      ? `Product label text: ${productNotes}`
      : '';
    const parts = [productSection, styleNotes, cleanedPrompt].filter((s) => s.trim().length > 0);
    const imageConstraintsCue = [
      'IMPORTANT: render exactly ONE person holding ONE product in a single unified scene.',
      'The person and product appear together naturally in one frame (composite is OK).',
      'Avoid: duplicate identical people, duplicate identical product instances, split-screen, picture-in-picture, collage layout, mirror reflections showing the same person or product twice.',
      'NO TEXT OVERLAY: do not add any caption, sticker, watermark, headline, subtitle, banner, badge, sale text, or floating text in the scene. The ONLY text allowed is text printed on the product label itself (which already exists on the actual product). Keep the rest of the frame clean of any added typography or graphics.',
    ].join(' ');
    const fullPrompt = [...parts, imageConstraintsCue].join('\n\n');
    const imgAspect = aspectRatio === 'portrait' ? '9:16' : '16:9';

    // Upload semua referensi secara paralel, skip yang gagal
    let referenceImageUrls: string[] | undefined;
    if (referenceDataUrls && referenceDataUrls.length > 0) {
      const results = await Promise.allSettled(
        referenceDataUrls.slice(0, 3).map((dataUrl) => uploadImageAsset(dataUrl))
      );
      const uploaded = results
        .filter((r): r is PromiseFulfilledResult<string> => r.status === 'fulfilled')
        .map((r) => r.value);
      if (uploaded.length > 0) referenceImageUrls = uploaded;
      const failed = results.filter((r) => r.status === 'rejected').length;
      if (failed > 0) console.warn(`[generate-image] ${failed} referensi gagal diupload, dilanjutkan dengan ${uploaded.length} referensi`);
    }

    const imgRes = await generateImage({
      prompt: fullPrompt,
      aspectRatio: imgAspect,
      model: referenceImageUrls ? (model === 'imagen-4' ? 'nano-banana-2' : model) : model,
      referenceImageUrls,
    });

    if (generationId !== undefined) {
      const creditCost = GOOGLE_FLOW_CREDIT_COSTS[model] ?? GOOGLE_FLOW_CREDIT_COSTS['imagen-4'];
      await logAssetUsage({
        generationId,
        clipIndex: clipIndex ?? -1,
        service: 'imagen',
        model,
        creditCost,
        costUsd: creditCost * GOOGLE_FLOW_CREDIT_PRICE_USD,
        createdAt: new Date(),
      });
    }

    // Download fifeUrl, convert ke base64 data URL
    const fetched = await fetch(imgRes.imageUrl);
    if (!fetched.ok) {
      return NextResponse.json(
        { error: `Failed to download image from useapi (${fetched.status})` },
        { status: 500 }
      );
    }
    const buffer = Buffer.from(await fetched.arrayBuffer());
    const base64 = buffer.toString('base64');

    // Detect actual mime type — Imagen sering output PNG, bukan JPEG.
    // Wrong mime di data URL bikin Veo reject image saat image-to-video.
    const contentType = fetched.headers.get('content-type') ?? '';
    let mime = 'image/jpeg';
    if (contentType.includes('png') || (buffer[0] === 0x89 && buffer[1] === 0x50)) {
      mime = 'image/png';
    } else if (contentType.includes('webp') || (buffer[8] === 0x57 && buffer[9] === 0x45)) {
      mime = 'image/webp';
    }
    const imageDataUrl = `data:${mime};base64,${base64}`;

    return NextResponse.json({
      imageDataUrl,
      mediaGenerationId: imgRes.mediaGenerationId,
    });
  } catch (error) {
    console.error('/api/studio/generate-image error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
