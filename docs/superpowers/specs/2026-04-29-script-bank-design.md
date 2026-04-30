# Script Bank — Design Spec

**Date:** 2026-04-29 (revised)
**Status:** Draft (pending user review of revision)
**Skill:** superpowers:brainstorming

## Goals

User IdeaMills sudah punya kumpulan **prompt video matang** dari kampanye sebelumnya — biasanya berbentuk paragraf panjang yang mendeskripsikan visual setting, acting, dialog, dan tone untuk single-shot video monolog/review produk. Saat ini tidak ada tempat di aplikasi untuk menyimpan dan re-use prompt ini.

Script Bank menyelesaikan ini dengan cara:
1. Menyediakan tempat penyimpanan (CRUD) untuk prompt video matang.
2. Mendukung input via form manual ATAU upload doc / paste text.
3. Menyimpan content **apa adanya** — tidak memecah, tidak parsing, tidak modifikasi.
4. Dari Studio "Punya Aset", user bisa import 1-klik untuk auto-fill scene narasi.

## Design Principle: "Sudah Matang, Tidak Perlu Parsing"

Asumsi awal kami (multi-scene Hook/Problem/Solution/CTA dengan AI auto-split) **tidak match dengan realita user**. User sudah datang dengan prompt yang polished sebagai 1 unit utuh — AI split malah merusak koherensi. Spec ini di-revise untuk menghormati realita itu: **bank script = penyimpanan prompt utuh, bukan workflow scriptwriting**.

## Non-Goals

Eksplisit ditunda atau dihapus:

- **AI auto-split per scene** — dihapus sepenuhnya. Bukan use-case.
- **Multi-scene editor (Hook/Problem/Solution/CTA)** — dihapus. Entry adalah 1 content utuh.
- **PDF upload** — parsing kompleks, tunda
- **Image dalam doc** — text-only extraction
- **Versioning / edit history** — tunda
- **Soft delete / trash** — hard delete
- **Duplicate script** — workaround dengan copy-paste
- **Export script (download)** — tunda
- **Bulk actions** — tunda
- **Full-text search di content** — search hanya by title
- **Fuzzy tag autocomplete** — exact prefix match cukup
- **Field `description`** — redundant dengan content + tags
- **Integrasi di "Dari Nol" pipeline** — hanya di "Punya Aset"
- **Multi-user, sharing, auth** — no auth system
- **Quota per-user** — single-user app
- **Draft persistence** — tutup tab = hilang
- **Unit/E2E test** — manual test plan
- **Activity log, template variables, generation count** — tunda

## Decisions Summary

| Aspek | Keputusan |
|---|---|
| Lokasi | Page standalone `/scripts` + integrasi di Studio "Punya Aset" |
| Content unit | 1 entry = 1 prompt content utuh (single text, max 5000 char) |
| Input method | Form unified — 1 textarea besar, dengan tombol "Upload doc" untuk fill from file |
| Format upload | `.docx` / `.txt` / `.md` + paste text (PDF tunda) |
| Auth | Skip (no auth system) |
| Metadata | `title`, `tags[]`, `source` (`manual` / `upload`) |
| Import flow | Modal picker di Studio + tombol "Use in Studio" di `/scripts/[id]` |
| CRUD | Create, Read, Edit, Delete, Search title, Filter by tag (OR), Sort |
| File upload limit | 5 MB |
| Schema | Single collection `ScriptLibrary`, no nested scenes, no LLM parsing |

## Architecture

### File Structure

```
ideamills/
├── app/
│   ├── api/scripts/
│   │   ├── route.ts                    # GET list + POST create
│   │   ├── [id]/route.ts               # GET detail, PATCH update, DELETE
│   │   └── tags/route.ts               # GET top tags + counts
│   ├── lib/
│   │   └── docParser.ts                # NEW — extract plain text dari .docx/.txt/.md
│   ├── scripts/
│   │   ├── page.tsx                    # List page
│   │   ├── new/page.tsx                # Form create
│   │   └── [id]/page.tsx               # Detail / edit
│   └── components/
│       ├── ScriptCard.tsx
│       ├── ScriptForm.tsx              # Unified form (no Tabs)
│       ├── ScriptPicker.tsx            # Modal picker untuk Studio
│       ├── DocDropzone.tsx             # Upload trigger di form
│       ├── TagInput.tsx
│       └── TagFilterPills.tsx
└── docs/
    └── superpowers/specs/
        └── 2026-04-29-script-bank-design.md  # this file
```

