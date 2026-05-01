# Service Monitoring Complete Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bangun halaman `/monitoring` dengan dua tab — Tab Status (saldo 4 external service, polling 60s) dan Tab History (cost per generation dalam Rupiah, logging Veo/Imagen, kurs live) — beserta entry "Monitoring" di TopBar.

**Architecture:** Single aggregator route `/api/admin/monitoring` (in-memory cache 30s) untuk Tab Status; route `/api/admin/monitoring/history` (no cache) untuk Tab History. Asset usage (Veo/Imagen) di-log ke collection `asset_usage` dari worker dan generate-image route. Kurs USD→IDR dari frankfurter.app di-cache 24h.

**Tech Stack:** Next.js 15 App Router, React 18 client component, TypeScript strict, MongoDB (existing), Vitest, lucide-react, Tailwind, fetch API + AbortController.

**Spec:** `docs/superpowers/specs/2026-04-30-monitoring-topbar-design.md`

---

## File Structure

| Path | Action | Responsibility |
|---|---|---|
| `vitest.config.ts` | Create | Vitest config |
| `app/lib/monitoring/types.ts` | Create | Semua types: ServiceMetric, MonitoringSnapshot, AssetUsageEntry, GenerationCostRow, HistorySnapshot |
| `app/lib/monitoring/thresholds.ts` | Create | `computeStatus()` + threshold constants |
| `app/lib/monitoring/creditCosts.ts` | Create | Credit cost per model + `assetCostUsd()` |
| `app/lib/monitoring/assetUsage.ts` | Create | `logAssetUsage()` — insert ke `asset_usage` collection |
| `app/lib/monitoring/exchange.ts` | Create | `fetchUsdToIdr()` — frankfurter.app, cache 24h |
| `app/lib/monitoring/cache.ts` | Create | In-memory cache 30s untuk Status snapshot |
| `app/lib/monitoring/aggregator.ts` | Create | `buildSnapshot()` — 4 fetchers parallel |
| `app/lib/monitoring/history.ts` | Create | `buildHistorySnapshot()` — aggregate + join + kurs |
| `app/lib/monitoring/services/openrouter.ts` | Create | `fetchOpenRouterCredit()` |
| `app/lib/monitoring/services/googleFlow.ts` | Create | `fetchGoogleFlowCredit()` |
| `app/lib/monitoring/services/capsolver.ts` | Create | `fetchCapSolverBalance()` |
| `app/lib/monitoring/services/useapi.ts` | Create | `fetchUseapiStats()` |
| `app/lib/monitoring/services/__tests__/thresholds.test.ts` | Create | Unit tests threshold |
| `app/lib/monitoring/services/__tests__/aggregator.test.ts` | Create | Unit tests aggregator partial failure |
| `app/lib/monitoring/services/__tests__/exchange.test.ts` | Create | Unit tests exchange rate |
| `app/lib/monitoring/services/__tests__/history.test.ts` | Create | Unit tests history aggregation |
| `app/api/admin/monitoring/route.ts` | Create | GET Status aggregator |
| `app/api/admin/monitoring/history/route.ts` | Create | GET History |
| `app/monitoring/page.tsx` | Create | Client page: 2 tab, polling, UI |
| `app/components/TopBar.tsx` | Modify | Tambah link Monitoring di paling kanan |
| `worker/runGeneration.ts` | Modify | Tambah `logAssetUsage()` setelah `waitForVideo()` |
| `app/api/studio/generate-image/route.ts` | Modify | Tambah `logAssetUsage()` setelah `generateImage()` |
| `.env.example` | Modify | Tambah `CAPSOLVER_API_KEY` |
| `package.json` | Modify | Tambah vitest + scripts |

---

## Task 1: Setup Vitest + Env Var

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`
- Modify: `.env.example`

- [ ] **Step 1: Install Vitest**

```bash
npm install -D vitest@^2.1.0
```

Expected: `"vitest": "^2.1.0"` masuk ke devDependencies.

- [ ] **Step 2: Tambah scripts di package.json**

Buka `package.json`, tambah setelah `"lint": "next lint",`:

```json
    "test": "vitest run",
    "test:watch": "vitest",
```

- [ ] **Step 3: Buat vitest.config.ts**

```typescript
import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['app/**/__tests__/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
});
```

- [ ] **Step 4: Verify Vitest jalan**

Run: `npm test`
Expected: exit 0, "No test files found" atau sejenisnya.

- [ ] **Step 5: Tambah CAPSOLVER_API_KEY ke .env.example**

Append setelah blok useapi.net (setelah `USEAPI_GOOGLE_EMAIL=...`):

```
# CapSolver — balance untuk Google Flow CAPTCHA automation
# Dapatkan di: https://dashboard.capsolver.com
CAPSOLVER_API_KEY=CAP-...
```

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json vitest.config.ts .env.example
git commit -m "chore(monitoring): setup vitest + CAPSOLVER_API_KEY env var"
```

---

## Task 2: Types

**Files:**
- Create: `app/lib/monitoring/types.ts`

- [ ] **Step 1: Buat types.ts**

```typescript
export type ServiceName = 'openrouter' | 'google-flow' | 'capsolver' | 'useapi';
export type ServiceStatus = 'ok' | 'warning' | 'error';
export type ServiceUnit = 'usd' | 'credits' | 'requests' | null;

export interface ServiceMetric {
  service: ServiceName;
  status: ServiceStatus;
  display: string;
  value: number | null;
  unit: ServiceUnit;
  detail: string | null;
  error: string | null;
  latencyMs: number;
}

export interface MonitoringSnapshot {
  generatedAt: string;
  cachedAt: string | null;
  services: ServiceMetric[];
}

export const SERVICE_ORDER: ServiceName[] = ['openrouter', 'google-flow', 'capsolver', 'useapi'];

export const SERVICE_LABELS: Record<ServiceName, string> = {
  'openrouter':  'OpenRouter',
  'google-flow': 'Google Flow',
  'capsolver':   'CapSolver',
  'useapi':      'useapi.net',
};

export interface AssetUsageEntry {
  generationId: string;
  clipIndex: number;
  service: 'veo' | 'imagen';
  model: string;
  creditCost: number;
  creditPriceUsd: number;
  costUsd: number;
  createdAt: Date;
}

export interface GenerationCostRow {
  generationId: string;
  productIdentifier: string;
  createdAt: string;
  clipCount: number;
  llmCostUsd: number;
  assetCostUsd: number;
  totalCostUsd: number;
  totalCostIdr: number;
  costPerClipIdr: number;
}

export interface HistorySnapshot {
  rows: GenerationCostRow[];
  summary: {
    todayIdr: number;
    sevenDaysIdr: number;
    allTimeIdr: number;
  };
  exchangeRate: {
    usdToIdr: number;
    source: 'frankfurter.app';
    updatedAt: string;
  };
  generatedAt: string;
}
```

