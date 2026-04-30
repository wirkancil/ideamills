# Cost Analysis IdeaMills

Dokumen ini menghitung kapasitas produksi video IdeaMills berdasarkan budget bulanan untuk semua service yang dipakai pipeline AI video generation.

> **Catatan**: Angka kredit Veo, rate limit useapi.net, dan harga model OpenRouter adalah estimasi publik per April 2026. Verifikasi ke akun masing-masing sebelum dipakai sebagai acuan keputusan finansial.

## Budget Bulanan

| Service | Paket | USD | Rp (kurs 17.295,35) |
|---|---|---|---|
| useapi.net | 1 bulan | $15 | 259.430,25 |
| Capsolver | 12.500 kredit | $10 | 172.953,50 |
| OpenRouter | top-up | $20 | 345.907,00 |
| Google Flow Ultra (Shopee) | 25.000 kredit | — | 208.000,00 |
| **TOTAL** | — | — | **986.290,75** |

## Setup Pipeline

- LLM gateway: OpenRouter, preset `balanced`
  - vision: Gemini 2.5 Pro
  - ideation/scripting: Gemini 2.5 Flash
  - embedding: text-embedding-3-small
  - visualPrompt: Claude Sonnet 4.6
  - text2img: Gemini 2.5 Flash Image
- Video: Veo 3.1 Fast via useapi.net Google Flow API ([app/lib/useapi.ts](../app/lib/useapi.ts))
- Default video clip: 8 detik, 100 kredit Google Flow

## Kapasitas Output (per bulan)

| Model Veo | Kredit/clip | Bottleneck | Total clip 8s | Cost/clip | Total video 40s | Cost/video 40s |
|---|---|---|---|---|---|---|
| Veo 2 | 20 | OpenRouter | 333 | Rp 2.961 | 66 | Rp 14.806 |
| Veo 3 Fast | 20 | OpenRouter | 333 | Rp 2.961 | 66 | Rp 14.806 |
| Veo 3 Quality | 100 | Google Flow | 250 | Rp 3.945 | 50 | Rp 19.726 |
| **Veo 3.1 Fast** (default) | 100 | Google Flow | **250** | **Rp 3.945** | **50** | **Rp 19.726** |
| Veo 3.1 Quality | 150 | Google Flow | 166 | Rp 5.940 | 33 | Rp 29.887 |

> Bottleneck OpenRouter pada model murah (~20 kredit) terjadi karena LLM cost per clip (~$0.06) menghabiskan budget $20 sebelum kredit Google Flow habis. Sisa kredit Google Flow tidak terpakai.

## Rincian Biaya per Clip (Veo 3.1 Fast — Default)

| Komponen | Rp/clip |
|---|---|
| LLM visualPrompt (Sonnet 4.6) | 363 |
| text2img (Gemini 2.5 Flash Image) | 675 |
| Google Flow Veo (100 kredit) | 832 |
| Alokasi useapi.net (Rp 259.430 ÷ 250) | 1.038 |
| Alokasi Capsolver (Rp 172.953 ÷ 250) | 692 |
| Alokasi L0–L3 (vision/ideation/embed/scripting) | 345 |
| **Total per clip 8 detik** | **3.945** |
| **× 5 clip = video final 40 detik** | **19.726** |

## Kesimpulan

Dengan budget Rp 986.290 dan setup default IdeaMills:

- **250 clip Veo 8-detik per bulan**, atau
- **50 video iklan final 40-detik per bulan**
- **Rp 3.945 per clip** atau **Rp 19.726 per video final**

Bottleneck nyata = **kredit Google Flow Ultra**. Untuk naikkan kapasitas, top-up Google Flow lebih dulu (bukan OpenRouter atau useapi.net).

## Asumsi yang Perlu Diverifikasi

1. Veo 3.1 Fast = 100 kredit / clip 8-detik (sumber: Google Flow Ultra publik)
2. useapi.net plan $15 = rate limit cukup untuk 250+ request video/bulan
3. Capsolver hanya dipakai untuk maintenance auth Google Flow, bukan per-clip
4. OpenRouter preset `balanced` (Sonnet 4.6 + Gemini 2.5 Flash Image)
5. 1 video final = 5 clip × 8 detik = 40 detik
6. Kurs USD = Rp 17.295,35

## Catatan Operasional

- Cost di atas adalah **per bulan**: useapi.net dan Google Flow Ultra dibayar bulanan, harus diperpanjang setiap bulan.
- Jika produksi <250 clip/bulan, biaya per clip naik karena alokasi fixed cost (useapi + Capsolver) dibagi sedikit output.
- Jika butuh produksi >50 video/bulan, naikkan paket Google Flow Ultra (bukan OpenRouter atau useapi.net).
- Sisa OpenRouter ~$4 tiap bulan tidak terpakai pada setup default — bisa ditabung atau dipakai untuk eksperimen preset `premium`.
