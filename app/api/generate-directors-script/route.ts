
import { NextRequest, NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { getDb } from '@/app/lib/mongoClient';
import { enrichVisualPrompts } from '@/app/lib/adapters/openai';
import { Variation } from '@/app/lib/types';

export async function POST(req: Request) {
  console.log('🎬 [API] generate-directors-script called');
  try {
    const body = await req.json();
    console.log('🎬 [API] Body:', JSON.stringify(body));
    const { generationId, variationId } = body;

    if (!generationId || !variationId) {
      console.error('🎬 [API] Missing generationId or variationId');
      return NextResponse.json(
        { error: 'Missing generationId or variationId' },
        { status: 400 }
      );
    }

    const db = await getDb();

    // 1. Get Generation to find product_identifier
    console.log(`🎬 [API] Fetching generation with ID: ${generationId}`);
    const generation = await db.collection('Generations').findOne({ _id: new ObjectId(generationId) });
    
    if (!generation) {
      console.error(`🎬 [API] Generation not found: ${generationId}`);
      return NextResponse.json({ 
        error: 'Generation not found', 
        receivedId: generationId,
        details: 'The generation ID provided does not exist in the Generations collection.'
      }, { status: 404 });
    }
    console.log(`🎬 [API] Generation found: ${generation._id}`);

    const productIdentifier = generation.product_identifier;
    if (!productIdentifier) {
      return NextResponse.json({ error: 'Product identifier not found in generation' }, { status: 404 });
    }

    // 2. Get Product Analysis
    let productAnalysis;

    if (productIdentifier === 'enhanced-flow') {
      console.log('🎬 [API] Enhanced flow detected, using overrides as product context');
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
        return NextResponse.json({ 
          error: 'Product analysis not found', 
          details: `Product identifier '${productIdentifier}' not found in Products collection.`
        }, { status: 404 });
      }
      productAnalysis = productDoc.description;
    }

    // 3. Get Model Analysis (optional)
    let modelAnalysis: any = { source: 'generic' };
    if (generation.model_identifier) {
      console.log(`🎬 [API] Fetching model analysis: ${generation.model_identifier}`);
      const modelDoc = await db.collection('Models').findOne({ model_identifier: generation.model_identifier });
      if (modelDoc && modelDoc.description) {
        modelAnalysis = modelDoc.description;
        console.log('🎬 [API] Model analysis found');
      } else {
        console.warn(`🎬 [API] Model identifier ${generation.model_identifier} found but document missing`);
      }
    }

    // 4. Get Script (Variation) and Scenes
    let script;
    if (ObjectId.isValid(variationId)) {
      console.log(`🎬 [API] Looking up script by _id: ${variationId}`);
      script = await db.collection('Scripts').findOne({ _id: new ObjectId(variationId) });
    } else if (variationId.startsWith('var_')) {
      // Handle "var_XXX" format from frontend
      const idxStr = variationId.replace('var_', '');
      const idx = parseInt(idxStr, 10);
      console.log(`🎬 [API] Looking up script by generation_id: ${generationId} and idx: ${idx}`);
      script = await db.collection('Scripts').findOne({ 
        generation_id: generationId, 
        idx: idx 
      });
    } else {
      console.error(`🎬 [API] Invalid variationId format: ${variationId}`);
      return NextResponse.json({ error: 'Invalid variation ID format' }, { status: 400 });
    }

    if (!script) {
      console.error(`🎬 [API] Script not found for variationId: ${variationId}`);
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
    const enrichedScripts = await enrichVisualPrompts(
      productAnalysis,
      modelAnalysis,
      generation.overrides || '',
      [variation]
    );

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
    console.error('Error generating director script:', error);
    return NextResponse.json(
      { error: 'Failed to generate director script' },
      { status: 500 }
    );
  }
}
