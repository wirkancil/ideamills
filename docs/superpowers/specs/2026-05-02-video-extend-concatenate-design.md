# Design: Video Extend & Concatenate
**Date:** 2026-05-02  
**Status:** Approved  

---

## Overview

Tambah dua fitur baru di halaman History:
1. **Extend** — perpanjang video clip yang sudah ada menghasilkan segment 8 detik baru via `POST /google-flow/videos/extend` (useapi.net)
2. **Concatenate** — gabungkan multiple clips yang dipilih user menjadi 1 video via `POST /google-flow/videos/concatenate`

Hasil extend ditampilkan sebagai clip baru dalam generation yang sama. Clip asli tetap ada dan tidak diubah. Hasil concatenate disimpan sebagai item terpisah di dalam generation yang sama.

---

## Data Model

### Perubahan `Clip` (`app/lib/types.ts`)

Tambah 2 field optional ke interface `Clip` yang sudah ada:

```ts
extended_from_index?: number | null;  // index clip sumber jika ini hasil extend
is_extended?: boolean;                // flag untuk distinguish di UI
```

Field `mediaGenerationId` yang sudah ada digunakan sebagai input ke `/videos/extend`.

### Field baru di `DBGeneration`

```ts
concatenated_videos?: ConcatenatedVideo[];
```

### Interface baru `ConcatenatedVideo`

```ts
interface ConcatenatedVideo {
  id: string;               // uuid lokal (crypto.randomUUID())
  clip_indices: number[];   // clips yang digabung, urutan yang user pilih
  status: 'generating' | 'done' | 'failed';
  local_path?: string | null;
  error?: string | null;
  created_at: Date;
}
```

---

## API Endpoints

### `POST /api/studio/extend-clip`

Mulai proses extend video dari clip sumber.

**Request body:**
```ts
{
  generationId: string;
  sourceClipIndex: number;  // index clip yang di-extend
  prompt: string;           // prompt extension (manual atau dari AI)
}
```

**Proses:**
1. Ambil `mediaGenerationId` dari clip sumber di MongoDB
2. Validasi clip sumber punya `video_status === 'done'` dan `mediaGenerationId`
3. Call `POST /google-flow/videos/extend` via useapi.net (async mode)
4. Buat objek `Clip` baru dengan:
   - `extended_from_index = sourceClipIndex`
   - `is_extended = true`
   - `video_status = 'queued'`
   - `video_job_id = jobId` dari response useapi
   - `prompt = prompt` yang dikirim
   - `index = clips.length` (append ke akhir array)
5. Push clip baru ke `generation.clips[]` via `$push`
6. Return `{ clipIndex: number }` — index clip baru

**Response:** `{ clipIndex: number }`

---

### `POST /api/studio/suggest-extend-prompt`

Generate prompt extension menggunakan LLM berdasarkan prompt clip sumber.

**Request body:**
```ts
{
  generationId: string;
  sourceClipIndex: number;
}
```

**Proses:**
1. Ambil `prompt` clip sumber + `brief` generation dari MongoDB
2. Call LLM (DeepSeek via OpenRouter) dengan instruksi: generate 1 prompt extension yang secara visual melanjutkan scene sebelumnya secara natural
3. Return prompt dalam bahasa Inggris (sama dengan format prompt clip asli)

**Response:** `{ prompt: string }`

---

### `POST /api/studio/concatenate`

Gabungkan multiple clips menjadi 1 video.

**Request body:**
```ts
{
  generationId: string;
  clipIndices: number[];  // urutan yang user pilih
}
```

**Proses:**
1. Validasi semua clips yang dipilih punya `video_status === 'done'` dan `mediaGenerationId`
2. Bangun array `media` untuk useapi:
   - Clips dengan `is_extended === true` mendapat `trimStart: 1` untuk hilangkan overlap
   - Clips biasa tidak ada trimStart
