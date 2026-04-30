# Service Monitoring TopBar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tambah halaman `/monitoring` + entry baru di TopBar yang menampilkan saldo & kesehatan 4 external service (OpenRouter, Google Flow via useapi.net, CapSolver, useapi.net stats), dengan polling 60s di client + cache 30s di server.

**Architecture:** Single aggregator route `GET /api/admin/monitoring` mem-fetch 4 external API secara paralel pakai `Promise.allSettled` + AbortController 5s timeout, dibungkus in-memory cache 30s. Frontend client component poll endpoint tiap 60s + tombol manual refresh `?force=1`. Tiap fetcher di-isolasi per file dengan return shape `ServiceMetric` yang konsisten.

**Tech Stack:** Next.js 15 App Router, React 18 client component, TypeScript strict, fetch API + AbortController, Vitest untuk minimal unit tests, lucide-react icons, Tailwind + existing UI primitives.

**Spec:** `docs/superpowers/specs/2026-04-30-monitoring-topbar-design.md`

---

## File Structure

**New files:**

| Path | Responsibility |
|---|---|
| `app/lib/monitoring/types.ts` | TypeScript types: `ServiceName`, `ServiceStatus`, `ServiceMetric`, `MonitoringSnapshot` |
| `app/lib/monitoring/thresholds.ts` | Hardcoded threshold constants + `computeStatus(service, value)` helper |
| `app/lib/monitoring/services/openrouter.ts` | `fetchOpenRouterCredit()` — calls openrouter.ai/api/v1/credits |
| `app/lib/monitoring/services/googleFlow.ts` | `fetchGoogleFlowCredit()` — calls useapi.net /google-flow/accounts/{email} |
| `app/lib/monitoring/services/capsolver.ts` | `fetchCapSolverBalance()` — POST capsolver.com /getBalance |
| `app/lib/monitoring/services/useapi.ts` | `fetchUseapiStats()` — calls useapi.net /account/stats |
| `app/lib/monitoring/aggregator.ts` | `buildSnapshot()` — calls 4 fetchers in parallel via Promise.allSettled |
| `app/lib/monitoring/cache.ts` | `getCachedSnapshot(force)` — module-level in-memory cache 30s |
| `app/api/admin/monitoring/route.ts` | `GET` handler that delegates to cache helper |
| `app/monitoring/page.tsx` | Client page: polling, refresh button, list rendering |
| `app/lib/monitoring/services/__tests__/thresholds.test.ts` | Unit tests for `computeStatus` boundaries |
| `app/lib/monitoring/services/__tests__/aggregator.test.ts` | Unit tests for partial failure handling |
| `vitest.config.ts` | Vitest config (root) |

**Modified files:**

| Path | Why |
|---|---|
| `app/components/TopBar.tsx` | Add "Monitoring" link as the rightmost entry |
| `.env.example` | Add `CAPSOLVER_API_KEY=CAP-...` |
| `package.json` | Add devDeps `vitest`, scripts `test` + `test:watch` |

---

## Task 1: Setup Vitest & Add CapSolver Env Var

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`
- Modify: `.env.example`

- [ ] **Step 1: Install Vitest as dev dependency**

Run:
```bash
npm install -D vitest@^2.1.0
```

Expected: package.json gets `"vitest": "^2.1.0"` added under devDependencies, `package-lock.json` updates.

- [ ] **Step 2: Add test scripts to package.json**

Edit `package.json` scripts block. Add after `"lint": "next lint",`:

```json
    "test": "vitest run",
    "test:watch": "vitest",
```

- [ ] **Step 3: Create vitest.config.ts**

Create `vitest.config.ts` at repo root with:

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

- [ ] **Step 4: Verify Vitest runs (no tests yet)**

Run: `npm test`
Expected: Vitest exits 0 with "No test files found" or similar non-error message. (If exit code 1 because no tests, that's also fine for now — we'll have tests in Task 6 & 9.)

- [ ] **Step 5: Add CAPSOLVER_API_KEY to .env.example**

Read `.env.example`, append after the useapi.net block (after `USEAPI_GOOGLE_EMAIL=...`):

```
# CapSolver — saldo akun capsolver yang di-connect ke useapi.net Google Flow
# Dapatkan di: https://dashboard.capsolver.com
CAPSOLVER_API_KEY=CAP-...
```

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json vitest.config.ts .env.example
git commit -m "chore(monitoring): setup vitest + add CAPSOLVER_API_KEY env var"
```

