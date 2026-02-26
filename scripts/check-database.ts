#!/usr/bin/env tsx
// Check database status - verify collections
// Usage: npx tsx scripts/check-database.ts

import './env';
import { getDb, closeDb } from '../app/lib/mongoClient';

async function checkDatabase() {
  console.log('🔍 Checking IdeaMill MongoDB Status...\n');
  console.log('='.repeat(60));

  try {
    const db = await getDb();
    
    // Check Collections
    console.log('2️⃣ Checking Collections...');
    const requiredCollections = [
      'Generations',
      'Ideas', 
      'JobQueue',
      'Products',
      'Scenes',
      'Scripts',
      // 'Tenants', // Maybe not used yet in Mongo migration
      // 'images.files', // GridFS
      // 'images.chunks' // GridFS
    ];

    const collections = await db.listCollections().toArray();
    const collectionNames = collections.map(c => c.name);
    
    const foundCollections: string[] = [];
    const missingCollections: string[] = [];

    for (const name of requiredCollections) {
      if (collectionNames.includes(name)) {
        foundCollections.push(name);
        const count = await db.collection(name).countDocuments();
        console.log(`   ✅ ${name} - EXISTS (${count} docs)`);
      } else {
        missingCollections.push(name);
        console.log(`   ❌ ${name} - NOT FOUND`);
      }
    }
    
    // Check GridFS
    const bucketName = process.env.MONGODB_BUCKET || 'images';
    if (collectionNames.includes(`${bucketName}.files`)) {
        console.log(`   ✅ ${bucketName}.files (GridFS) - EXISTS`);
        foundCollections.push(`${bucketName}.files`);
    } else {
        console.log(`   ❌ ${bucketName}.files (GridFS) - NOT FOUND`);
        missingCollections.push(`${bucketName}.files`);
    }

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('📊 Summary:');
    console.log(`   Found: ${foundCollections.length} collections`);
    console.log(`   Missing: ${missingCollections.length} collections`);

  } catch (error) {
    console.error('❌ Error checking database:', error);
  } finally {
    await closeDb();
  }
}

checkDatabase();