- [ ] **Step 2: Verify type-check**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add app/lib/monitoring/types.ts
git commit -m "feat(monitoring): add all monitoring types"
```

---

## Task 3: Thresholds (TDD)

**Files:**
- Create: `app/lib/monitoring/thresholds.ts`
- Create: `app/lib/monitoring/services/__tests__/thresholds.test.ts`

- [ ] **Step 1: Tulis test dulu**

Buat `app/lib/monitoring/services/__tests__/thresholds.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { computeStatus } from '../../thresholds';

describe('computeStatus', () => {
  describe('openrouter (warn<5, err<1 USD)', () => {
    it('ok at exact warning boundary 5.00', () => expect(computeStatus('openrouter', 5)).toBe('ok'));
    it('warning at 4.99', () => expect(computeStatus('openrouter', 4.99)).toBe('warning'));
    it('warning at exact error boundary 1.00', () => expect(computeStatus('openrouter', 1)).toBe('warning'));
    it('error at 0.99', () => expect(computeStatus('openrouter', 0.99)).toBe('error'));
    it('ok at 20', () => expect(computeStatus('openrouter', 20)).toBe('ok'));
  });

  describe('google-flow (warn<100, err<20 credits)', () => {
    it('ok at 100', () => expect(computeStatus('google-flow', 100)).toBe('ok'));
    it('warning at 99', () => expect(computeStatus('google-flow', 99)).toBe('warning'));
    it('warning at 20', () => expect(computeStatus('google-flow', 20)).toBe('warning'));
    it('error at 19', () => expect(computeStatus('google-flow', 19)).toBe('error'));
  });

  describe('capsolver (warn<3, err<0.5 USD)', () => {
    it('ok at 3', () => expect(computeStatus('capsolver', 3)).toBe('ok'));
    it('warning at 2.99', () => expect(computeStatus('capsolver', 2.99)).toBe('warning'));
    it('warning at 0.5', () => expect(computeStatus('capsolver', 0.5)).toBe('warning'));
    it('error at 0.49', () => expect(computeStatus('capsolver', 0.49)).toBe('error'));
  });

  describe('useapi (warn<80%, no error threshold)', () => {
    it('ok at 80', () => expect(computeStatus('useapi', 80)).toBe('ok'));
    it('warning at 79.9', () => expect(computeStatus('useapi', 79.9)).toBe('warning'));
    it('ok when null', () => expect(computeStatus('useapi', null)).toBe('ok'));
  });

  it('null value → ok for any service', () => {
    expect(computeStatus('openrouter', null)).toBe('ok');
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `npm test`
Expected: FAIL — module not found.

- [ ] **Step 3: Implementasi thresholds.ts**

Buat `app/lib/monitoring/thresholds.ts`:

```typescript
import type { ServiceName, ServiceStatus } from './types';

interface Threshold {
  warningBelow: number;
  errorBelow: number | null;
}

const THRESHOLDS: Record<ServiceName, Threshold> = {
  'openrouter':  { warningBelow: 5,   errorBelow: 1    },
  'google-flow': { warningBelow: 100, errorBelow: 20   },
  'capsolver':   { warningBelow: 3,   errorBelow: 0.5  },
  'useapi':      { warningBelow: 80,  errorBelow: null },
};

export function computeStatus(service: ServiceName, value: number | null): ServiceStatus {
  if (value === null) return 'ok';
  const t = THRESHOLDS[service];
  if (t.errorBelow !== null && value < t.errorBelow) return 'error';
  if (value < t.warningBelow) return 'warning';
  return 'ok';
}
```

- [ ] **Step 4: Run — expect PASS**

Run: `npm test`
Expected: PASS, semua 17 test green.

- [ ] **Step 5: Commit**

```bash
git add app/lib/monitoring/thresholds.ts app/lib/monitoring/services/__tests__/thresholds.test.ts
git commit -m "feat(monitoring): threshold logic with TDD"
```

---

## Task 4: Credit Costs + Asset Usage Logger

**Files:**
- Create: `app/lib/monitoring/creditCosts.ts`
- Create: `app/lib/monitoring/assetUsage.ts`

- [ ] **Step 1: Buat creditCosts.ts**

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

- [ ] **Step 2: Buat assetUsage.ts**

```typescript
import { getDb } from '@/app/lib/mongoClient';
import type { AssetUsageEntry } from './types';

export async function logAssetUsage(entry: AssetUsageEntry): Promise<void> {
  try {
    const db = await getDb();
    await db.collection('asset_usage').insertOne(entry);
  } catch (err) {
    console.warn('[asset] failed to log usage:', (err as Error).message);
  }
}
```

- [ ] **Step 3: Verify type-check**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add app/lib/monitoring/creditCosts.ts app/lib/monitoring/assetUsage.ts
git commit -m "feat(monitoring): credit costs constants + asset usage logger"
```

---

## Task 5: Exchange Rate

**Files:**
- Create: `app/lib/monitoring/exchange.ts`
- Create: `app/lib/monitoring/services/__tests__/exchange.test.ts`

- [ ] **Step 1: Tulis test dulu**

Buat `app/lib/monitoring/services/__tests__/exchange.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('fetchUsdToIdr', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => vi.unstubAllGlobals());

  it('returns rate from API on fresh fetch', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      json: async () => ({ rates: { IDR: 16450 }, date: '2026-04-30' }),
    });
    const { fetchUsdToIdr } = await import('../../exchange');
    const result = await fetchUsdToIdr();
    expect(result.rate).toBe(16450);
    expect(result.updatedAt).toBe('2026-04-30');
  });

  it('returns cached value without re-fetching within TTL', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      json: async () => ({ rates: { IDR: 16450 }, date: '2026-04-30' }),
    });
    const { fetchUsdToIdr } = await import('../../exchange');
    await fetchUsdToIdr();
    await fetchUsdToIdr();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('returns fallback 16500 when fetch throws and no cache', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('network error'));
    const { fetchUsdToIdr } = await import('../../exchange');
    const result = await fetchUsdToIdr();
    expect(result.rate).toBe(16500);
    expect(result.updatedAt).toBe('fallback');
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `npm test`
Expected: FAIL — module not found.

