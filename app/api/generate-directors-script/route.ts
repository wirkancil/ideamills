
import { NextRequest, NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { getDb } from '@/app/lib/mongoClient';
import { enrichVisualPrompts } from '@/app/lib/llm';
import { Variation } from '@/app/lib/types';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { generationId, variationId } = body;

    if (!generationId || !variationId) {
      return NextResponse.json(
        { error: 'Missing generationId or variationId' },
        { status: 400 }
      );
    }

    const db = await getDb();

    const generation = await db.collection('Generations').findOne({ _id: new ObjectId(generationId) });

    if (!generation) {
      return NextResponse.json({ error: 'Generation not found' }, { status: 404 });
    }
    const productIdentifier = generation.product_identifier;
    if (!productIdentifier) {
      return NextResponse.json({ error: 'Product identifier not found in generation' }, { status: 404 });
    }

    // 2. Get Product Analysis
    let productAnalysis;

    if (productIdentifier === 'enhanced-flow') {
      if (!generation.overrides) {
         return NextResponse.json({ error: 'Enhanced flow generation missing overrides' }, { status: 404 });
      }
      productAnalysis = {
        brand: 'Creative Concept',
        form_factor: 'Contextual',
        category: 'Creative Brief',
        key_benefit: 'Derived from creative brief',
        additional_notes: generation.overrides,
        notable_text: ''
      };
    } else {
      const productDoc = await db.collection('Products').findOne({ product_identifier: productIdentifier });
      if (!productDoc || !productDoc.description) {
        return NextResponse.json({ error: 'Product analysis not found' }, { status: 404 });
      }
      productAnalysis = productDoc.description;
    }

    // 3. Get Model Analysis (optional)
    let modelAnalysis: any = { source: 'generic' };
    if (generation.model_identifier) {
      const modelDoc = await db.collection('Models').findOne({ model_identifier: generation.model_identifier });
      if (modelDoc && modelDoc.description) {
        modelAnalysis = modelDoc.description;
      }
    }

    // 4. Get Script (Variation) and Scenes
    let script;
    if (ObjectId.isValid(variationId)) {
      script = await db.collection('Scripts').findOne({ _id: new ObjectId(variationId) });
    } else if (variationId.startsWith('var_')) {
      const idx = parseInt(variationId.replace('var_', ''), 10);
      script = await db.collection('Scripts').findOne({ generation_id: generationId, idx });
    } else {
      return NextResponse.json({ error: 'Invalid variation ID format' }, { status: 400 });
    }

    if (!script) {
      return NextResponse.json({ error: 'Script not found' }, { status: 404 });
    }

    // Get the real _id string for later use
    const scriptId = script._id.toString();

    const scenes = await db.collection('Scenes')
      .find({ script_id: scriptId })
      .sort({ order: 1 })
      .toArray();

    // Construct Variation object for enrichment
    const variation: Variation = {
      id: scriptId, // Use real DB ID here for internal processing
      theme: script.theme,
      scenes: scenes.map(s => ({
        struktur: s.struktur,
        naskah_vo: s.naskah_vo,
        visual_idea: s.visual_idea,
        text_to_image: s.text_to_image,
        image_to_video: s.image_to_video
      }))
    };

    // 5. Generate Director's Script
    // We pass an array of 1 script
    const enrichedScripts = (await enrichVisualPrompts(
      productAnalysis,
      modelAnalysis,
      generation.overrides || '',
      [variation],
      generation.modelConfig,
      generationId
    )) as Array<{ directors_script?: string }>;

    if (!enrichedScripts || enrichedScripts.length === 0 || !enrichedScripts[0].directors_script) {
      throw new Error('Failed to generate director script content');
    }

    const generatedScript = enrichedScripts[0].directors_script;

    // 6. Update Script in DB
    await db.collection('Scripts').updateOne(
      { _id: script._id },
      { $set: { directors_script: generatedScript } }
    );

    return NextResponse.json({ directors_script: generatedScript });

  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to generate director script' },
      { status: 500 }
    );
  }
}
