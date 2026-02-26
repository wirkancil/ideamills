import { NextRequest, NextResponse } from 'next/server';
import { ObjectId, GridFSBucket } from 'mongodb';
import { getDb } from '@/app/lib/mongoClient';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  let oid: ObjectId;
  try {
    oid = new ObjectId(id);
  } catch {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }
  const db = await getDb();
  const bucket = new GridFSBucket(db, { bucketName: process.env.MONGODB_BUCKET || 'images' });
  const stream = bucket.openDownloadStream(oid);
  return new Response(stream as unknown as ReadableStream, {
    headers: {
      'Content-Type': 'image/jpeg',
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
}