- [ ] **Step 3: Implementasi exchange.ts**

Buat `app/lib/monitoring/exchange.ts`:

```typescript
const CACHE_MS = 24 * 60 * 60 * 1000;
let cached: { rate: number; updatedAt: string; expiresAt: number } | null = null;

export async function fetchUsdToIdr(): Promise<{ rate: number; updatedAt: string }> {
  if (cached && Date.now() < cached.expiresAt) {
    return { rate: cached.rate, updatedAt: cached.updatedAt };
  }
  try {
    const res = await fetch('https://api.frankfurter.app/latest?from=USD&to=IDR');
    const json = await res.json() as { rates: { IDR: number }; date: string };
    const rate = json.rates.IDR;
    cached = { rate, updatedAt: json.date, expiresAt: Date.now() + CACHE_MS };
    return { rate, updatedAt: json.date };
  } catch {
    if (cached) return { rate: cached.rate, updatedAt: cached.updatedAt };
    return { rate: 16500, updatedAt: 'fallback' };
  }
}
```

- [ ] **Step 4: Run — expect PASS**

Run: `npm test`
Expected: PASS semua tests.

- [ ] **Step 5: Commit**

```bash
git add app/lib/monitoring/exchange.ts app/lib/monitoring/services/__tests__/exchange.test.ts
git commit -m "feat(monitoring): exchange rate fetcher with 24h cache"
```

---

## Task 6: Service Fetchers (Status)

**Files:**
- Create: `app/lib/monitoring/services/openrouter.ts`
- Create: `app/lib/monitoring/services/googleFlow.ts`
- Create: `app/lib/monitoring/services/capsolver.ts`
- Create: `app/lib/monitoring/services/useapi.ts`

- [ ] **Step 1: Buat openrouter.ts**

```typescript
import { computeStatus } from '../thresholds';
import type { ServiceMetric } from '../types';

const TIMEOUT_MS = 5_000;

export async function fetchOpenRouterCredit(): Promise<ServiceMetric> {
  const start = performance.now();
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) return err('OPENROUTER_API_KEY not set', start);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch('https://openrouter.ai/api/v1/credits', {
      headers: { Authorization: `Bearer ${key}` },
      signal: controller.signal,
    });
    if (!res.ok) return err(`HTTP ${res.status}`, start);
    const json = await res.json() as { data?: { total_credits?: number; total_usage?: number } };
    const total = json.data?.total_credits;
    const used = json.data?.total_usage;
    if (typeof total !== 'number' || typeof used !== 'number') return err('malformed response', start);
    const remaining = total - used;
    return {
      service: 'openrouter', status: computeStatus('openrouter', remaining),
      display: `$${remaining.toFixed(2)}`, value: remaining, unit: 'usd',
      detail: `$${used.toFixed(2)} used`, error: null,
      latencyMs: Math.round(performance.now() - start),
    };
  } catch (e) {
    const msg = e instanceof Error ? (e.name === 'AbortError' ? `timeout ${TIMEOUT_MS / 1000}s` : e.message) : 'unknown';
    return err(msg, start);
  } finally {
    clearTimeout(timer);
  }
}

function err(error: string, start: number): ServiceMetric {
  return { service: 'openrouter', status: 'error', display: '—', value: null, unit: 'usd', detail: null, error, latencyMs: Math.round(performance.now() - start) };
}
```

- [ ] **Step 2: Buat googleFlow.ts**

```typescript
import { computeStatus } from '../thresholds';
import type { ServiceMetric } from '../types';

const TIMEOUT_MS = 5_000;

export async function fetchGoogleFlowCredit(): Promise<ServiceMetric> {
  const start = performance.now();
  const token = process.env.USEAPI_TOKEN;
  const email = process.env.USEAPI_GOOGLE_EMAIL;
  if (!token) return err('USEAPI_TOKEN not set', start);
  if (!email) return err('USEAPI_GOOGLE_EMAIL not set', start);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(
      `https://api.useapi.net/v1/google-flow/accounts/${encodeURIComponent(email)}`,
      { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal }
    );
    if (!res.ok) return err(`HTTP ${res.status}`, start);
    const json = await res.json() as { health?: string; credits?: { credits?: number; userPaygateTier?: string } };
    if (json.health !== 'OK') return err(`health: ${json.health ?? 'unknown'}`, start);
    const credits = json.credits?.credits;
    if (typeof credits !== 'number') return err('credits missing', start);
    const tier = json.credits?.userPaygateTier;
    const detail = tier === 'PAYGATE_TIER_TWO' ? 'Tier 2' : tier === 'PAYGATE_TIER_ONE' ? 'Tier 1' : (tier ?? null);
    return {
      service: 'google-flow', status: computeStatus('google-flow', credits),
      display: `${credits.toLocaleString()} credits`, value: credits, unit: 'credits',
      detail, error: null, latencyMs: Math.round(performance.now() - start),
    };
  } catch (e) {
    const msg = e instanceof Error ? (e.name === 'AbortError' ? `timeout ${TIMEOUT_MS / 1000}s` : e.message) : 'unknown';
    return err(msg, start);
  } finally {
    clearTimeout(timer);
  }
}

function err(error: string, start: number): ServiceMetric {
  return { service: 'google-flow', status: 'error', display: '—', value: null, unit: 'credits', detail: null, error, latencyMs: Math.round(performance.now() - start) };
}
```

- [ ] **Step 3: Buat capsolver.ts**

```typescript
import { computeStatus } from '../thresholds';
import type { ServiceMetric } from '../types';

