# Service Monitoring — Design Spec (Complete)

**Date:** 2026-04-30
**Status:** Approved (brainstorming complete)
**Scope:** Halaman `/monitoring` + entry baru di TopBar dengan dua tab:
- **Tab "Status"** — saldo & kesehatan 4 external service real-time (polling 60s)
- **Tab "History"** — cost per generation dalam Rupiah, logging asset usage Veo/Imagen, kurs live dari frankfurter.app (auto-refresh 30s)

---

## 1. Goal & Context

Pipeline IdeaMills bergantung pada empat external service berbayar. Dua masalah:

1. **Saldo habis tanpa diketahui** — generation gagal silently. Butuh panel saldo real-time.
2. **Cost per generation tidak terlihat** — tidak bisa evaluasi efisiensi. Butuh history pengeluaran per generation dalam Rupiah.

**Service yang dimonitor:**

| Service | Tab Status (saldo) | Tab History (cost) |
|---|---|---|
| OpenRouter | sisa USD credit | actual cost dari `llm_usage.costUsd` |
| Google Flow | sisa AI credits + tier | actual cost dari `asset_usage` (Veo/Imagen log) |
| CapSolver | sisa USD balance | tidak ter-track per generation (hanya saldo total) |
| useapi.net | request count + success rate | supporting metric saja |

**Pricing resmi Google (sumber: support.google.com/labs/answer/16526234, April 2026):**

| Model | Credits per generation | USD (@ $0.01/credit resmi) |
|---|---|---|
| Veo 3.1 Lite | 10 | $0.10 |
| Veo 3.1 Fast | 20 | $0.20 |
| Veo 3.1 Quality | 100 | $1.00 |
| Imagen 4 (estimasi) | 10 | $0.10 |

**Non-goals:**
- Tidak ada auth/RBAC (single-tenant local app).
- Tidak ada per-service drill-down page.
- Tidak ada alerting/notification push.
- Tidak ada filter/search di History list (YAGNI).
- Tidak ada export CSV.
- CapSolver cost per generation tidak di-track (tidak ada API per-solve).

---

## 2. Architecture

### Tab Status — single aggregator route

```
[browser /monitoring — Tab Status]
        │ poll 60s + manual refresh ?force=1
        ▼
[GET /api/admin/monitoring]
        │ in-memory cache 30s
        ▼
[buildSnapshot() — Promise.allSettled, 5s timeout per service]
   ├─► fetchOpenRouterCredit()  → openrouter.ai/api/v1/credits
   ├─► fetchGoogleFlowCredit()  → useapi.net /google-flow/accounts/{email}
   ├─► fetchCapSolverBalance()  → capsolver.com /getBalance
   └─► fetchUseapiStats()       → useapi.net /account/stats
```

Satu fetcher yang fail tidak men-block tiga lainnya. Response selalu `MonitoringSnapshot` dengan 4 entries (urutan tetap).

### Tab History — aggregation route + asset logging

```
[browser /monitoring — Tab History]
        │ poll 30s
        ▼
[GET /api/admin/monitoring/history]
        │ no server cache — data fresh tiap generation selesai
        ▼
[buildHistorySnapshot()]
   ├─► query MongoDB llm_usage    (costUsd per LLM call, grouped by jobId/generationId)
   ├─► query MongoDB asset_usage  (costUsd per Veo/Imagen call, grouped by generationId)
   ├─► query MongoDB Generations  (product_identifier, clips[], created_at)
   └─► fetchUsdToIdr()            → frankfurter.app (cache 24h)

[Logging pipeline — baru]
  worker/runGeneration.ts
    setelah waitForVideo() → logAssetUsage() → insert asset_usage
  app/api/studio/generate-image/route.ts
    setelah generateImage() → logAssetUsage() → insert asset_usage
```

---

## 3. File Layout

### File baru

