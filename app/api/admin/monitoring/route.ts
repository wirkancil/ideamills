import { NextRequest, NextResponse } from 'next/server';
import { getCachedSnapshot } from '@/app/lib/monitoring/cache';

export async function GET(req: NextRequest) {
  const force = req.nextUrl.searchParams.get('force') === '1';
  try {
    const snapshot = await getCachedSnapshot(force);
    return NextResponse.json(snapshot);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
