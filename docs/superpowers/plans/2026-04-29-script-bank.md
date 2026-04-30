# Script Bank Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Script Bank feature for IdeaMills — a standalone page (`/scripts`) where users can store reusable single-content video prompts (manual entry or via doc upload), and import them into Studio "Punya Aset" as a single scene narration.

**Architecture:** Single MongoDB collection `ScriptLibrary` with `content: string` (no nested scenes, no LLM parsing). New module `app/lib/docParser.ts` for `.docx`/`.txt`/`.md` extraction. Two import entry points into Studio: modal picker and `?scriptId=` URL parameter. **No LLM integration** — bank script is pure storage & retrieval.

**Tech Stack:** Next.js 15 App Router, MongoDB driver (native `mongodb` package), TypeScript, Tailwind + shadcn/ui, `mammoth` (new dep) for `.docx` parsing.

**Spec:** [docs/superpowers/specs/2026-04-29-script-bank-design.md](../specs/2026-04-29-script-bank-design.md)

**Note on testing:** IdeaMills has no automated test infrastructure. Following the spec's MVP decision, this plan uses **manual smoke verification** per task instead of unit tests. Each task ends with a `npm run build` typecheck + manual verification + commit.

**Note on language:** All UI copy in Bahasa Indonesia.

---

## File Structure

**Files created (12):**

```
app/lib/
  docParser.ts                          # Pure utility: buffer → plain text

app/api/scripts/
  route.ts                              # GET list, POST create
  [id]/route.ts                         # GET detail, PATCH update, DELETE
  extract/route.ts                      # POST upload → return extracted text (no save)
  tags/route.ts                         # GET top tags

app/scripts/
  page.tsx                              # List page
  new/page.tsx                          # Create form (unified: textarea + upload)
  [id]/page.tsx                         # Detail / edit / delete / use-in-studio

app/components/
  ScriptCard.tsx
  ScriptForm.tsx                        # Unified form, no Tabs
  ScriptPicker.tsx                      # Modal for Studio
  DocDropzone.tsx                       # Upload doc trigger
  TagInput.tsx
  TagFilterPills.tsx
```

**Files modified (4):**
```
app/lib/types.ts                        # + DBScriptLibrary, ScriptLibraryListItem
app/lib/mongoClient.ts                  # + ScriptLibrary indexes
app/components/TopBar.tsx               # + "Scripts" nav link
app/studio/page.tsx                     # AssetsForm: + ScriptPicker + scriptId query handling
package.json                            # + mammoth dep (via npm install)
```

---

## Task 1: Install Dependencies, Add Types, Add Indexes

**Files:**
- Modify: `package.json` (via npm install)
- Modify: `app/lib/types.ts`
- Modify: `app/lib/mongoClient.ts`

- [ ] **Step 1: Install mammoth dependency**

Run from project root:
```bash
npm install mammoth
```

Expected: `added 1 package`. Verify:
```bash
grep mammoth package.json
```
Expected: `"mammoth": "^x.y.z",`

- [ ] **Step 2: Add type definitions to `app/lib/types.ts`**

Open `app/lib/types.ts`. At the very end of the file (after `SceneAssetState` interface), append:

```typescript

// Script Bank (Library)
export interface DBScriptLibrary {
  _id: string;               // ObjectId stringified at API boundary
  title: string;             // 1–200 char
  tags: string[];            // lowercase + dash, max 10, ≤50 char each
  content: string;           // 1–5000 char, full prompt text utuh
  source: 'manual' | 'upload';
  created_at: Date;
  updated_at: Date;
}

export type ScriptLibraryListItem = Omit<DBScriptLibrary, 'content'>;
```

- [ ] **Step 3: Add ScriptLibrary indexes in `app/lib/mongoClient.ts`**

Open `app/lib/mongoClient.ts`. Inside the `ensureIndexes()` function, find the `Promise.all([...])` array. Append three new index calls inside the array (before the closing `])`):

```typescript
    // Script Library
    db.collection('ScriptLibrary').createIndex({ updated_at: -1 }),
    db.collection('ScriptLibrary').createIndex({ tags: 1 }),
    db.collection('ScriptLibrary').createIndex({ title: 'text' }),
```

So the relevant section becomes:

```typescript
    // Worker stats for ETA calculation
    db.collection('worker_stats').createIndex({ job_type: 1, completed_at: -1 }),
    // Script Library
    db.collection('ScriptLibrary').createIndex({ updated_at: -1 }),
    db.collection('ScriptLibrary').createIndex({ tags: 1 }),
    db.collection('ScriptLibrary').createIndex({ title: 'text' }),
  ]);
```

- [ ] **Step 4: Run typecheck**

```bash
npm run build
```

Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json app/lib/types.ts app/lib/mongoClient.ts
git commit -m "feat(scripts): add deps, types, and indexes for Script Library"
```

---

## Task 2: Create `app/lib/docParser.ts`

**Files:**
- Create: `app/lib/docParser.ts`

- [ ] **Step 1: Create the file**

Create `app/lib/docParser.ts`:

```typescript
/**
 * Doc parser — extract plain text from .docx, .txt, .md buffers.
 * Pure utility, no LLM calls.
 */

const SUPPORTED_MIMES = new Set([
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'text/markdown',
  'text/x-markdown',
]);

export class DocParseError extends Error {
  constructor(message: string, public readonly code: 'UNSUPPORTED_MIME' | 'CORRUPT' | 'EMPTY') {
    super(message);
    this.name = 'DocParseError';
  }
}

export function isSupportedMime(mime: string): boolean {
  return SUPPORTED_MIMES.has(mime);
}

export async function extractText(buffer: Buffer, mime: string): Promise<string> {
  if (!isSupportedMime(mime)) {
    throw new DocParseError(`Unsupported MIME type: ${mime}`, 'UNSUPPORTED_MIME');
  }

  // Minimal type stub — mammoth ships no .d.ts and there's no @types/mammoth package
  interface MammothResult { value: string; messages: unknown[] }
  interface MammothModule {
    extractRawText(options: { buffer: Buffer }): Promise<MammothResult>;
  }

  let text: string;
  if (mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    try {
      const mammoth = (await import('mammoth')) as unknown as MammothModule;
      const result = await mammoth.extractRawText({ buffer });
      text = result.value;
    } catch (err) {
      throw new DocParseError(
        `Failed to extract text from .docx: ${(err as Error).message}`,
        'CORRUPT'
      );
    }
  } else {
    // Buffer.toString('utf-8') never throws — invalid bytes become U+FFFD silently.
    // Binary detection is intentionally not performed for text/* MIMEs; the EMPTY
    // check below catches the only remaining failure mode (zero-length result).
    text = buffer.toString('utf-8');
  }

  text = text.trim();
  if (text.length === 0) {
    throw new DocParseError('No text could be extracted from file', 'EMPTY');
  }

  return text;
}
```

- [ ] **Step 2: Verify typecheck**

```bash
npm run build
```

Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add app/lib/docParser.ts
git commit -m "feat(scripts): add docParser utility for .docx/.txt/.md extraction"
```