3. Call `POST /google-flow/videos/concatenate`
4. Buat dokumen `ConcatenatedVideo` dengan `status: 'generating'`, push ke `generation.concatenated_videos[]`
5. Response base64 dari useapi → decode → simpan ke `storage/videos/{generationId}/concat_{id}.mp4`
6. Update `ConcatenatedVideo` dengan `status: 'done'` dan `local_path`

**Response:** `{ concatenatedVideoId: string }`

---

## Polling Extended Clips

Worker yang sudah ada (`/worker`) sudah handle polling `video_job_id` untuk semua clips. Extended clips menggunakan mekanisme yang sama — tidak perlu perubahan di worker.

Namun perlu pastikan worker query juga mengambil clips dengan `is_extended: true` saat mencari clips dengan `video_status === 'queued'`.

---

## UI — History Page

### Tombol Extend per Clip

- Muncul pada setiap clip dengan `video_status === 'done'`
- Posisi: di action bar clip, sejajar dengan tombol download

**Modal Extend:**
- Header: *"Extend Clip #[N]"*
- Textarea: placeholder *"Deskripsikan apa yang terjadi selanjutnya..."*
- Tombol **"Generate Prompt"** → call `suggest-extend-prompt` → isi textarea (dengan loading state)
- Tombol **"Extend Video"** → call `extend-clip` → tutup modal → clip baru muncul di bawah dengan status generating
- Tombol **"Batal"**

### Badge Extended Clip

Extended clips ditampilkan dengan:
- Badge kecil **"Extended"** (warna berbeda dari badge status)
- Sub-label: *"dari Clip #[sourceIndex]"*

### Concatenate — Mode Seleksi

Trigger: tombol **"Gabungkan Clips"** di header generation card (hanya muncul jika ada ≥2 clips dengan `video_status === 'done'`).

**Mode seleksi aktif:**
- Setiap clip dengan `video_status === 'done'` tampil checkbox di pojok
- Footer sticky bar muncul: *"[N] clips dipilih"* + tombol **"Gabungkan"** + tombol **"Batal"**
- Tombol Gabungkan disabled jika < 2 clips dipilih

**Setelah concatenate selesai:**
- Video gabungan muncul sebagai card terpisah di bawah semua clips dalam generation yang sama
- Card menampilkan: video player + tombol download + label *"Video Gabungan ([N] clips)"*
- Bisa ada multiple concatenated videos dalam 1 generation

---

## Error Handling

| Skenario | Handling |
|---|---|
| Clip sumber tidak punya `mediaGenerationId` | Return 400, tampil error di modal |
| useapi.net extend gagal (403 PROMINENT_PEOPLE) | Set `video_status: 'failed'`, `video_error` = pesan yang sudah ada |
| useapi.net extend gagal (lainnya) | Set `video_status: 'failed'`, tampil tombol Retry |
| Concatenate: ada clip yang belum done | Validasi di frontend (disable checkbox) + validasi di backend |
| Concatenate: useapi gagal | Set `ConcatenatedVideo.status: 'failed'`, tampil error + tombol Retry |

---

## File yang Diubah / Dibuat

| File | Perubahan |
|---|---|
| `app/lib/types.ts` | Tambah `extended_from_index`, `is_extended` ke `Clip`; tambah `ConcatenatedVideo`; tambah `concatenated_videos` ke `DBGeneration` |
| `app/lib/useapi.ts` | Tambah fungsi `extendVideo()` dan `concatenateVideos()` |
| `app/api/studio/extend-clip/route.ts` | Endpoint baru |
| `app/api/studio/suggest-extend-prompt/route.ts` | Endpoint baru |
| `app/api/studio/concatenate/route.ts` | Endpoint baru |
| `app/components/ClipResults.tsx` | Tambah tombol Extend + modal + badge Extended |
| `app/history/page.tsx` | Tambah UI concatenate (mode seleksi + footer bar + card hasil) |

---

## Biaya

- **Extend:** sama dengan generate video biasa — 1 kredit Google Flow per extend
- **Concatenate:** tidak ada biaya tambahan dari useapi (operasi server-side)
- **suggest-extend-prompt:** biaya LLM DeepSeek — sangat murah (~$0.001 per call)
