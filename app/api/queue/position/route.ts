import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/app/lib/mongoClient';
import { getAvgCompletionMs } from '@/app/lib/workerStats';
import { WORKER_CONCURRENCY } from '@/app/lib/workerConfig';

export async function GET(req: NextRequest) {
  const generationId = req.nextUrl.searchParams.get('generationId');
  if (!generationId) {
    return NextResponse.json({ error: 'generationId is required' }, { status: 400 });
  }

  const db = await getDb();
  const job = await db.collection('JobQueue').findOne({ generation_id: generationId });

  if (!job) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  }

  const status = job.status as string;

  if (status === 'completed' || status === 'failed') {
    return NextResponse.json({ position: 0, ahead: 0, estimatedWaitMs: 0, status });
  }

  // Count jobs ahead: pending/processing, scheduled earlier
  const ahead = await db.collection('JobQueue').countDocuments({
    status: { $in: ['pending', 'processing'] },
    scheduled_at: { $lt: job.scheduled_at },
  });

  const position = ahead + 1;
  const avgMs = await getAvgCompletionMs();

  // ETA accounts for parallel slots: ceil(ahead / concurrency) batches × avg time
  const estimatedWaitMs = Math.ceil(ahead / WORKER_CONCURRENCY) * avgMs;

  return NextResponse.json({ position, ahead, estimatedWaitMs, status });
}
