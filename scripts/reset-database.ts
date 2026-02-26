#!/usr/bin/env tsx
/**
 * Database Reset Script for IdeaMill
 * This script provides utilities to reset MongoDB database data
 */

import './env';
import { getDb, closeDb } from '../app/lib/mongoClient';

async function resetDataOnly() {
  console.log('🔄 Starting data reset (MongoDB)...');

  try {
    const db = await getDb();
    
    // Clear collections
    const collections = ['Scenes', 'Scripts', 'Ideas', 'JobQueue', 'Generations', 'Models', 'Products'];
    
    for (const collectionName of collections) {
      console.log(`📝 Clearing ${collectionName} collection...`);
      try {
        await db.collection(collectionName).deleteMany({});
      } catch (err) {
        console.warn(`⚠️ Warning clearing ${collectionName}:`, err);
      }
    }

    console.log('✅ Data reset completed successfully!');
    await verifyReset();

  } catch (error) {
    console.error('❌ Data reset failed:', error);
    process.exit(1);
  } finally {
    await closeDb();
  }
}

async function verifyReset() {
  console.log('\n🔍 Verifying reset...');

  try {
    const db = await getDb();
    const collections = ['Generations', 'JobQueue', 'Scripts', 'Scenes', 'Ideas', 'Products', 'Models'];

    for (const name of collections) {
      const count = await db.collection(name).countDocuments();
      console.log(`📊 ${name}: ${count} records`);
    }

    console.log('✅ Verification complete!');

  } catch (error) {
    console.error('❌ Verification failed:', error);
  }
}

// Check if running directly
if (require.main === module) {
    resetDataOnly();
}

export { resetDataOnly };
