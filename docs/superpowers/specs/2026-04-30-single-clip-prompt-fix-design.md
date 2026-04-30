# Design: Single Clip + Prompt Fix (Dari Nol)

**Date:** 2026-04-30
**Branch:** feature/studio-clean-flow

## Problem

Mode Dari Nol saat ini memiliki 3 masalah utama:

1. **Clip prompt berbahasa Inggris** — `EXPAND_USER` tidak mewajibkan VO/dialog, LLM skip dialog dan tulis full visual description dalam bahasa Inggris.
2. **Tidak ada lipsync** — tanpa instruksi eksplisit model berbicara + dialog, Veo tidak render lipsync.
3. **Text overlay muncul di video** — kata "CTA", "call-to-action" di clip 4 trigger Veo render on-screen text.
4. **Glitch/artefak visual** — prompt ambigu soal camera motion dan negation phrases menyebabkan Veo interpret bebas → jitter, random cuts, artefak.
5. **4 clips terlalu kompleks** — user harus edit 4 prompt sekaligus, dan pipeline 4x lebih mahal/lambat.

## Solution: Refactor Expand → Single Clip + Auto-Enhance

### Scope Perubahan

| File | Perubahan |
|------|-----------|
| `app/lib/llm/prompts.ts` | Rewrite `EXPAND_USER` — 1 clip, wajib VO Bahasa Indonesia, anti-glitch rules |
| `app/api/studio/expand/route.ts` | Auto-enhance clip prompt sebelum return ke client |
| `app/studio/components/ClipEditor.tsx` | Hapus UI asumsi 4 clips (label "Clip X/4", dll) jika ada |

Worker (`runGeneration.ts`), DB schema, dan route lain **tidak berubah** — sudah support 1 clip.

---

## Section 1: EXPAND_USER Prompt Baru

### Tujuan

Generate **1 clip prompt** berkualitas tinggi, 8 detik, siap pakai untuk Veo image-to-video.

### Aturan wajib dalam prompt baru

**VO/Dialog:**
- Wajib include model berbicara ke kamera dalam Bahasa Indonesia
- 1-2 kalimat dialog natural, disertakan inline: `model berbicara: "..."`
- Eksplisit: `"model berbicara langsung ke kamera, bibir bergerak sinkron dengan ucapan"`

**Anti text-overlay:**
- Tidak boleh sebut "CTA", "call-to-action", "tagline", "teks", "tulisan", "subtitle"
- Diganti deskripsi visual aksi: `"model mengangkat produk ke kamera dengan senyum"` 
- Positive phrasing: `"clean video frame, only model and product visible"`

**Anti-glitch:**
- `"static camera, fixed tripod position"` — prevent jitter
- `"single continuous 8-second take"` — prevent random cuts
- Semua negation di-convert ke positive equivalent (enforce lebih ketat dari versi lama)
- Tidak ada ambigu motion — setiap gerakan model harus dideskripsikan eksplisit

**Bahasa:**
- Technical visual terms: Bahasa Inggris
- Dialog/VO model: Bahasa Indonesia
- Narasi deskripsi prompt: campur (natural)

**Panjang prompt:** bebas hingga 5000 karakter (sama dengan Quick Generate)

**`styleNotes`:** tetap ada, berisi visual anchor (brand, model appearance, setting, lighting) — di-prepend ke prompt oleh worker sebelum dikirim ke Veo.

---

## Section 2: Auto-Enhance di expand/route.ts

Setelah `expandToClips()` return 1 clip prompt, server langsung panggil `enhancePrompt()` (fungsi yang sudah ada, pakai `ENHANCE_PROMPT_SYSTEM`) sebelum return ke client.

**Flow:**
```
LLM generate clip prompt
  → server auto-enhance (flip negation)
  → simpan ke DB (prompt sudah enhanced)
  → return ke client (user langsung lihat prompt rapi)
```

User tidak perlu klik tombol Enhance manual. Tombol Enhance di ClipEditor tetap ada untuk re-enhance jika user edit manual.

---

## Section 3: Flow Dari Nol Setelah Perubahan

```
Upload foto
  → Generate Ide (3-5 ide, tidak berubah)
  → Pilih Ide
  → Expand → 1 clip prompt (auto-enhanced, siap pakai)
  → ClipEditor: user bisa edit prompt
  → Generate Video (1 clip × 8 detik)
```

Identik dengan Quick Generate flow, bedanya clip prompt di-generate AI dari ide yang dipilih.

---

## Section 4: ClipEditor UI

Periksa dan hapus elemen UI yang mengasumsikan 4 clips:
- Label "Clip 1/4" atau "Clip X dari Y" → ganti ke "Clip" saja
- Navigasi antar clip (prev/next) jika ada → hapus jika tidak relevan untuk 1 clip
- Fungsionalitas inti (edit prompt, imageMode) tidak berubah

---

## Out of Scope

- Quick Generate route — tidak berubah
- Worker pipeline — tidak berubah  
- DB schema — tidak berubah
- IDEAS_USER prompt (ide generation) — tidak berubah
- Voice profile / audio pipeline — tidak termasuk