---

## Task 2: Define Monitoring Types

**Files:**
- Create: `app/lib/monitoring/types.ts`

- [ ] **Step 1: Create types.ts with full data contract**

Create `app/lib/monitoring/types.ts`:

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
  'openrouter': 'OpenRouter',
  'google-flow': 'Google Flow',
  'capsolver': 'CapSolver',
  'useapi': 'useapi.net',
};
```

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit`
Expected: PASS, no new errors.

- [ ] **Step 3: Commit**

```bash
git add app/lib/monitoring/types.ts
git commit -m "feat(monitoring): add ServiceMetric and MonitoringSnapshot types"
```

---

## Task 3: Implement Threshold Logic + Unit Tests (TDD)

**Files:**
- Create: `app/lib/monitoring/thresholds.ts`
- Create: `app/lib/monitoring/services/__tests__/thresholds.test.ts`

- [ ] **Step 1: Write the failing test first**

Create `app/lib/monitoring/services/__tests__/thresholds.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { computeStatus } from '../../thresholds';

describe('computeStatus', () => {
  describe('openrouter (USD: warn<5, err<1)', () => {
    it('returns ok at exact warning boundary $5.00', () => {
      expect(computeStatus('openrouter', 5)).toBe('ok');
    });
    it('returns warning just below warning boundary $4.99', () => {
      expect(computeStatus('openrouter', 4.99)).toBe('warning');
    });
    it('returns warning at exact error boundary $1.00', () => {
      expect(computeStatus('openrouter', 1)).toBe('warning');
    });
    it('returns error just below error boundary $0.99', () => {
      expect(computeStatus('openrouter', 0.99)).toBe('error');
    });
    it('returns ok well above warning $20', () => {
      expect(computeStatus('openrouter', 20)).toBe('ok');
    });
  });

  describe('google-flow (credits: warn<100, err<20)', () => {
    it('returns ok at boundary 100', () => {
      expect(computeStatus('google-flow', 100)).toBe('ok');
    });
    it('returns warning at 99', () => {
      expect(computeStatus('google-flow', 99)).toBe('warning');
    });
    it('returns warning at error boundary 20', () => {
      expect(computeStatus('google-flow', 20)).toBe('warning');
    });
    it('returns error at 19', () => {
      expect(computeStatus('google-flow', 19)).toBe('error');
    });
  });

  describe('capsolver (USD: warn<3, err<0.5)', () => {
    it('returns ok at 3.00', () => {
      expect(computeStatus('capsolver', 3)).toBe('ok');
    });
    it('returns warning at 2.99', () => {
      expect(computeStatus('capsolver', 2.99)).toBe('warning');
    });
    it('returns warning at 0.5', () => {
      expect(computeStatus('capsolver', 0.5)).toBe('warning');
    });
    it('returns error at 0.49', () => {
      expect(computeStatus('capsolver', 0.49)).toBe('error');
    });
  });

  describe('useapi (success_rate %: warn<80, no error)', () => {
    it('returns ok at 80', () => {
      expect(computeStatus('useapi', 80)).toBe('ok');
    });
    it('returns warning at 79.9', () => {
      expect(computeStatus('useapi', 79.9)).toBe('warning');
    });
    it('returns ok when value is null (no requests today)', () => {
      expect(computeStatus('useapi', null)).toBe('ok');
    });
  });

  describe('null values for services with thresholds', () => {
    it('returns ok when openrouter value is null (treated as no signal)', () => {
      expect(computeStatus('openrouter', null)).toBe('ok');
    });
  });
});
```

- [ ] **Step 2: Run tests — expect them to fail (no implementation yet)**

Run: `npm test`
Expected: FAIL — `Cannot find module '../../thresholds'` or similar.

- [ ] **Step 3: Implement thresholds.ts**

Create `app/lib/monitoring/thresholds.ts`:

```typescript
import type { ServiceName, ServiceStatus } from './types';

interface Threshold {
  warningBelow: number;
  errorBelow: number | null;
}

const THRESHOLDS: Record<ServiceName, Threshold> = {
  'openrouter':   { warningBelow: 5,   errorBelow: 1 },
  'google-flow':  { warningBelow: 100, errorBelow: 20 },
  'capsolver':    { warningBelow: 3,   errorBelow: 0.5 },
  'useapi':       { warningBelow: 80,  errorBelow: null },
};

export function computeStatus(service: ServiceName, value: number | null): ServiceStatus {
  if (value === null) return 'ok';
  const t = THRESHOLDS[service];
  if (t.errorBelow !== null && value < t.errorBelow) return 'error';
  if (value < t.warningBelow) return 'warning';
  return 'ok';
}
```

