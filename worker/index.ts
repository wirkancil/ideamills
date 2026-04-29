#!/usr/bin/env tsx
/**
 * Worker Entry Point
 * Loads environment variables before starting the worker
 */

import { config } from 'dotenv';
import path from 'path';

// IMPORTANT: Load .env.local FIRST before any other imports
config({ path: path.join(process.cwd(), '.env.local') });

// Verify critical env vars
if (!process.env.MONGODB_URI) {
  console.error('❌ ERROR: MONGODB_URI not found in .env.local');
  process.exit(1);
}
if (!process.env.OPENROUTER_API_KEY) {
  console.error('❌ ERROR: OPENROUTER_API_KEY not found in .env.local');
  process.exit(1);
}

console.log('✅ Environment variables loaded\n');

// Ensure MongoDB indexes, pre-register rate-limit buckets, then start worker
import('../app/lib/mongoClient').then(({ ensureIndexes }) =>
  ensureIndexes()
    .then(() => console.log('✅ MongoDB indexes ensured'))
    .catch((e) => console.warn('⚠️  Index setup warning:', e.message))
).then(async () => {
  // Pre-register LLM rate-limit buckets so capacity is set before first job
  const { initBucket } = await import('../app/lib/llm/rateLimiter');
  const { STANDARD_CONCURRENCY, STRUCTURED_CONCURRENCY } = await import('../app/lib/workerConfig');
  // Global cap: standard jobs × 8 inner goroutines + structured × 6 = cap per model key
  // We use a single "chat" bucket shared across models to cap total LLM calls
  await initBucket('chat:global', (STANDARD_CONCURRENCY * 8) + (STRUCTURED_CONCURRENCY * 3));
  console.log('✅ Rate-limit buckets initialized');
}).then(() =>
  import('./poll').catch((error) => {
    console.error('❌ Failed to start worker:', error);
    process.exit(1);
  })
);
