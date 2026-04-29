import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/app/lib/mongoClient';
import { ObjectId } from 'mongodb';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1', 10);
    const pageSize = parseInt(searchParams.get('pageSize') || '20', 10);

    let objectId: ObjectId;
    try {
      objectId = new ObjectId(id);
    } catch {
      return NextResponse.json({ error: 'Invalid generation ID format' }, { status: 400 });
    }

    const db = await getDb();
    const generation = await db.collection('Generations').findOne({ _id: objectId });
    if (!generation) {
      return NextResponse.json({ error: 'Generation not found' }, { status: 404 });
    }

    const generationId = objectId.toString();
    const count = await db.collection('Scripts').countDocuments({ generation_id: generationId });
    const distinctThemes = await db.collection('Scripts').distinct('theme', { generation_id: generationId });
    const uniqueThemes = distinctThemes.length;

    const themeCountsAgg = await db.collection('Scripts')
      .aggregate([
        { $match: { generation_id: generationId } },
        { $group: { _id: '$theme', count: { $sum: 1 } } },
      ])
      .toArray();
    const themeCounts: Record<string, number> = {};
    themeCountsAgg.forEach((t) => {
      if (t._id) themeCounts[String(t._id)] = t.count;
    });

    // Get paginated variations
    const offset = (page - 1) * pageSize;
    
    // Try to fetch with error handling
    let scriptData: any[] = [];
    let scriptError: any = null;
    
    try {
      const scripts = await db.collection('Scripts')
        .find({ generation_id: generationId })
        .sort({ idx: 1 })
        .skip(offset)
        .limit(pageSize)
        .toArray();

      const scriptIds = scripts.map((s) => s._id.toString());
      const scenes = await db.collection('Scenes')
        .find({ script_id: { $in: scriptIds } })
        .toArray();

      const scenesByScript: Record<string, any[]> = {};
      scenes.forEach((scene) => {
        const sid = String(scene.script_id);
        scenesByScript[sid] = scenesByScript[sid] || [];
        scenesByScript[sid].push(scene);
      });

      scriptData = scripts.map((script) => ({
        id: script._id.toString(),
        theme: script.theme,
        idx: script.idx,
        directors_script: script.directors_script,
        Scenes: scenesByScript[script._id.toString()] || [],
      }));
    } catch (fetchErr) {
      scriptError = fetchErr;
    }

    if (scriptError) {
      scriptData = [];
    }

    // Sanitize a field: strip null bytes and control chars, cap length
    const sanitize = (str: unknown): string => {
      if (!str || typeof str !== 'string') return '';
      return str
        .replace(/\0/g, '')
        .replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, '')
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
        .slice(0, 50_000);
    };

    const variations = (scriptData || []).map((script: any) => ({
      id: `var_${String(script.idx).padStart(3, '0')}`,
      theme: sanitize(script.theme),
      scenes: (script.Scenes || [])
        .sort((a: any, b: any) => a.order - b.order)
        .map((scene: any) => ({
          struktur: sanitize(scene.struktur),
          naskah_vo: sanitize(scene.naskah_vo),
          visual_idea: sanitize(scene.visual_idea),
          text_to_image: sanitize(scene.text_to_image) || undefined,
          image_to_video: sanitize(scene.image_to_video) || undefined,
        })),
    }));

    // Map database status to frontend status
    const statusMap: Record<string, string> = {
      'queued': 'queued',
      'processing': 'processing',
      'completed': 'succeeded',
      'failed': 'failed',
      'cancelled': 'canceled',
    };
    
    const frontendStatus = statusMap[generation.status] || generation.status;

    return NextResponse.json({
      id: generationId,
      status: frontendStatus,
      progress: generation.progress || 0,
      progressLabel: generation.progress_label ?? null,
      engine: generation.engine,
      productIdentifier: generation.product_identifier,
      error: generation.error_message || undefined,
      createdAt: generation.created_at,
      counts: { themes: uniqueThemes, scripts: count || 0, variations: count || 0 },
      themeCounts,
      page,
      pageSize,
      totalVariations: count || 0,
      variations,
    });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    if (body.action === 'cancel') {
      let cancelId: ObjectId;
      try {
        cancelId = new ObjectId(id);
      } catch {
        return NextResponse.json({ error: 'Invalid generation ID format' }, { status: 400 });
      }

      const db = await getDb();
      const result = await db.collection('Generations').updateOne(
        { _id: cancelId },
        { $set: { status: 'canceled', updated_at: new Date() } }
      );

      if (!result.acknowledged) {
        return NextResponse.json({ error: 'Failed to cancel' }, { status: 500 });
      }

      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