const TIMEOUT_MS = 5_000;

export async function fetchCapSolverBalance(): Promise<ServiceMetric> {
  const start = performance.now();
  const key = process.env.CAPSOLVER_API_KEY;
  if (!key) return err('CAPSOLVER_API_KEY not set', start);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch('https://api.capsolver.com/getBalance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientKey: key }),
      signal: controller.signal,
    });
    if (!res.ok) return err(`HTTP ${res.status}`, start);
    const json = await res.json() as { errorId: number; balance?: number; errorDescription?: string };
    if (json.errorId !== 0) return err(json.errorDescription ?? `errorId ${json.errorId}`, start);
    if (typeof json.balance !== 'number') return err('balance missing', start);
    return {
      service: 'capsolver', status: computeStatus('capsolver', json.balance),
      display: `$${json.balance.toFixed(2)}`, value: json.balance, unit: 'usd',
      detail: 'connected via useapi', error: null,
      latencyMs: Math.round(performance.now() - start),
    };
  } catch (e) {
    const msg = e instanceof Error ? (e.name === 'AbortError' ? `timeout ${TIMEOUT_MS / 1000}s` : e.message) : 'unknown';
    return err(msg, start);
  } finally {
    clearTimeout(timer);
  }
}

function err(error: string, start: number): ServiceMetric {
  return { service: 'capsolver', status: 'error', display: '—', value: null, unit: 'usd', detail: null, error, latencyMs: Math.round(performance.now() - start) };
}
```

- [ ] **Step 4: Buat useapi.ts**

```typescript
import { computeStatus } from '../thresholds';
import type { ServiceMetric } from '../types';

const TIMEOUT_MS = 5_000;

export async function fetchUseapiStats(): Promise<ServiceMetric> {
  const start = performance.now();
  const token = process.env.USEAPI_TOKEN;
  if (!token) return err('USEAPI_TOKEN not set', start);

  const today = new Date().toISOString().slice(0, 10);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(
      `https://api.useapi.net/v1/account/stats?bot=google-flow&date=${today}`,
      { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal }
    );
    if (!res.ok) return err(`HTTP ${res.status}`, start);
    const json = await res.json() as { total?: number; summary?: { success_rate?: string } };
    const total = json.total ?? 0;
    if (!json.summary || total === 0) {
      return { service: 'useapi', status: 'ok', display: 'API healthy', value: null, unit: null, detail: 'no requests today', error: null, latencyMs: Math.round(performance.now() - start) };
    }
    const rateStr = json.summary.success_rate ?? '';
    const rate = Number.isFinite(parseFloat(rateStr)) ? parseFloat(rateStr.replace('%', '')) : null;
    return {
      service: 'useapi', status: computeStatus('useapi', rate),
      display: 'API healthy', value: rate, unit: null,
      detail: `${total} reqs · ${rateStr || 'n/a'} ok`, error: null,
      latencyMs: Math.round(performance.now() - start),
    };
  } catch (e) {
    const msg = e instanceof Error ? (e.name === 'AbortError' ? `timeout ${TIMEOUT_MS / 1000}s` : e.message) : 'unknown';
    return err(msg, start);
  } finally {
    clearTimeout(timer);
  }
}

function err(error: string, start: number): ServiceMetric {
  return { service: 'useapi', status: 'error', display: '—', value: null, unit: null, detail: null, error, latencyMs: Math.round(performance.now() - start) };
}
```

- [ ] **Step 5: Verify type-check**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add app/lib/monitoring/services/
git commit -m "feat(monitoring): 4 service fetchers (openrouter, google-flow, capsolver, useapi)"
```

---

## Task 7: Aggregator (TDD)

**Files:**
- Create: `app/lib/monitoring/aggregator.ts`
- Create: `app/lib/monitoring/cache.ts`
- Create: `app/lib/monitoring/services/__tests__/aggregator.test.ts`

- [ ] **Step 1: Tulis test dulu**

Buat `app/lib/monitoring/services/__tests__/aggregator.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ServiceMetric } from '../../types';

const ok = (service: ServiceMetric['service']): ServiceMetric => ({
  service, status: 'ok', display: 'fake', value: 10, unit: 'usd', detail: null, error: null, latencyMs: 5,
});

vi.mock('../openrouter', () => ({ fetchOpenRouterCredit: vi.fn() }));
vi.mock('../googleFlow',  () => ({ fetchGoogleFlowCredit: vi.fn() }));
vi.mock('../capsolver',   () => ({ fetchCapSolverBalance: vi.fn() }));
vi.mock('../useapi',      () => ({ fetchUseapiStats: vi.fn() }));

describe('buildSnapshot', () => {
  beforeEach(() => vi.resetAllMocks());

  it('returns 4 services in stable order on full success', async () => {
    const { fetchOpenRouterCredit } = await import('../openrouter');
    const { fetchGoogleFlowCredit } = await import('../googleFlow');
    const { fetchCapSolverBalance } = await import('../capsolver');
    const { fetchUseapiStats }      = await import('../useapi');
    (fetchOpenRouterCredit as ReturnType<typeof vi.fn>).mockResolvedValue(ok('openrouter'));
    (fetchGoogleFlowCredit as ReturnType<typeof vi.fn>).mockResolvedValue(ok('google-flow'));
    (fetchCapSolverBalance as ReturnType<typeof vi.fn>).mockResolvedValue(ok('capsolver'));
    (fetchUseapiStats      as ReturnType<typeof vi.fn>).mockResolvedValue(ok('useapi'));

    const { buildSnapshot } = await import('../../aggregator');
    const snap = await buildSnapshot();
    expect(snap.services.map((s) => s.service)).toEqual(['openrouter', 'google-flow', 'capsolver', 'useapi']);
    expect(snap.cachedAt).toBeNull();
  });

  it('one fetcher rejects → error entry, others ok', async () => {
    const { fetchOpenRouterCredit } = await import('../openrouter');
    const { fetchGoogleFlowCredit } = await import('../googleFlow');
    const { fetchCapSolverBalance } = await import('../capsolver');
    const { fetchUseapiStats }      = await import('../useapi');
    (fetchOpenRouterCredit as ReturnType<typeof vi.fn>).mockResolvedValue(ok('openrouter'));
    (fetchGoogleFlowCredit as ReturnType<typeof vi.fn>).mockResolvedValue(ok('google-flow'));
    (fetchCapSolverBalance as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('boom'));
    (fetchUseapiStats      as ReturnType<typeof vi.fn>).mockResolvedValue(ok('useapi'));

    const { buildSnapshot } = await import('../../aggregator');
    const snap = await buildSnapshot();
    const cs = snap.services.find((s) => s.service === 'capsolver');
    expect(cs?.status).toBe('error');
    expect(cs?.error).toBe('boom');
    expect(snap.services.filter((s) => s.service !== 'capsolver').every((s) => s.status === 'ok')).toBe(true);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `npm test`
Expected: FAIL — module not found.

- [ ] **Step 3: Buat aggregator.ts**

```typescript
import { fetchOpenRouterCredit } from './services/openrouter';
import { fetchGoogleFlowCredit } from './services/googleFlow';
import { fetchCapSolverBalance } from './services/capsolver';
import { fetchUseapiStats }      from './services/useapi';
import type { MonitoringSnapshot, ServiceMetric, ServiceName } from './types';

