import dotenv from 'dotenv';
import path from 'path';
import os from 'os';
dotenv.config({ path: path.join(process.cwd(), '.env.local') });

import { WORKER_CONCURRENCY } from '../app/lib/workerConfig';

const POLL_INTERVAL_ACTIVE_MS = 2000;   // queue ada job
const POLL_INTERVAL_IDLE_MS = 15000;    // queue kosong
const STUCK_RECOVERY_INTERVAL_MS = 5 * 60 * 1000;

const WORKER_ID = `${os.hostname()}:${process.pid}`;

let activeJobs = 0;
let shuttingDown = false;

async function bootstrap() {
  const { dequeueJob, completeJob, failJob, getPendingJobCount, recoverStuckJobs } =
    await import('../app/lib/queue');
  const { runGeneration } = await import('./runGeneration');
  const { recordCompletion } = await import('../app/lib/workerStats');

  async function processJob() {
    if (shuttingDown || activeJobs >= WORKER_CONCURRENCY) return;

    const job = await dequeueJob(WORKER_ID);
    if (!job) return;

    activeJobs++;
    const startedAt = Date.now();

    console.log(
      `[Worker:${WORKER_ID}] job ${job.id.slice(-6)} started — active:${activeJobs}/${WORKER_CONCURRENCY}`
    );

    try {
      await runGeneration(job.generation_id, job.payload);
      await completeJob(job.id);
      const durationMs = Date.now() - startedAt;
      await recordCompletion(durationMs, job.id);
      console.log(`[Worker] Job ${job.id.slice(-6)} done in ${Math.round(durationMs / 1000)}s`);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error(`[Worker] Job ${job.id.slice(-6)} failed: ${msg}`);
      await failJob(job.id, msg);
    } finally {
      activeJobs--;
    }
  }

  // Periodic stuck-job recovery
  setInterval(async () => {
    try {
      const recovered = await recoverStuckJobs(15 * 60 * 1000, [WORKER_ID]);
      if (recovered > 0) console.log(`[Worker] Recovered ${recovered} stuck job(s)`);
    } catch (e) {
      console.error('[Worker] Stuck recovery error:', e);
    }
  }, STUCK_RECOVERY_INTERVAL_MS);

  // Graceful shutdown — tunggu job aktif selesai sebelum exit
  const shutdown = () => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[Worker] Shutting down — waiting for ${activeJobs} active job(s)...`);
    const checkDone = setInterval(() => {
      if (activeJobs === 0) {
        clearInterval(checkDone);
        console.log('[Worker] All jobs done, exiting.');
        process.exit(0);
      }
    }, 1000);
    // Force-exit setelah 35 menit (max job duration untuk 3-clip chain)
    setTimeout(() => { console.error('[Worker] Forced shutdown after timeout'); process.exit(1); }, 35 * 60 * 1000);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  // Catch unhandled rejections agar tidak crash process
  process.on('unhandledRejection', (reason) => {
    console.error('[Worker] Unhandled rejection:', reason);
  });

  async function workerLoop() {
    console.log(`[Worker] ${WORKER_ID} started — concurrency: ${WORKER_CONCURRENCY}`);

    while (!shuttingDown) {
      let pending = 0;
      try {
        pending = await getPendingJobCount();
        if (pending > 0) {
          const slots = WORKER_CONCURRENCY - activeJobs;
          for (let i = 0; i < slots; i++) {
            processJob().catch((e) => console.error('[Worker] Unhandled:', e));
          }
        }
      } catch (error) {
        console.error('[Worker] Loop error:', error);
      }

      const interval = (pending > 0 || activeJobs > 0) ? POLL_INTERVAL_ACTIVE_MS : POLL_INTERVAL_IDLE_MS;
      await new Promise((resolve) => setTimeout(resolve, interval));
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
