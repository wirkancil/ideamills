import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { ObjectId } from 'mongodb';
import { getDb } from '@/app/lib/mongoClient';
import { saveImage } from '@/app/lib/storage';

const SceneInputSchema = z.object({
  struktur: z.string().default('Hook'),
  naskah_vo: z.string().default(''),
  text_to_image: z.string().optional().default(''),
  image_to_video: z.string().optional().default(''),
  imageDataUrl: z.string().optional().nullable(),
});

const StudioCreateSchema = z.object({
  productImageUrl: z.string().min(1),
  modelImageUrl: z.string().nullable().optional(),
  brief: z.string().optional().default(''),
  scenes: z.array(SceneInputSchema).optional(),
  modelConfig: z.record(z.unknown()).optional(),
});

const DEFAULT_STRUCTURES = ['Hook', 'Problem', 'Solution', 'CTA'];

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const validation = StudioCreateSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }

    const { productImageUrl, modelImageUrl, brief, scenes, modelConfig } = validation.data;

    const db = await getDb();
    const generationId = new ObjectId();
    const generationIdStr = generationId.toString();
    const now = new Date();
    const timestamp = now.getTime();

    // Save product image to storage if base64
    let storedProductUrl = productImageUrl;
    if (productImageUrl.startsWith('data:')) {
      const imagePath = await saveImage(productImageUrl, generationIdStr, 'product.jpg');
      storedProductUrl = imagePath;
    }

    let storedModelUrl: string | null = null;
    if (modelImageUrl) {
      if (modelImageUrl.startsWith('data:')) {
        const imagePath = await saveImage(modelImageUrl, generationIdStr, 'model.jpg');
        storedModelUrl = imagePath;
      } else {
        storedModelUrl = modelImageUrl;
      }
    }

    type SceneInput = typeof scenes extends (infer T)[] | undefined ? NonNullable<T> : never;
    const sceneInputs: SceneInput[] = (scenes && scenes.length > 0
      ? scenes
      : DEFAULT_STRUCTURES.map((s) => ({ struktur: s, naskah_vo: '', text_to_image: '', image_to_video: '', imageDataUrl: null }))) as SceneInput[];

    // Detect shortcut level
    const hasVeoPrompts = sceneInputs.every((s) => s.image_to_video && s.image_to_video.trim() !== '');
    const hasScenes = scenes && scenes.length > 0;

    // Create Generation doc
    await db.collection('Generations').insertOne({
      _id: generationId,
      product_identifier: `studio-${timestamp}`,
      model_identifier: null,
      creative_idea_title: brief?.slice(0, 80) || 'Studio Draft',
      product_image_url: storedProductUrl,
      model_image_url: storedModelUrl,
      overrides: brief || null,
      modelConfig: modelConfig ?? null,
      engine: 'studio',
      status: 'completed',
      progress: 100,
      progress_label: 'Studio draft ready',
      error_message: null,
      needs_veo_prompt: !hasVeoPrompts,
      created_at: now,
      updated_at: now,
    });

    // Create Script doc
    const scriptId = new ObjectId();
    await db.collection('Scripts').insertOne({
      _id: scriptId,
      generation_id: generationIdStr,
      idea_id: generationIdStr,
      theme: brief?.slice(0, 120) || 'Studio Draft',
      idx: 0,
      directors_script: null,
      created_at: now,
    });

    // Save per-scene uploaded images and create Scene docs
    const sceneDocs = await Promise.all(
      sceneInputs.map(async (s, idx) => {
        let imageStatus: string = 'pending';
        let imagePath: string | null = null;
        let imageSource: string | null = null;

        if (s.imageDataUrl) {
          try {
            imagePath = await saveImage(s.imageDataUrl, generationIdStr, `scene-${idx}.jpg`);
            imageStatus = 'done';
            imageSource = 'user';
          } catch {
            imageStatus = 'failed';
          }
        } else if (storedProductUrl) {
          // Default: use product image as scene image
          imagePath = storedProductUrl;
          imageStatus = 'done';
          imageSource = 'user';
        }

        return {
          _id: new ObjectId(),
          script_id: scriptId.toString(),
          order: idx,
          struktur: s.struktur,
          naskah_vo: s.naskah_vo,
          visual_idea: s.naskah_vo,
          text_to_image: s.text_to_image || '',
          image_to_video: s.image_to_video || '',
          image_status: imageStatus,
          video_status: 'pending',
          image_source: imageSource,
          image_error: null,
          video_error: null,
          generated_image_path: imagePath,
          generated_video_path: null,
          created_at: now,
          updated_at: now,
        };
      })
    );

    if (sceneDocs.length > 0) {
      await db.collection('Scenes').insertMany(sceneDocs);
    }

    return NextResponse.json({
      generationId: generationIdStr,
      needsVeoPrompt: !hasVeoPrompts,
      hasScenes,
      sceneCount: sceneDocs.length,
    });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to create studio draft' }, { status: 500 });
  }
}
