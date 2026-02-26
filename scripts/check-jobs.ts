#!/usr/bin/env tsx
/**
 * Check job queue status (MongoDB)
 */

import './env';
import { getDb, closeDb } from '../app/lib/mongoClient';

async function checkJobs() {
  console.log('🔍 Checking Job Queue (MongoDB)...\n');

  try {
    const db = await getDb();

    // Check pending jobs
    const pendingJobs = await db.collection('JobQueue')
      .find({ status: 'pending' })
      .sort({ created_at: 1 })
      .toArray();

    console.log(`📋 Pending Jobs: ${pendingJobs.length}`);
    if (pendingJobs.length > 0) {
      console.table(pendingJobs.map(j => ({
        id: j._id.toString().substring(0, 8),
        generation_id: j.generation_id.substring(0, 8),
        status: j.status,
        created: j.created_at ? new Date(j.created_at).toLocaleTimeString() : 'N/A'
      })));
    }

    // Check processing jobs
    const processingJobs = await db.collection('JobQueue')
      .find({ status: 'processing' })
      .toArray();

    if (processingJobs.length > 0) {
      console.log(`\n⚙️  Processing Jobs: ${processingJobs.length}`);
      console.table(processingJobs.map(j => ({
        id: j._id.toString().substring(0, 8),
        generation_id: j.generation_id.substring(0, 8),
        started: j.started_at ? new Date(j.started_at).toLocaleTimeString() : 'N/A'
      })));
    }

    // Check recent generations
    const generations = await db.collection('Generations')
      .find({})
      .sort({ created_at: -1 })
      .limit(3)
      .toArray();

    if (generations.length > 0) {
      console.log('\n📊 Recent Generations:');
      console.table(generations.map(g => ({
        id: g._id.toString().substring(0, 8),
        status: g.status,
        progress: `${g.progress}%`,
        created: g.created_at ? new Date(g.created_at).toLocaleTimeString() : 'N/A'
      })));
    }

    // Summary
    console.log('\n💡 Tips:');
    if (pendingJobs.length > 0) {
      console.log('   - Worker needs to be running to process pending jobs');
      console.log('   - Start worker: npm run worker');
    } else {
      console.log('   - No pending jobs in queue');
    }

  } catch (error) {
    console.error('❌ Error checking jobs:', error);
  } finally {
    await closeDb();
  }
}

checkJobs();