---

## Task 3: API Route — `GET/POST /api/scripts` (List + Create)

**Files:**
- Create: `app/api/scripts/route.ts`

- [ ] **Step 1: Create the route file**

Create `app/api/scripts/route.ts`:

```typescript
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
```

- [ ] **Step 2: Verify typecheck**

```bash
npm run build
```

Expected: build succeeds.

- [ ] **Step 3: Manual smoke test (with dev server running)**

Create a script:
```bash
curl -s -X POST http://localhost:3000/api/scripts \
  -H "Content-Type: application/json" \
  -d '{"title":"Test","tags":["test"],"source":"manual","content":"Hello world this is a test prompt"}'
```
Expected: `{"id":"...","script":{...}}`

List:
```bash
curl -s http://localhost:3000/api/scripts
```
Expected: `{"items":[{"_id":"...","title":"Test",...}],"total":1,"page":1}` (no `content` in items).

Validation:
```bash
curl -s -X POST http://localhost:3000/api/scripts \
  -H "Content-Type: application/json" \
  -d '{"title":"","tags":[],"source":"manual","content":""}'
```
Expected: `{"error":"Title wajib diisi"}` HTTP 400.

- [ ] **Step 4: Commit**

```bash
git add app/api/scripts/route.ts
git commit -m "feat(scripts): add GET/POST /api/scripts endpoints"
```

---

## Task 4: API Route — `GET/PATCH/DELETE /api/scripts/[id]`

**Files:**
- Create: `app/api/scripts/[id]/route.ts`

- [ ] **Step 1: Create the route file**

Create `app/api/scripts/[id]/route.ts`:

```typescript
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
```

- [ ] **Step 2: Verify typecheck**

```bash
npm run build
```

- [ ] **Step 3: Manual smoke test**

Create then test:
```bash
ID=$(curl -s -X POST http://localhost:3000/api/scripts \
  -H "Content-Type: application/json" \
  -d '{"title":"Smoke","tags":["smoke"],"source":"manual","content":"hello"}' \
  | grep -o '"id":"[^"]*"' | cut -d'"' -f4)
echo "ID=$ID"

curl -s http://localhost:3000/api/scripts/$ID
```
Expected: `{"script":{"_id":"...","title":"Smoke","content":"hello",...}}`

```bash
curl -s -X PATCH http://localhost:3000/api/scripts/$ID \
  -H "Content-Type: application/json" \
  -d '{"title":"Updated","content":"new content"}'
```
Expected: `{"script":{...,"title":"Updated","content":"new content",...}}`

```bash
curl -s -X DELETE http://localhost:3000/api/scripts/$ID
```
Expected: `{"ok":true}`

- [ ] **Step 4: Commit**

```bash
git add app/api/scripts/[id]/route.ts
git commit -m "feat(scripts): add GET/PATCH/DELETE /api/scripts/[id] endpoints"
```

---

## Task 5: API Route — `POST /api/scripts/extract`

**Files:**
- Create: `app/api/scripts/extract/route.ts`

This endpoint extracts plain text from uploaded `.docx`/`.txt`/`.md` and returns it. **No DB writes.** Used by the form's "Upload doc" button to fill the content textarea.

- [ ] **Step 1: Create the route file**

Create `app/api/scripts/extract/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { extractText, isSupportedMime, DocParseError } from '@/app/lib/docParser';

const FILE_MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const CONTENT_MAX = 5000;

export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get('content-type') ?? '';
    if (!contentType.includes('multipart/form-data')) {
      return NextResponse.json(
        { error: 'Content-Type harus multipart/form-data' },
        { status: 400 }
      );
    }

    const form = await req.formData();
    const file = form.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'File tidak ditemukan' }, { status: 400 });
    }
    if (file.size > FILE_MAX_BYTES) {
      return NextResponse.json({ error: 'File terlalu besar (max 5MB)' }, { status: 400 });
    }
    if (!isSupportedMime(file.type)) {
      return NextResponse.json(
        { error: 'Format file tidak didukung. Gunakan .docx, .txt, atau .md' },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    let text: string;
    try {
      text = await extractText(buffer, file.type);
    } catch (err) {
      if (err instanceof DocParseError) {
        if (err.code === 'CORRUPT') {
          return NextResponse.json({ error: 'File rusak atau tidak valid' }, { status: 400 });
        }
        if (err.code === 'EMPTY') {
          return NextResponse.json(
            { error: 'Tidak ada teks yang bisa diekstrak dari file' },
            { status: 400 }
          );
        }
      }
      throw err;
    }

    let warning: string | undefined;
    if (text.length > CONTENT_MAX) {
      text = text.slice(0, CONTENT_MAX);
      warning = `Teks di-truncate ke ${CONTENT_MAX} karakter pertama.`;
    }

    return NextResponse.json({ content: text, warning });
  } catch (err) {
    console.error('[POST /api/scripts/extract] error:', err);
    return NextResponse.json({ error: 'Server error. Coba lagi.' }, { status: 500 });
  }
}
```

- [ ] **Step 2: Verify typecheck**

```bash
npm run build
```

- [ ] **Step 3: Manual smoke test**

Create a small `.txt` test file:
```bash
echo "This is a sample script content for testing." > /tmp/test.txt
curl -s -X POST http://localhost:3000/api/scripts/extract \
  -F "file=@/tmp/test.txt"
```
Expected: `{"content":"This is a sample script content for testing."}`

Test wrong format:
```bash
echo "x" > /tmp/test.unknown
curl -s -X POST http://localhost:3000/api/scripts/extract \
  -F "file=@/tmp/test.unknown;type=application/x-unknown"
```
Expected: `{"error":"Format file tidak didukung..."}` HTTP 400.

- [ ] **Step 4: Commit**

```bash
git add app/api/scripts/extract/route.ts
git commit -m "feat(scripts): add POST /api/scripts/extract endpoint for doc text extraction"
```

---

## Task 6: API Route — `GET /api/scripts/tags`

**Files:**
- Create: `app/api/scripts/tags/route.ts`

- [ ] **Step 1: Create the route file**

Create `app/api/scripts/tags/route.ts`:

```typescript
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
```

- [ ] **Step 2: Verify typecheck**

```bash
npm run build
```

- [ ] **Step 3: Manual smoke test**

```bash
curl -s http://localhost:3000/api/scripts/tags
```
Expected: `{"tags":[{"name":"...","count":N},...]}`

- [ ] **Step 4: Commit**

```bash
git add app/api/scripts/tags/route.ts
git commit -m "feat(scripts): add GET /api/scripts/tags endpoint"
```

---

## Task 7: Install Missing shadcn/ui Components

