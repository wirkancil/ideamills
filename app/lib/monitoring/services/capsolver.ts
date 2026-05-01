import { computeStatus } from '../thresholds';
import type { ServiceMetric } from '../types';

const TIMEOUT_MS = 8_000;

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
    const json = await res.json() as {
      errorId: number;
      balance?: number;
      errorDescription?: string;
      packages?: Array<{ title: string; numberOfCalls: number; expireTime: number }>;
    };
    if (json.errorId !== 0) return err(json.errorDescription ?? `errorId ${json.errorId}`, start);
    if (typeof json.balance !== 'number') return err('balance missing', start);

    const activePackages = (json.packages ?? []).filter((p) => p.numberOfCalls > 0);
    const detail = activePackages.length > 0
      ? activePackages.map((p) => {
          const exp = new Date(p.expireTime * 1000).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' });
          return `${p.title} (${p.numberOfCalls.toLocaleString()} calls · exp ${exp})`;
        }).join(' · ')
      : null;

    return {
      service: 'capsolver', status: computeStatus('capsolver', json.balance),
      display: `$${json.balance.toFixed(2)}`, value: json.balance, unit: 'usd',
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
  return { service: 'capsolver', status: 'error', display: '—', value: null, unit: 'usd', detail: null, error, latencyMs: Math.round(performance.now() - start) };
}