### Architectural Decisions

1. **`docParser.ts` adalah utility murni.** Tidak ada LLM call. File buffer in → plain text out. Pakai `mammoth` untuk `.docx`, `Buffer.toString('utf-8')` untuk `.txt`/`.md`. Hasil extract langsung jadi `content` string di form.

2. **Tidak ada LLM integration.** Bank script tidak butuh LLM sama sekali. Tidak ada `parseScriptToScenes()`, tidak ada `/api/scripts/parse` endpoint, tidak ada prompt baru di `app/lib/llm/`. Cost = $0.

3. **Tidak ada perubahan di pipeline existing.** Collection `Scripts`, `Scenes`, `Generations` tetap utuh. `ScriptLibrary` collection terpisah.

4. **Reuse existing infrastructure 100%:** `getDb()`, shadcn/ui primitives, `TopBar`. Tidak ada perubahan di `app/lib/llm/`.

### Dependency Baru

- `mammoth` (npm) — parsing `.docx` ke plain text. Ringan (~250KB), tidak butuh LibreOffice/Word terinstall.
- shadcn/ui `Dialog` dan `DropdownMenu` (via shadcn CLI).

## Database Schema

### Collection: `ScriptLibrary`

```ts
interface DBScriptLibrary {
  _id: ObjectId;
  title: string;             // wajib, 1–200 char
  tags: string[];            // free-form, lowercase normalized, max 10 tags, ≤50 char/tag
  content: string;           // wajib, 1–5000 char (full prompt text utuh)
  source: 'manual' | 'upload';
  created_at: Date;
  updated_at: Date;
}
```

**Source field semantic:**
- `manual` — user input dari form textarea kosong.
- `upload` — content di-fill dari upload `.docx`/`.txt`/`.md` (user mungkin edit setelah fill, tapi origin tetap `upload`).

### Indexes

Tambahkan di `app/lib/mongoClient.ts` `ensureIndexes()`:

```ts
db.collection('ScriptLibrary').createIndex({ updated_at: -1 });
db.collection('ScriptLibrary').createIndex({ tags: 1 });
db.collection('ScriptLibrary').createIndex({ title: 'text' });
```

### Tag Normalization

Sebelum save, semua tag:
```ts
const normalize = (t: string) => t.trim().toLowerCase().replace(/\s+/g, '-');
```
Contoh: `"Skin Care"` → `"skin-care"`. Konsisten, mencegah duplikasi.

### Validation Rules

- `title`: required, 1–200 char (trim).
- `tags`: array of string, max 10, tiap tag ≤50 char, lowercase + dash.
- `content`: required, 1–5000 char (trim).
- `source`: enum `'manual' | 'upload'`.

### Relasi dengan Collection Lain

**Tidak ada foreign key.** Saat user "Use in Studio", `content` di-**copy** sebagai narasi 1 scene di Studio "Punya Aset" form. Studio tetap simpan ke `Scripts`/`Scenes` collection seperti biasa via `/api/studio/create`. Library tidak ter-link dengan generation hasilnya — user bebas edit script di bank tanpa mengubah generation lama.

## API Routes

| Method | Path | Body / Query | Returns |
|---|---|---|---|
| `GET` | `/api/scripts` | `?q=text&tag=skincare&sort=recent\|alpha&page=1&limit=20` | `{ items, total, page }` |
| `POST` | `/api/scripts` | `{ title, tags, content, source }` | `{ id, script }` |
| `GET` | `/api/scripts/[id]` | — | `{ script }` |
| `PATCH` | `/api/scripts/[id]` | partial: `{ title?, tags?, content? }` | `{ script }` |
| `DELETE` | `/api/scripts/[id]` | — | `{ ok: true }` |
| `POST` | `/api/scripts/extract` | multipart: `file` | `{ content, warning? }` (no DB write) |
| `GET` | `/api/scripts/tags` | — | `{ tags: { name, count }[] }` (top 50) |

### Detail per Route

