#!/usr/bin/env tsx
/**
 * Reset stuck jobs back to pending
 */

import './env';
import { getDb, closeDb } from '../app/lib/mongoClient';

async function resetStuckJobs() {
  console.log('🔄 Resetting stuck jobs...\n');

  try {
    const db = await getDb();
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();

    // Find jobs stuck in processing for > 5 minutes
    const stuckJobs = await db.collection('JobQueue')
      .find({
        status: 'processing',
        started_at: { $lt: fiveMinutesAgo }
      })
      .toArray();

    if (stuckJobs.length === 0) {
      // Check all processing jobs just in case
      const allProcessing = await db.collection('JobQueue')
        .find({ status: 'processing' })
        .toArray();
      
      if (allProcessing.length > 0) {
        console.log(`⚠️  Found ${allProcessing.length} processing job(s), resetting...`);
        
        for (const job of allProcessing) {
          await db.collection('JobQueue').updateOne(
            { _id: job._id },
            { $set: { status: 'pending', started_at: null } }
          );
          console.log(`   ✅ Reset job ${job._id}`);
        }
      } else {
        console.log('✅ No stuck jobs found');
      }
    } else {
      console.log(`Found ${stuckJobs.length} stuck job(s)\n`);

      for (const job of stuckJobs) {
        await db.collection('JobQueue').updateOne(
          { _id: job._id },
          { $set: { status: 'pending', started_at: null } }
        );
        console.log(`✅ Reset job ${job._id} (generation: ${job.generation_id})`);
      }
      
      console.log('\n✅ All stuck jobs reset to pending');
    }

  } catch (error) {
    console.error('❌ Error finding/resetting stuck jobs:', error);
  } finally {
    await closeDb();
  }
}

resetStuckJobs();