- [ ] **Step 4: Run tests — expect all pass**

Run: `npm test`
Expected: PASS, all 16 test cases green.

- [ ] **Step 5: Verify type-check**

Run: `npx tsc --noEmit`
Expected: PASS, no errors.

- [ ] **Step 6: Commit**

```bash
git add app/lib/monitoring/thresholds.ts app/lib/monitoring/services/__tests__/thresholds.test.ts
git commit -m "feat(monitoring): add threshold logic with TDD coverage"
```

---

## Task 4: Implement OpenRouter Fetcher

**Files:**
- Create: `app/lib/monitoring/services/openrouter.ts`

- [ ] **Step 1: Implement openrouter.ts**

Create `app/lib/monitoring/services/openrouter.ts`:

```typescript
import { computeStatus } from '../thresholds';
import type { ServiceMetric } from '../types';

const URL = 'https://openrouter.ai/api/v1/credits';
const TIMEOUT_MS = 5_000;

interface RawCreditsResponse {
  data?: {
    total_credits?: number;
    total_usage?: number;
  };
}

export async function fetchOpenRouterCredit(): Promise<ServiceMetric> {
  const start = performance.now();
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) {
    return errorMetric('OPENROUTER_API_KEY not set', start);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(URL, {
      headers: { Authorization: `Bearer ${key}` },
      signal: controller.signal,
    });
    if (!res.ok) {
      return errorMetric(`HTTP ${res.status}`, start);
    }
    const json = (await res.json()) as RawCreditsResponse;
    const total = json.data?.total_credits;
    const used = json.data?.total_usage;
    if (typeof total !== 'number' || typeof used !== 'number') {
      return errorMetric('malformed response', start);
    }
    const remaining = total - used;
    return {
      service: 'openrouter',
      status: computeStatus('openrouter', remaining),
      display: `$${remaining.toFixed(2)}`,
      value: remaining,
      unit: 'usd',
      detail: `$${used.toFixed(2)} used`,
      error: null,
      latencyMs: Math.round(performance.now() - start),
    };
  } catch (err) {
    const msg = err instanceof Error
      ? (err.name === 'AbortError' ? `timeout ${TIMEOUT_MS / 1000}s` : err.message)
      : 'unknown error';
    return errorMetric(msg, start);
  } finally {
    clearTimeout(timer);
  }
}

function errorMetric(error: string, start: number): ServiceMetric {
  return {
    service: 'openrouter',
    status: 'error',
    display: '—',
    value: null,
    unit: 'usd',
    detail: null,
    error,
    latencyMs: Math.round(performance.now() - start),
  };
}
```

- [ ] **Step 2: Verify type-check**

Run: `npx tsc --noEmit`
Expected: PASS, no errors.

- [ ] **Step 3: Manual smoke test**

Add a temporary script `scripts/debug-monitor-openrouter.ts`:

```typescript
import 'dotenv/config';
import { fetchOpenRouterCredit } from '../app/lib/monitoring/services/openrouter';

(async () => {
  const result = await fetchOpenRouterCredit();
  console.log(JSON.stringify(result, null, 2));
})();
```

Run: `npx tsx scripts/debug-monitor-openrouter.ts`
Expected: Output JSON with `status: 'ok'` (or `warning` if low), `display: "$X.XX"`, real `value` and `latencyMs > 0`.

If `OPENROUTER_API_KEY` invalid → `status: 'error'`, error like `HTTP 401`.

Then delete the script: `rm scripts/debug-monitor-openrouter.ts`

- [ ] **Step 4: Commit**

```bash
git add app/lib/monitoring/services/openrouter.ts
git commit -m "feat(monitoring): add OpenRouter credit fetcher"
```

---

## Task 5: Implement Google Flow Fetcher

**Files:**
- Create: `app/lib/monitoring/services/googleFlow.ts`

- [ ] **Step 1: Implement googleFlow.ts**

Create `app/lib/monitoring/services/googleFlow.ts`:

