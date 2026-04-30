# Service Monitoring Page — Design Spec

**Date:** 2026-04-30
**Status:** Approved (brainstorming complete)
**Scope:** Halaman `/monitoring` + entry baru di TopBar untuk memantau saldo & kesehatan 4 external service yang dipakai pipeline IdeaMills.

---

## 1. Goal & Context

Pipeline IdeaMills bergantung pada empat external service berbayar. Saat salah satu kehabisan saldo / API down, generation gagal silently. Kita butuh panel monitoring sederhana agar admin bisa cek status & saldo sebelum jalanin batch besar.

**Service yang dimonitor:**

| Service | Yang ditampilkan | Sumber |
|---|---|---|
| OpenRouter | sisa USD credit | `GET https://openrouter.ai/api/v1/credits` |
| Google Flow | sisa AI credits + tier | `GET https://api.useapi.net/v1/google-flow/accounts/{email}` |
| CapSolver | sisa USD balance | `POST https://api.capsolver.com/getBalance` |
| useapi.net | request count + success rate hari ini (supporting health metric) | `GET https://api.useapi.net/v1/account/stats?bot=google-flow&date=YYYY-MM-DD` |

CapSolver dipakai *via useapi.net* — user langganan terpisah di capsolver.com lalu API key-nya di-connect ke useapi.net Google Flow account. Jadi saldo yang habis adalah saldo akun CapSolver milik user, bukan kredit useapi.

**Non-goals:**
- Tidak ada auth/RBAC (single-tenant local app).
- Tidak ada history/chart/trend.
- Tidak ada alerting/notification.
- Tidak ada per-service drill-down page.

---

## 2. Architecture

**Pendekatan:** single aggregator route (Opsi 1 dari brainstorming).

```
[browser /monitoring page]
        │ poll 60s + manual refresh button
        ▼
[GET /api/admin/monitoring?force=0|1]
        │ in-memory cache 30s
        ▼
[buildSnapshot() — Promise.allSettled, 5s timeout per service]
   ├─► fetchOpenRouterCredit()  → openrouter.ai/api/v1/credits
   ├─► fetchGoogleFlowCredit()  → useapi.net /google-flow/accounts/{email}
   ├─► fetchCapSolverBalance()  → capsolver.com /getBalance
   └─► fetchUseapiStats()       → useapi.net /account/stats
```

Satu fetcher yang fail tidak men-block tiga lainnya. Hasilnya selalu `MonitoringSnapshot` dengan 4 entries (urutan tetap: openrouter, google-flow, capsolver, useapi).

---

## 3. File Layout

**File baru:**

```
app/
  monitoring/
    page.tsx                          # Halaman /monitoring (client component)
  api/admin/monitoring/
    route.ts                          # GET aggregator endpoint
  lib/monitoring/
    types.ts                          # ServiceStatus, ServiceMetric, MonitoringSnapshot
    cache.ts                          # In-memory cache helper
    aggregator.ts                     # buildSnapshot() — calls 4 fetchers in parallel
    thresholds.ts                     # Hardcoded warning/error thresholds + status calc
    services/
      openrouter.ts                   # fetchOpenRouterCredit()
      googleFlow.ts                   # fetchGoogleFlowCredit()
      capsolver.ts                    # fetchCapSolverBalance()
      useapi.ts                       # fetchUseapiStats()
      __tests__/
        thresholds.test.ts
        aggregator.test.ts
```

**File yang dimodifikasi:**

- `app/components/TopBar.tsx` — tambah link "Monitoring" di paling ujung kanan setelah "Riwayat", icon `Activity` dari lucide-react.
- `.env.example` — tambah `CAPSOLVER_API_KEY=CAP-...`.
- `package.json` — tambah dev deps `vitest` + `@vitest/ui`, script `"test": "vitest run"`, `"test:watch": "vitest"`.

**Env vars yang dipakai:**

