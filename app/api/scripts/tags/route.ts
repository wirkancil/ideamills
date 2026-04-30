import { NextResponse } from 'next/server';
import { getDb } from '@/app/lib/mongoClient';

const COLLECTION = 'ScriptLibrary';
const TOP_LIMIT = 50;

export async function GET() {
  try {
    const db = await getDb();
    const result = await db
      .collection(COLLECTION)
      .aggregate([
        { $unwind: '$tags' },
        { $group: { _id: '$tags', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: TOP_LIMIT },
        { $project: { _id: 0, name: '$_id', count: 1 } },
      ])
      .toArray();

    return NextResponse.json({
      tags: result as Array<{ name: string; count: number }>,
    });
  } catch (err) {
    console.error('[GET /api/scripts/tags] error:', err);
    return NextResponse.json({ error: 'Database error. Coba lagi.' }, { status: 500 });
  }
}
