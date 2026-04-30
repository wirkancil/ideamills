import { getDb } from './mongoClient';

const ROLLING_WINDOW = 20; // keep last N completions
const DEFAULT_AVG_MS = 5 * 60 * 1000; // 5 min default ETA when no samples yet

export async function recordCompletion(durationMs: number, jobId: string): Promise<void> {
  const db = await getDb();
  const col = db.collection('worker_stats');
  const now = new Date();

  await col.insertOne({ duration_ms: durationMs, job_id: jobId, completed_at: now });

  // Prune: keep only last ROLLING_WINDOW
  const oldest = await col
    .find({})
    .sort({ completed_at: -1 })
    .skip(ROLLING_WINDOW)
    .limit(1)
    .toArray();

  if (oldest.length > 0) {
    await col.deleteMany({ completed_at: { $lte: oldest[0].completed_at } });
  }
}

export async function getAvgCompletionMs(): Promise<number> {
  const db = await getDb();
  const result = await db
    .collection('worker_stats')
    .aggregate([
      { $sort: { completed_at: -1 } },
      { $limit: ROLLING_WINDOW },
      { $group: { _id: null, avg: { $avg: '$duration_ms' } } },
    ])
    .toArray();

  return result[0]?.avg ?? DEFAULT_AVG_MS;
}