```
OPENROUTER_API_KEY        # already exists — used as Bearer for openrouter.ai
USEAPI_TOKEN              # already exists — Bearer for useapi.net (Google Flow + stats)
USEAPI_GOOGLE_EMAIL       # already exists — path param for /google-flow/accounts/{email}
CAPSOLVER_API_KEY         # NEW — clientKey untuk POST /getBalance ke capsolver.com
```

---

## 4. Data Contract

### `app/lib/monitoring/types.ts`

```typescript
export type ServiceName = 'openrouter' | 'google-flow' | 'capsolver' | 'useapi';
export type ServiceStatus = 'ok' | 'warning' | 'error';

export interface ServiceMetric {
  service: ServiceName;
  status: ServiceStatus;
  /** Primary value displayed; e.g. "$4.21", "1,250 credits", "API healthy". */
  display: string;
  /** Raw numeric for client-side use; null when not applicable (e.g. useapi healthy state). */
  value: number | null;
  unit: 'usd' | 'credits' | 'requests' | null;
  /** Sub-info shown muted under the main value; e.g. "$5.79 used", "Tier 2", "548 reqs · 98.2% ok". */
  detail: string | null;
  /** Set only when status === 'error'; human-readable reason. */
  error: string | null;
  /** ms latency this fetcher took to call its external API (for debug/tuning). */
  latencyMs: number;
}

export interface MonitoringSnapshot {
  /** ISO timestamp this snapshot was originally generated. */
  generatedAt: string;
  /** ISO timestamp if served from cache; null when fetched fresh. */
  cachedAt: string | null;
  /** Always 4 entries in stable order: openrouter, google-flow, capsolver, useapi. */
  services: ServiceMetric[];
}
```

### Aggregator response (HTTP)

`GET /api/admin/monitoring` returns `200 OK` with body matching `MonitoringSnapshot`. No 4xx/5xx for partial failures — individual service errors are encoded inside `services[i].status === 'error'`. Aggregator returns 500 only on internal exceptions (e.g. cache module crash).

### Service mapping rules

**OpenRouter** (`fetchOpenRouterCredit`):
- API: `GET https://openrouter.ai/api/v1/credits` with `Authorization: Bearer ${OPENROUTER_API_KEY}`.
- Response: `{ data: { total_credits: number, total_usage: number } }`.
- Compute: `remaining = total_credits - total_usage`.
- `display = "$" + remaining.toFixed(2)`, `value = remaining`, `unit = 'usd'`.
- `detail = "$" + total_usage.toFixed(2) + " used"`.

**Google Flow** (`fetchGoogleFlowCredit`):
- API: `GET https://api.useapi.net/v1/google-flow/accounts/${USEAPI_GOOGLE_EMAIL}` with `Authorization: Bearer ${USEAPI_TOKEN}`.
- Response: `{ health: 'OK' | string, credits?: { credits: number, userPaygateTier: string } }`.
- If `health !== 'OK'` → `status='error'`, `error='health: ' + health`.
- Else: `display = credits.credits.toLocaleString() + " credits"`, `value = credits.credits`, `unit = 'credits'`.
- `detail = humanizeTier(userPaygateTier)` — e.g. `'PAYGATE_TIER_TWO' → 'Tier 2'`, `'PAYGATE_TIER_ONE' → 'Tier 1'`. Unknown values pass through.

**CapSolver** (`fetchCapSolverBalance`):
- API: `POST https://api.capsolver.com/getBalance` with body `{ clientKey: CAPSOLVER_API_KEY }`. (No Authorization header — clientKey goes in body.)
- Response: `{ errorId: 0, balance: number }` on success, `{ errorId: number, errorDescription: string }` on error.
- If `errorId !== 0` → `status='error'`, `error=errorDescription`.
- Else: `display = "$" + balance.toFixed(2)`, `value = balance`, `unit = 'usd'`, `detail = 'connected via useapi'`.