```
app/
  monitoring/
    page.tsx                          # Halaman /monitoring — client component, 2 tab
  api/admin/monitoring/
    route.ts                          # GET /api/admin/monitoring — Status aggregator
    history/
      route.ts                        # GET /api/admin/monitoring/history
  lib/monitoring/
    types.ts                          # Semua types: ServiceMetric, MonitoringSnapshot,
                                      #   AssetUsageEntry, GenerationCostRow, HistorySnapshot
    thresholds.ts                     # computeStatus() + threshold constants
    cache.ts                          # In-memory cache 30s untuk Status snapshot
    aggregator.ts                     # buildSnapshot() — 4 fetchers parallel
    creditCosts.ts                    # GOOGLE_FLOW_CREDIT_COSTS + assetCostUsd()
    assetUsage.ts                     # logAssetUsage() — insert ke asset_usage collection
    exchange.ts                       # fetchUsdToIdr() — frankfurter.app, cache 24h
    history.ts                        # buildHistorySnapshot() — aggregate + join + kurs
    services/
      openrouter.ts                   # fetchOpenRouterCredit()
      googleFlow.ts                   # fetchGoogleFlowCredit()
      capsolver.ts                    # fetchCapSolverBalance()
      useapi.ts                       # fetchUseapiStats()
      __tests__/
        thresholds.test.ts
        aggregator.test.ts
        exchange.test.ts
        history.test.ts
vitest.config.ts                      # Vitest config (root)
```

### File yang dimodifikasi

| File | Perubahan |
|---|---|
| `app/components/TopBar.tsx` | Tambah link "Monitoring" di paling kanan, icon `Activity` |
| `app/lib/monitoring/types.ts` | (baru — tidak ada file existing) |
| `worker/runGeneration.ts` | Tambah `logAssetUsage()` setelah `waitForVideo()` |
| `app/api/studio/generate-image/route.ts` | Tambah `logAssetUsage()` setelah `generateImage()` |
| `.env.example` | Tambah `CAPSOLVER_API_KEY=CAP-...` |
| `package.json` | Tambah `vitest`, script `test` + `test:watch` |

### Env vars

```
OPENROUTER_API_KEY        # existing — Bearer openrouter.ai
USEAPI_TOKEN              # existing — Bearer useapi.net
USEAPI_GOOGLE_EMAIL       # existing — path param /google-flow/accounts/{email}
CAPSOLVER_API_KEY         # NEW — clientKey untuk POST /getBalance capsolver.com
```

---

## 4. Data Contract — Tab Status

### `app/lib/monitoring/types.ts` (Status types)

```typescript
export type ServiceName = 'openrouter' | 'google-flow' | 'capsolver' | 'useapi';
export type ServiceStatus = 'ok' | 'warning' | 'error';
export type ServiceUnit = 'usd' | 'credits' | 'requests' | null;

export interface ServiceMetric {
  service: ServiceName;
  status: ServiceStatus;
  display: string;        // e.g. "$4.21", "1,250 credits", "API healthy"
  value: number | null;   // raw numeric for threshold logic; null if not applicable
  unit: ServiceUnit;
  detail: string | null;  // muted sub-info e.g. "$5.79 used", "Tier 2", "548 reqs · 98.2% ok"
  error: string | null;   // set only when status === 'error'
  latencyMs: number;
}

export interface MonitoringSnapshot {
  generatedAt: string;    // ISO timestamp snapshot dibuat
  cachedAt: string | null; // ISO timestamp dari cache; null = fresh fetch
  services: ServiceMetric[]; // always 4 in order: openrouter, google-flow, capsolver, useapi
}

export const SERVICE_ORDER: ServiceName[] = ['openrouter', 'google-flow', 'capsolver', 'useapi'];

export const SERVICE_LABELS: Record<ServiceName, string> = {
  'openrouter':   'OpenRouter',
  'google-flow':  'Google Flow',
  'capsolver':    'CapSolver',
  'useapi':       'useapi.net',
};
```

### Service mapping rules

**OpenRouter** (`fetchOpenRouterCredit`):
- `GET https://openrouter.ai/api/v1/credits` — `Authorization: Bearer ${OPENROUTER_API_KEY}`
- Response: `{ data: { total_credits: number, total_usage: number } }`
- `remaining = total_credits - total_usage`
- `display = "$" + remaining.toFixed(2)`, `unit = 'usd'`, `detail = "$X.XX used"`