**Files:** Auto-generated under `app/components/ui/`.

The components currently in `app/components/ui/` are: badge, button, card, input, label, progress, select, tabs, textarea. We need: **dialog**, **dropdown-menu**.

- [ ] **Step 1: Add Dialog**

```bash
npx shadcn@latest add dialog
```
Expected: new file `app/components/ui/dialog.tsx`.

- [ ] **Step 2: Add DropdownMenu**

```bash
npx shadcn@latest add dropdown-menu
```
Expected: new file `app/components/ui/dropdown-menu.tsx`.

- [ ] **Step 3: Verify typecheck**

```bash
npm run build
```
Expected: build succeeds. shadcn CLI may have added `@radix-ui/react-dialog` and `@radix-ui/react-dropdown-menu` to package.json.

- [ ] **Step 4: Commit**

```bash
git add app/components/ui/dialog.tsx app/components/ui/dropdown-menu.tsx package.json package-lock.json
git commit -m "feat(scripts): add shadcn/ui Dialog and DropdownMenu"
```

---

## Task 8: Create `TagInput.tsx` Component

**Files:**
- Create: `app/components/TagInput.tsx`

- [ ] **Step 1: Create the file**

Create `app/components/TagInput.tsx`:

```typescript
'use client';

import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';

function normalizeTag(t: string): string {
  return t.trim().toLowerCase().replace(/\s+/g, '-').slice(0, 50);
}

export interface TagInputProps {
  value: string[];
  onChange: (tags: string[]) => void;
  max?: number;
  placeholder?: string;
  suggestions?: string[];
}

export function TagInput({ value, onChange, max = 10, placeholder = 'Tambah tag...', suggestions = [] }: TagInputProps) {
  const [draft, setDraft] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const filteredSuggestions = suggestions
    .filter((s) => !value.includes(s) && s.startsWith(draft.toLowerCase()))
    .slice(0, 8);

  function addTag(raw: string) {
    const tag = normalizeTag(raw);
    if (!tag) return;
    if (value.includes(tag)) return;
    if (value.length >= max) return;
    onChange([...value, tag]);
    setDraft('');
  }

  function removeTag(idx: number) {
    onChange(value.filter((_, i) => i !== idx));
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      if (draft.trim()) addTag(draft);
    } else if (e.key === 'Backspace' && !draft && value.length > 0) {
      removeTag(value.length - 1);
    }
  }

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (inputRef.current && !inputRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="relative">
      <div className="flex flex-wrap items-center gap-1.5 border rounded-md px-2 py-1.5 min-h-[40px] focus-within:ring-2 focus-within:ring-primary">
        {value.map((tag, idx) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 bg-primary/10 text-primary text-xs px-2 py-0.5 rounded-full"
          >
            {tag}
            <button
              type="button"
              onClick={() => removeTag(idx)}
              className="hover:text-primary/70"
              aria-label={`Remove ${tag}`}
            >
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}
        {value.length < max && (
          <input
            ref={inputRef}
            type="text"
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              setShowSuggestions(true);
            }}
            onKeyDown={handleKeyDown}
            onFocus={() => setShowSuggestions(true)}
            placeholder={value.length === 0 ? placeholder : ''}
            className="flex-1 outline-none bg-transparent text-sm min-w-[100px]"
          />
        )}
      </div>
      {showSuggestions && filteredSuggestions.length > 0 && (
        <div className="absolute z-10 mt-1 w-full bg-background border rounded-md shadow-lg max-h-48 overflow-y-auto">
          {filteredSuggestions.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => {
                addTag(s);
                setShowSuggestions(false);
              }}
              className="w-full text-left px-3 py-1.5 text-sm hover:bg-muted"
            >
              {s}
            </button>
          ))}
        </div>
      )}
      <div className="text-xs text-muted-foreground mt-1">
        {value.length}/{max} tags
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify typecheck**

```bash
npm run build
```

- [ ] **Step 3: Commit**

```bash
git add app/components/TagInput.tsx
git commit -m "feat(scripts): add TagInput component"
```

---

## Task 9: Create `TagFilterPills.tsx` Component

**Files:**
- Create: `app/components/TagFilterPills.tsx`

- [ ] **Step 1: Create the file**

Create `app/components/TagFilterPills.tsx`:

```typescript
'use client';

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';

export interface TagFilterPillsProps {
  selectedTags: string[];
  onChange: (tags: string[]) => void;
}