**useapi.net** (`fetchUseapiStats`):
- API: `GET https://api.useapi.net/v1/account/stats?bot=google-flow&date=${todayUtcDate}` with `Authorization: Bearer ${USEAPI_TOKEN}`.
- Response includes `summary.success_rate` (string like `"98.2%"`) and `total` (number of requests today). `summary` may be omitted if no requests today.
- If no `summary` → `display='API healthy'`, `value=null`, `unit=null`, `detail='no requests today'`, `status='ok'`.
- Else: parse `success_rate` as float (strip `%`); if parse fails, treat as `null`. `display = 'API healthy'`, `value = parsedRate ?? null`, `unit = null`, `detail = total + ' reqs · ' + success_rate + ' ok'`.
- Status: if `value !== null && value < 80` → `'warning'`; else `'ok'` (no `error` from threshold — `error` only set on fetch/auth failure).

### Threshold rules — `app/lib/monitoring/thresholds.ts`

```typescript
const THRESHOLDS = {
  openrouter:  { warningBelow: 5,    errorBelow: 1    },  // USD
  'google-flow': { warningBelow: 100,  errorBelow: 20   },  // credits
  capsolver:   { warningBelow: 3,    errorBelow: 0.5  },  // USD
  useapi:      { warningBelow: 80,   errorBelow: null },  // success_rate %; error only on fetch fail
};

// Boundary semantics: strict less-than. value === warningBelow → 'ok'. value === errorBelow → 'warning'.
```

API/auth/timeout failures override threshold logic and force `status='error'` regardless of `value`.

---

## 5. Caching & Polling

### Server-side cache — `app/lib/monitoring/cache.ts`

Module-level in-memory cache, TTL 30s. Single-process Node assumption (Next.js dev/prod). Worker process tidak share cache ini — tidak relevan karena monitoring hanya di-call dari Next.js.

```typescript
let cached: { snapshot: MonitoringSnapshot; expiresAt: number } | null = null;
const TTL_MS = 30_000;

export async function getCachedSnapshot(force: boolean): Promise<MonitoringSnapshot> {
  if (!force && cached && Date.now() < cached.expiresAt) {
    return { ...cached.snapshot, cachedAt: cached.snapshot.generatedAt };
  }
  const snapshot = await buildSnapshot();
  cached = { snapshot, expiresAt: Date.now() + TTL_MS };
  return snapshot; // cachedAt already null from buildSnapshot
}
```

`buildSnapshot()` returns a snapshot with `cachedAt: null` and `generatedAt: new Date().toISOString()`.

### Aggregator route

```typescript
// app/api/admin/monitoring/route.ts
export async function GET(req: Request) {
  const force = new URL(req.url).searchParams.get('force') === '1';
  try {
    const snapshot = await getCachedSnapshot(force);
    return NextResponse.json(snapshot);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 },
    );
  }
}
```

### Per-fetcher timeout

Each fetcher uses `AbortController` with 5s timeout. On `AbortError` → `status='error'`, `error='timeout 5s'`. `latencyMs` recorded with `performance.now()` deltas.

### Frontend polling

```typescript
// app/monitoring/page.tsx (client component)
const POLL_MS = 60_000;

useEffect(() => {
  let cancelled = false;
  async function tick(force = false) {
    const res = await fetch(`/api/admin/monitoring${force ? '?force=1' : ''}`);
    const data = await res.json();
    if (!cancelled) setSnapshot(data);
  }
  tick();
  const id = setInterval(() => tick(), POLL_MS);
  return () => { cancelled = true; clearInterval(id); };
}, []);
```

"Refresh sekarang" button calls `tick(true)`. Button disabled + spinner while in-flight (track via local `isRefreshing` state).

---

## 6. UI Layout

**TopBar change** — `app/components/TopBar.tsx`:

Order becomes: `Studio · Scripts · Aset · Riwayat · Monitoring`. New entry uses `Activity` icon from lucide-react. Active state matches `pathname === '/monitoring'`.

**Page** — `app/monitoring/page.tsx`:

