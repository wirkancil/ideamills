import { ObjectId } from 'mongodb';
import { getDb } from './mongoClient';
import { GenerationRequest } from './types';

export interface Job {
  id: string;
  generation_id: string;
  payload: GenerationRequest;
}

export async function enqueueJob(
  generationId: string,
  payload: GenerationRequest
): Promise<void> {
  const db = await getDb();
  const result = await db.collection('JobQueue').insertOne({
    generation_id: generationId,
    payload,
    status: 'pending',
    attempts: 0,
    max_attempts: 3,
    scheduled_at: new Date(),
    created_at: new Date(),
  });

  if (!result.acknowledged) {
    throw new Error('Failed to enqueue job');
  }
}

export async function dequeueJob(): Promise<Job | null> {
  const db = await getDb();
  const now = new Date();
  const result = await db.collection('JobQueue').findOneAndUpdate(
    {
      status: 'pending',
      scheduled_at: { $lte: now },
      $expr: { $lt: ['$attempts', '$max_attempts'] }
    },
    {
      $set: { status: 'processing', started_at: now },
      $inc: { attempts: 1 }
    },
    { sort: { scheduled_at: 1 }, returnDocument: 'after' }
  );

  if (!result) {
    return null;
  }

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
  await db.collection('JobQueue').updateOne(
    { _id: new ObjectId(jobId) },
    { $set: { status: 'failed', error_message: errorMessage, completed_at: new Date() } }
  );
}

export async function getPendingJobCount(): Promise<number> {
  const db = await getDb();
  return db.collection('JobQueue').countDocuments({ status: 'pending' });
}

export async function cleanupOldJobs(): Promise<void> {
  const db = await getDb();
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  await db.collection('JobQueue').deleteMany({
    status: { $in: ['completed', 'failed'] },
    completed_at: { $lte: cutoff }
  });
}