**Google Flow** (`fetchGoogleFlowCredit`):
- `GET https://api.useapi.net/v1/google-flow/accounts/${USEAPI_GOOGLE_EMAIL}` — `Authorization: Bearer ${USEAPI_TOKEN}`
- Response: `{ health: string, credits?: { credits: number, userPaygateTier: string } }`
- If `health !== 'OK'` → `status='error'`, `error='health: ' + health`
- Else: `display = credits.toLocaleString() + " credits"`, `unit = 'credits'`, `detail = humanizeTier(tier)`
- `humanizeTier`: `PAYGATE_TIER_TWO` → `'Tier 2'`, `PAYGATE_TIER_ONE` → `'Tier 1'`, unknown → pass-through

**CapSolver** (`fetchCapSolverBalance`):
- `POST https://api.capsolver.com/getBalance` — body `{ clientKey: CAPSOLVER_API_KEY }` (no Authorization header)
- Response: `{ errorId: 0, balance: number }` on success; `{ errorId: number, errorDescription: string }` on error
- If `errorId !== 0` → `status='error'`, `error=errorDescription`
- Else: `display = "$" + balance.toFixed(2)`, `unit = 'usd'`, `detail = 'connected via useapi'`

**useapi.net** (`fetchUseapiStats`):
- `GET https://api.useapi.net/v1/account/stats?bot=google-flow&date=YYYY-MM-DD` — `Authorization: Bearer ${USEAPI_TOKEN}`
- If no `summary` (no requests today) → `display='API healthy'`, `value=null`, `detail='no requests today'`, `status='ok'`
- Else: parse `success_rate` string (strip `%`); `display='API healthy'`, `detail='{total} reqs · {rate}% ok'`
- `status='warning'` if parsed rate < 80; `status='ok'` otherwise. `status='error'` only on fetch/auth failure.

### Threshold rules — `app/lib/monitoring/thresholds.ts`

```typescript
const THRESHOLDS = {
  'openrouter':   { warningBelow: 5,   errorBelow: 1    },  // USD
  'google-flow':  { warningBelow: 100, errorBelow: 20   },  // credits
  'capsolver':    { warningBelow: 3,   errorBelow: 0.5  },  // USD
  'useapi':       { warningBelow: 80,  errorBelow: null },  // success_rate %
};
// Boundary: strict less-than. value === warningBelow → 'ok'. value === errorBelow → 'warning'.
// null value → 'ok'. API/auth/timeout failure → always 'error' (overrides threshold).
```

### Cache & polling (Tab Status)

**Server-side:** module-level in-memory, TTL 30s. `getCachedSnapshot(force)` di `cache.ts`. `?force=1` bypass cache.

**Frontend:** `useEffect` polling 60s + tombol "Refresh sekarang" (call dengan `?force=1`, disabled + spinner saat in-flight). Cleanup via `cancelled` flag + `clearInterval` saat component unmount.

**Per-fetcher timeout:** `AbortController` 5s. `AbortError` → `status='error'`, `error='timeout 5s'`.

---

## 5. Data Contract — Tab History

### `app/lib/monitoring/types.ts` (History types)

```typescript
export interface AssetUsageEntry {
  generationId: string;      // link ke Generations._id; 'preview' jika dari Imagen standalone
  clipIndex: number;         // 0-5 untuk video; -1 untuk Imagen preview
  service: 'veo' | 'imagen';
  model: string;             // 'veo-3.1-fast' | 'veo-3.1-quality' | 'veo-3.1-lite' | 'imagen-4'
  creditCost: number;        // jumlah credits dari tabel resmi Google
  creditPriceUsd: number;    // $0.01 (harga resmi Google, flat semua tier)
  costUsd: number;           // creditCost × creditPriceUsd
  createdAt: Date;
}

export interface GenerationCostRow {
  generationId: string;
  productIdentifier: string;
  createdAt: string;         // ISO timestamp
  clipCount: number;         // jumlah clips di generation (dari Generations.clips[])
  llmCostUsd: number;        // sum(llm_usage.costUsd) WHERE jobId = generationId
  assetCostUsd: number;      // sum(asset_usage.costUsd) WHERE generationId
  totalCostUsd: number;      // llmCostUsd + assetCostUsd
  totalCostIdr: number;      // totalCostUsd × exchangeRate.usdToIdr
  costPerClipIdr: number;    // totalCostIdr / clipCount; 0 jika clipCount = 0
}

export interface HistorySnapshot {
  rows: GenerationCostRow[];  // sorted descending by createdAt
  summary: {
    todayIdr: number;
    sevenDaysIdr: number;
    allTimeIdr: number;
  };
  exchangeRate: {
    usdToIdr: number;
    source: 'frankfurter.app';
    updatedAt: string;        // ISO date e.g. "2026-04-30"
  };
  generatedAt: string;
}
```

