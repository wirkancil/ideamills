import type { MonitoringSnapshot, ServiceMetric, ServiceName } from './types';
import { fetchOpenRouterCredit } from './services/openrouter';
import { fetchGoogleFlowCredit } from './services/googleFlow';
import { fetchCapSolverBalance } from './services/capsolver';
import { fetchUseapiStats } from './services/useapi';

const FETCHERS: Array<{ service: ServiceName; fn: () => Promise<ServiceMetric> }> = [
  { service: 'openrouter',   fn: fetchOpenRouterCredit },
  { service: 'google-flow',  fn: fetchGoogleFlowCredit },
  { service: 'capsolver',    fn: fetchCapSolverBalance },
  { service: 'useapi',       fn: fetchUseapiStats },
];

export async function buildSnapshot(): Promise<MonitoringSnapshot> {
  const results = await Promise.allSettled(FETCHERS.map((f) => f.fn()));
  const services: ServiceMetric[] = results.map((r, i) => {
    if (r.status === 'fulfilled') return r.value;
    const msg = r.reason instanceof Error ? r.reason.message : 'unknown error';
    return {
      service: FETCHERS[i].service,
      status: 'error',
      display: '—',
      value: null,
      unit: null,
      detail: null,
      error: msg,
      latencyMs: 0,
    };
  });
  return { generatedAt: new Date().toISOString(), cachedAt: null, services };
}
