import { computeStatus } from '../thresholds';
import type { ServiceMetric } from '../types';

const TIMEOUT_MS = 8_000;

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
