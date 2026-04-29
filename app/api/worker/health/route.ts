import { NextResponse } from 'next/server';
import { getDb } from '@/app/lib/mongoClient';
import { recoverStuckJobs } from '@/app/lib/queue';
import { getAvgCompletionMs } from '@/app/lib/workerStats';

export async function GET() {
  try {
    const db = await getDb();
    const col = db.collection('JobQueue');

    const [
      pendingStd, pendingStr,
      processingStd, processingStr,
      failed,
      activeWorkerIds,
      recovered,
      avgStd, avgStr,
    ] = await Promise.all([
      col.countDocuments({ status: 'pending', job_type: { $in: ['standard', null] } }),
      col.countDocuments({ status: 'pending', job_type: 'structured' }),
      col.countDocuments({ status: 'processing', job_type: { $in: ['standard', null] } }),
      col.countDocuments({ status: 'processing', job_type: 'structured' }),
      col.countDocuments({ status: 'failed' }),
      col.distinct('worker_id', { status: 'processing', worker_id: { $ne: null } }),
      recoverStuckJobs(),
      getAvgCompletionMs('standard'),
      getAvgCompletionMs('structured'),
    ]);

    return NextResponse.json({
      ok: true,
      queue: {
        pending: { standard: pendingStd, structured: pendingStr, total: pendingStd + pendingStr },
        processing: { standard: processingStd, structured: processingStr, total: processingStd + processingStr },
        failed,
      },
      workers: {
        activeInstances: activeWorkerIds.length,
        workerIds: activeWorkerIds,
      },
      avgCompletionMs: { standard: Math.round(avgStd), structured: Math.round(avgStr) },
      recovered,
      ts: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
