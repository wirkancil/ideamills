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