const FETCHERS: Array<{ service: ServiceName; fn: () => Promise<ServiceMetric> }> = [
  { service: 'openrouter',  fn: fetchOpenRouterCredit },
  { service: 'google-flow', fn: fetchGoogleFlowCredit },
  { service: 'capsolver',   fn: fetchCapSolverBalance },
  { service: 'useapi',      fn: fetchUseapiStats },
];

export async function buildSnapshot(): Promise<MonitoringSnapshot> {
  const results = await Promise.allSettled(FETCHERS.map((f) => f.fn()));
  const services: ServiceMetric[] = results.map((r, i) => {
    if (r.status === 'fulfilled') return r.value;
    const msg = r.reason instanceof Error ? r.reason.message : 'unknown error';
    return { service: FETCHERS[i].service, status: 'error', display: '—', value: null, unit: null, detail: null, error: msg, latencyMs: 0 };
  });
  return { generatedAt: new Date().toISOString(), cachedAt: null, services };
}
```

- [ ] **Step 4: Buat cache.ts**

```typescript
import { buildSnapshot } from './aggregator';
import type { MonitoringSnapshot } from './types';

const TTL_MS = 30_000;
let cached: { snapshot: MonitoringSnapshot; expiresAt: number } | null = null;

export async function getCachedSnapshot(force: boolean): Promise<MonitoringSnapshot> {
  if (!force && cached && Date.now() < cached.expiresAt) {
    return { ...cached.snapshot, cachedAt: cached.snapshot.generatedAt };
  }
  const snapshot = await buildSnapshot();
  cached = { snapshot, expiresAt: Date.now() + TTL_MS };
  return snapshot;
}
```

- [ ] **Step 5: Run — expect PASS**

Run: `npm test`
Expected: PASS semua tests.

- [ ] **Step 6: Commit**

```bash
git add app/lib/monitoring/aggregator.ts app/lib/monitoring/cache.ts app/lib/monitoring/services/__tests__/aggregator.test.ts
git commit -m "feat(monitoring): aggregator + in-memory cache with TDD"
```

---

## Task 8: History Aggregation (TDD)

**Files:**
- Create: `app/lib/monitoring/history.ts`
- Create: `app/lib/monitoring/services/__tests__/history.test.ts`

- [ ] **Step 1: Tulis test dulu**

Buat `app/lib/monitoring/services/__tests__/history.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/app/lib/mongoClient', () => ({
  getDb: vi.fn(),
}));
vi.mock('../../exchange', () => ({
  fetchUsdToIdr: vi.fn().mockResolvedValue({ rate: 16500, updatedAt: '2026-04-30' }),
}));

const mockDb = (gens: unknown[], llm: unknown[], assets: unknown[]) => {
  const collection = vi.fn().mockImplementation((name: string) => {
    if (name === 'Generations') return { find: () => ({ toArray: async () => gens }) };
    if (name === 'llm_usage')   return { find: () => ({ toArray: async () => llm }) };
    if (name === 'asset_usage') return { find: () => ({ toArray: async () => assets }) };
  });
  return { collection };
};

