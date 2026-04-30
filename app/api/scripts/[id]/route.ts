import { NextRequest, NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { getDb } from '@/app/lib/mongoClient';

const COLLECTION = 'ScriptLibrary';
const TITLE_MAX = 200;
const CONTENT_MAX = 5000;
const TAGS_MAX_COUNT = 10;
const TAG_MAX_LENGTH = 50;

function normalizeTag(t: string): string {
  return t.trim().toLowerCase().replace(/\s+/g, '-');
}

function validatePatch(body: unknown):
  | { ok: true; updates: Record<string, unknown> }
  | { ok: false; error: string }
{
  if (!body || typeof body !== 'object') return { ok: false, error: 'Body harus berupa object' };
  const b = body as Record<string, unknown>;
  const updates: Record<string, unknown> = {};

  if ('title' in b) {
    const title = typeof b.title === 'string' ? b.title.trim() : '';
    if (!title) return { ok: false, error: 'Title wajib diisi' };
    if (title.length > TITLE_MAX) return { ok: false, error: `Title max ${TITLE_MAX} karakter` };
    updates.title = title;
  }

  if ('content' in b) {
    const content = typeof b.content === 'string' ? b.content.trim() : '';
    if (!content) return { ok: false, error: 'Content wajib diisi' };
    if (content.length > CONTENT_MAX) {
      return { ok: false, error: `Content max ${CONTENT_MAX} karakter` };
    }
    updates.content = content;
  }

  if ('tags' in b) {
    if (!Array.isArray(b.tags)) return { ok: false, error: 'Tags harus berupa array' };
    const rawTags = (b.tags as unknown[]).filter((t): t is string => typeof t === 'string');
    if (rawTags.length > TAGS_MAX_COUNT) return { ok: false, error: `Maksimal ${TAGS_MAX_COUNT} tags` };
    const normalized = rawTags.map(normalizeTag).filter(Boolean);
    if (normalized.some((t) => t.length > TAG_MAX_LENGTH)) {
      return { ok: false, error: `Tiap tag max ${TAG_MAX_LENGTH} karakter` };
    }
    updates.tags = Array.from(new Set(normalized));
  }

  if (Object.keys(updates).length === 0) {
    return { ok: false, error: 'Tidak ada field yang diupdate' };
  }

  return { ok: true, updates };
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    if (!ObjectId.isValid(id)) {
      return NextResponse.json({ error: 'ID script tidak valid' }, { status: 400 });
    }

    const db = await getDb();
    const doc = await db.collection(COLLECTION).findOne({ _id: new ObjectId(id) });
    if (!doc) {
      return NextResponse.json({ error: 'Script tidak ditemukan' }, { status: 404 });
    }

    return NextResponse.json({
      script: {
        _id: doc._id.toString(),
        title: doc.title,
        tags: doc.tags ?? [],
        content: doc.content ?? '',
        source: doc.source,
        created_at: doc.created_at,
        updated_at: doc.updated_at,
      },
    });
  } catch (err) {
    console.error('[GET /api/scripts/[id]] error:', err);
    return NextResponse.json({ error: 'Database error. Coba lagi.' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    if (!ObjectId.isValid(id)) {
      return NextResponse.json({ error: 'ID script tidak valid' }, { status: 400 });
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Request body bukan JSON valid' }, { status: 400 });
    }
    const validation = validatePatch(body);
    if (!validation.ok) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    const db = await getDb();
    const result = await db.collection(COLLECTION).findOneAndUpdate(
      { _id: new ObjectId(id) },
      { $set: { ...validation.updates, updated_at: new Date() } },
      { returnDocument: 'after' }
    );

    if (!result) {
      return NextResponse.json({ error: 'Script tidak ditemukan' }, { status: 404 });
    }

    return NextResponse.json({
      script: {
        _id: result._id.toString(),
        title: result.title,
        tags: result.tags ?? [],
        content: result.content ?? '',
        source: result.source,
        created_at: result.created_at,
        updated_at: result.updated_at,
      },
    });
  } catch (err) {
    console.error('[PATCH /api/scripts/[id]] error:', err);
    return NextResponse.json({ error: 'Database error. Coba lagi.' }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    if (!ObjectId.isValid(id)) {
      return NextResponse.json({ error: 'ID script tidak valid' }, { status: 400 });
    }

    const db = await getDb();
    const result = await db.collection(COLLECTION).deleteOne({ _id: new ObjectId(id) });

    if (result.deletedCount === 0) {
      return NextResponse.json({ error: 'Script tidak ditemukan' }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[DELETE /api/scripts/[id]] error:', err);
    return NextResponse.json({ error: 'Database error. Coba lagi.' }, { status: 500 });
  }
}
