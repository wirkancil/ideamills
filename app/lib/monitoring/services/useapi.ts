import type { ServiceMetric } from '../types';

const TIMEOUT_MS = 8_000;

export async function fetchUseapiStats(): Promise<ServiceMetric> {
  const start = performance.now();
  const token = process.env.USEAPI_TOKEN;
  if (!token) return err('USEAPI_TOKEN not set', start);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch('https://api.useapi.net/v2/account', {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    });
    if (!res.ok) return err(`HTTP ${res.status}`, start);
    const json = await res.json() as {
      subscriptionIsActive?: boolean;
      subscriptions?: number;
      maxAccountsPerAPI?: number;
      accounts?: Record<string, { total?: number; active?: number; error?: number }>;
      sub?: string;
    };

    if (!json.subscriptionIsActive) {
      return err('Subscription tidak aktif', start);
    }

    const gfAccount = json.accounts?.['Google Flow API'];
    const active = gfAccount?.active ?? 0;
    const errorCount = gfAccount?.error ?? 0;
    const detail = [
      `${active} akun aktif`,
      errorCount > 0 ? `${errorCount} error` : null,
      json.sub ? `renewal ${json.sub.slice(4, 6)}/${json.sub.slice(2, 4)}` : null,
    ].filter(Boolean).join(' · ');

    const status = errorCount > 0 ? 'warning' : 'ok';

    return {
      service: 'useapi', status,
      display: 'Aktif', value: null, unit: null,
      detail, error: null,
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