describe('buildHistorySnapshot', () => {
  beforeEach(() => vi.resetAllMocks());

  it('empty DB → rows=[], summary zeros', async () => {
    const { getDb } = await import('@/app/lib/mongoClient');
    (getDb as ReturnType<typeof vi.fn>).mockResolvedValue(mockDb([], [], []));
    const { buildHistorySnapshot } = await import('../../history');
    const snap = await buildHistorySnapshot();
    expect(snap.rows).toHaveLength(0);
    expect(snap.summary.allTimeIdr).toBe(0);
    expect(snap.exchangeRate.usdToIdr).toBe(16500);
  });

  it('one generation: llm $0.50 + asset $0.20, 3 clips → correct IDR', async () => {
    const { getDb } = await import('@/app/lib/mongoClient');
    const genId = 'gen123';
    const now = new Date('2026-04-30T14:22:00Z');
    (getDb as ReturnType<typeof vi.fn>).mockResolvedValue(mockDb(
      [{ _id: genId, product_identifier: 'Product A', created_at: now, clips: [{}, {}, {}] }],
      [{ jobId: genId, costUsd: 0.30 }, { jobId: genId, costUsd: 0.20 }],
      [{ generationId: genId, costUsd: 0.20 }],
    ));
    const { buildHistorySnapshot } = await import('../../history');
    const snap = await buildHistorySnapshot();
    expect(snap.rows).toHaveLength(1);
    const row = snap.rows[0];
    expect(row.llmCostUsd).toBeCloseTo(0.50);
    expect(row.assetCostUsd).toBeCloseTo(0.20);
    expect(row.totalCostUsd).toBeCloseTo(0.70);
    expect(row.totalCostIdr).toBeCloseTo(0.70 * 16500);
    expect(row.costPerClipIdr).toBeCloseTo((0.70 * 16500) / 3);
  });

  it('clipCount=0 → costPerClipIdr=0 (no divide by zero)', async () => {
    const { getDb } = await import('@/app/lib/mongoClient');
    (getDb as ReturnType<typeof vi.fn>).mockResolvedValue(mockDb(
      [{ _id: 'g1', product_identifier: 'P', created_at: new Date(), clips: [] }],
      [], [],
    ));
    const { buildHistorySnapshot } = await import('../../history');
    const snap = await buildHistorySnapshot();
    expect(snap.rows[0].costPerClipIdr).toBe(0);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `npm test`
Expected: FAIL — module not found.

- [ ] **Step 3: Buat history.ts**

```typescript
import { getDb } from '@/app/lib/mongoClient';
import { fetchUsdToIdr } from './exchange';
import type { GenerationCostRow, HistorySnapshot } from './types';

export async function buildHistorySnapshot(): Promise<HistorySnapshot> {
  const [db, { rate, updatedAt }] = await Promise.all([getDb(), fetchUsdToIdr()]);

  const [gens, llmDocs, assetDocs] = await Promise.all([
    db.collection('Generations').find({}).toArray(),
    db.collection('llm_usage').find({}).toArray(),
    db.collection('asset_usage').find({}).toArray(),
  ]);

  // Build lookup maps
  const llmByGen = new Map<string, number>();
  for (const doc of llmDocs) {
    const id = String(doc.jobId ?? '');
    llmByGen.set(id, (llmByGen.get(id) ?? 0) + (doc.costUsd ?? 0));
  }
  const assetByGen = new Map<string, number>();
  for (const doc of assetDocs) {
    const id = String(doc.generationId ?? '');
    assetByGen.set(id, (assetByGen.get(id) ?? 0) + (doc.costUsd ?? 0));
  }

  const now = Date.now();
  const DAY_MS = 86_400_000;

  const rows: GenerationCostRow[] = gens.map((g) => {
    const id = String(g._id);
    const llm = llmByGen.get(id) ?? 0;
    const asset = assetByGen.get(id) ?? 0;
    const total = llm + asset;
    const totalIdr = total * rate;
    const clipCount = Array.isArray(g.clips) ? g.clips.length : 0;
    return {
      generationId: id,
      productIdentifier: String(g.product_identifier ?? ''),
      createdAt: new Date(g.created_at).toISOString(),
      clipCount,
      llmCostUsd: llm,
      assetCostUsd: asset,
      totalCostUsd: total,
      totalCostIdr: totalIdr,
      costPerClipIdr: clipCount > 0 ? totalIdr / clipCount : 0,
    };
  }).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const todayIdr = rows.filter((r) => now - new Date(r.createdAt).getTime() < DAY_MS).reduce((s, r) => s + r.totalCostIdr, 0);
  const sevenDaysIdr = rows.filter((r) => now - new Date(r.createdAt).getTime() < 7 * DAY_MS).reduce((s, r) => s + r.totalCostIdr, 0);
  const allTimeIdr = rows.reduce((s, r) => s + r.totalCostIdr, 0);

  return {
    rows,
    summary: { todayIdr, sevenDaysIdr, allTimeIdr },
    exchangeRate: { usdToIdr: rate, source: 'frankfurter.app', updatedAt },
    generatedAt: new Date().toISOString(),
  };
}
```

- [ ] **Step 4: Run — expect PASS**

Run: `npm test`
Expected: PASS semua tests.

- [ ] **Step 5: Commit**

```bash
git add app/lib/monitoring/history.ts app/lib/monitoring/services/__tests__/history.test.ts
git commit -m "feat(monitoring): history aggregation with TDD"
```

---

## Task 9: API Routes

**Files:**
- Create: `app/api/admin/monitoring/route.ts`
- Create: `app/api/admin/monitoring/history/route.ts`

- [ ] **Step 1: Buat Status route**

```typescript
// app/api/admin/monitoring/route.ts
import { NextResponse } from 'next/server';
import { getCachedSnapshot } from '@/app/lib/monitoring/cache';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const force = new URL(req.url).searchParams.get('force') === '1';
  try {
    const snapshot = await getCachedSnapshot(force);
    return NextResponse.json(snapshot);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 });
  }
}
```

- [ ] **Step 2: Buat History route**

```typescript
// app/api/admin/monitoring/history/route.ts
import { NextResponse } from 'next/server';
import { buildHistorySnapshot } from '@/app/lib/monitoring/history';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const snapshot = await buildHistorySnapshot();
    return NextResponse.json(snapshot);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 });
  }
}
```

- [ ] **Step 3: Smoke test kedua route**

Run: `npm run dev` di terminal lain, lalu:

```bash
curl -s http://localhost:3000/api/admin/monitoring | jq '.services | length'
# Expected: 4

curl -s http://localhost:3000/api/admin/monitoring/history | jq '.summary'
# Expected: { todayIdr: ..., sevenDaysIdr: ..., allTimeIdr: ... }
```

Stop dev server.

- [ ] **Step 4: Commit**

```bash
git add app/api/admin/monitoring/
git commit -m "feat(monitoring): GET /api/admin/monitoring + /history routes"
```

---

## Task 10: Asset Logging di Worker + Generate-Image

**Files:**
- Modify: `worker/runGeneration.ts`
- Modify: `app/api/studio/generate-image/route.ts`

- [ ] **Step 1: Modifikasi worker/runGeneration.ts**

Tambah 2 import di baris paling atas file setelah import yang sudah ada:

```typescript
import { logAssetUsage } from '../app/lib/monitoring/assetUsage';
import { GOOGLE_FLOW_CREDIT_COSTS, GOOGLE_FLOW_CREDIT_PRICE_USD, assetCostUsd } from '../app/lib/monitoring/creditCosts';
```

Lalu di fungsi `generateClipAssets`, cari baris `const videoUrl = await waitForVideo(veoJobId);` (sekitar line 238). Tambah setelah baris tersebut, sebelum `downloadAndSaveVideo`:

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

- [ ] **Step 2: Modifikasi app/api/studio/generate-image/route.ts**

Tambah 2 import di atas file setelah import yang ada:

```typescript
import { logAssetUsage } from '@/app/lib/monitoring/assetUsage';
import { GOOGLE_FLOW_CREDIT_COSTS, GOOGLE_FLOW_CREDIT_PRICE_USD, assetCostUsd } from '@/app/lib/monitoring/creditCosts';
```

Cari baris `const imgRes = await generateImage({...})` (sekitar line 63). Tambah setelah call tersebut berhasil, sebelum `const fetched = await fetch(imgRes.imageUrl)`:

```typescript
    await logAssetUsage({
      generationId: (body as Record<string, unknown>)?.generationId as string ?? 'preview',
      clipIndex: typeof (body as Record<string, unknown>)?.clipIndex === 'number'
        ? (body as Record<string, unknown>).clipIndex as number
        : -1,
      service: 'imagen',
      model: parsed.data.model,
      creditCost: GOOGLE_FLOW_CREDIT_COSTS[parsed.data.model] ?? 10,
      creditPriceUsd: GOOGLE_FLOW_CREDIT_PRICE_USD,
      costUsd: assetCostUsd(parsed.data.model),
      createdAt: new Date(),
    });
```

Note: `body` sudah di-parse di baris 39 (`const body = await request.json()`). Tapi karena sudah di-parse dengan `RequestSchema.safeParse(body)`, kita pakai `parsed.data.model` untuk model value yang sudah tervalidasi.

- [ ] **Step 3: Verify type-check**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add worker/runGeneration.ts app/api/studio/generate-image/route.ts
git commit -m "feat(monitoring): log asset usage after Veo and Imagen generation"
```

---

## Task 11: TopBar Link

**Files:**
- Modify: `app/components/TopBar.tsx`

- [ ] **Step 1: Tambah Activity ke lucide-react import**

Di [app/components/TopBar.tsx](app/components/TopBar.tsx) line 5, ubah:

```typescript
import { Sparkles, History, Clapperboard, Images, FileText } from 'lucide-react';
```

Menjadi:

```typescript
import { Sparkles, History, Clapperboard, Images, FileText, Activity } from 'lucide-react';
```

- [ ] **Step 2: Tambah link Monitoring di paling kanan**

Setelah closing `</Link>` dari entry "Riwayat" (sekitar line 63), sebelum closing `</div>` dari link group, tambah:

```tsx
            <Link
              href="/monitoring"
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                pathname === '/monitoring'
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted'
              }`}
            >
              <Activity className="w-4 h-4" />
              Monitoring
            </Link>
```

- [ ] **Step 3: Verify type-check + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: PASS keduanya.

- [ ] **Step 4: Commit**

```bash
git add app/components/TopBar.tsx
git commit -m "feat(monitoring): add Monitoring link to TopBar (rightmost)"
```

---

## Task 12: Monitoring Page UI

**Files:**
- Create: `app/monitoring/page.tsx`

- [ ] **Step 1: Buat page.tsx**

```tsx
'use client';

import { useEffect, useState, useCallback } from 'react';
import { RefreshCw } from 'lucide-react';
import type { MonitoringSnapshot, ServiceMetric, ServiceStatus, HistorySnapshot, GenerationCostRow } from '@/app/lib/monitoring/types';
import { SERVICE_LABELS, SERVICE_ORDER } from '@/app/lib/monitoring/types';

export default function MonitoringPage() {
  const [tab, setTab] = useState<'status' | 'history'>('status');
  const [snapshot, setSnapshot] = useState<MonitoringSnapshot | null>(null);
  const [history, setHistory] = useState<HistorySnapshot | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchStatus = useCallback(async (force = false) => {
    setRefreshing(true);
    try {
      const res = await fetch(`/api/admin/monitoring${force ? '?force=1' : ''}`, { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) { setStatusError(data.error ?? `HTTP ${res.status}`); return; }
      setSnapshot(data as MonitoringSnapshot);
      setStatusError(null);
    } catch (e) {
      setStatusError(e instanceof Error ? e.message : 'unknown error');
    } finally {
      setRefreshing(false);
    }
  }, []);

  const fetchHistory = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await fetch('/api/admin/monitoring/history', { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) { setHistoryError(data.error ?? `HTTP ${res.status}`); return; }
      setHistory(data as HistorySnapshot);
      setHistoryError(null);
    } catch (e) {
      setHistoryError(e instanceof Error ? e.message : 'unknown error');
    } finally {
      setRefreshing(false);
    }
  }, []);

  // Tab Status: poll 60s
  useEffect(() => {
    if (tab !== 'status') return;
    let cancelled = false;
    const tick = () => { if (!cancelled) fetchStatus(); };
    tick();
    const id = setInterval(tick, 60_000);
    return () => { cancelled = true; clearInterval(id); };
  }, [tab, fetchStatus]);

  // Tab History: poll 30s
  useEffect(() => {
    if (tab !== 'history') return;
    let cancelled = false;
    const tick = () => { if (!cancelled) fetchHistory(); };
    tick();
    const id = setInterval(tick, 30_000);
    return () => { cancelled = true; clearInterval(id); };
  }, [tab, fetchHistory]);

  const handleRefresh = () => tab === 'status' ? fetchStatus(true) : fetchHistory();

  const orderedServices = SERVICE_ORDER
    .map((name) => (snapshot?.services ?? []).find((s) => s.service === name))
    .filter((s): s is ServiceMetric => Boolean(s));

  return (
    <main className="container mx-auto px-4 max-w-4xl py-6">
      <header className="flex items-start justify-between mb-4">
        <div>
          <h1 className="text-2xl font-semibold">Service Monitoring</h1>
          <p className="text-xs text-muted-foreground mt-1">
            {tab === 'status'
              ? snapshot ? `Updated: ${formatRelative(snapshot.cachedAt ?? snapshot.generatedAt)} · auto-refresh 60s` : 'Loading…'
              : history ? `Updated: ${formatRelative(history.generatedAt)} · auto-refresh 30s` : 'Loading…'}
          </p>
        </div>
        <button
          type="button"
          onClick={handleRefresh}
          disabled={refreshing}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium border hover:bg-muted disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh sekarang
        </button>
      </header>

      {/* Tab navigation */}
      <div className="flex border-b mb-4">
        {(['status', 'history'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 capitalize ${
              tab === t ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {t === 'status' ? 'Status' : 'History'}
          </button>
        ))}
      </div>

      {/* Tab Status */}
      {tab === 'status' && (
        <>
          {statusError && <ErrorBanner msg={statusError} />}
          <ul className="border rounded-md divide-y">
            {snapshot
              ? orderedServices.map((s) => <StatusRow key={s.service} metric={s} />)
              : SERVICE_ORDER.map((n) => <SkeletonRow key={n} />)}
          </ul>
        </>
      )}

      {/* Tab History */}
      {tab === 'history' && (
        <>
          {historyError && <ErrorBanner msg={historyError} />}
          {history && (
            <div className="mb-4 p-3 bg-muted/40 rounded-md text-sm">
              <div className="flex gap-6 font-medium">
                <span>Hari ini: {formatIdr(history.summary.todayIdr)}</span>
                <span>7 hari: {formatIdr(history.summary.sevenDaysIdr)}</span>
                <span>All-time: {formatIdr(history.summary.allTimeIdr)}</span>
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                Kurs: 1 USD = {formatIdr(history.exchangeRate.usdToIdr)} (ECB · {history.exchangeRate.updatedAt})
              </div>
            </div>
          )}
          <ul className="border rounded-md divide-y">
            {history
              ? history.rows.length === 0
                ? <li className="px-4 py-6 text-center text-sm text-muted-foreground">Belum ada generation. Jalankan generation pertama di Studio.</li>
                : history.rows.map((r) => <HistoryRow key={r.generationId} row={r} />)
              : [0, 1, 2].map((i) => <SkeletonRow key={i} />)}
          </ul>
        </>
      )}
    </main>
  );
}

function StatusRow({ metric }: { metric: ServiceMetric }) {
  return (
    <li className="flex items-center gap-4 px-4 py-3">
      <StatusDot status={metric.status} />
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-sm">{SERVICE_LABELS[metric.service]}</div>
        {metric.unit && <div className="text-xs text-muted-foreground">{metric.unit}</div>}
      </div>
      <div className="text-lg font-mono whitespace-nowrap">{metric.display}</div>
      <div className="text-right text-xs text-muted-foreground min-w-[10rem] truncate">
        {metric.status === 'error'
          ? <span className="text-red-600">{metric.error}</span>
          : metric.detail}
        <div>{metric.latencyMs}ms</div>
      </div>
    </li>
  );
}

function HistoryRow({ row }: { row: GenerationCostRow }) {
  return (
    <li className="flex items-center gap-4 px-4 py-3 text-sm">
      <div className="text-muted-foreground w-32 shrink-0">{formatDate(row.createdAt)}</div>
      <div className="flex-1 truncate font-medium">{row.productIdentifier}</div>
      <div className="text-muted-foreground w-16 text-right">{row.clipCount} clips</div>
      <div className="font-mono w-28 text-right">{formatIdr(row.totalCostIdr)}</div>
      <div className="font-mono w-32 text-right text-muted-foreground">{formatIdr(row.costPerClipIdr)}/clip</div>
    </li>
  );
}

function SkeletonRow() {
  return (
    <li className="flex items-center gap-4 px-4 py-3 animate-pulse">
      <div className="w-4 h-4 rounded-full bg-muted" />
      <div className="flex-1"><div className="h-4 w-24 bg-muted rounded" /></div>
      <div className="h-5 w-16 bg-muted rounded" />
    </li>
  );
}

function StatusDot({ status }: { status: ServiceStatus }) {
  const cls = status === 'ok' ? 'bg-green-500' : status === 'warning' ? 'bg-yellow-500' : 'bg-red-500';
  return <span className={`w-4 h-4 rounded-full ${cls} shrink-0`} aria-label={status} />;
}

function ErrorBanner({ msg }: { msg: string }) {
  return <div className="mb-4 px-3 py-2 rounded-md border border-red-500 bg-red-50 text-red-700 text-sm">Gagal load: {msg}</div>;
}

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 5_000) return 'just now';
  if (diff < 60_000) return `${Math.round(diff / 1000)}s ago`;
  return `${Math.round(diff / 60_000)}m ago`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short' }) + ' ' +
    d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
}

function formatIdr(amount: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency', currency: 'IDR',
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(amount);
}
```

- [ ] **Step 2: Verify type-check + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: PASS keduanya.

- [ ] **Step 3: Commit**

```bash
git add app/monitoring/page.tsx
git commit -m "feat(monitoring): monitoring page with Status + History tabs"
```

---

## Task 13: Final Verification

- [ ] **Step 1: Run semua tests**

Run: `npm test`
Expected: PASS semua — thresholds, aggregator, exchange, history.

- [ ] **Step 2: Type-check + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: PASS keduanya.

- [ ] **Step 3: Manual — Tab Status**

Run: `npm run dev`. Buka `http://localhost:3000/monitoring`.

- [ ] 4 env vars valid (`OPENROUTER_API_KEY`, `USEAPI_TOKEN`, `USEAPI_GOOGLE_EMAIL`, `CAPSOLVER_API_KEY`) → 4 row dengan angka real
- [ ] TopBar: urutan Studio · Scripts · Aset · Riwayat · Monitoring, icon Activity
- [ ] "Monitoring" link active (highlighted) saat di `/monitoring`
- [ ] Klik "Refresh sekarang" → spinner, `?force=1` di DevTools Network
- [ ] Tunggu 60s → auto-refresh di DevTools (tab Status)
- [ ] Hit `/api/admin/monitoring` 3× cepat via curl → 2nd+ call `cachedAt != null`

- [ ] **Step 4: Manual — Tab History**

- [ ] Klik tab History → summary bar muncul (0 jika belum ada generation)
- [ ] Jalankan satu generation di Studio → kembali ke History → refresh → generation muncul dengan Rp
- [ ] Tunggu 30s di tab History → auto-refresh (tidak perlu klik)
- [ ] Switch ke tab Status → DevTools tidak ada request ke `/history` (polling stop)
- [ ] Matikan wifi → kurs pakai cached, tidak blank error

- [ ] **Step 5: Mobile check**

DevTools → 375px width → layout tidak overflow horizontal.

- [ ] **Step 6: Final commit jika ada cleanup**

```bash
git add -A
git commit -m "chore(monitoring): final verification cleanups"
```
