import { NextResponse } from 'next/server';
import { buildHistorySnapshot } from '@/app/lib/monitoring/history';

export async function GET() {
  try {
    const snapshot = await buildHistorySnapshot();
    return NextResponse.json(snapshot);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