**`GET /api/scripts`** — List dengan search + filter:
- `q`: search di title (regex case-insensitive). Tidak full-text search content.
- `tag`: filter `{ tags: { $in: [...] } }`. Multiple tags via `?tag=a&tag=b` (OR semantic).
- `sort`: `recent` (default, by `updated_at` desc) | `alpha` (by `title` asc).
- Pagination: `page` (default 1) + `limit` (default 20, max 100).
- Response items pakai `ScriptLibraryListItem` (tanpa field `content` — hemat bandwidth):
  ```ts
  type ScriptLibraryListItem = Omit<DBScriptLibrary, 'content'>;
  ```

**`GET /api/scripts/tags`** — Untuk autocomplete TagInput:
- Aggregate semua tags + count occurrence.
- Return sorted by count desc, limit 50.
- Tidak ada caching untuk MVP.

### Idempotency

CRUD biasa tidak butuh idempotency key (tidak ada async retry / worker queue).

## Data Flow

### Flow 1: Create — Manual atau via Upload

```
User di /scripts/new
   ↓
Form unified:
  - Title input (required)
  - Tags input (multi-select)
  - Content textarea besar (required, 1-5000 char)
  - [Optional] Tombol "Upload doc" di samping textarea
   ↓
Jika user klik "Upload doc":
   - Pilih .docx/.txt/.md (max 5MB)
   - Server extract via /api/scripts/parse-upload
     ATAU client-side untuk .txt/.md, server-side untuk .docx
   - Hasil text fill ke textarea content (replace existing)
   - source = 'upload' (otomatis di-set)
   ↓
User edit content kalau perlu
   ↓
Klik Save
   ↓
POST /api/scripts dengan source: 'manual' atau 'upload'
   ↓
Insert + redirect /scripts/[id]
```

**Note tentang upload extraction:** Bisa dilakukan client-side untuk `.txt`/`.md` (browser FileReader) atau server-side untuk `.docx` (butuh `mammoth`). Untuk simplicity dan konsistensi, kita lakukan **server-side via endpoint internal helper**: form upload file → POST ke `/api/scripts` dengan multipart, server detect, extract, validate, save dalam 1 request. Tapi karena user perlu **review/edit** content sebelum save, lebih baik:

- **Pisah jadi 2 fase:** (1) `POST /api/scripts/extract` (multipart) → return `{ content: string }` tanpa save. (2) User edit di textarea. (3) `POST /api/scripts` (JSON) → save.

Endpoint `/api/scripts/extract` adalah utility murni: extract text dari file → return text. **Bukan parse, tidak ada LLM.** Sangat ringan.

### Flow 2: Edit

```
User di /scripts/[id]
   ↓ GET /api/scripts/[id]
Form pre-filled (title, tags, content)
   ↓ User edit
   ↓ Save → PATCH /api/scripts/[id]
Toast confirmation
```

Old data overwritten (no versioning).

### Flow 3: Delete

```
Tombol Delete di /scripts/[id] menu (⋯)
   ↓ konfirmasi dialog
DELETE /api/scripts/[id]
   ↓ redirect /scripts + toast
```

Hard delete.

### Flow 4: Import to Studio (entry-point A — modal picker)

```
User di /studio (mode 'assets')
   ↓ klik [📚 Import dari Script Bank]
ScriptPicker modal terbuka
   ↓ GET /api/scripts (list dengan search + tag filter)
User klik card script
   ↓ Modal load detail (GET /api/scripts/[id]) untuk dapat content
   ↓ IF Studio form sudah ada isi: konfirmasi "Replace?"
Modal close, Studio form scenes[] = [{ narasi: bank.content, ... }] (1 scene)
   ↓ Banner muncul: "📚 Script dimuat: <title>"
   ↓ User upload foto produk, klik "Buat Video" → flow Studio existing
```

**Single scene mapping:** Bank content (1 text utuh) → Studio scenes[0].narasi. Studio user bisa "Tambah Scene" manual setelah import kalau mau split jadi multi-scene.

### Flow 5: Import to Studio (entry-point C — Use in Studio)

```
User di /scripts/[id]
   ↓ klik [🎬 Use in Studio]
Browser navigate /studio?mode=assets&scriptId=<id>
Studio mount:
   1. Detect query params, auto-set mode='assets'
   2. Fetch GET /api/scripts/[id]
   3. Pre-fill scenes[0].narasi = script.content
   4. Toast "Script '<title>' dimuat dari Script Bank"
   ↓ user upload foto produk, klik "Buat Video"
```