export function TagFilterPills({ selectedTags, onChange }: TagFilterPillsProps) {
  const [allTags, setAllTags] = useState<Array<{ name: string; count: number }>>([]);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    fetch('/api/scripts/tags')
      .then((r) => r.json())
      .then((data) => setAllTags(data.tags ?? []))
      .catch(() => setAllTags([]));
  }, []);

  const visibleTags = showAll ? allTags : allTags.slice(0, 10);

  function toggleTag(name: string) {
    if (selectedTags.includes(name)) {
      onChange(selectedTags.filter((t) => t !== name));
    } else {
      onChange([...selectedTags, name]);
    }
  }

  if (allTags.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {visibleTags.map((tag) => {
        const active = selectedTags.includes(tag.name);
        return (
          <button
            key={tag.name}
            type="button"
            onClick={() => toggleTag(tag.name)}
            className={`inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full transition-colors ${
              active
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:bg-muted/80'
            }`}
          >
            {tag.name}
            {active && <X className="w-3 h-3" />}
            {!active && <span className="opacity-60">({tag.count})</span>}
          </button>
        );
      })}
      {!showAll && allTags.length > 10 && (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="text-xs text-muted-foreground hover:text-foreground px-2.5 py-1"
        >
          + {allTags.length - 10} more
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify typecheck**

```bash
npm run build
```

- [ ] **Step 3: Commit**

```bash
git add app/components/TagFilterPills.tsx
git commit -m "feat(scripts): add TagFilterPills component"
```

---

## Task 10: Create `ScriptCard.tsx` Component

**Files:**
- Create: `app/components/ScriptCard.tsx`

- [ ] **Step 1: Create the file**

Create `app/components/ScriptCard.tsx`:

```typescript
'use client';

import Link from 'next/link';
import { MoreVertical, Edit, Trash2, FileText, Upload } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/app/components/ui/dropdown-menu';
import type { ScriptLibraryListItem } from '@/app/lib/types';

function timeAgo(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const seconds = Math.floor((Date.now() - d.getTime()) / 1000);
  if (seconds < 60) return 'baru saja';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} menit lalu`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} jam lalu`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} hari lalu`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} bulan lalu`;
  return `${Math.floor(months / 12)} tahun lalu`;
}

export interface ScriptCardProps {
  script: ScriptLibraryListItem;
  variant?: 'full' | 'compact';
  onClick?: () => void;
  onDelete?: (id: string) => void;
}

export function ScriptCard({ script, variant = 'full', onClick, onDelete }: ScriptCardProps) {
  const visibleTags = script.tags.slice(0, 3);
  const remainingTags = script.tags.length - visibleTags.length;

  const inner = (
    <div className="border-2 rounded-xl p-4 hover:border-primary transition-colors h-full flex flex-col">
      <div className="flex items-start justify-between gap-2 mb-2">
        <h3 className="font-semibold text-base line-clamp-1 flex-1">{script.title}</h3>
        {variant === 'full' && onDelete && (
          <DropdownMenu>
            <DropdownMenuTrigger
              onClick={(e) => e.stopPropagation()}
              className="p-1 hover:bg-muted rounded"
              aria-label="Menu"
            >
              <MoreVertical className="w-4 h-4 text-muted-foreground" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem asChild>
                <Link href={`/scripts/${script._id}`} className="flex items-center gap-2 cursor-pointer">
                  <Edit className="w-4 h-4" />
                  Edit
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={(e) => {
                  e.preventDefault();
                  if (confirm(`Hapus "${script.title}"? Tidak bisa di-undo.`)) {
                    onDelete(script._id);
                  }
                }}
                className="text-destructive flex items-center gap-2"
              >
                <Trash2 className="w-4 h-4" />
                Hapus
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      <div className="flex items-center gap-1.5 flex-wrap mb-3">
        {visibleTags.map((tag) => (
          <span key={tag} className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full">
            #{tag}
          </span>
        ))}
        {remainingTags > 0 && (
          <span className="text-xs text-muted-foreground">+{remainingTags} more</span>
        )}
      </div>
      <div className="mt-auto flex items-center gap-3 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          {script.source === 'upload' ? (
            <Upload className="w-3 h-3" />
          ) : (
            <FileText className="w-3 h-3" />
          )}
          {script.source === 'upload' ? 'upload' : 'manual'}
        </span>
        <span>•</span>
        <span>{timeAgo(script.updated_at)}</span>
      </div>
    </div>
  );

  if (variant === 'compact' || onClick) {
    return (
      <button type="button" onClick={onClick} className="text-left w-full">
        {inner}
      </button>
    );
  }

  return (
    <Link href={`/scripts/${script._id}`} className="block">
      {inner}
    </Link>
  );
}
```

- [ ] **Step 2: Verify typecheck**

```bash
npm run build
```

- [ ] **Step 3: Commit**

```bash
git add app/components/ScriptCard.tsx
git commit -m "feat(scripts): add ScriptCard component"
```

---

## Task 11: Create `DocDropzone.tsx` Component

**Files:**
- Create: `app/components/DocDropzone.tsx`

This component triggers file selection (or drag-drop), uploads to `/api/scripts/extract`, and returns extracted text via callback. Used inside ScriptForm.

- [ ] **Step 1: Create the file**

Create `app/components/DocDropzone.tsx`:

```typescript
'use client';

import { useState, useRef } from 'react';
import { Upload, Loader2 } from 'lucide-react';

const ACCEPTED_MIMES = [
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'text/markdown',
  'text/x-markdown',
];
const ACCEPTED_EXT = '.docx,.txt,.md';
const MAX_BYTES = 5 * 1024 * 1024;

function isAcceptable(file: File): { ok: true } | { ok: false; error: string } {
  if (file.size > MAX_BYTES) return { ok: false, error: 'File terlalu besar (max 5MB)' };
  if (!ACCEPTED_MIMES.includes(file.type)) {
    const ext = file.name.toLowerCase().split('.').pop();
    if (!['docx', 'txt', 'md'].includes(ext ?? '')) {
      return { ok: false, error: 'Format file tidak didukung. Gunakan .docx, .txt, atau .md' };
    }
  }
  return { ok: true };
}

export interface DocDropzoneProps {
  onExtract: (content: string, warning?: string) => void;
  disabled?: boolean;
}

export function DocDropzone({ onExtract, disabled = false }: DocDropzoneProps) {
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    const check = isAcceptable(file);
    if (!check.ok) {
      setError(check.error);
      return;
    }
    setError(null);
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/scripts/extract', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Gagal extract');
        return;
      }
      onExtract(data.content, data.warning);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    if (disabled || uploading) return;
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  return (
    <div className="space-y-2">
      <div
        onDragOver={(e) => {
          if (disabled || uploading) return;
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => !disabled && !uploading && inputRef.current?.click()}
        className={`border-2 border-dashed rounded-xl p-4 text-center transition-colors ${
          disabled || uploading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:border-primary'
        } ${dragOver ? 'border-primary bg-primary/5' : ''}`}
      >
        {uploading ? (
          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground py-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            Mengupload & extract...
          </div>
        ) : (
          <>
            <Upload className="w-6 h-6 mx-auto text-muted-foreground mb-1" />
            <p className="text-sm font-medium">Drag & drop atau klik untuk upload doc</p>
            <p className="text-xs text-muted-foreground mt-0.5">.docx, .txt, .md (max 5MB)</p>
          </>
        )}
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED_EXT}
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
          }}
        />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 2: Verify typecheck**

```bash
npm run build
```

- [ ] **Step 3: Commit**

```bash
git add app/components/DocDropzone.tsx
git commit -m "feat(scripts): add DocDropzone component"
```

---

## Task 12: Create `ScriptForm.tsx` Component

**Files:**
- Create: `app/components/ScriptForm.tsx`

Unified form for create + edit. **No Tabs.** Title + Tags + Content textarea + Optional DocDropzone for upload (only in create mode).

- [ ] **Step 1: Create the file**

Create `app/components/ScriptForm.tsx`:

```typescript
'use client';

import { useEffect, useState } from 'react';
import { Loader2, Save, X } from 'lucide-react';
import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/input';
import { Label } from '@/app/components/ui/label';
import { Textarea } from '@/app/components/ui/textarea';
import { TagInput } from './TagInput';
import { DocDropzone } from './DocDropzone';
import type { DBScriptLibrary } from '@/app/lib/types';

export type ScriptFormMode = 'create' | 'edit';

export interface ScriptFormSubmitData {
  title: string;
  tags: string[];
  content: string;
  source: 'manual' | 'upload';
}

export interface ScriptFormProps {
  mode: ScriptFormMode;
  initialData?: Partial<DBScriptLibrary>;
  onSubmit: (data: ScriptFormSubmitData) => Promise<void>;
  onCancel?: () => void;
  submitting?: boolean;
}

const TITLE_MAX = 200;
const CONTENT_MAX = 5000;

export function ScriptForm({ mode, initialData, onSubmit, onCancel, submitting = false }: ScriptFormProps) {
  const [title, setTitle] = useState(initialData?.title ?? '');
  const [tags, setTags] = useState<string[]>(initialData?.tags ?? []);
  const [content, setContent] = useState(initialData?.content ?? '');
  const [source, setSource] = useState<'manual' | 'upload'>(initialData?.source ?? 'manual');
  const [uploadWarning, setUploadWarning] = useState<string | null>(null);
  const [tagSuggestions, setTagSuggestions] = useState<string[]>([]);

  useEffect(() => {
    fetch('/api/scripts/tags')
      .then((r) => r.json())
      .then((data) => {
        setTagSuggestions((data.tags ?? []).map((t: { name: string }) => t.name));
      })
      .catch(() => {});
  }, []);

  const isValid =
    title.trim().length > 0 &&
    title.length <= TITLE_MAX &&
    content.trim().length > 0 &&
    content.length <= CONTENT_MAX;

  async function handleSubmit() {
    if (!isValid) return;
    await onSubmit({
      title: title.trim(),
      tags,
      content: content.trim(),
      source,
    });
  }

  function handleExtract(extractedContent: string, warning?: string) {
    setContent(extractedContent);
    setSource('upload');
    setUploadWarning(warning ?? null);
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Label>
          Title <span className="text-destructive">*</span>
        </Label>
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value.slice(0, TITLE_MAX))}
          placeholder="Contoh: Iklan Skincare Monolog Glow Booster"
          maxLength={TITLE_MAX}
        />
        <div className="text-xs text-muted-foreground text-right">{title.length}/{TITLE_MAX}</div>
      </div>

      <div className="space-y-2">
        <Label>
          Tags <span className="text-muted-foreground text-xs">(optional, max 10)</span>
        </Label>
        <TagInput
          value={tags}
          onChange={setTags}
          max={10}
          suggestions={tagSuggestions}
          placeholder="skincare, monolog, ramadan..."
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>
            Content <span className="text-destructive">*</span>{' '}
            <span className="text-muted-foreground text-xs">(prompt video utuh)</span>
          </Label>
          {source === 'upload' && (
            <span className="text-xs text-primary">📤 Dari upload</span>
          )}
        </div>

        {mode === 'create' && (
          <DocDropzone onExtract={handleExtract} disabled={submitting} />
        )}

        <Textarea
          value={content}
          onChange={(e) => {
            setContent(e.target.value.slice(0, CONTENT_MAX));
            // Once user manually edits after upload, semantic source could stay as 'upload'
            // (the origin of the text was upload). We keep source unchanged here.
          }}
          placeholder={
            mode === 'create'
              ? 'Tulis prompt video kamu di sini, atau upload doc di atas untuk auto-fill...'
              : 'Edit prompt video...'
          }
          rows={14}
          maxLength={CONTENT_MAX}
          className="font-mono text-sm resize-none"
        />
        <div className="flex items-center justify-between">
          {uploadWarning ? (
            <span className="text-xs text-amber-600 dark:text-amber-400">{uploadWarning}</span>
          ) : (
            <span />
          )}
          <span className="text-xs text-muted-foreground">{content.length}/{CONTENT_MAX}</span>
        </div>
      </div>

      <div className="flex items-center gap-3 pt-2">
        <Button
          type="button"
          onClick={handleSubmit}
          disabled={!isValid || submitting}
          size="lg"
          className="flex-1"
        >
          {submitting ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Menyimpan...
            </>
          ) : (
            <>
              <Save className="w-4 h-4 mr-2" />
              Save
            </>
          )}
        </Button>
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel} disabled={submitting}>
            <X className="w-4 h-4 mr-2" />
            Cancel
          </Button>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify typecheck**