### `app/lib/monitoring/creditCosts.ts`

```typescript
export const GOOGLE_FLOW_CREDIT_COSTS: Record<string, number> = {
  'veo-3.1-lite':    10,
  'veo-3.1-fast':    20,
  'veo-3.1-quality': 100,
  'imagen-4':        10,
};

export const GOOGLE_FLOW_CREDIT_PRICE_USD = 0.01;

export function assetCostUsd(model: string): number {
  const credits = GOOGLE_FLOW_CREDIT_COSTS[model] ?? 20;
  return credits * GOOGLE_FLOW_CREDIT_PRICE_USD;
}
```

### `app/lib/monitoring/exchange.ts`

```typescript
const CACHE_MS = 24 * 60 * 60 * 1000;
let cached: { rate: number; updatedAt: string; expiresAt: number } | null = null;

export async function fetchUsdToIdr(): Promise<{ rate: number; updatedAt: string }> {
  if (cached && Date.now() < cached.expiresAt) {
    return { rate: cached.rate, updatedAt: cached.updatedAt };
  }
  try {
    const res = await fetch('https://api.frankfurter.app/latest?from=USD&to=IDR');
    const json = await res.json();
    const rate: number = json.rates.IDR;
    cached = { rate, updatedAt: json.date, expiresAt: Date.now() + CACHE_MS };
    return { rate, updatedAt: json.date };
  } catch {
    if (cached) return { rate: cached.rate, updatedAt: cached.updatedAt };
    return { rate: 16500, updatedAt: 'fallback' };
  }
}
```

Cache 24h. Fallback ke cache expired jika API down; fallback hardcode `16500` jika belum ada cache sama sekali.

### `app/lib/monitoring/assetUsage.ts`

```typescript
export async function logAssetUsage(entry: AssetUsageEntry): Promise<void> {
  try {
    const db = await getDb();
    await db.collection('asset_usage').insertOne(entry);
  } catch (err) {
    console.warn('[asset] failed to log usage:', (err as Error).message);
  }
}
```

Fire-and-forget dengan try/catch. Kalau DB down, generation tidak gagal — sama pola dengan `logUsage()` LLM middleware.

### `app/lib/monitoring/history.ts` — `buildHistorySnapshot()`

1. `fetchUsdToIdr()` → kurs
2. Query `Generations` collection: semua docs, ambil `_id`, `product_identifier`, `created_at`, `clips`
3. Query `llm_usage`: group by `jobId`, sum `costUsd` → `Map<generationId, llmCost>`
4. Query `asset_usage`: group by `generationId`, sum `costUsd` → `Map<generationId, assetCost>`
5. Join: per generation → `totalCostUsd = llm + asset` → `totalCostIdr = totalCostUsd × rate` → `costPerClipIdr = totalCostIdr / clipCount` (0 if clipCount = 0)
6. Sort by `createdAt` descending
7. Compute summary: bucket rows by today / 7 days / all-time
8. Return `HistorySnapshot`

**Mapping `llm_usage.jobId` → `generationId`:** field `jobId` di `llm_usage` diisi oleh `logUsage()` di middleware. Saat implementasi, verifikasi semua LLM calls di worker mengisi `jobId` = `generationId` dengan benar.

### History API Route

```typescript
// GET /api/admin/monitoring/history
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const snapshot = await buildHistorySnapshot();
    return NextResponse.json(snapshot);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
```

Tidak ada server-side cache — data berubah setiap generation selesai. Frontend poll 30s sudah cukup.

---

## 6. Logging Integration