### Edge Cases

| Scenario | Behavior |
|---|---|
| Upload file >5MB | 400 client-side validation, "File terlalu besar (max 5MB)" |
| Upload `.pdf` atau format lain | 400, "Format file tidak didukung. Gunakan .docx, .txt, atau .md" |
| `.docx` corrupt | 400, "File rusak atau tidak valid" |
| Extracted text empty | 400, "Tidak ada teks yang bisa diekstrak dari file" |
| Content kosong saat save | 400, "Content wajib diisi" |
| Content >5000 char | 400, "Content max 5000 karakter" |
| User import → script di-delete dari bank | Tidak masalah — Studio sudah copy ke `Scripts` collection. Library tidak ter-link. |
| User edit script setelah import | Tidak affect generation lama. Hanya affect import berikutnya. |

### Loading States

- **Upload extraction**: tombol disabled, spinner singkat
- **List page**: skeleton card saat fetch
- **Form save**: tombol disabled + spinner

## Components UI

### Component Tree

```
app/scripts/page.tsx (List)
  ├── TopBar
  ├── SearchBar
  ├── TagFilterPills
  ├── SortDropdown
  └── ScriptCard[] (variant='full')

app/scripts/new/page.tsx (Create)
  ├── TopBar
  └── ScriptForm (mode='create')
      ├── TitleInput
      ├── TagInput
      └── ContentEditor
          ├── DocDropzone (or "Upload doc" button)
          └── Textarea (large)

app/scripts/[id]/page.tsx (Detail/Edit)
  ├── TopBar
  ├── header: title + [🎬 Use in Studio] + [⋯ Delete]
  └── ScriptForm (mode='edit', initialData=script)

app/components/ScriptPicker.tsx (Modal di Studio)
  └── Dialog
      ├── SearchBar
      ├── TagFilterPills
      └── ScriptCard[] (variant='compact')
```

### Komponen Baru

**1. `ScriptCard.tsx`** — Reusable card untuk list page DAN modal picker.
- Props: `{ script, variant: 'full' | 'compact', onClick?, onDelete? }`
- `full`: tombol Edit + menu ⋯
- `compact`: seluruh card clickable, no actions
- Display: title, content preview (truncate 2 lines), tags (max 3 visible + "+N"), source badge, updated_at relative time

**2. `ScriptForm.tsx`** — Unified form untuk create + edit.
- Props: `{ mode: 'create' | 'edit', initialData?: DBScriptLibrary, onSubmit, onCancel?, submitting? }`
- Internal state: controlled state biasa (no `react-hook-form`)
- Field: TitleInput, TagInput, content Textarea (besar)
- Tombol "Upload doc" yang trigger hidden file input → server extract → fill content textarea
- **Tidak ada Tabs.** Semua input ke textarea yang sama.

**3. `ScriptPicker.tsx`** — Modal picker untuk Studio.
- Props: `{ open, onOpenChange, onSelect: (script) => void }`
- Pakai `Dialog` dari shadcn/ui
- Internal: SearchBar + TagFilterPills + ScriptCard list (compact)
- Empty state: "Belum ada script di bank. [Buat sekarang →]"

**4. `DocDropzone.tsx`** — File upload trigger dengan drag-drop area.
- Props: `{ onExtract: (content: string) => void, disabled?: boolean }`
- HTML5 native drag-drop (no `react-dropzone`)
- Validasi MIME + size client-side
- POST file ke `/api/scripts/extract` → return text → call `onExtract(text)`
- Bisa juga sebagai tombol biasa "Upload doc" yang buka file picker

**5. `TagInput.tsx`** — Multi-select tag dengan autocomplete.
- Props: `{ value: string[], onChange, max=10, suggestions: string[] }`
- Render: chips per tag aktif (dengan ✕) + input field
- Autocomplete dari `/api/scripts/tags`
- Enter / klik suggestion / comma → add tag (normalize)
- Backspace di empty input → hapus tag terakhir

**6. `TagFilterPills.tsx`** — Filter UI di list page + picker.
- Props: `{ selectedTags: string[], onChange }`
- Fetch top 10 tags dari `/api/scripts/tags`
- Pill aktif: bg primary, ada ✕

