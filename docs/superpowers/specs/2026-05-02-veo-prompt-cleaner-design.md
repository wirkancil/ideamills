# Veo Prompt Cleaner Layer — Design Doc

**Date:** 2026-05-02  
**Status:** Approved

---

## Problem

`EXPAND_USER` (LLM expand stage) menghasilkan `clip.prompt` dalam bentuk narasi Bahasa Indonesia panjang (66+ kata). Prompt ini dikirim mentah ke Veo. Hasilnya tidak konsisten — Veo lebih optimal menerima prompt terstruktur dengan technical terms Inggris, sementara dialog model tetap Bahasa Indonesia.

Contoh output expand saat ini yang bermasalah:
```
Model wanita duduk santai di sofa berwarna krem dengan pencahayaan natural dari jendela. 
Ia mengambil botol GlowBooster dari meja, tersenyum ke kamera, dan berkata: "Kulitku 
kusam? Oh sekarang sudah bye-bye! Pake GlowBooster tiap pagi, hasilnya langsung keliatan." 
Ekspresi antusias dan natural. Setting ruang tamu modern minimalis Indonesia. Kamera statis.
```

Masalah: narasi terlalu panjang, tidak terstruktur untuk Veo, tapi mengandung elemen berharga (dialog, aksi) yang tidak boleh hilang.

---

## Solution

Tambahkan **1 LLM call tambahan** (`cleanVeoPrompt`) di worker pipeline, setelah `expandToClips` dan sebelum `createVideoJob`. Hasilnya disimpan di field baru `clip.veo_prompt` — prompt asli tetap di `clip.prompt` untuk ditampilkan di UI.

### Pipeline Baru

```
expandToClips()
  → clip.prompt (Indonesia naratif, disimpan & ditampilkan di UI)
       ↓
cleanVeoPrompt(clip.prompt)
  → clip.veo_prompt (Veo-ready, yang dikirim ke createVideoJob)
       ↓
createVideoJob(prompt: clip.veo_prompt)
```

### Format Output `veo_prompt`

- **Technical visual terms:** Bahasa Inggris (lighting, camera direction, motion)
- **Dialog model:** Bahasa Indonesia, intact persis dari source, aksen natural Indo
- **Struktur:** action → dialog → camera (max ~80 kata)
- **Clean frame:** tanpa negasi, tanpa duplikasi, tanpa prose berlebih

Contoh output target:
```
Indonesian woman sits on cream sofa, picks up GlowBooster bottle, smiles warmly at camera. 
Speaks directly to camera, lips sync: "Kulitku kusam? Oh sekarang sudah bye-bye! Pake 
GlowBooster tiap pagi, hasilnya langsung keliatan." Static camera, single take, clean frame.
```

---

## Architecture

### File Changes

| File | Perubahan |
|------|-----------|
| `app/lib/llm/prompts.ts` | Tambah `CLEAN_VEO_SYSTEM` + `CLEAN_VEO_USER` |
| `app/lib/llm/index.ts` | Tambah `cleanVeoPrompt(rawPrompt, ctx?)` |
| `app/lib/types.ts` | Tambah `veo_prompt?: string` di `Clip` |
| `worker/runGeneration.ts` | Panggil `cleanVeoPrompt` sebelum `createVideoJob`, simpan `veo_prompt` ke DB |
| `app/api/studio/regenerate-clip/route.ts` | Pastikan `veo_prompt` di-reset saat regenerate |
| `app/components/ClipResults.tsx` | Tampilkan `veo_prompt` di expand section sebagai "Veo Prompt (dikirim ke Veo)" |

### LLM Config

- **Model:** `google/gemini-2.5-flash` (hardcoded, sama dengan `suggestExtendPrompt`)
- **maxTokens:** 1500
- **timeoutMs:** 30_000
- **Layer:** `'expand'` (untuk logging konsisten)

---

## Prompt Design

### CLEAN_VEO_SYSTEM

Instruksi ketat satu tanggung jawab:
1. Extract aksi utama (max 2 major actions)
2. Pertahankan dialog Indonesia persis dari source — jangan translate, jangan paraphrase
3. Convert deskripsi visual/technical ke Inggris
4. Output max 80 kata, 1 paragraf, format: `[action] → [dialog] → [camera]`
5. Hapus prose berlebih, negasi, duplikasi
6. Jangan tambah konten baru yang tidak ada di source

### CLEAN_VEO_USER

Pass `clip.prompt` as-is. Tidak perlu context tambahan (productNotes/styleNotes tidak perlu — cleaner hanya mengolah aksi & dialog dari source prompt).

---

## UI Changes

Di `ClipResults.tsx`, section "Lihat prompt lengkap" ditambah field:

```
Clip Prompt (original)     ← clip.prompt (Indonesia naratif)
Veo Prompt (dikirim ke Veo) ← clip.veo_prompt (Veo-ready, English + dialog Indo)
```

Label "Full Prompt (preview gabungan)" tetap ada — `productNotes + styleNotes + veo_prompt`.

---

## Error Handling

- Jika `cleanVeoPrompt` gagal (timeout/error): fallback ke `clip.prompt` original — generation tidak gagal, hanya log warning.
- Jika output kosong: fallback ke `clip.prompt`.
- `veo_prompt` di DB bisa null untuk clips lama — worker selalu cek `clip.veo_prompt ?? clip.prompt` saat kirim ke Veo.

---

## Extend Clip

`extend-clip` route tidak perlu diubah — extend prompt sudah ditulis user/AI secara manual dan sudah dalam format yang lebih clean. Bisa ditambahkan di fase berikutnya jika diperlukan.

---

## Out of Scope

- Orchestrator / multi-agent loop
- Perubahan pada `EXPAND_USER` prompt
- Perubahan pada ideation (`IDEAS_USER`) atau vision (`VISION_COMBINED_PROMPT`)
- Auto-retry dengan model berbeda