Container `mx-auto px-4 max-w-4xl` matching other pages. Header row: title "Service Monitoring" left, refresh button right. Sub-line shows relative time ("30s ago") + "auto-refresh tiap 60 detik".

Below header, a flat list of 4 rows separated by horizontal dividers (`border-b`). Each row is a flex layout with 4 columns:

| Col | Content | Class hints |
|---|---|---|
| 1 | Status dot (16px circle: green/yellow/red) | `w-4 h-4 rounded-full` |
| 2 | Service name (semibold) + unit subtitle (xs muted) | `flex-1` |
| 3 | `display` value (font-mono, lg) | `text-lg font-mono` |
| 4 | `detail` line + `latencyMs` (xs muted, right-aligned) | `text-right text-xs text-muted-foreground` |

**Service display labels:**
- `openrouter` → "OpenRouter"
- `google-flow` → "Google Flow"
- `capsolver` → "CapSolver"
- `useapi` → "useapi.net"

**Error row:** dot red, value column shows `—`, detail column shows error message in red text.

**Loading state:** before first response, render 4 skeleton rows (gray dot + shimmer text).

**Aggregator-level error:** if `/api/admin/monitoring` itself returns 500, show a red banner above the list: `Gagal load monitoring: {error}`. Polling continues — next tick may recover.

**Mobile:** row stays single-line on ≥375px width by truncating detail column. No card breakpoint.

**No auth gate** — single-tenant app, `/monitoring` and `/api/admin/monitoring` are open. Future basic-auth would be added at middleware level.

---

## 7. Testing Strategy

**Tooling setup:** add Vitest + minimal config. Two test files only — coverage is intentionally narrow, not comprehensive.

### `thresholds.test.ts`

Table-driven test asserting `computeStatus(service, value)` produces the right `ServiceStatus` for boundary values. Cases per service:

- exact warning boundary (e.g. OpenRouter `$5.00`) → `'ok'`
- just below warning (`$4.99`) → `'warning'`
- exact error boundary (`$1.00`) → `'warning'`
- just below error (`$0.99`) → `'error'`
- well above warning → `'ok'`

Repeated for google-flow (100/20), capsolver (3/0.5). useapi covered separately because it doesn't have an `error` threshold.

### `aggregator.test.ts`

Mocks all 4 fetcher modules. Two scenarios:

1. **All succeed** — `buildSnapshot()` returns 4 services with correct order and `cachedAt: null`.
2. **One fetcher rejects** — e.g. `fetchCapSolverBalance` throws. Snapshot still returns 4 entries; CapSolver entry has `status='error'`, others unaffected. No exception bubbles up.

### Manual verification checklist

Before claiming done, the implementer must verify:

- [ ] All 4 env vars set with real keys → `/monitoring` shows real numbers for all 4 rows.
- [ ] Invalidate one key → that row goes red with auth error, others remain healthy.
- [ ] Click "Refresh sekarang" → spinner appears, button disables, fresh values returned.
- [ ] Leave tab open 2 minutes → at least one auto-refresh observed in network panel.
- [ ] Mobile width (DevTools 375px) → layout stays readable.
- [ ] Hit `/api/admin/monitoring` 5× rapidly → 2nd-5th calls return cached `cachedAt != null` and finish in <50ms.
- [ ] `/api/admin/monitoring?force=1` always returns `cachedAt: null` and re-fetches external APIs.
- [ ] Type-check passes: `npx tsc --noEmit`.
- [ ] Lint passes: `npm run lint`.

---

## 8. Out of Scope (deferred)

- History/trend chart of saldo over time → would need MongoDB collection `monitoring_snapshots` + cron writer.
- Email/Telegram alert when status hits `error` → needs notification infrastructure.
- Per-service drill-down page (e.g. show breakdown of OpenRouter usage by model) → nice-to-have, build later.
- Multi-tenant auth — currently a single-user local tool.
- CapSolver direct ↔ useapi.net configured-key-match check.

These can be layered on without touching the existing data contract.
