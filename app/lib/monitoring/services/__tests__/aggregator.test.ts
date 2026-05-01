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
