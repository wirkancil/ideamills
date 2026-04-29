import { getDb } from './mongoClient';
import type { JobType } from './types';

const ROLLING_WINDOW = 20; // keep last N completions per type

const DEFAULTS: Record<JobType, number> = {
  standard: 10 * 60 * 1000,   // 10 min
  structured: 2 * 60 * 1000,  // 2 min
};

export async function recordCompletion(
  jobType: JobType,
  durationMs: number,
  jobId: string
): Promise<void> {
  const db = await getDb();
  const col = db.collection('worker_stats');
  const now = new Date();

  await col.insertOne({ job_type: jobType, duration_ms: durationMs, job_id: jobId, completed_at: now });

  // Prune: keep only last ROLLING_WINDOW per type
  const oldest = await col
    .find({ job_type: jobType })
    .sort({ completed_at: -1 })
    .skip(ROLLING_WINDOW)
    .limit(1)
    .toArray();

  if (oldest.length > 0) {
    await col.deleteMany({ job_type: jobType, completed_at: { $lte: oldest[0].completed_at } });
  }
}

export async function getAvgCompletionMs(jobType: JobType): Promise<number> {
  const db = await getDb();
  const result = await db
    .collection('worker_stats')
    .aggregate([
      { $match: { job_type: jobType } },
      { $sort: { completed_at: -1 } },
      { $limit: ROLLING_WINDOW },
      { $group: { _id: null, avg: { $avg: '$duration_ms' } } },
    ])
    .toArray();

  return result[0]?.avg ?? DEFAULTS[jobType];
}