```bash
npm run build
```

- [ ] **Step 3: Commit**

```bash
git add app/components/ScriptForm.tsx
git commit -m "feat(scripts): add ScriptForm unified component (no Tabs, single content textarea)"
```

---

## Task 13: Create `ScriptPicker.tsx` Component

**Files:**
- Create: `app/components/ScriptPicker.tsx`

- [ ] **Step 1: Create the file**

Create `app/components/ScriptPicker.tsx`:

```typescript
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Search, Plus } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/app/components/ui/dialog';
import { Input } from '@/app/components/ui/input';
import { ScriptCard } from './ScriptCard';
import { TagFilterPills } from './TagFilterPills';
import type { DBScriptLibrary, ScriptLibraryListItem } from '@/app/lib/types';

export interface ScriptPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (script: DBScriptLibrary) => void;
}

export function ScriptPicker({ open, onOpenChange, onSelect }: ScriptPickerProps) {
  const [scripts, setScripts] = useState<ScriptLibraryListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [fetchingDetail, setFetchingDetail] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    const params = new URLSearchParams();
    if (query.trim()) params.set('q', query.trim());
    selectedTags.forEach((t) => params.append('tag', t));
    fetch(`/api/scripts?${params.toString()}`)
      .then((r) => r.json())
      .then((data) => setScripts(data.items ?? []))
      .catch(() => setScripts([]))
      .finally(() => setLoading(false));
  }, [open, query, selectedTags]);

  async function handleSelect(id: string) {
    setFetchingDetail(id);
    try {
      const res = await fetch(`/api/scripts/${id}`);
      const data = await res.json();
      if (res.ok && data.script) {
        onSelect(data.script as DBScriptLibrary);
        onOpenChange(false);
      }
    } catch {
      // ignore
    } finally {
      setFetchingDetail(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Pilih Script dari Bank</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 pb-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Cari script..."
              className="pl-9"
            />
          </div>
          <TagFilterPills selectedTags={selectedTags} onChange={setSelectedTags} />
        </div>

        <div className="flex-1 overflow-y-auto -mx-6 px-6">
          {loading && (
            <div className="text-center py-12 text-sm text-muted-foreground">Memuat...</div>
          )}
          {!loading && scripts.length === 0 && (
            <div className="text-center py-12 space-y-3">
              <p className="text-sm text-muted-foreground">
                {query || selectedTags.length > 0
                  ? 'Tidak ada script yang cocok'
                  : 'Belum ada script di bank'}
              </p>
              <Link
                href="/scripts/new"
                className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
                onClick={() => onOpenChange(false)}
              >
                <Plus className="w-4 h-4" />
                Buat sekarang
              </Link>
            </div>
          )}
          {!loading && scripts.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pb-2">
              {scripts.map((script) => (
                <ScriptCard
                  key={script._id}
                  script={script}
                  variant="compact"
                  onClick={() => handleSelect(script._id)}
                />
              ))}
            </div>
          )}
          {fetchingDetail && (
            <div className="text-center py-2 text-xs text-muted-foreground">Memuat script...</div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Verify typecheck**

```bash
npm run build
```

- [ ] **Step 3: Commit**

```bash
git add app/components/ScriptPicker.tsx
git commit -m "feat(scripts): add ScriptPicker modal component"
```

---

## Task 14: Create `/scripts` List Page

**Files:**
- Create: `app/scripts/page.tsx`

- [ ] **Step 1: Create the file**

Create `app/scripts/page.tsx`:

```typescript
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Plus, Search } from 'lucide-react';
import { TopBar } from '@/app/components/TopBar';
import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/app/components/ui/select';
import { ScriptCard } from '@/app/components/ScriptCard';
import { TagFilterPills } from '@/app/components/TagFilterPills';
import type { ScriptLibraryListItem } from '@/app/lib/types';

