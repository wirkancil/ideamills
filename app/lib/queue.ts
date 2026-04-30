import { ObjectId } from 'mongodb';
import { getDb } from './mongoClient';

export interface Job {
  id: string;
  generation_id: string;
  payload: unknown;
}

export async function enqueueJob(generationId: string, payload: unknown): Promise<void> {
  const db = await getDb();

  const result = await db.collection('JobQueue').insertOne({
    generation_id: generationId,
    payload,
    status: 'pending',
    attempts: 0,
    max_attempts: 3,
    worker_id: null,
    scheduled_at: new Date(),
    created_at: new Date(),
  });

  if (!result.acknowledged) {
    throw new Error('Failed to enqueue job');
  }
}

export async function dequeueJob(workerId?: string): Promise<Job | null> {
  const db = await getDb();
  const now = new Date();

  const result = await db.collection('JobQueue').findOneAndUpdate(
    {
      status: 'pending',
      scheduled_at: { $lte: now },
      $expr: { $lt: ['$attempts', '$max_attempts'] },
    },
    {
      $set: { status: 'processing', started_at: now, worker_id: workerId ?? null },
      $inc: { attempts: 1 },
    },
    { sort: { scheduled_at: 1 }, returnDocument: 'after' }
  );

  if (!result) return null;

  return {
    id: result._id instanceof ObjectId ? result._id.toString() : String(result._id),
    generation_id: result.generation_id,
    payload: result.payload,
  };
}

export async function completeJob(jobId: string): Promise<void> {
  const db = await getDb();
  await db.collection('JobQueue').updateOne(
    { _id: new ObjectId(jobId) },
    { $set: { status: 'completed', completed_at: new Date() } }
  );
}

export async function failJob(jobId: string, errorMessage: string): Promise<void> {
  const db = await getDb();
  const job = await db.collection('JobQueue').findOne({ _id: new ObjectId(jobId) });
  if (!job) return;

  const attempts = job.attempts ?? 1;
  const maxAttempts = job.max_attempts ?? 3;

  if (attempts < maxAttempts) {
    // Exponential backoff: ~30s, ~2m, ~8m
    const delayMs = Math.pow(4, attempts) * 7500;
    await db.collection('JobQueue').updateOne(
      { _id: new ObjectId(jobId) },
      {
        $set: {
          status: 'pending',
          scheduled_at: new Date(Date.now() + delayMs),
          last_error: errorMessage,
          worker_id: null,
          updated_at: new Date(),
        },
      }
    );
  } else {
    await db.collection('JobQueue').updateOne(
      { _id: new ObjectId(jobId) },
      { $set: { status: 'failed', error_message: errorMessage, completed_at: new Date() } }
    );
  }
}

export async function getPendingJobCount(): Promise<number> {
  const db = await getDb();
  return db.collection('JobQueue').countDocuments({ status: 'pending' });
}

// Recover jobs stuck in 'processing' for more than timeoutMs.
// excludeWorkerIds: skip jobs belonging to worker instances that may still be alive.
export async function recoverStuckJobs(
  timeoutMs = 15 * 60 * 1000,
  excludeWorkerIds: string[] = []
): Promise<number> {
  const db = await getDb();
  const stuckBefore = new Date(Date.now() - timeoutMs);

  const filter: Record<string, unknown> = {
    status: 'processing',
    started_at: { $lte: stuckBefore },
    $expr: { $lt: ['$attempts', '$max_attempts'] },
  };

  if (excludeWorkerIds.length > 0) {
    filter.worker_id = { $nin: excludeWorkerIds };
  }

  const result = await db.collection('JobQueue').updateMany(filter, {
    $set: {
      status: 'pending',
      scheduled_at: new Date(),
      worker_id: null,
      last_error: 'Recovered from stuck processing state',
      updated_at: new Date(),
    },
  });

  return result.modifiedCount;
}

export async function cleanupOldJobs(): Promise<void> {
  const db = await getDb();
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  await db.collection('JobQueue').deleteMany({
    status: { $in: ['completed', 'failed'] },
    completed_at: { $lte: cutoff },
  });
}
