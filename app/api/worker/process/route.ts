import { NextRequest, NextResponse } from 'next/server';

// Dynamic import to avoid build-time compilation issues
async function getRunGeneration() {
  const { runGeneration } = await import('@/worker/runGeneration');
  return runGeneration;
}

// This is a simplified worker endpoint for development
// In production, use proper job queue (BullMQ, Cloud Tasks, etc.)

export async function POST(request: NextRequest) {
  try {
    const { generationId, payload } = await request.json();

    if (!generationId || !payload) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }

    // Get runGeneration function dynamically
    const runGeneration = await getRunGeneration();

    // Run generation asynchronously (don't await in production)
    runGeneration(generationId, payload)
      .then(() => console.log(`Generation ${generationId} completed`))
      .catch((err) => console.error(`Generation ${generationId} failed:`, err));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Worker process error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

