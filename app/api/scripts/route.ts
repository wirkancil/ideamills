import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/app/lib/mongoClient';
import type { ScriptLibraryListItem } from '@/app/lib/types';

const COLLECTION = 'ScriptLibrary';
const TITLE_MAX = 200;
const CONTENT_MAX = 5000;
const TAGS_MAX_COUNT = 10;
const TAG_MAX_LENGTH = 50;
const LIMIT_MAX = 100;
const LIMIT_DEFAULT = 20;

function normalizeTag(t: string): string {
  return t.trim().toLowerCase().replace(/\s+/g, '-');
}

function validateBody(body: unknown):
  | { ok: true; data: { title: string; tags: string[]; content: string; source: 'manual' | 'upload' } }
  | { ok: false; error: string }
{
  if (!body || typeof body !== 'object') return { ok: false, error: 'Body harus berupa object' };
  const b = body as Record<string, unknown>;

  const title = typeof b.title === 'string' ? b.title.trim() : '';
  if (!title) return { ok: false, error: 'Title wajib diisi' };
  if (title.length > TITLE_MAX) return { ok: false, error: `Title max ${TITLE_MAX} karakter` };

  const content = typeof b.content === 'string' ? b.content.trim() : '';
  if (!content) return { ok: false, error: 'Content wajib diisi' };
  if (content.length > CONTENT_MAX) {
    return { ok: false, error: `Content max ${CONTENT_MAX} karakter` };
  }

  if (!Array.isArray(b.tags)) return { ok: false, error: 'Tags harus berupa array' };
  const rawTags = (b.tags as unknown[]).filter((t): t is string => typeof t === 'string');
  if (rawTags.length > TAGS_MAX_COUNT) {
    return { ok: false, error: `Maksimal ${TAGS_MAX_COUNT} tags` };
  }
  const normalized = rawTags.map(normalizeTag).filter(Boolean);
  if (normalized.some((t) => t.length > TAG_MAX_LENGTH)) {
    return { ok: false, error: `Tiap tag max ${TAG_MAX_LENGTH} karakter` };
  }
  const tags = Array.from(new Set(normalized));

  const source = b.source === 'manual' || b.source === 'upload' ? b.source : null;
  if (!source) return { ok: false, error: 'Source harus "manual" atau "upload"' };

  return { ok: true, data: { title, tags, content, source } };
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const q = url.searchParams.get('q')?.trim() ?? '';
    const tagParams = url.searchParams.getAll('tag').map(normalizeTag).filter(Boolean);
    const sort = url.searchParams.get('sort') === 'alpha' ? 'alpha' : 'recent';
    const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10) || 1);
    const limit = Math.min(LIMIT_MAX, Math.max(1, parseInt(url.searchParams.get('limit') ?? String(LIMIT_DEFAULT), 10) || LIMIT_DEFAULT));

    const filter: Record<string, unknown> = {};
    if (q) {
      filter.title = { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
    }
    if (tagParams.length > 0) {
      filter.tags = { $in: tagParams };
    }

    const sortSpec: Record<string, 1 | -1> = sort === 'alpha' ? { title: 1 } : { updated_at: -1 };

    const db = await getDb();
    const coll = db.collection(COLLECTION);

    const [docs, total] = await Promise.all([
      coll
        .find(filter, { projection: { content: 0 } })
        .sort(sortSpec)
        .skip((page - 1) * limit)
        .limit(limit)
        .toArray(),
      coll.countDocuments(filter),
    ]);

    const items: ScriptLibraryListItem[] = docs.map((d) => ({
      _id: d._id.toString(),
      title: d.title,
      tags: d.tags ?? [],
      source: d.source,
      created_at: d.created_at,
      updated_at: d.updated_at,
    }));

    return NextResponse.json({ items, total, page });
  } catch (err) {
    console.error('[GET /api/scripts] error:', err);
    return NextResponse.json({ error: 'Database error. Coba lagi.' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Request body bukan JSON valid' }, { status: 400 });
    }
    const validation = validateBody(body);
    if (!validation.ok) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    const now = new Date();
    const doc = {
      ...validation.data,
      created_at: now,
      updated_at: now,
    };

    const db = await getDb();
    const result = await db.collection(COLLECTION).insertOne(doc);

    return NextResponse.json({
      id: result.insertedId.toString(),
      script: { _id: result.insertedId.toString(), ...doc },
    });
  } catch (err) {
    console.error('[POST /api/scripts] error:', err);
    return NextResponse.json({ error: 'Database error. Coba lagi.' }, { status: 500 });
  }
}