```typescript
import { computeStatus } from '../thresholds';
import type { ServiceMetric } from '../types';

const BASE_URL = 'https://api.useapi.net/v1';
const TIMEOUT_MS = 5_000;

interface RawAccountResponse {
  health?: string;
  credits?: {
    credits?: number;
    userPaygateTier?: string;
  };
}

export async function fetchGoogleFlowCredit(): Promise<ServiceMetric> {
  const start = performance.now();
  const token = process.env.USEAPI_TOKEN;
  const email = process.env.USEAPI_GOOGLE_EMAIL;
  if (!token) return errorMetric('USEAPI_TOKEN not set', start);
  if (!email) return errorMetric('USEAPI_GOOGLE_EMAIL not set', start);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(
      `${BASE_URL}/google-flow/accounts/${encodeURIComponent(email)}`,
      {
        headers: { Authorization: `Bearer ${token}` },
        signal: controller.signal,
      },
    );
    if (!res.ok) return errorMetric(`HTTP ${res.status}`, start);

    const json = (await res.json()) as RawAccountResponse;
    if (json.health !== 'OK') {
      return errorMetric(`health: ${json.health ?? 'unknown'}`, start);
    }
    const credits = json.credits?.credits;
    if (typeof credits !== 'number') {
      return errorMetric('credits missing', start);
    }
    const tier = json.credits?.userPaygateTier;
    return {
      service: 'google-flow',
      status: computeStatus('google-flow', credits),
      display: `${credits.toLocaleString()} credits`,
      value: credits,
      unit: 'credits',
      detail: humanizeTier(tier),
      error: null,
      latencyMs: Math.round(performance.now() - start),
    };
  } catch (err) {
    const msg = err instanceof Error
      ? (err.name === 'AbortError' ? `timeout ${TIMEOUT_MS / 1000}s` : err.message)
      : 'unknown error';
    return errorMetric(msg, start);
  } finally {
    clearTimeout(timer);
  }
}

function humanizeTier(tier: string | undefined): string | null {
  if (!tier) return null;
  if (tier === 'PAYGATE_TIER_ONE') return 'Tier 1';
  if (tier === 'PAYGATE_TIER_TWO') return 'Tier 2';
  return tier;
}

function errorMetric(error: string, start: number): ServiceMetric {
  return {
    service: 'google-flow',
    status: 'error',
    display: '—',
    value: null,
    unit: 'credits',
    detail: null,
    error,
    latencyMs: Math.round(performance.now() - start),
  };
}
```

- [ ] **Step 2: Verify type-check**

Run: `npx tsc --noEmit`
Expected: PASS, no errors.

- [ ] **Step 3: Commit**

```bash
git add app/lib/monitoring/services/googleFlow.ts
git commit -m "feat(monitoring): add Google Flow credit fetcher via useapi.net"
```

---

## Task 6: Implement CapSolver Fetcher

**Files:**
- Create: `app/lib/monitoring/services/capsolver.ts`

- [ ] **Step 1: Implement capsolver.ts**

Create `app/lib/monitoring/services/capsolver.ts`:

```typescript
import { computeStatus } from '../thresholds';
import type { ServiceMetric } from '../types';

const URL = 'https://api.capsolver.com/getBalance';
const TIMEOUT_MS = 5_000;

interface RawBalanceResponse {
  errorId: number;
  balance?: number;
  errorDescription?: string;
}

export async function fetchCapSolverBalance(): Promise<ServiceMetric> {
  const start = performance.now();
  const key = process.env.CAPSOLVER_API_KEY;
  if (!key) return errorMetric('CAPSOLVER_API_KEY not set', start);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientKey: key }),
      signal: controller.signal,
    });
    if (!res.ok) return errorMetric(`HTTP ${res.status}`, start);

    const json = (await res.json()) as RawBalanceResponse;
    if (json.errorId !== 0) {
      return errorMetric(json.errorDescription ?? `errorId ${json.errorId}`, start);
    }
    if (typeof json.balance !== 'number') {
      return errorMetric('balance missing', start);
    }
    const bal = json.balance;
    return {
      service: 'capsolver',
      status: computeStatus('capsolver', bal),
      display: `$${bal.toFixed(2)}`,
      value: bal,
      unit: 'usd',
      detail: 'connected via useapi',
      error: null,
      latencyMs: Math.round(performance.now() - start),
    };
  } catch (err) {
    const msg = err instanceof Error
      ? (err.name === 'AbortError' ? `timeout ${TIMEOUT_MS / 1000}s` : err.message)
      : 'unknown error';
    return errorMetric(msg, start);
  } finally {
    clearTimeout(timer);
  }
}

function errorMetric(error: string, start: number): ServiceMetric {
  return {
    service: 'capsolver',
    status: 'error',
    display: '—',
    value: null,
    unit: 'usd',
    detail: null,
    error,
    latencyMs: Math.round(performance.now() - start),
  };
}
```

