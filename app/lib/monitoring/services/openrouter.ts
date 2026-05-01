import { computeStatus } from '../thresholds';
import type { ServiceMetric } from '../types';

const TIMEOUT_MS = 8_000;

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
      detail: `digunakan $${used.toFixed(2)} · total $${total.toFixed(2)}`, error: null,
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
