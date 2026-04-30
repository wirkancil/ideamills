# Single Clip + Prompt Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor mode Dari Nol dari 4 clips menjadi 1 clip dengan prompt yang di-generate AI, wajib VO Bahasa Indonesia + lipsync, anti text-overlay, anti-glitch, dan auto-enhance sebelum ditampilkan ke user.

**Architecture:** `EXPAND_USER` prompt di-rewrite untuk generate 1 clip prompt dengan aturan ketat. `expandToClips()` di `llm/index.ts` direlaksasi validasinya dari minimum 2 clips ke minimum 1. `expand/route.ts` memanggil `enhanceVeoPrompt()` otomatis setelah expand sebelum return ke client. `ClipEditor` di-update MIN_CLIPS dari 2 ke 1 agar bisa submit dengan 1 clip.

**Tech Stack:** TypeScript, Next.js App Router, OpenRouter LLM via `app/lib/llm/`

---

## File Map

| File | Aksi | Tanggung jawab |
|------|------|----------------|
| `app/lib/llm/prompts.ts` | Modify | Rewrite `EXPAND_SYSTEM` + `EXPAND_USER` — 1 clip, wajib VO BI, anti-glitch |
| `app/lib/llm/index.ts` | Modify | Relaksasi validasi `expandToClips` dari `< 2` ke `< 1` |
| `app/api/studio/expand/route.ts` | Modify | Auto-enhance clip prompt setelah expand, simpan enhanced ke DB |
| `app/studio/components/ClipEditor.tsx` | Modify | Ubah `MIN_CLIPS` dari 2 ke 1, update label, update `canSubmit` |

---

## Task 1: Rewrite EXPAND_SYSTEM + EXPAND_USER di prompts.ts

**Files:**
- Modify: `app/lib/llm/prompts.ts`

- [ ] **Step 1: Buka dan baca `app/lib/llm/prompts.ts`**

Pastikan kamu memahami struktur existing sebelum edit. Fokus pada `EXPAND_SYSTEM` (baris 46) dan `EXPAND_USER` (baris 48–100).

- [ ] **Step 2: Rewrite `EXPAND_SYSTEM`**

Ganti baris 46:
```ts
export const EXPAND_SYSTEM = `Kamu adalah video director yang men-design 30-second commercial sebagai 4 clips × 8 detik dengan narrative flow.`;
```
Dengan:
```ts
export const EXPAND_SYSTEM = `Kamu adalah Veo prompt specialist untuk iklan video Indonesia. Tugasmu men-design SATU clip prompt 8 detik berkualitas tinggi dari sebuah ide iklan.`;
```

- [ ] **Step 3: Rewrite `EXPAND_USER`**

Ganti seluruh fungsi `EXPAND_USER` (baris 48–100) dengan:
```ts
export const EXPAND_USER = (
  productAnalysis: unknown,
  modelAnalysis: unknown,
  selectedIdea: { title: string; content: string },
  brief: string
) => `PRODUK: ${JSON.stringify(productAnalysis)}
MODEL: ${JSON.stringify(modelAnalysis)}
IDE TERPILIH:
  Title: "${selectedIdea.title}"
  Content: ${selectedIdea.content}
BRIEF: "${brief || '(tidak ada)'}"

Tugas:

1. Tulis "styleNotes" — 1 paragraf singkat yang berisi visual anchor:
   - Nama brand dan bentuk produk (3-5 keyword spesifik untuk konsistensi Veo)
   - Model appearance: umur, gender, ethnicity, style pakaian
   - Setting/lokasi umum
   - Lighting dan tone warna
   StyleNotes ini akan di-prepend ke clip prompt oleh sistem sebelum dikirim ke Veo.

2. Tulis SATU "clip" prompt untuk video iklan 8 detik.

   WAJIB dalam prompt:
   a. Model berbicara langsung ke kamera — sertakan dialog Bahasa Indonesia 1-2 kalimat natural, ditulis inline sebagai: model berbicara: "[dialog]"
   b. Lipsync eksplisit: tulis "model berbicara langsung ke kamera, bibir bergerak sinkron dengan ucapan"
   c. Kamera statis: tulis "static camera, fixed tripod position, eye-level framing"
   d. Single take: tulis "single continuous 8-second take"
   e. Clean frame: tulis "clean video frame, only model and product visible, no on-screen graphics"

   DILARANG dalam prompt:
   - Kata "CTA", "call-to-action", "tagline" — ganti dengan deskripsi visual aksi model
   - Negation phrases: "no X", "not X", "tidak X", "tanpa X", "bukan X", "jangan X" — selalu pakai positive equivalent
   - Kata "subtitle", "teks", "tulisan", "overlay"

   Contoh convert negation ke positive (wajib ikuti):
   - "tidak terlalu terang" → "soft natural indoor lighting"
   - "tidak ada flicker" → "stable steady lighting"
   - "tidak kaku" → "relaxed natural movement"
   - "bukan iklan hard selling" → "authentic conversational tone, feels like genuine product review"
   - "no AI artifacts" → "natural photographic quality with authentic skin texture"
   - "no fast movement" → "slow deliberate motion, calm pacing"

   Format prompt: 1 paragraf naratif, Bahasa Indonesia untuk dialog/VO, Bahasa Inggris untuk technical visual terms. Panjang bebas hingga 5000 karakter.

