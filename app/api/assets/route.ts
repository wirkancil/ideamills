import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/app/lib/mongoClient';
import { storagePathToUrl } from '@/app/lib/storage';
import type { Clip } from '@/app/lib/types';

interface AssetItem {
  id: string;
  generationId: string;
  generationTitle: string;
  type: 'uploaded' | 'generated';
  role: 'product' | 'clip-image' | 'clip-video' | null;
  image_url: string | null;
  video_url: string | null;
  label: string;
  updated_at: Date;
}

// filter: all | images | videos | uploaded
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const filter = searchParams.get('filter') ?? 'all';
    const limit = Math.min(parseInt(searchParams.get('limit') ?? '48', 10), 100);
    const offset = parseInt(searchParams.get('offset') ?? '0', 10);

    const db = await getDb();

    const gens = await db.collection('Generations')
      .find({})
      .sort({ created_at: -1 })
      .toArray();

    const items: AssetItem[] = [];

    for (const g of gens) {
      const genId = g._id.toString();
      const title = g.creative_idea_title || g.product_identifier || `Generation ${genId.slice(-6)}`;

      // Uploaded composite/product photo (Step 1) — include for filter 'all', 'uploaded', and 'images'
      const productUrl = resolvePhotoUrl(g.product_image_url);
      if (productUrl && (filter === 'all' || filter === 'uploaded' || filter === 'images')) {
        items.push({
          id: `${genId}-product`,
          generationId: genId,
          generationTitle: title,
          type: 'uploaded',
          role: 'product',
          image_url: productUrl,
          video_url: null,
          label: 'Foto Composite',
          updated_at: g.created_at,
        });
      }

      // V2 clips: generated images + videos
      const clips = (g.clips ?? []) as Clip[];
      for (const c of clips) {
        if (c.generated_image_path && (filter === 'all' || filter === 'images')) {
          items.push({
            id: `${genId}-clip-${c.index}-img`,
            generationId: genId,
            generationTitle: title,
            type: 'generated',
            role: 'clip-image',
            image_url: c.generated_image_path,
            video_url: null,
            label: `Clip ${c.index + 1} image`,
            updated_at: c.updated_at ?? c.created_at,
          });
        }
        if (c.generated_video_path && (filter === 'all' || filter === 'videos')) {
          items.push({
            id: `${genId}-clip-${c.index}-vid`,
            generationId: genId,
            generationTitle: title,
            type: 'generated',
            role: 'clip-video',
            image_url: null,
            video_url: c.generated_video_path,
            label: `Clip ${c.index + 1} video`,
            updated_at: c.updated_at ?? c.created_at,
          });
        }
      }
    }

    // Sort newest first, paginate
    items.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
    const total = items.length;
    const paginated = items.slice(offset, offset + limit);

    return NextResponse.json({ assets: paginated, total, limit, offset });
  } catch (error) {
    console.error('/api/assets error:', error);
    return NextResponse.json({ error: 'Failed to fetch assets' }, { status: 500 });
  }
}

function resolvePhotoUrl(raw: unknown): string | null {
  if (typeof raw !== 'string' || !raw) return null;
  // Skip base64 data URLs (don't expose huge strings via list)
  if (raw.startsWith('data:')) return null;
  // Already a public URL or absolute path
  if (raw.startsWith('http://') || raw.startsWith('https://') || raw.startsWith('/')) return raw;
  // Try to resolve storage path
  if (raw.includes('storage/')) {
    try {
      return storagePathToUrl(raw);
    } catch {
      return null;
    }
  }
  return null;
}