- [ ] **Step 2: Verify type-check**

Run: `npx tsc --noEmit`
Expected: PASS, no errors.

- [ ] **Step 3: Commit**

```bash
git add app/lib/monitoring/services/capsolver.ts
git commit -m "feat(monitoring): add CapSolver balance fetcher"
```

---

## Task 7: Implement useapi.net Stats Fetcher

**Files:**
- Create: `app/lib/monitoring/services/useapi.ts`

- [ ] **Step 1: Implement useapi.ts**

Create `app/lib/monitoring/services/useapi.ts`:

```typescript
import { computeStatus } from '../thresholds';
import type { ServiceMetric } from '../types';

const BASE_URL = 'https://api.useapi.net/v1';
const TIMEOUT_MS = 5_000;

interface RawStatsResponse {
  total?: number;
  summary?: {
    success_rate?: string;
  };
}

export async function fetchUseapiStats(): Promise<ServiceMetric> {
  const start = performance.now();
  const token = process.env.USEAPI_TOKEN;
  if (!token) return errorMetric('USEAPI_TOKEN not set', start);

  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD UTC
  const url = `${BASE_URL}/account/stats?bot=google-flow&date=${today}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    });
    if (!res.ok) return errorMetric(`HTTP ${res.status}`, start);

    const json = (await res.json()) as RawStatsResponse;
    const total = json.total ?? 0;

    if (!json.summary || total === 0) {
      return {
        service: 'useapi',
        status: 'ok',
        display: 'API healthy',
        value: null,
        unit: null,
        detail: 'no requests today',
        error: null,
        latencyMs: Math.round(performance.now() - start),
      };
    }

    const rateStr = json.summary.success_rate ?? '';
    const parsed = parseFloat(rateStr.replace('%', ''));
    const rate = Number.isFinite(parsed) ? parsed : null;

    return {
      service: 'useapi',
      status: computeStatus('useapi', rate),
      display: 'API healthy',
      value: rate,
      unit: null,
      detail: `${total} reqs · ${rateStr || 'n/a'} ok`,
      error: null,
      latencyMs: Math.round(performance.now() - start),
    };
  } catch (err) {
    const msg = err instanceof Error
      ? (err.name === 'AbortError' ? `timeout ${TIMEOUT_MS / 1000}s` : err.message)
      : 'unknown error';
    return errorMetric(msg, start);
  } finally {
    clearTimeout(timer);
  }
}

function errorMetric(error: string, start: number): ServiceMetric {
  return {
    service: 'useapi',
    status: 'error',
    display: '—',
    value: null,
    unit: null,
    detail: null,
    error,
    latencyMs: Math.round(performance.now() - start),
  };
}
```

- [ ] **Step 2: Verify type-check**

Run: `npx tsc --noEmit`
Expected: PASS, no errors.

- [ ] **Step 3: Commit**

```bash
git add app/lib/monitoring/services/useapi.ts
git commit -m "feat(monitoring): add useapi.net account stats fetcher"
```

---

## Task 8: Implement Aggregator with Partial-Failure Tests (TDD)

**Files:**
- Create: `app/lib/monitoring/aggregator.ts`
- Create: `app/lib/monitoring/services/__tests__/aggregator.test.ts`

- [ ] **Step 1: Write failing tests first**

Create `app/lib/monitoring/services/__tests__/aggregator.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ServiceMetric } from '../../types';

const mockOpenRouter = vi.fn();
const mockGoogleFlow = vi.fn();
const mockCapSolver = vi.fn();
const mockUseapi = vi.fn();

vi.mock('../openrouter', () => ({ fetchOpenRouterCredit: () => mockOpenRouter() }));
vi.mock('../googleFlow', () => ({ fetchGoogleFlowCredit: () => mockGoogleFlow() }));
vi.mock('../capsolver', () => ({ fetchCapSolverBalance: () => mockCapSolver() }));
vi.mock('../useapi', () => ({ fetchUseapiStats: () => mockUseapi() }));

const okMetric = (service: ServiceMetric['service']): ServiceMetric => ({
  service,
  status: 'ok',
  display: 'fake',
  value: 10,
  unit: 'usd',
  detail: null,
  error: null,
  latencyMs: 5,
});

