import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/app/lib/mongoClient';
import { getAvgCompletionMs } from '@/app/lib/workerStats';
import { STANDARD_CONCURRENCY, STRUCTURED_CONCURRENCY } from '@/app/lib/workerConfig';
import type { JobType } from '@/app/lib/types';

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
    return NextResponse.json({
      position: 0,
      ahead: 0,
      estimatedWaitMs: 0,
      jobType: job.job_type ?? 'standard',
      status,
    });
  }

  const jobType: JobType = (job.job_type as JobType) ?? 'standard';

  // Count jobs ahead: same type, pending/processing, scheduled earlier
  const typeFilter =
    jobType === 'standard'
      ? { $in: ['standard', null] }
      : 'structured';

  const ahead = await db.collection('JobQueue').countDocuments({
    status: { $in: ['pending', 'processing'] },
    job_type: typeFilter,
    scheduled_at: { $lt: job.scheduled_at },
  });

  const position = ahead + 1;
  const avgMs = await getAvgCompletionMs(jobType);
  const concurrency = jobType === 'standard' ? STANDARD_CONCURRENCY : STRUCTURED_CONCURRENCY;

  // ETA accounts for parallel slots: ceil(ahead / concurrency) batches × avg time
  const estimatedWaitMs = Math.ceil(ahead / concurrency) * avgMs;

  return NextResponse.json({
    position,
    ahead,
    estimatedWaitMs,
    jobType,
    status,
  });
}
