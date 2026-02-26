import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/app/lib/mongoClient';
import { ObjectId } from 'mongodb';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    
    let objectId: ObjectId;
    try {
      objectId = new ObjectId(id);
    } catch {
      return NextResponse.json({ error: 'Invalid generation ID format' }, { status: 400 });
    }

    const db = await getDb();
    
    // Check if generation exists
    const generation = await db.collection('Generations').findOne({ _id: objectId });
    if (!generation) {
      return NextResponse.json({ error: 'Generation not found' }, { status: 404 });
    }

    // Check if job exists
    const job = await db.collection('JobQueue').findOne({ generation_id: id });
    if (!job) {
      return NextResponse.json({ 
        error: 'Job data not found. Cannot retry.',
        details: 'The job queue entry has been deleted or expired.'
      }, { status: 404 });
    }

    // Reset JobQueue
    await db.collection('JobQueue').updateOne(
      { _id: job._id },
      { 
        $set: { 
          status: 'pending', 
          attempts: 0, 
          error_message: null, 
          scheduled_at: new Date(),
          started_at: null, // Clear started_at so it looks new
          completed_at: null, // Clear completed_at
        },
        $currentDate: { updated_at: true }
      }
    );

    // Reset Generation
    await db.collection('Generations').updateOne(
      { _id: objectId },
      { 
        $set: { 
          status: 'queued', 
          progress: 0, 
          error_message: null
        },
        $currentDate: { updated_at: true }
      }
    );

    return NextResponse.json({ 
      success: true, 
      message: 'Generation retried successfully',
      id: id
    });

  } catch (error) {
    console.error('Retry error:', error);
    return NextResponse.json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