### Komponen Existing yang di-Touch

**`app/studio/page.tsx`** — `AssetsForm`:
- Tambah tombol `[📚 Import dari Script Bank]` di atas section "Script per Scene"
- State baru: `pickerOpen: boolean`, `importedScriptTitle: string | null`
- Handler `handleImportFromBank(script: DBScriptLibrary)` map `script.content` → 1 scene di state `scenes[]`
- `useEffect` detect query param `scriptId` → auto-fetch + pre-fill (entry-point C)
- Render `<ScriptPicker open={pickerOpen} ... />`

`PipelineForm` (mode "Dari Nol") tidak di-touch.

**`app/components/TopBar.tsx`** — Tambah link nav "Scripts" sejajar dengan "Studio", "Aset", "Riwayat".

**`app/lib/types.ts`** — Tambah types:
```ts
export interface DBScriptLibrary { ... }
export type ScriptLibraryListItem = Omit<DBScriptLibrary, 'content'>;
```

### shadcn/ui Components yang Dipakai

Sudah ada di `app/components/ui/`:
- `Button`, `Input`, `Textarea`, `Label`, `Select`, `Card`, `Badge`

Perlu install via shadcn CLI:
- `Dialog` (untuk ScriptPicker + delete confirmation)
- `DropdownMenu` (menu ⋯ di card dan detail page)

### Visual Style

Konsisten dengan IdeaMills existing:
- Border radius `rounded-xl` / `rounded-2xl`
- Border 2px untuk emphasis
- Spacing `space-y-6` section, `space-y-3` inner
- Color: primary untuk active, muted-foreground untuk meta
- Bahasa: Indonesia

### Responsive

- Desktop: list grid 3 columns
- Tablet: 2 columns
- Mobile: 1 column, modal picker pakai Dialog (auto-fit di mobile)

## Doc Extraction (`app/lib/docParser.ts`)

```ts
export async function extractText(buffer: Buffer, mime: string): Promise<string> {
  // .docx → mammoth
  // .txt/.md → buffer.toString('utf-8')
  // throws DocParseError on failure
}
```

Pure function. Dipakai dari `/api/scripts/extract` endpoint.

### Endpoint `/api/scripts/extract`

```
POST /api/scripts/extract
Body: multipart/form-data with 'file' field
Returns: { content: string } (extracted text)

Validation:
- file required
- size ≤ 5MB
- MIME in: docx, txt, md
- extracted text non-empty
- truncate ke 5000 char + warning kalau lebih panjang
```

Endpoint ini **tidak save apapun ke DB**. Hanya extraction utility. Hasil dikembalikan ke client untuk di-fill ke form, user review, baru `POST /api/scripts` untuk save.

## Error Handling

### Validation Errors (400)

| Scenario | Status | Message |
|---|---|---|
| Title kosong / >200 char | 400 | "Title wajib diisi (max 200 karakter)" |
| Tags >10 atau ada tag >50 char | 400 | "Maksimal 10 tags, tiap tag max 50 karakter" |
| Content kosong | 400 | "Content wajib diisi" |
| Content >5000 char | 400 | "Content max 5000 karakter" |
| File >5MB | 400 | "File terlalu besar (max 5MB)" |
| MIME tidak didukung | 400 | "Format file tidak didukung. Gunakan .docx, .txt, atau .md" |
| `.docx` corrupt | 400 | "File rusak atau tidak valid" |
| Extracted text empty | 400 | "Tidak ada teks yang bisa diekstrak dari file" |

### CRUD Errors

| Scenario | Status | Message |
|---|---|---|
| ID tidak valid format | 400 | "ID script tidak valid" |
| ID tidak ditemukan | 404 | "Script tidak ditemukan" |
| MongoDB error | 500 | "Database error. Coba lagi." (log detail server-side) |

### Frontend UX

| Scenario | Handling |
|---|---|
| Form invalid | Disable Save + inline error per field |
| Import script ke Studio yang sudah ada isi | Konfirmasi "Replace current scenes?" |
| Klik Delete | Konfirmasi "Hapus '<title>'? Tidak bisa di-undo." |
| Network error | Toast/alert "Tidak bisa terhubung ke server. Cek koneksi." |

