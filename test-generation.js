#!/usr/bin/env node
require('dotenv').config({ path: require('path').join(process.cwd(), '.env.local') });

const { createClient } = require('@supabase/supabase-js');
const { randomUUID } = require('crypto');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

async function createTestGeneration() {
  try {
    console.log('🧪 Creating test generation...');

    const genId = randomUUID();
    const testPayload = {
      productImageUrl: 'https://picsum.photos/seed/product123/400/400.jpg',
      modelImageUrl: 'https://picsum.photos/seed/model456/400/400.jpg',
      basicIdea: 'Test skincare product for brightening',
      engine: 'gpt-4o',
      visualOverrides: ''
    };

    // Insert generation record first
    const { error: genError } = await supabase
      .from('Generations')
      .insert({
        id: genId,
        idempotency_key: randomUUID(), // Add required idempotency_key
        product_identifier: 'test-product-' + Date.now(), // Add required product_identifier
        status: 'pending',
        progress: 0,
        created_at: new Date().toISOString()
      });

    if (genError) {
      console.error('Error creating generation:', genError);
      return;
    }

    // Insert job
    const { error: jobError } = await supabase
      .from('JobQueue')
      .insert({
        id: randomUUID(),
        generation_id: genId,
        payload: testPayload,
        status: 'pending',
        created_at: new Date().toISOString()
      });

    if (jobError) {
      console.error('Error creating job:', jobError);
      return;
    }

    console.log(`✅ Created test generation: ${genId.substring(0, 8)}...`);
    console.log('📋 Test job added to queue');
    console.log('Worker should pick it up automatically...');

  } catch (error) {
    console.error('Test generation error:', error);
  }
}

createTestGeneration();