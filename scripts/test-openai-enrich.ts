
import { config } from 'dotenv';
import path from 'path';

// Load environment variables immediately
config({ path: path.resolve(process.cwd(), '.env.local') });

async function runTest() {
  try {
    console.log('🧪 Testing OpenAI Enrichment...');
    
    const { enrichVisualPrompts } = await import('../app/lib/adapters/openai');

    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY is not set in .env.local');
    }

    // Mock data
    const product = {
      brand: "TestBrand",
      category: "Skincare",
      form_factor: "Bottle",
      target_audience: "Women 25-35",
      style: "Minimalist",
      color_scheme: "White, Gold",
      key_benefit: "Hydration",
      notable_text: "Pure Glow",
      ingredients: "Aloe Vera",
      additional_notes: "Soft lighting"
    };

    const model = {
      gender: "Female",
      age_range: "Young Adult",
      hair_style: "Long Straight",
      ethnicity: "Asian",
      skin_tone: "Fair",
      expression: "Natural Smile",
      body_type: "Slim",
      pose: "Portrait",
      model_notes: "Natural makeup"
    };

    const scripts = [
      {
        id: "test-script-1",
        theme: "Daily Routine",
        scenes: [
          {
            struktur: "Hook",
            naskah_vo: "Awali harimu dengan kesegaran.",
            visual_idea: "Model washing face with water splash."
          }
        ]
      }
    ];

    console.log('\nEnriching script...');
    const enriched = await enrichVisualPrompts(product, model as any, '', scripts);
    
    console.log('\nEnriched Script Result:');
    console.log(JSON.stringify(enriched[0], null, 2));

    if (enriched[0].directors_script) {
        console.log('\n✅ PASS: directors_script found!');
    } else {
        console.error('\n❌ FAIL: directors_script MISSING!');
    }

  } catch (error: unknown) {
    console.error('❌ Test failed:', error);
  }
}

runTest();
