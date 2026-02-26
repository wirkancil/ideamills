
import { config } from 'dotenv';
import path from 'path';

// Load environment variables immediately
config({ path: path.resolve(process.cwd(), '.env.local') });

async function runTest() {
  try {
    console.log('🧪 Testing Gemini Integration...');
    
    // Dynamic import to ensure env vars are loaded first
    const { visionDescribeProductGemini, visionDescribeModelGemini, ideation50Gemini, script5Gemini } = await import('../app/lib/adapters/gemini');

    if (!process.env.GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY is not set in .env.local');
    }
    
    // Check MongoDB connection (optional but good to know)
    if (!process.env.MONGODB_URI) {
        console.warn('Warning: MONGODB_URI is not set, some functions might fail if they depend on DB.');
    }

    // Use a real product image (Headphones) from Unsplash for better analysis
    const productImageUrl = 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?q=80&w=1000&auto=format&fit=crop';

    console.log(`\nAnalyzing product image: ${productImageUrl}`);
    const productDesc = await visionDescribeProductGemini(productImageUrl);
    console.log('Product Description:', JSON.stringify(productDesc, null, 2));

    // Test model description
    const modelUrl = 'https://picsum.photos/seed/model456/400/400.jpg';
    console.log(`\nAnalyzing model image: ${modelUrl}`);
    const modelDesc = await visionDescribeModelGemini(modelUrl);
    console.log('Model Description:', JSON.stringify(modelDesc, null, 2));

    // Test ideation
    if (productDesc && Object.keys(productDesc).length > 0) {
      console.log('\nGenerating ideas...');
      // Cast to any to bypass type check for now since we are in a script
      const ideas = await ideation50Gemini(productDesc as any, 'Test Idea');
      console.log(`Generated ${ideas.length} ideas.`);
      if (ideas.length > 0) {
        console.log('Sample idea:', ideas[0]);
      }
    } else {
      console.log('Skipping ideation due to empty product description.');
    }

    // Test script generation
    console.log('\nGenerating script for theme: "Test Theme"');
    const scripts = await script5Gemini('Test Theme');
    console.log(`Generated ${scripts.length} script variations.`);
    if (scripts.length > 0) {
      console.log('Sample script structure:', JSON.stringify(scripts[0], null, 2));
    }

    // Close DB connection if needed
    const { closeDb } = await import('../app/lib/mongoClient');
    await closeDb();

  } catch (error: unknown) {
    if (error instanceof Error) {
      console.error('❌ Test failed:', error.message);
      if (error.stack) console.error(error.stack);
    } else {
      console.error('❌ Test failed with unknown error:', String(error));
    }
    process.exit(1);
  }
}

runTest();
