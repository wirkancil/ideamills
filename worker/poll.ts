import dotenv from 'dotenv';
import path from 'path';
import os from 'os';
dotenv.config({ path: path.join(process.cwd(), '.env.local') });

import { STANDARD_CONCURRENCY, STRUCTURED_CONCURRENCY } from '../app/lib/workerConfig';

const POLL_INTERVAL_MS = 2000;
const STUCK_RECOVERY_INTERVAL_MS = 5 * 60 * 1000;

// Unique identity for this worker process — used for stuck-job safety
const WORKER_ID = `${os.hostname()}:${process.pid}`;

let activeStandard = 0;
let activeStructured = 0;

async function bootstrap() {
  const { dequeueJob, completeJob, failJob, getPendingJobCount, recoverStuckJobs } =
    await import('../app/lib/queue');
  const { runGeneration } = await import('./runGeneration');
  const { recordCompletion } = await import('../app/lib/workerStats');

  async function processJob(type: 'standard' | 'structured') {
    const isStandard = type === 'standard';
    if (isStandard && activeStandard >= STANDARD_CONCURRENCY) return;
    if (!isStandard && activeStructured >= STRUCTURED_CONCURRENCY) return;

    const job = await dequeueJob(type, WORKER_ID);
    if (!job) return;

    if (isStandard) activeStandard++; else activeStructured++;
    const startedAt = Date.now();

    console.log(
      `[Worker:${WORKER_ID}] ${type} job ${job.id.slice(-6)} started` +
      ` — std:${activeStandard}/${STANDARD_CONCURRENCY} str:${activeStructured}/${STRUCTURED_CONCURRENCY}`
    );

    try {
      await runGeneration(job.generation_id, job.payload);
      await completeJob(job.id);
      const durationMs = Date.now() - startedAt;
      await recordCompletion(type, durationMs, job.id);
      console.log(`[Worker] Job ${job.id.slice(-6)} done in ${Math.round(durationMs / 1000)}s`);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error(`[Worker] Job ${job.id.slice(-6)} failed: ${msg}`);
      await failJob(job.id, msg);
    } finally {
      if (isStandard) activeStandard--; else activeStructured--;
    }
  }

  // Periodic stuck-job recovery — exclude this worker's own jobs
  setInterval(async () => {
    try {
      const recovered = await recoverStuckJobs(15 * 60 * 1000, [WORKER_ID]);
      if (recovered > 0) console.log(`[Worker] Recovered ${recovered} stuck job(s)`);
    } catch (e) {
      console.error('[Worker] Stuck recovery error:', e);
    }
  }, STUCK_RECOVERY_INTERVAL_MS);

  async function workerLoop() {
    console.log(
      `[Worker] ${WORKER_ID} started` +
      ` — std concurrency: ${STANDARD_CONCURRENCY}, structured: ${STRUCTURED_CONCURRENCY}`
    );

    while (true) {
      try {
        const [pendingStd, pendingStr] = await Promise.all([
          getPendingJobCount('standard'),
          getPendingJobCount('structured'),
        ]);

        // Fill standard slots
        if (pendingStd > 0) {
          const slots = STANDARD_CONCURRENCY - activeStandard;
          for (let i = 0; i < slots; i++) {
            processJob('standard').catch((e) => console.error('[Worker] Unhandled:', e));
          }
        }

        // Fill structured slots
        if (pendingStr > 0) {
          const slots = STRUCTURED_CONCURRENCY - activeStructured;
          for (let i = 0; i < slots; i++) {
            processJob('structured').catch((e) => console.error('[Worker] Unhandled:', e));
          }
        }
      } catch (error) {
        console.error('[Worker] Loop error:', error);
      }

      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }
  }

  console.log('🚀 IdeaMills Worker');
  await workerLoop();
}

if (require.main === module) {
  bootstrap().catch((error) => {
    console.error('[Worker] Fatal:', error);
    process.exit(1);
  });
}
