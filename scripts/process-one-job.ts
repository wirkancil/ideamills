#!/usr/bin/env tsx
/**
 * Manually process one pending job
 * Use this as a workaround if worker won't start
 */

import './env';
import { getDb, closeDb } from '../app/lib/mongoClient';
import { runGeneration } from '../worker/runGeneration';

console.log('🔧 Manual Job Processor (MongoDB)\n');

async function processOneJob() {
  try {
    const db = await getDb();
    
    // Get pending job
    const job = await db.collection('JobQueue')
      .findOne(
        { status: 'pending' },
        { sort: { created_at: 1 } }
      );

    if (!job) {
      console.log('❌ No pending jobs found');
      return;
    }

    console.log(`✅ Found job: ${job._id}`);
    console.log(`   Generation: ${job.generation_id}\n`);

    // Mark as processing
    await db.collection('JobQueue').updateOne(
      { _id: job._id },
      { $set: { status: 'processing', started_at: new Date().toISOString() } }
    );

    console.log('⚙️  Job marked as processing');
    console.log('🚀 Starting generation...\n');

    // Run generation
    await runGeneration(job.generation_id, job.payload);

    // Mark as completed
    await db.collection('JobQueue').updateOne(
      { _id: job._id },
      { $set: { status: 'completed', completed_at: new Date().toISOString() } }
    );

    console.log('\n✅ Job completed successfully!');

  } catch (error) {
    console.error('\n❌ Error processing job:', error);
    process.exit(1);
  } finally {
    await closeDb();
  }
}

processOneJob();