### `worker/runGeneration.ts`

Tambah setelah `const videoUrl = await waitForVideo(veoJobId);`, sebelum `downloadAndSaveVideo()`:

```typescript
await logAssetUsage({
  generationId,
  clipIndex: clip.index,
  service: 'veo',
  model: veoModel,
  creditCost: GOOGLE_FLOW_CREDIT_COSTS[veoModel] ?? 20,
  creditPriceUsd: GOOGLE_FLOW_CREDIT_PRICE_USD,
  costUsd: assetCostUsd(veoModel),
  createdAt: new Date(),
});
```

Import tambahan di atas file:
```typescript
import { logAssetUsage } from '../app/lib/monitoring/assetUsage';
import { GOOGLE_FLOW_CREDIT_COSTS, GOOGLE_FLOW_CREDIT_PRICE_USD, assetCostUsd } from '../app/lib/monitoring/creditCosts';
```

### `app/api/studio/generate-image/route.ts`

Setelah `generateImage()` berhasil, tambah:

```typescript
await logAssetUsage({
  generationId: (body as Record<string, unknown>).generationId as string ?? 'preview',
  clipIndex: (body as Record<string, unknown>).clipIndex as number ?? -1,
  service: 'imagen',
  model: 'imagen-4',
  creditCost: GOOGLE_FLOW_CREDIT_COSTS['imagen-4'],
  creditPriceUsd: GOOGLE_FLOW_CREDIT_PRICE_USD,
  costUsd: assetCostUsd('imagen-4'),
  createdAt: new Date(),
});
```

---

## 7. UI Layout

### TopBar

Order: `Studio · Scripts · Aset · Riwayat · Monitoring`. Icon `Activity` dari lucide-react. Active: `pathname === '/monitoring'`.

### `/monitoring` page structure

```
┌─ TopBar ──────────────────────────────────────────────────────┐
│ ✨ IdeaMills    Studio  Scripts  Aset  Riwayat  Monitoring     │
└───────────────────────────────────────────────────────────────┘

Service Monitoring                        [⟳ Refresh sekarang]
Last updated: 30s ago · auto-refresh tiap 60 detik

[ Status ]  [ History ]    ← tab navigation (border-b active indicator)

── Tab Status ──────────────────────────────────────────────────
🟢  OpenRouter     $4.21 USD         $5.79 used        234ms
🟡  Google Flow    142 credits       Tier 2             412ms
🟢  CapSolver      $7.30 USD         connected via…    189ms
🟢  useapi.net     API healthy       548 reqs · 98.2%  321ms

── Tab History ─────────────────────────────────────────────────
Hari ini: Rp 45.200    7 hari: Rp 312.000    All-time: Rp 1.2jt
Kurs: 1 USD = Rp 16.450 (ECB · 30 Apr 2026)

30 Apr 14:22  Product A  6 clips  Rp 12.400  Rp 2.067/clip
30 Apr 11:05  Product B  4 clips  Rp  8.900  Rp 2.225/clip
29 Apr 18:30  Product C  6 clips  Rp 14.100  Rp 2.350/clip

Auto-refresh 30 detik
```

### Tab Status row anatomy

| Col | Content | Class hints |
|---|---|---|
| 1 | Status dot 16px (green/yellow/red) | `w-4 h-4 rounded-full bg-green-500\|bg-yellow-500\|bg-red-500` |
| 2 | Service label (semibold) + unit (xs muted) | `flex-1` |
| 3 | `display` value (font-mono, lg) | `text-lg font-mono` |
| 4 | `detail` + `latencyMs` (xs muted, right-aligned) | `text-right text-xs text-muted-foreground` |

Error row: dot red, value = `—`, detail = error message in `text-red-600`.

### Tab History row anatomy

Flat rows `border-b`, flex 5 kolom:

| Col | Content |
|---|---|
| 1 | `createdAt` format DD MMM HH:mm |
| 2 | `productIdentifier` (truncate if long) |
| 3 | `clipCount` clips |
| 4 | `totalCostIdr` (formatIdr) |
| 5 | `costPerClipIdr` (formatIdr)/clip, right-aligned muted |

