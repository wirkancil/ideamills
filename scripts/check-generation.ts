#!/usr/bin/env tsx
/**
 * Check if a specific generation exists in database
 */

import './env';
import { getDb, closeDb } from '../app/lib/mongoClient';
import { ObjectId } from 'mongodb';

const generationId = process.argv[2];

if (!generationId) {
  console.error('❌ Usage: tsx scripts/check-generation.ts <generation-id>');
  process.exit(1);
}

async function checkGeneration() {
  console.log(`🔍 Checking generation: ${generationId}\n`);

  try {
    const db = await getDb();
    
    // Try to fetch generation
    let query = {};
    try {
        query = { _id: new ObjectId(generationId) };
    } catch (e) {
        query = { _id: generationId }; // Fallback for string IDs if not ObjectId
    }

    const data = await db.collection('Generations').findOne(query);

    if (!data) {
      console.error('❌ Generation not found');
      
      // Try alternative query - list recent
      console.log('\n🔄 Listing recent generations...\n');
      const recent = await db.collection('Generations')
        .find({})
        .sort({ created_at: -1 })
        .limit(5)
        .toArray();
      
      if (recent.length === 0) {
        console.error('❌ No generations found in database');
      } else {
        console.log('✅ Recent generations:');
        console.table(recent.map(g => ({
            id: g._id.toString(),
            status: g.status,
            progress: g.progress,
            created: g.created_at
        })));
      }
      
      return;
    }

    console.log('✅ Generation found!');
    console.log('\nDetails:');
    console.log(`  ID: ${data._id}`);
    console.log(`  Status: ${data.status}`);
    console.log(`  Progress: ${data.progress}%`);
    console.log(`  Engine: ${data.engine}`);
    console.log(`  Created: ${data.created_at}`);
    console.log(`  Product: ${data.product_identifier}`);
    
    if (data.error_message) {
      console.log(`  Error: ${data.error_message}`);
    }

    // Check for related job
    const jobData = await db.collection('JobQueue').findOne({ generation_id: data._id.toString() });

    if (jobData) {
      console.log('\n✅ Job found!');
      console.log(`  Job Status: ${jobData.status}`);
      console.log(`  Created: ${jobData.created_at}`);
      if (jobData.started_at) console.log(`  Started: ${jobData.started_at}`);
      if (jobData.completed_at) console.log(`  Completed: ${jobData.completed_at}`);
      if (jobData.error) console.log(`  Error: ${jobData.error}`);
    } else {
      console.log('\n⚠️  No job found in queue');
      // Try finding by string ID if stored that way
      const jobDataAlt = await db.collection('JobQueue').findOne({ generation_id: generationId });
       if (jobDataAlt) {
        console.log('\n✅ Job found (via string match)!');
        console.log(`  Job Status: ${jobDataAlt.status}`);
      }
    }

  } catch (err) {
    console.error('❌ Unexpected error:', err);
  } finally {
      await closeDb();
  }
}

checkGeneration();
