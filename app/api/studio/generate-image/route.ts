import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { generateImage } from '@/app/lib/useapi';

const RequestSchema = z.object({
  prompt: z.string().min(10).max(5000),
  productNotes: z.string().max(2000).optional().default(''),
  styleNotes: z.string().max(2000).optional().default(''),
  aspectRatio: z.enum(['portrait', 'landscape']).optional().default('portrait'),
  model: z.enum(['imagen-4', 'nano-banana-2', 'nano-banana-pro']).optional().default('imagen-4'),
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

    const { prompt, productNotes, styleNotes, aspectRatio, model } = parsed.data;
    const cleanedPrompt = stripVideoInstructions(prompt);
    const parts = [productNotes, styleNotes, cleanedPrompt].filter((s) => s.trim().length > 0);
    // Anti-duplication + anti-text-overlay cue.
    // Imagen kadang render: (1) duplikat model/produk identik, (2) text overlay
    // tambahan (caption, sticker, watermark) di luar label produk asli.
    const imageConstraintsCue = [
      'IMPORTANT: render exactly ONE person holding ONE product in a single unified scene.',
      'The person and product appear together naturally in one frame (composite is OK).',
      'Avoid: duplicate identical people, duplicate identical product instances, split-screen, picture-in-picture, collage layout, mirror reflections showing the same person or product twice.',
      'NO TEXT OVERLAY: do not add any caption, sticker, watermark, headline, subtitle, banner, badge, sale text, or floating text in the scene. The ONLY text allowed is text printed on the product label itself (which already exists on the actual product). Keep the rest of the frame clean of any added typography or graphics.',
    ].join(' ');
    const fullPrompt = [...parts, imageConstraintsCue].join('\n\n');
    const imgAspect = aspectRatio === 'portrait' ? '9:16' : '16:9';

    const imgRes = await generateImage({
      prompt: fullPrompt,
      aspectRatio: imgAspect,
      model,
    });

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