export default function ScriptsListPage() {
  const [scripts, setScripts] = useState<ScriptLibraryListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [sort, setSort] = useState<'recent' | 'alpha'>('recent');

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (query.trim()) params.set('q', query.trim());
    selectedTags.forEach((t) => params.append('tag', t));
    params.set('sort', sort);
    fetch(`/api/scripts?${params.toString()}`)
      .then((r) => r.json())
      .then((data) => setScripts(data.items ?? []))
      .catch(() => setScripts([]))
      .finally(() => setLoading(false));
  }, [query, selectedTags, sort]);

  async function handleDelete(id: string) {
    const res = await fetch(`/api/scripts/${id}`, { method: 'DELETE' });
    if (res.ok) {
      setScripts((prev) => prev.filter((s) => s._id !== id));
    } else {
      const data = await res.json().catch(() => ({}));
      alert(data.error || 'Gagal menghapus script');
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <TopBar />
      <div className="container mx-auto px-4 py-8 max-w-5xl">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">Script Bank</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Simpan dan re-use prompt video iklan kamu.
            </p>
          </div>
          <Link href="/scripts/new">
            <Button size="lg">
              <Plus className="w-4 h-4 mr-2" />
              Buat Script
            </Button>
          </Link>
        </div>

        <div className="space-y-3 mb-6">
          <div className="flex items-center gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Cari script..."
                className="pl-9"
              />
            </div>
            <Select value={sort} onValueChange={(v) => setSort(v as 'recent' | 'alpha')}>
              <SelectTrigger className="w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="recent">Terbaru</SelectItem>
                <SelectItem value="alpha">Alphabetical</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <TagFilterPills selectedTags={selectedTags} onChange={setSelectedTags} />
        </div>

        {loading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="border-2 rounded-xl p-4 h-40 animate-pulse bg-muted/30" />
            ))}
          </div>
        )}

        {!loading && scripts.length === 0 && (
          <div className="text-center py-16 space-y-3">
            <p className="text-muted-foreground">
              {query || selectedTags.length > 0
                ? 'Tidak ada script yang cocok'
                : 'Belum ada script di bank. Buat yang pertama!'}
            </p>
            {!(query || selectedTags.length > 0) && (
              <Link href="/scripts/new">
                <Button>
                  <Plus className="w-4 h-4 mr-2" />
                  Buat Script Pertama
                </Button>
              </Link>
            )}
          </div>
        )}

        {!loading && scripts.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {scripts.map((script) => (
              <ScriptCard
                key={script._id}
                script={script}
                variant="full"
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify typecheck**

```bash
npm run build
```

- [ ] **Step 3: Manual smoke test**

Open `http://localhost:3000/scripts` in browser. Empty or with data, should render.

- [ ] **Step 4: Commit**

```bash
git add app/scripts/page.tsx
git commit -m "feat(scripts): add /scripts list page"
```

---

## Task 15: Create `/scripts/new` Page

**Files:**
- Create: `app/scripts/new/page.tsx`

- [ ] **Step 1: Create the file**

Create `app/scripts/new/page.tsx`:

```typescript
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { TopBar } from '@/app/components/TopBar';
import { ScriptForm, type ScriptFormSubmitData } from '@/app/components/ScriptForm';

export default function ScriptNewPage() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(data: ScriptFormSubmitData) {
    setSubmitting(true);
    try {
      const res = await fetch('/api/scripts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (!res.ok) {
        alert(json.error || 'Gagal menyimpan script');
        setSubmitting(false);
        return;
      }
      router.push(`/scripts/${json.id}`);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Network error');
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <TopBar />
      <div className="container mx-auto px-4 py-8 max-w-3xl">
        <button
          type="button"
          onClick={() => router.push('/scripts')}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Kembali ke Script Bank
        </button>

        <div className="mb-6">
          <h1 className="text-2xl font-bold">Buat Script Baru</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Tulis manual atau upload doc untuk auto-fill content.
          </p>
        </div>

        <ScriptForm
          mode="create"
          onSubmit={handleSubmit}
          onCancel={() => router.push('/scripts')}
          submitting={submitting}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify typecheck**

```bash
npm run build
```

- [ ] **Step 3: Manual smoke test**

Open `http://localhost:3000/scripts/new`:
1. Fill title="Test", add 1 tag, type 100+ chars di content textarea, klik Save → redirect to /scripts/[id].
2. Test upload: upload .txt file → content textarea ter-fill, source='upload' shown, klik Save.

- [ ] **Step 4: Commit**

```bash
git add app/scripts/new/page.tsx
git commit -m "feat(scripts): add /scripts/new page"
```

---

## Task 16: Create `/scripts/[id]` Detail/Edit Page

**Files:**
- Create: `app/scripts/[id]/page.tsx`

- [ ] **Step 1: Create the file**

Create `app/scripts/[id]/page.tsx`:

```typescript
'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { ArrowLeft, Clapperboard, MoreVertical, Trash2, Loader2 } from 'lucide-react';
import { TopBar } from '@/app/components/TopBar';
import { Button } from '@/app/components/ui/button';
import { ScriptForm, type ScriptFormSubmitData } from '@/app/components/ScriptForm';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/app/components/ui/dropdown-menu';
import type { DBScriptLibrary } from '@/app/lib/types';

export default function ScriptDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params?.id;

  const [script, setScript] = useState<DBScriptLibrary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!id) return;
    fetch(`/api/scripts/${id}`)
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) {
          setError(data.error || 'Gagal memuat script');
          return;
        }
        setScript(data.script);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Network error'))
      .finally(() => setLoading(false));
  }, [id]);

  async function handleSave(data: ScriptFormSubmitData) {
    if (!id) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/scripts/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: data.title,
          tags: data.tags,
          content: data.content,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        alert(json.error || 'Gagal update');
        setSubmitting(false);
        return;
      }
      setScript(json.script);
      alert('Script berhasil disimpan');
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Network error');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!id || !script) return;
    if (!confirm(`Hapus "${script.title}"? Tidak bisa di-undo.`)) return;
    const res = await fetch(`/api/scripts/${id}`, { method: 'DELETE' });
    if (res.ok) {
      router.push('/scripts');
    } else {
      const data = await res.json().catch(() => ({}));
      alert(data.error || 'Gagal menghapus');
    }
  }

  function handleUseInStudio() {
    if (!id) return;
    router.push(`/studio?mode=assets&scriptId=${id}`);
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <TopBar />
        <div className="container mx-auto px-4 py-12 max-w-3xl text-center">
          <Loader2 className="w-6 h-6 animate-spin mx-auto text-muted-foreground" />
        </div>
      </div>
    );
  }

  if (error || !script) {
    return (
      <div className="min-h-screen bg-background">
        <TopBar />
        <div className="container mx-auto px-4 py-12 max-w-3xl">
          <p className="text-destructive">{error || 'Script tidak ditemukan'}</p>
          <button
            type="button"
            onClick={() => router.push('/scripts')}
            className="mt-4 text-sm text-primary hover:underline"
          >
            Kembali ke Script Bank
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <TopBar />
      <div className="container mx-auto px-4 py-8 max-w-3xl">
        <button
          type="button"
          onClick={() => router.push('/scripts')}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Kembali ke Script Bank
        </button>

        <div className="flex items-start justify-between gap-3 mb-6">
          <div>
            <h1 className="text-2xl font-bold">{script.title}</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Source: {script.source} • {script.content.length} karakter
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={handleUseInStudio}>
              <Clapperboard className="w-4 h-4 mr-2" />
              Use in Studio
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger className="p-2 hover:bg-muted rounded-md">
                <MoreVertical className="w-4 h-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={handleDelete}
                  className="text-destructive flex items-center gap-2 cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                  Hapus Script
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <ScriptForm
          mode="edit"
          initialData={script}
          onSubmit={handleSave}
          submitting={submitting}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify typecheck**

```bash
npm run build
```

- [ ] **Step 3: Manual smoke test**

After creating a script, navigate to `/scripts/[id]`:
1. Detail loads, form pre-filled.
2. Edit content, Save → success.
3. Click "Use in Studio" → redirects to `/studio?mode=assets&scriptId=...` (not yet wired in Studio — Task 18).
4. Menu ⋯ → Delete → confirm → redirect to /scripts.

- [ ] **Step 4: Commit**

```bash
git add app/scripts/[id]/page.tsx
git commit -m "feat(scripts): add /scripts/[id] detail/edit page"
```

---

## Task 17: Update `TopBar` with "Scripts" Nav Link

**Files:**
- Modify: `app/components/TopBar.tsx`

- [ ] **Step 1: Update icon import**

Open `app/components/TopBar.tsx`. Find:

```typescript
import { Sparkles, History, Clapperboard, Images } from 'lucide-react';
```

Replace with:

```typescript
import { Sparkles, History, Clapperboard, Images, FileText } from 'lucide-react';
```

- [ ] **Step 2: Add Scripts nav link**

Find the existing Studio link. After Studio's closing `</Link>` and before the **Aset** link, insert:

```tsx
            <Link
              href="/scripts"
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                pathname === '/scripts' || pathname.startsWith('/scripts/')
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted'
              }`}
            >
              <FileText className="w-4 h-4" />
              Scripts
            </Link>
```

Final nav order: Studio → Scripts → Aset → Riwayat.

- [ ] **Step 3: Verify typecheck**

```bash
npm run build
```

- [ ] **Step 4: Manual smoke test**

Open dev server. TopBar shows 4 links. Click Scripts → navigates to `/scripts`. Active state highlights on `/scripts` and `/scripts/[id]`.

- [ ] **Step 5: Commit**

```bash
git add app/components/TopBar.tsx
git commit -m "feat(scripts): add Scripts nav link to TopBar"
```

---

## Task 18: Integrate Script Bank into Studio "Punya Aset"

**Files:**
- Modify: `app/studio/page.tsx`

`AssetsForm` needs:
1. Import button "Script Bank" above scenes section.
2. State for picker modal.
3. Handler that maps imported `DBScriptLibrary.content` → 1 scene narasi.
4. `useEffect` for `?scriptId=` URL param.

- [ ] **Step 1: Update imports**

Open `app/studio/page.tsx`. Find imports. Update:

```typescript
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
```

to:

```typescript
import { useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ScriptPicker } from '@/app/components/ScriptPicker';
import type { DBScriptLibrary } from '@/app/lib/types';
```

Update icon import:
```typescript
import { Upload, Video, Plus, Trash2, Loader2, X, Sparkles, FolderOpen, ArrowLeft } from 'lucide-react';
```

to:
```typescript
import { Upload, Video, Plus, Trash2, Loader2, X, Sparkles, FolderOpen, ArrowLeft, BookOpen } from 'lucide-react';
```

- [ ] **Step 2: Update `StudioPage` to honor `?mode=` query param**

Find the existing `StudioPage` component. Replace:

```typescript
export default function StudioPage() {
  const [mode, setMode] = useState<Mode>(null);

  return (
    <div className="min-h-screen bg-background">
      <TopBar />
      {mode === null && <LandingView onSelect={setMode} />}
      {mode === 'pipeline' && <PipelineForm onBack={() => setMode(null)} />}
      {mode === 'assets' && <AssetsForm onBack={() => setMode(null)} />}
    </div>
  );
}
```

with:

```typescript
export default function StudioPage() {
  const searchParams = useSearchParams();
  const initialMode = searchParams.get('mode') === 'assets' ? 'assets'
    : searchParams.get('mode') === 'pipeline' ? 'pipeline'
    : null;
  const [mode, setMode] = useState<Mode>(initialMode);

  return (
    <div className="min-h-screen bg-background">
      <TopBar />
      {mode === null && <LandingView onSelect={setMode} />}
      {mode === 'pipeline' && <PipelineForm onBack={() => setMode(null)} />}
      {mode === 'assets' && <AssetsForm onBack={() => setMode(null)} />}
    </div>
  );
}
```

- [ ] **Step 3: Add picker state and import logic to `AssetsForm`**

Find the `AssetsForm` function. Inside the function, after the existing `useState` declarations, add:

```typescript
  const searchParams = useSearchParams();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [importedScriptTitle, setImportedScriptTitle] = useState<string | null>(null);
```

After existing handlers (after `handleSubmit`), add:

```typescript
  function handleImportFromBank(script: DBScriptLibrary) {
    const hasUnsavedScenes = scenes.some((s) => s.narasi.trim() || s.imageDataUrl);
    if (hasUnsavedScenes) {
      const confirmed = confirm(
        `Replace current scenes dengan script "${script.title}"? Scene yang sudah diisi akan hilang.`
      );
      if (!confirmed) return;
    }
    const newScene: SceneInput = {
      id: Math.random().toString(36).slice(2),
      narasi: script.content,
      imageDataUrl: null,
      imagePreview: null,
    };
    setScenes([newScene]);
    setImportedScriptTitle(script.title);
  }

  useEffect(() => {
    const scriptId = searchParams.get('scriptId');
    if (!scriptId) return;
    fetch(`/api/scripts/${scriptId}`)
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok || !data.script) return;
        const script = data.script as DBScriptLibrary;
        const newScene: SceneInput = {
          id: Math.random().toString(36).slice(2),
          narasi: script.content,
          imageDataUrl: null,
          imagePreview: null,
        };
        setScenes([newScene]);
        setImportedScriptTitle(script.title);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
```

- [ ] **Step 4: Add the import button + banner to `AssetsForm` UI**

Find the section "Script per Scene" in JSX of `AssetsForm`. The original:

```tsx
        <div className="space-y-3">
          <div>
            <Label>Script per Scene <span className="text-muted-foreground text-sm font-normal">(optional)</span></Label>
            <p className="text-xs text-muted-foreground mt-0.5">Tulis narasi tiap scene. Kosongkan untuk auto-generate dari foto dan brief.</p>
          </div>
          {scenes.map((scene, idx) => (
            // ... SceneCard ...
          ))}
          <button ... > Tambah Scene </button>
        </div>
```

Replace with:

```tsx
        <div className="space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <Label>Script per Scene <span className="text-muted-foreground text-sm font-normal">(optional)</span></Label>
              <p className="text-xs text-muted-foreground mt-0.5">Tulis narasi tiap scene. Kosongkan untuk auto-generate dari foto dan brief.</p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setPickerOpen(true)}
            >
              <BookOpen className="w-3.5 h-3.5 mr-1.5" />
              Script Bank
            </Button>
          </div>
          {importedScriptTitle && (
            <div className="text-xs bg-primary/10 text-primary border border-primary/20 rounded-md px-3 py-2 flex items-center justify-between">
              <span>📚 Script dimuat: <strong>{importedScriptTitle}</strong></span>
              <button
                type="button"
                onClick={() => setImportedScriptTitle(null)}
                className="text-primary/70 hover:text-primary"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          )}
          {scenes.map((scene, idx) => (
            <SceneCard
              key={scene.id}
              scene={scene}
              index={idx}
              canRemove={scenes.length > 1}
              productPreview={productPreview}
              onNarasiChange={(v) => setScenes((prev) => prev.map((s) => s.id === scene.id ? { ...s, narasi: v } : s))}
              onRemove={() => setScenes((prev) => prev.filter((s) => s.id !== scene.id))}
              onImageUpload={(file) => handleSceneImage(scene.id, file)}
            />
          ))}
          <button
            type="button"
            onClick={() => setScenes((prev) => [...prev, newScene()])}
            className="w-full border-2 border-dashed rounded-xl py-3 text-sm text-muted-foreground hover:text-foreground hover:border-primary transition-colors flex items-center justify-center gap-2"
          >
            <Plus className="w-4 h-4" /> Tambah Scene
          </button>
        </div>
```

- [ ] **Step 5: Add `<ScriptPicker />` at end of `AssetsForm`'s JSX**

Find the last `</div>` of `AssetsForm`'s return (the outermost wrapper). Before that final closing `</div>`, insert:

```tsx
      <ScriptPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        onSelect={handleImportFromBank}
      />
```

So the end becomes:

```tsx
        <Button size="lg" className="w-full text-base" disabled={submitting || !productDataUrl} onClick={handleSubmit}>
          {/* ... */}
        </Button>
        {!productDataUrl && <p className="text-xs text-muted-foreground text-center -mt-2">Upload foto produk untuk mulai.</p>}
      </div>

      <ScriptPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        onSelect={handleImportFromBank}
      />
    </div>
  );
}
```

- [ ] **Step 6: Verify typecheck**

```bash
npm run build
```

- [ ] **Step 7: Manual smoke test**

With dev server:
1. `/studio` → "Punya Aset" → klik "Script Bank" → modal opens, list scripts.
2. Click a script → modal closes, scene 1 narasi terisi dengan content full, banner muncul.
3. Open `/studio?mode=assets&scriptId=<valid-id>` → AssetsForm langsung muncul, scene 1 pre-filled.
4. Open `/studio?mode=assets&scriptId=invalid` → AssetsForm muncul, scene kosong (no error blocks).

- [ ] **Step 8: Commit**

```bash
git add app/studio/page.tsx
git commit -m "feat(scripts): integrate Script Bank into Studio Punya Aset (picker + scriptId param)"
```

---

## Task 19: Final Verification

**Files:** none modified.

- [ ] **Step 1: Full build**

```bash
npm run build
```
Expected: succeeds, no errors.

- [ ] **Step 2: Run dev server**

Make sure `.env.local` has `MONGODB_URI`. Run:
```bash
./start.sh
```
(or `npm run dev` if start.sh has issues)

Open `http://localhost:3000/scripts` — list page loads.

- [ ] **Step 3: Walk through manual test plan**

Run every checkbox in the **Manual Test Plan** section of the spec at [docs/superpowers/specs/2026-04-29-script-bank-design.md](../specs/2026-04-29-script-bank-design.md):

- Create — Manual (5 cases)
- Create — Upload doc (3 cases)
- Create — Paste content (1 case)
- Edge: Upload validation (4 cases)
- Edit (2 cases)
- Delete (1 case)
- Search & Filter (4 cases)
- Import to Studio — Modal Picker (4 cases)
- Import to Studio — Use in Studio (2 cases)
- Cross-feature (2 cases)

If any test fails, fix immediately or file follow-up.

- [ ] **Step 4: Verify production readiness checklist**

From spec's "Production Readiness":
- [ ] Manual test plan ✓
- [ ] `npm run build` pass
- [ ] `mammoth` dep installed → `grep mammoth package-lock.json | head -3`
- [ ] Indexes created → start app, check MongoDB `db.ScriptLibrary.getIndexes()`
- [ ] Routes have try/catch → `grep "catch (err)" app/api/scripts -r`
- [ ] Loading & error states present
- [ ] TopBar nav "Scripts" visible
- [ ] No console.error spam
- [ ] UI bahasa Indonesia konsisten

- [ ] **Step 5: Final commit (if any small fixes)**

If fixes were applied during verification:
```bash
git add <files>
git commit -m "fix(scripts): <description>"
```

Otherwise no further commit needed. Suggested PR title:

```
feat(scripts): Script Bank — single-content storage with /scripts pages and Studio integration
```

---

## Summary

After completing all 19 tasks:
- **Files created:** 12
- **Files modified:** 4
- **New deps:** `mammoth`, `@radix-ui/react-dialog`, `@radix-ui/react-dropdown-menu` (last two from shadcn add)
- **New collection:** `ScriptLibrary` (3 indexes)
- **New endpoints:** 6 (`GET/POST /api/scripts`, `GET/PATCH/DELETE /api/scripts/[id]`, `POST /api/scripts/extract`, `GET /api/scripts/tags`)
- **No LLM integration** — purely storage feature, $0 LLM cost
- **New pages:** 3 (`/scripts`, `/scripts/new`, `/scripts/[id]`)
- **New nav link:** "Scripts" in TopBar
- **Studio integration:** modal picker + `?scriptId=` URL parameter, content → 1 scene

Adheres to revised spec: no AI parsing, no multi-scene editor, single content storage, manual test plan instead of unit tests.
