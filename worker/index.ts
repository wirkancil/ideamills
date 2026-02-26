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
if (!process.env.OPENAI_API_KEY) {
  console.error('❌ ERROR: OPENAI_API_KEY not found in .env.local');
  process.exit(1);
}

console.log('✅ Environment variables loaded\n');

// Now import and run the worker
import('./poll').catch((error) => {
  console.error('❌ Failed to start worker:', error);
  process.exit(1);
});
