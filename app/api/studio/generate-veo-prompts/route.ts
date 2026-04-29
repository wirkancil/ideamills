import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { ObjectId } from 'mongodb';
import { getDb } from '@/app/lib/mongoClient';
import { enrichVisualPrompts } from '@/app/lib/llm';
import type { Variation } from '@/app/lib/types';

const Schema = z.object({
  generationId: z.string().min(1),
  modelConfig: z.record(z.unknown()).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const validation = Schema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }

    const { generationId, modelConfig } = validation.data;

    let objectId: ObjectId;
    try {
      objectId = new ObjectId(generationId);
    } catch {
      return NextResponse.json({ error: 'Invalid generation ID' }, { status: 400 });
    }

    const db = await getDb();
    const generation = await db.collection('Generations').findOne({ _id: objectId });
    if (!generation) {
      return NextResponse.json({ error: 'Generation not found' }, { status: 404 });
    }

    // Fetch scenes via scripts
    const scripts = await db.collection('Scripts').find({ generation_id: generationId }).toArray();
    if (scripts.length === 0) {
      return NextResponse.json({ error: 'No scripts found' }, { status: 404 });
    }

    const scriptIds = scripts.map((s) => s._id.toString());
    const scenes = await db.collection('Scenes')
      .find({ script_id: { $in: scriptIds } })
      .sort({ order: 1 })
      .toArray();

    if (scenes.length === 0) {
      return NextResponse.json({ error: 'No scenes found' }, { status: 404 });
    }

    // Build minimal product context from generation
    const productAnalysis = {
      brand: '',
      form_factor: '',
      category: '',
      key_benefit: generation.overrides || generation.creative_idea_title || '',
      additional_notes: generation.overrides || '',
      notable_text: '',
    };
    const modelAnalysis = { source: 'generic' as const };

    // Build variation for enrichVisualPrompts
    const variation: Variation = {
      id: scripts[0]._id.toString(),
      theme: scripts[0].theme || '',
      scenes: scenes.map((s) => ({
        struktur: s.struktur,
        naskah_vo: s.naskah_vo,
        visual_idea: s.visual_idea || s.naskah_vo,
        text_to_image: s.text_to_image || '',
        image_to_video: s.image_to_video || '',
      })),
    };

    const enriched = await enrichVisualPrompts(
      productAnalysis,
      modelAnalysis,
      generation.overrides || '',
      [variation],
      modelConfig as Record<string, string> | undefined,
      generationId
    ) as Array<{ scenes?: Array<{ image_to_video?: string; text_to_image?: string }> }>;

    const enrichedScenes = enriched[0]?.scenes ?? [];

    // Update each scene in DB
    const updates = await Promise.all(
      scenes.map(async (scene, idx) => {
        const ep = enrichedScenes[idx];
        if (!ep) return null;

        const update: Record<string, string> = { updated_at: new Date().toISOString() };
        if (ep.image_to_video) update.image_to_video = ep.image_to_video;
        if (ep.text_to_image && !scene.text_to_image) update.text_to_image = ep.text_to_image;

        await db.collection('Scenes').updateOne(
          { _id: scene._id },
          { $set: update }
        );

        return {
          id: scene._id.toString(),
          image_to_video: ep.image_to_video || scene.image_to_video || '',
          text_to_image: ep.text_to_image || scene.text_to_image || '',
        };
      })
    );

    // Mark generation as no longer needing veo prompts
    await db.collection('Generations').updateOne(
      { _id: objectId },
      { $set: { needs_veo_prompt: false, updated_at: new Date() } }
    );

    return NextResponse.json({ scenes: updates.filter(Boolean) });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to generate Veo prompts' }, { status: 500 });
  }
}