Return JSON:
{
  "styleNotes": "...",
  "clips": [
    { "prompt": "..." }
  ]
}`;
```

- [ ] **Step 4: Verifikasi file tersimpan dengan benar**

```bash
npx tsx -e "import { EXPAND_SYSTEM, EXPAND_USER } from './app/lib/llm/prompts'; console.log('EXPAND_SYSTEM:', EXPAND_SYSTEM.slice(0,80)); const r = EXPAND_USER({brand:'X'}, {gender:'female'}, {title:'Test',content:'Test content'}, ''); console.log('Has clips key:', r.includes('\"clips\"')); console.log('Has dialog rule:', r.includes('model berbicara')); console.log('Has static camera:', r.includes('static camera')); console.log('Has single take:', r.includes('single continuous')); console.log('Has clean frame:', r.includes('clean video frame'));"
```
Expected: semua `true`, tidak ada error.

- [ ] **Step 5: Commit**

```bash
git add app/lib/llm/prompts.ts
git commit -m "feat: rewrite EXPAND_USER — single clip, wajib VO Bahasa Indonesia, anti-glitch rules"
```

---

## Task 2: Relaksasi validasi expandToClips di llm/index.ts

**Files:**
- Modify: `app/lib/llm/index.ts:314-318`

- [ ] **Step 1: Ubah validasi minimum clips**

Di `app/lib/llm/index.ts`, cari baris:
```ts
  if (!Array.isArray(clips) || clips.length < 2) {
    throw new LLMError('Expand returned < 2 clips', 'INVALID_RESPONSE', 'llmgateway', expand);
  }
```
Ganti dengan:
```ts
  if (!Array.isArray(clips) || clips.length < 1) {
    throw new LLMError('Expand returned 0 clips', 'INVALID_RESPONSE', 'llmgateway', expand);
  }
```

- [ ] **Step 2: Verifikasi TypeScript compile**

```bash
npx tsc --noEmit --project tsconfig.json 2>&1 | head -20
```
Expected: tidak ada error baru.

- [ ] **Step 3: Commit**

```bash
git add app/lib/llm/index.ts
git commit -m "fix: allow expandToClips to return 1 clip (was min 2)"
```

---

## Task 3: Auto-enhance di expand/route.ts

**Files:**
- Modify: `app/api/studio/expand/route.ts`

- [ ] **Step 1: Import enhanceVeoPrompt**

Di `app/api/studio/expand/route.ts` baris 5, tambahkan `enhanceVeoPrompt` ke import dari `@/app/lib/llm`:
```ts
import { resolvePreset, expandToClips, enhanceVeoPrompt } from '@/app/lib/llm';
```

- [ ] **Step 2: Tambahkan auto-enhance setelah expandToClips**

Di `app/api/studio/expand/route.ts`, cari blok setelah `const result = await expandToClips(...)` (baris 56–62). Ubah dari:

```ts
    const result = await expandToClips(
      productAnalysis,
      modelAnalysis,
      selectedIdea,
      brief,
      modelConfig as Parameters<typeof expandToClips>[4]
    );

    const now = new Date();
    const clips: Clip[] = result.clips.map((c, idx) => ({
      index: idx,
      prompt: c.prompt,
```

Menjadi:

```ts
    const result = await expandToClips(
      productAnalysis,
      modelAnalysis,
      selectedIdea,
      brief,
      modelConfig as Parameters<typeof expandToClips>[4]
    );

    // Auto-enhance: flip negation ke positive phrasing sebelum return ke client
    const enhancedClips = await Promise.all(
      result.clips.map(async (c) => {
        try {
          const enhanced = await enhanceVeoPrompt(c.prompt, modelConfig as Parameters<typeof enhanceVeoPrompt>[1]);
          return { prompt: enhanced };
        } catch {
          return { prompt: c.prompt };
        }
      })
    );

    const now = new Date();
    const clips: Clip[] = enhancedClips.map((c, idx) => ({
      index: idx,
      prompt: c.prompt,
```

