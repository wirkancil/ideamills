// MongoDB Queue Worker - Polling System
// Load env FIRST before any other imports
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const POLL_INTERVAL_MS = 2000; // Check every 2 seconds
const MAX_CONCURRENT = 4; // Max concurrent jobs

let activeJobs = 0;

async function bootstrap() {
  // Dynamic imports to ensure environment variables are loaded first
  const { dequeueJob, completeJob, failJob, getPendingJobCount } = await import('../app/lib/queue');
  const { runGeneration } = await import('./runGeneration');

  /**
   * Process a single job
   */
  async function processJob() {
    if (activeJobs >= MAX_CONCURRENT) {
      return; // Wait for slot to free up
    }

    const job = await dequeueJob();
    if (!job) {
      return; // No jobs available
    }

    activeJobs++;
    console.log(`[Worker] Processing job ${job.id} for generation ${job.generation_id}`);
    console.log(`[Worker] Active jobs: ${activeJobs}/${MAX_CONCURRENT}`);

    try {
      await runGeneration(job.generation_id, job.payload);
      await completeJob(job.id);
      console.log(`[Worker] ✅ Job ${job.id} completed successfully`);
    } catch (error) {
      console.error(`[Worker] ❌ Job ${job.id} failed:`, error);
      await failJob(job.id, String(error));
    } finally {
      activeJobs--;
    }
  }

  /**
   * Main worker loop
   */
  async function workerLoop() {
    console.log('[Worker] Starting queue worker...');
    console.log(`[Worker] Poll interval: ${POLL_INTERVAL_MS}ms`);
    console.log(`[Worker] Max concurrent: ${MAX_CONCURRENT}`);

    while (true) {
      try {
        // Check for pending jobs
        const pendingCount = await getPendingJobCount();
        
        if (pendingCount > 0) {
          console.log(`[Worker] ${pendingCount} pending jobs, ${activeJobs} active`);
          
          // Process jobs up to max concurrent limit
          const slotsAvailable = MAX_CONCURRENT - activeJobs;
          for (let i = 0; i < slotsAvailable; i++) {
            processJob().catch(console.error); // Fire and forget
          }
        }
      } catch (error) {
        console.error('[Worker] Error in worker loop:', error);
      }

      // Wait before next poll
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }
  }

  // Start loop
  console.log('🚀 IdeaMill Worker - MongoDB Queue');
  console.log('=====================================\n');
  await workerLoop();
}

// Start worker
if (require.main === module) {
  bootstrap().catch((error) => {
    console.error('Fatal worker error:', error);
    process.exit(1);
  });
}