describe('buildSnapshot', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('returns 4 services in stable order on full success', async () => {
    mockOpenRouter.mockResolvedValue(okMetric('openrouter'));
    mockGoogleFlow.mockResolvedValue(okMetric('google-flow'));
    mockCapSolver.mockResolvedValue(okMetric('capsolver'));
    mockUseapi.mockResolvedValue(okMetric('useapi'));

    const { buildSnapshot } = await import('../../aggregator');
    const snap = await buildSnapshot();

    expect(snap.services).toHaveLength(4);
    expect(snap.services.map((s) => s.service)).toEqual([
      'openrouter', 'google-flow', 'capsolver', 'useapi',
    ]);
    expect(snap.cachedAt).toBeNull();
    expect(snap.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('returns error metric for one fetcher when it throws, others remain ok', async () => {
    mockOpenRouter.mockResolvedValue(okMetric('openrouter'));
    mockGoogleFlow.mockResolvedValue(okMetric('google-flow'));
    mockCapSolver.mockRejectedValue(new Error('boom'));
    mockUseapi.mockResolvedValue(okMetric('useapi'));

    const { buildSnapshot } = await import('../../aggregator');
    const snap = await buildSnapshot();

    expect(snap.services).toHaveLength(4);
    const cs = snap.services.find((s) => s.service === 'capsolver');
    expect(cs?.status).toBe('error');
    expect(cs?.error).toBe('boom');

    const others = snap.services.filter((s) => s.service !== 'capsolver');
    expect(others.every((s) => s.status === 'ok')).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests — expect them to fail (no aggregator.ts yet)**

Run: `npm test`
Expected: FAIL — `Cannot find module '../../aggregator'`.

- [ ] **Step 3: Implement aggregator.ts**

Create `app/lib/monitoring/aggregator.ts`:

```typescript
import { fetchOpenRouterCredit } from './services/openrouter';
import { fetchGoogleFlowCredit } from './services/googleFlow';
import { fetchCapSolverBalance } from './services/capsolver';
import { fetchUseapiStats } from './services/useapi';
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
    const err = r.reason;
    const message = err instanceof Error ? err.message : 'unknown error';
    return {
      service: FETCHERS[i].service,
      status: 'error',
      display: '—',
      value: null,
      unit: null,
      detail: null,
      error: message,
      latencyMs: 0,
    };
  });
  return {
    generatedAt: new Date().toISOString(),
    cachedAt: null,
    services,
  };
}
```

- [ ] **Step 4: Run tests — expect all pass**

Run: `npm test`
Expected: PASS — both `aggregator.test.ts` cases plus all earlier `thresholds.test.ts` cases.

- [ ] **Step 5: Verify type-check**

Run: `npx tsc --noEmit`
Expected: PASS, no errors.

- [ ] **Step 6: Commit**

```bash
git add app/lib/monitoring/aggregator.ts app/lib/monitoring/services/__tests__/aggregator.test.ts
git commit -m "feat(monitoring): add aggregator with partial-failure handling"
```

---

## Task 9: Implement Cache Module

**Files:**
- Create: `app/lib/monitoring/cache.ts`

- [ ] **Step 1: Implement cache.ts**

Create `app/lib/monitoring/cache.ts`:

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

- [ ] **Step 2: Verify type-check**

Run: `npx tsc --noEmit`
Expected: PASS, no errors.

- [ ] **Step 3: Commit**

```bash
git add app/lib/monitoring/cache.ts
git commit -m "feat(monitoring): add 30s in-memory snapshot cache"
```

---

## Task 10: Implement Aggregator API Route

**Files:**
- Create: `app/api/admin/monitoring/route.ts`

- [ ] **Step 1: Implement route.ts**

Create `app/api/admin/monitoring/route.ts`:

```typescript
import { NextResponse } from 'next/server';
import { getCachedSnapshot } from '@/app/lib/monitoring/cache';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const force = new URL(req.url).searchParams.get('force') === '1';
  try {
    const snapshot = await getCachedSnapshot(force);
    return NextResponse.json(snapshot);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
```

- [ ] **Step 2: Start dev server and test the endpoint**

Run in one terminal: `npm run dev`

In another terminal:

```bash
curl -s http://localhost:3000/api/admin/monitoring | jq
```

Expected: JSON snapshot with `generatedAt`, `cachedAt: null`, and `services` array of 4. Each service has `status`, `display`, etc.

- [ ] **Step 3: Test cache behavior**

Run twice in quick succession:

```bash
curl -s http://localhost:3000/api/admin/monitoring | jq '.cachedAt'
curl -s http://localhost:3000/api/admin/monitoring | jq '.cachedAt'
```

Expected: First call → `null`. Second call (within 30s) → ISO timestamp string (cached hit).

- [ ] **Step 4: Test force bypass**

```bash
curl -s "http://localhost:3000/api/admin/monitoring?force=1" | jq '.cachedAt'
```

Expected: `null` (fresh fetch).

- [ ] **Step 5: Stop dev server (Ctrl+C) and commit**

```bash
git add app/api/admin/monitoring/route.ts
git commit -m "feat(monitoring): add GET /api/admin/monitoring aggregator route"
```

---

## Task 11: Add Monitoring Link to TopBar

**Files:**
- Modify: `app/components/TopBar.tsx`

- [ ] **Step 1: Read current TopBar.tsx**

Open `app/components/TopBar.tsx` and confirm it imports icons from `lucide-react` and uses `pathname` for active state. (Already verified: it does.)

- [ ] **Step 2: Add Activity icon to imports**

Find the lucide-react import line (currently around line 5):

```typescript
import { Sparkles, History, Clapperboard, Images, FileText } from 'lucide-react';
```

Replace with:

```typescript
import { Sparkles, History, Clapperboard, Images, FileText, Activity } from 'lucide-react';
```

- [ ] **Step 3: Add Monitoring link as last entry**

Find the closing `</Link>` for the "Riwayat" entry (currently around line 63). After that closing `</Link>` and before `</div>` of the link group, add:

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

- [ ] **Step 4: Verify type-check**

Run: `npx tsc --noEmit`
Expected: PASS, no errors.

- [ ] **Step 5: Manual visual check**

Run: `npm run dev` in one terminal, visit `http://localhost:3000/`. Confirm TopBar order is: Studio · Scripts · Aset · Riwayat · Monitoring (with Activity icon). Click "Monitoring" → 404 expected (page not yet built — covered next task).

Stop dev server.

- [ ] **Step 6: Commit**

```bash
git add app/components/TopBar.tsx
git commit -m "feat(monitoring): add Monitoring link to TopBar (rightmost)"
```

---

## Task 12: Build Monitoring Page UI

**Files:**
- Create: `app/monitoring/page.tsx`

- [ ] **Step 1: Implement page.tsx**

Create `app/monitoring/page.tsx`:

```tsx
'use client';

import { useEffect, useState, useCallback } from 'react';
import { RefreshCw } from 'lucide-react';
import type { MonitoringSnapshot, ServiceMetric, ServiceStatus } from '@/app/lib/monitoring/types';
import { SERVICE_LABELS, SERVICE_ORDER } from '@/app/lib/monitoring/types';

const POLL_MS = 60_000;

export default function MonitoringPage() {
  const [snapshot, setSnapshot] = useState<MonitoringSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchSnapshot = useCallback(async (force: boolean) => {
    setRefreshing(true);
    try {
      const res = await fetch(`/api/admin/monitoring${force ? '?force=1' : ''}`, { cache: 'no-store' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? `HTTP ${res.status}`);
        return;
      }
      const data = (await res.json()) as MonitoringSnapshot;
      setSnapshot(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'unknown error');
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const tick = async (force = false) => {
      if (cancelled) return;
      await fetchSnapshot(force);
    };
    tick();
    const id = setInterval(() => tick(), POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [fetchSnapshot]);

  const orderedServices = orderServices(snapshot?.services ?? []);

  return (
    <main className="container mx-auto px-4 max-w-4xl py-6">
      <header className="flex items-start justify-between mb-4">
        <div>
          <h1 className="text-2xl font-semibold">Service Monitoring</h1>
          <p className="text-xs text-muted-foreground mt-1">
            {snapshot
              ? `Last updated: ${formatRelative(snapshot.cachedAt ?? snapshot.generatedAt)} · auto-refresh tiap 60 detik`
              : 'Loading…'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => fetchSnapshot(true)}
          disabled={refreshing}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium border hover:bg-muted disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh sekarang
        </button>
      </header>

      {error && (
        <div className="mb-4 px-3 py-2 rounded-md border border-red-500 bg-red-50 text-red-700 text-sm">
          Gagal load monitoring: {error}
        </div>
      )}

      <ul className="border rounded-md divide-y">
        {snapshot
          ? orderedServices.map((s) => <Row key={s.service} metric={s} />)
          : SERVICE_ORDER.map((name) => <SkeletonRow key={name} />)}
      </ul>
    </main>
  );
}

function Row({ metric }: { metric: ServiceMetric }) {
  return (
    <li className="flex items-center gap-4 px-4 py-3">
      <StatusDot status={metric.status} />
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-sm">{SERVICE_LABELS[metric.service]}</div>
        {metric.unit && <div className="text-xs text-muted-foreground">{metric.unit}</div>}
      </div>
      <div className="text-lg font-mono whitespace-nowrap">
        {metric.status === 'error' ? '—' : metric.display}
      </div>
      <div className="text-right text-xs text-muted-foreground min-w-[10rem] truncate">
        {metric.status === 'error' ? (
          <span className="text-red-600">{metric.error}</span>
        ) : (
          metric.detail
        )}
        <div>{metric.latencyMs}ms</div>
      </div>
    </li>
  );
}

function SkeletonRow() {
  return (
    <li className="flex items-center gap-4 px-4 py-3 animate-pulse">
      <div className="w-4 h-4 rounded-full bg-muted" />
      <div className="flex-1">
        <div className="h-4 w-24 bg-muted rounded" />
      </div>
      <div className="h-5 w-16 bg-muted rounded" />
    </li>
  );
}

function StatusDot({ status }: { status: ServiceStatus }) {
  const cls =
    status === 'ok' ? 'bg-green-500' :
    status === 'warning' ? 'bg-yellow-500' :
    'bg-red-500';
  return <span className={`w-4 h-4 rounded-full ${cls} shrink-0`} aria-label={status} />;
}

function orderServices(services: ServiceMetric[]): ServiceMetric[] {
  const map = new Map(services.map((s) => [s.service, s]));
  return SERVICE_ORDER.map((name) => map.get(name)).filter((s): s is ServiceMetric => Boolean(s));
}

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 5_000) return 'just now';
  if (diff < 60_000) return `${Math.round(diff / 1000)}s ago`;
  return `${Math.round(diff / 60_000)}m ago`;
}
```

- [ ] **Step 2: Verify type-check**

Run: `npx tsc --noEmit`
Expected: PASS, no errors.

- [ ] **Step 3: Verify lint**

Run: `npm run lint`
Expected: PASS, no errors in new files.

- [ ] **Step 4: Manual visual test**

Run: `npm run dev`. Visit `http://localhost:3000/monitoring`.

Expected:
- TopBar shows "Monitoring" highlighted as active.
- Page header "Service Monitoring" + sub-line + "Refresh sekarang" button.
- 4 rows rendered with status dots (green/yellow/red), service name, value, detail, latency.
- After ~60s, observe a second fetch in DevTools Network tab.
- Click "Refresh sekarang" → button shows spinner, request goes out with `?force=1`.

Stop dev server.

- [ ] **Step 5: Commit**

```bash
git add app/monitoring/page.tsx
git commit -m "feat(monitoring): add /monitoring page with polling and refresh"
```

---

## Task 13: Final Verification

**Files:** none (verification only)

- [ ] **Step 1: Run full test suite**

Run: `npm test`
Expected: PASS, all tests in `thresholds.test.ts` and `aggregator.test.ts` green.

- [ ] **Step 2: Run type-check**

Run: `npx tsc --noEmit`
Expected: PASS, no errors.

- [ ] **Step 3: Run lint**

Run: `npm run lint`
Expected: PASS, no new errors.

- [ ] **Step 4: Run manual verification checklist (from spec section 7)**

Start `npm run dev`. Then:

- [ ] All 4 env vars set with real keys → `/monitoring` shows real numbers for all 4 rows.
- [ ] Temporarily invalidate one key (set wrong value, restart dev) → that row goes red with auth error, others remain healthy. Restore the key.
- [ ] Click "Refresh sekarang" → spinner appears, button disables until response.
- [ ] Leave tab open 2 minutes → at least one auto-refresh observed in network panel.
- [ ] Mobile width (DevTools 375px) → layout stays readable, no horizontal scroll.
- [ ] Hit `/api/admin/monitoring` 5× rapidly via curl → 2nd-5th calls return `cachedAt != null` and finish in <50ms.
- [ ] `curl /api/admin/monitoring?force=1` always returns `cachedAt: null`.

Stop dev server.

- [ ] **Step 5: Final commit (if any cleanups needed)**

If everything passes without changes, no commit needed. Otherwise:

```bash
git add -A
git commit -m "chore(monitoring): final cleanups"
```
