import { NextRequest, NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { getDb } from '@/app/lib/mongoClient';

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let oid: ObjectId;
  try {
    oid = new ObjectId(id);
  } catch {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  const db = await getDb();

  // Hapus job dari queue jika masih pending
  await db.collection('JobQueue').updateMany(
    { generation_id: id, status: 'pending' },
    { $set: { status: 'cancelled', updated_at: new Date() } }
  );

  const result = await db.collection('Generations').updateOne(
    { _id: oid, status: { $in: ['queued', 'processing', 'draft'] } },
    { $set: { status: 'cancelled', progress: 0, progress_label: 'Dibatalkan', updated_at: new Date() } }
  );

  if (result.matchedCount === 0) {
    return NextResponse.json({ error: 'Generation tidak ditemukan atau sudah selesai' }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
