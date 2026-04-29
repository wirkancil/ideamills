import { NextRequest, NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { getDb } from '@/app/lib/mongoClient';
import { storagePathToUrl } from '@/app/lib/storage';

// filter: all | images | videos | uploaded
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const filter = searchParams.get('filter') ?? 'all';
    const limit = Math.min(parseInt(searchParams.get('limit') ?? '48', 10), 100);
    const offset = parseInt(searchParams.get('offset') ?? '0', 10);

    const db = await getDb();

    // ── Uploaded photos (product + model dari Generations) ──────────────────
    // Selalu disertakan kecuali filter = images atau videos (AI only)
    let uploadedAssets: {
      id: string;
      generationId: string;
      generationTitle: string;
      type: 'uploaded';
      role: 'product' | 'model';
      image_url: string;
      video_url: null;
      naskah_vo: string;
      updated_at: Date;
    }[] = [];

    if (filter === 'all' || filter === 'uploaded') {
      const gens = await db.collection('Generations')
        .find({
          $or: [
            { product_image_url: { $exists: true, $nin: [null, ''] } },
            { model_image_url: { $exists: true, $nin: [null, ''] } },
          ],
        })
        .sort({ created_at: -1 })
        .toArray();

      for (const g of gens) {
        const title = g.creative_idea_title || g.product_identifier || `Generation ${g._id.toString().slice(-6)}`;
        const genId = g._id.toString();

        if (g.product_image_url) {
          const url = g.product_image_url.startsWith('/')
            ? g.product_image_url
            : g.product_image_url.startsWith('data:')
              ? null
              : g.product_image_url;
          // Only include if it's a stored path (not base64)
          const storedUrl = g.product_image_url.startsWith('/storage') || g.product_image_url.includes('storage/')
            ? storagePathToUrl(g.product_image_url)
            : g.product_image_url.startsWith('http')
              ? g.product_image_url
              : null;
          if (storedUrl) {
            uploadedAssets.push({
              id: `${genId}-product`,
              generationId: genId,
              generationTitle: title,
              type: 'uploaded',
              role: 'product',
              image_url: storedUrl,
              video_url: null,
              naskah_vo: 'Foto Produk',
              updated_at: g.created_at,
            });
          }
        }

        if (g.model_image_url) {
          const storedUrl = g.model_image_url.startsWith('/storage') || g.model_image_url.includes('storage/')
            ? storagePathToUrl(g.model_image_url)
            : g.model_image_url.startsWith('http')
              ? g.model_image_url
              : null;
          if (storedUrl) {
            uploadedAssets.push({
              id: `${genId}-model`,
              generationId: genId,
              generationTitle: title,
              type: 'uploaded',
              role: 'model',
              image_url: storedUrl,
              video_url: null,
              naskah_vo: 'Foto Model',
              updated_at: g.created_at,
            });
          }
        }
      }
    }

    // ── Scene assets (AI generated + user uploaded per scene) ───────────────
    const sceneFilter: Record<string, unknown> = {};
    if (filter === 'images') {
      sceneFilter.image_status = 'done';
      sceneFilter.generated_image_path = { $exists: true, $ne: null };
    } else if (filter === 'videos') {
      sceneFilter.video_status = 'done';
      sceneFilter.generated_video_path = { $exists: true, $ne: null };
    } else if (filter === 'uploaded') {
      // uploaded per scene = image_source: 'user'
      sceneFilter.image_source = 'user';
      sceneFilter.image_status = 'done';
    } else {
      // all: semua scene yang punya image atau video
      sceneFilter.$or = [
        { image_status: 'done', generated_image_path: { $exists: true, $ne: null } },
        { video_status: 'done', generated_video_path: { $exists: true, $ne: null } },
      ];
    }

    const totalScenes = await db.collection('Scenes').countDocuments(sceneFilter);
    const scenes = await db.collection('Scenes')
      .find(sceneFilter)
      .sort({ updated_at: -1, created_at: -1 })
      .skip(filter === 'uploaded' ? 0 : offset)
      .limit(filter === 'uploaded' ? 200 : limit)
      .toArray();

    // Resolve generation titles for scenes
    const scriptIds = [...new Set(scenes.map((s) => s.script_id))];
    const scripts = await db.collection('Scripts')
      .find({ _id: { $in: scriptIds.map((id) => { try { return new ObjectId(id); } catch { return null; } }).filter(Boolean) as ObjectId[] } })
      .toArray();

    const scriptToGen: Record<string, string> = {};
    scripts.forEach((s) => { scriptToGen[s._id.toString()] = s.generation_id; });

    const uniqueGenIds = [...new Set(Object.values(scriptToGen))];
    const generations = await db.collection('Generations')
      .find({ _id: { $in: uniqueGenIds.map((id) => { try { return new ObjectId(id); } catch { return null; } }).filter(Boolean) as ObjectId[] } })
      .toArray();

    const genMap: Record<string, string> = {};
    generations.forEach((g) => {
      genMap[g._id.toString()] = g.creative_idea_title || g.product_identifier || `Generation ${g._id.toString().slice(-6)}`;
    });

    const sceneAssets = scenes.map((s) => {
      const genId = scriptToGen[s.script_id] ?? '';
      return {
        id: s._id.toString(),
        generationId: genId,
        generationTitle: genMap[genId] ?? '',
        type: s.image_source === 'user' ? 'uploaded' : 'generated',
        role: null,
        image_url: s.generated_image_path ? storagePathToUrl(s.generated_image_path) : null,
        video_url: s.generated_video_path ? storagePathToUrl(s.generated_video_path) : null,
        image_status: s.image_status ?? 'pending',
        video_status: s.video_status ?? 'pending',
        image_source: s.image_source ?? null,
        naskah_vo: s.naskah_vo ?? '',
        struktur: s.struktur ?? '',
        updated_at: s.updated_at ?? s.created_at,
      };
    });

    // ── Merge + paginate ────────────────────────────────────────────────────
    const total = filter === 'uploaded'
      ? uploadedAssets.length + sceneAssets.filter((s) => s.type === 'uploaded').length
      : totalScenes + (filter === 'all' ? uploadedAssets.length : 0);

    // For 'all': merge uploaded photos first, then scene assets (already paginated)
    const merged = filter === 'all'
      ? [...uploadedAssets, ...sceneAssets]
      : filter === 'uploaded'
        ? [...uploadedAssets, ...sceneAssets]
        : sceneAssets;

    const paginated = filter === 'all' || filter === 'uploaded'
      ? merged.slice(offset, offset + limit)
      : merged;

    return NextResponse.json({ assets: paginated, total, limit, offset });
  } catch {
    return NextResponse.json({ error: 'Failed to fetch assets' }, { status: 500 });
  }
}