- [ ] **Step 3: Verifikasi TypeScript compile**

```bash
npx tsc --noEmit --project tsconfig.json 2>&1 | head -20
```
Expected: tidak ada error baru.

- [ ] **Step 4: Test manual — call expand endpoint**

Jalankan dev server:
```bash
npm run dev
```
Lakukan generate ide di Studio → pilih ide → perhatikan clip prompt yang muncul di ClipEditor. Pastikan:
- Prompt berbahasa Indonesia (dialog/VO)
- Ada frasa "model berbicara" dengan dialog
- Tidak ada negation seperti "tidak", "jangan", "no X"
- Tidak ada kata "CTA" atau "call-to-action"

- [ ] **Step 5: Commit**

```bash
git add app/api/studio/expand/route.ts
git commit -m "feat: auto-enhance clip prompt after expand (flip negation before returning to client)"
```

---

## Task 4: Update ClipEditor — MIN_CLIPS dan label

**Files:**
- Modify: `app/studio/components/ClipEditor.tsx`

- [ ] **Step 1: Ubah MIN_CLIPS dari 2 ke 1**

Di `app/studio/components/ClipEditor.tsx` baris 32:
```ts
const MIN_CLIPS = 2;
```
Ganti dengan:
```ts
const MIN_CLIPS = 1;
```

- [ ] **Step 2: Update canSubmit — hapus minimum clips check**

Di baris 99–101:
```ts
  const canSubmit =
    !submitting && clips.length >= MIN_CLIPS && clips.every((c) => c.prompt.trim().length >= 10);
```
Ganti dengan:
```ts
  const canSubmit =
    !submitting && clips.length >= MIN_CLIPS && clips.every((c) => c.prompt.trim().length >= 10);
```
(Tidak berubah — `MIN_CLIPS` sudah diubah ke 1, jadi ini otomatis benar.)

- [ ] **Step 3: Update label clips agar tidak hardcode asumsi jumlah**

Di baris 117–119:
```tsx
        <Label>
          Clips ({clips.length} × 8 detik = ~{clips.length * 8} detik total)
        </Label>
```
Ganti dengan:
```tsx
        <Label>
          {clips.length === 1
            ? 'Clip (8 detik)'
            : `Clips (${clips.length} × 8 detik = ~${clips.length * 8} detik total)`}
        </Label>
```

- [ ] **Step 4: Update tombol remove — MIN_CLIPS sudah 1, hapus tombol jika hanya 1 clip tetap benar**

Baris 148–153 sudah menggunakan `MIN_CLIPS`:
```tsx
                {clips.length > MIN_CLIPS && (
                  <button
                    type="button"
                    onClick={() => removeClip(clip.index)}
```
Ini sudah benar — tombol hapus hanya muncul jika lebih dari 1 clip. Tidak perlu diubah.

- [ ] **Step 5: Verifikasi TypeScript compile**

```bash
npx tsc --noEmit --project tsconfig.json 2>&1 | head -20
```
Expected: tidak ada error baru.

- [ ] **Step 6: Test UI di browser**

Buka Studio → mode Dari Nol → generate ide → pilih ide → pastikan:
- ClipEditor menampilkan 1 clip (bukan 4)
- Label menampilkan "Clip (8 detik)"
- Tombol "Tambah Clip" masih ada (untuk user yang mau tambah manual)
- Tombol "Buat Video" aktif dengan 1 clip

- [ ] **Step 7: Commit**

```bash
git add app/studio/components/ClipEditor.tsx
git commit -m "fix: ClipEditor MIN_CLIPS=1, update label for single clip from-scratch flow"
```

---

## Self-Review Checklist

**Spec coverage:**
- [x] Section 1: EXPAND_USER rewrite — Task 1
- [x] Section 2: Auto-enhance di expand/route.ts — Task 3
- [x] Section 3: Flow 1 clip — Tasks 1+2+4
- [x] Section 4: ClipEditor UI update — Task 4

**Tidak ada placeholder** — semua step punya kode konkret.

**Type consistency:**
- `enhanceVeoPrompt` sudah ada di `app/lib/llm/index.ts` dan di-export, langsung bisa dipakai di Task 3.
- `expandToClips` return type `{ styleNotes: string; clips: Array<{ prompt: string }> }` — konsisten di semua task.
- `Clip` type dari `app/lib/types` tidak berubah.