### Cost Guard

Tidak ada LLM call. Cost = $0. Tidak ada quota concern.

## Manual Test Plan

Karena IdeaMills belum punya test infrastructure, MVP rilis dengan **manual test plan** ini sebagai checklist sebelum merge.

### Create — Manual

- [ ] Buka `/scripts/new`
- [ ] Form valid: title 5 char, content 100 char, 1 tag → Save → redirect `/scripts/[id]`
- [ ] Form invalid: title kosong → tombol Save disabled
- [ ] Form invalid: 11 tags → tag ke-11 ditolak
- [ ] Form invalid: content kosong → Save disabled
- [ ] Form invalid: content 6000 char → ditruncate atau ditolak

### Create — Upload doc

- [ ] Klik "Upload doc", pilih `.docx` 100KB valid 200 kata
- [ ] Loading singkat → content textarea ter-fill dengan extracted text
- [ ] User edit text di textarea
- [ ] Save → redirect `/scripts/[id]`, source='upload' tersimpan

- [ ] Upload `.txt` 500 kata → content ter-fill
- [ ] Upload `.md` dengan headers → content ter-fill (markdown syntax tetap muncul as-is)

### Create — Paste content

- [ ] Paste prompt video 1500 char langsung ke textarea → Save → tersimpan utuh

### Edge: Upload validation

- [ ] Upload `.pdf` → ditolak client-side (MIME mismatch)
- [ ] Upload file 6MB → ditolak client-side
- [ ] Upload `.docx` corrupt → 400 error message ramah
- [ ] Upload empty `.txt` → "Tidak ada teks..." error

### Edit

- [ ] `/scripts/[id]` → ubah title, content, save → toast success
- [ ] List page reflect title baru

### Delete

- [ ] `/scripts/[id]` menu ⋯ → Delete → konfirmasi → redirect `/scripts`

### Search & Filter

- [ ] List page: search "skin" → hanya script dengan "skin" di title
- [ ] Klik 1 tag pill → filter aktif
- [ ] Klik 2 tag pills → script dengan salah satu tag muncul (OR)
- [ ] Sort dropdown ubah ke alphabetical → urutan berubah

### Import to Studio — Modal Picker (entry-point A)

- [ ] `/studio` mode "Punya Aset", klik "Import dari Script Bank"
- [ ] Modal terbuka, search + filter berfungsi
- [ ] Klik 1 script → modal close, scenes[0].narasi terisi dengan content full
- [ ] Studio form sudah ada isi → konfirmasi "Replace?"
- [ ] User upload foto produk → klik "Buat Video" → flow Studio jalan

### Import to Studio — Use in Studio (entry-point C)

- [ ] `/scripts/[id]` → klik "Use in Studio"
- [ ] Redirect `/studio?mode=assets&scriptId=xxx`
- [ ] AssetsForm pre-filled scenes[0].narasi = content

### Cross-feature

- [ ] Delete script di bank → generation lama yang sudah pakai script itu tetap aman
- [ ] Edit script di bank → import ulang ke Studio → narasi baru sesuai edit

### Production Readiness

- [ ] Semua manual test plan ✓
- [ ] `npm run build` pass tanpa error
- [ ] `mammoth` dep di-install + lockfile updated
- [ ] `ensureIndexes()` di mongoClient.ts updated
- [ ] Semua route handler pakai try/catch yang return JSON error
- [ ] Loading & error state tampil di semua page baru
- [ ] TopBar nav menu "Scripts" muncul
- [ ] Tidak ada console.error spam saat normal operation
- [ ] Bahasa UI konsisten Indonesia

## Open Questions / Future Iteration

Bukan blocker MVP, tapi bisa jadi v2 berdasarkan feedback user:

1. PDF upload (kalau banyak user submit doc PDF)
2. Duplicate script (1-line tombol)
3. Full-text search di content
4. Auto-tag suggestion (no LLM, statistical from content keywords)
5. Versioning (kalau tim besar masuk)
6. Auth + multi-user (kalau jadi multi-tenant)
7. Integrasi di "Dari Nol" pipeline (script bank sebagai brief inspiration)
8. Multi-scene split — kalau ternyata ada use-case nyata (saat ini eksplisit dihapus)