```typescript
function formatIdr(amount: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency', currency: 'IDR',
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(amount);
}
```

### Loading & error states

- **Status first load:** 4 skeleton rows (gray dot + shimmer)
- **History first load:** 3 skeleton rows
- **Aggregator 500:** red banner `Gagal load monitoring: {error}`, polling continues
- **History 500:** red banner `Gagal load history: {error}`
- **History empty:** `"Belum ada generation. Jalankan generation pertama di Studio."`

### Polling per tab

- Tab Status: 60s polling ke `/api/admin/monitoring`
- Tab History: 30s polling ke `/api/admin/monitoring/history`
- Polling masing-masing **hanya aktif saat tab-nya visible** — `useEffect` di-mount/unmount saat switch tab. "Refresh sekarang" button shared, force-refresh tab yang aktif.

---

## 8. Testing Strategy

**Setup:** Vitest + minimal config di `vitest.config.ts`. Script `npm test` (vitest run) + `npm run test:watch`.

### `thresholds.test.ts`

Table-driven test `computeStatus(service, value)` untuk boundary values per service:
- Exact warning boundary → `'ok'` (strict less-than)
- Just below warning → `'warning'`
- Exact error boundary → `'warning'`
- Just below error → `'error'`
- `null` value → `'ok'`

### `aggregator.test.ts`

Mock 4 fetcher modules:
1. All succeed → 4 services, urutan tetap, `cachedAt: null`
2. One fetcher rejects → entry-nya `status='error'`, tiga lainnya `status='ok'`, tidak throw

### `exchange.test.ts`

Mock `fetch`:
1. Happy path → rate parsed, `updatedAt` dari `json.date`
2. Cache hit → fetch dipanggil hanya sekali dari dua calls
3. Fetch throws + cache exists → return cached value
4. Fetch throws + no cache → return `{ rate: 16500, updatedAt: 'fallback' }`

### `history.test.ts`

Mock MongoDB queries:
1. Empty DB → `rows=[]`, summary all zeros, `exchangeRate` present
2. One generation (2 llm_usage $0.50, 1 asset_usage $0.20, 3 clips):
   - `totalCostUsd = 0.70`
   - `totalCostIdr = 0.70 × 16500 = 11,550`
   - `costPerClipIdr = 3,850`
3. Generation `clipCount=0` → `costPerClipIdr=0` (no divide-by-zero)
4. Summary buckets: generations di tanggal berbeda → `todayIdr`, `sevenDaysIdr`, `allTimeIdr` benar

### Manual verification checklist

**Tab Status:**
- [ ] 4 env vars valid → 4 row dengan angka real
- [ ] Invalidate satu key → row tsb merah, 3 lainnya hijau
- [ ] "Refresh sekarang" → spinner, `?force=1` di network panel
- [ ] Tinggal 2 menit → auto-refresh terlihat di DevTools
- [ ] Hit endpoint 5× cepat → 2nd+ call `cachedAt != null`, selesai <50ms
- [ ] `?force=1` → `cachedAt: null` selalu

**Tab History:**
- [ ] Jalankan satu generation → `asset_usage` collection di MongoDB ada N entries
- [ ] Tab History → generation tersebut muncul dengan angka Rp
- [ ] Tunggu 30s → auto-refresh, data terbaru muncul tanpa reload
- [ ] Jalankan generation kedua → muncul di atas list
- [ ] Matikan wifi → kurs pakai cached value, tidak error
- [ ] Switch ke tab Status → polling `/history` berhenti (tidak ada request di DevTools)

**General:**
- [ ] Mobile 375px → layout readable, tidak horizontal scroll
- [ ] `npx tsc --noEmit` → PASS
- [ ] `npm run lint` → PASS
- [ ] `npm test` → semua test green

---

## 9. Out of Scope (deferred)

- Filter/search di History list by date range atau produk
- Chart/grafik trend pengeluaran harian
- Email/Telegram alert saat saldo kritis
- Export CSV
- Per-layer LLM cost breakdown di History
- CapSolver cost per generation (tidak ada API per-solve)
- Multi-tenant auth (single-user local tool)
- Push notification saat cost per clip melebihi threshold manual
