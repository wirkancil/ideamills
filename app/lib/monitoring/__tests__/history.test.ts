import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../exchange', () => ({
  fetchUsdToIdr: vi.fn(),
}));

vi.mock('@/app/lib/mongoClient', () => ({
  getDb: vi.fn(),
}));

const makeDb = (llmDocs: object[], assetDocs: object[], genDocs: object[]) => ({
  collection: vi.fn((name: string) => {
    if (name === 'llm_usage') return {
      aggregate: vi.fn().mockReturnValue({ toArray: async () => llmDocs }),
    };
    if (name === 'asset_usage') return {
      aggregate: vi.fn().mockReturnValue({ toArray: async () => assetDocs }),
    };
    if (name === 'Generations') return {
      find: vi.fn().mockReturnValue({ toArray: async () => genDocs }),
    };
    return {};
  }),
});

describe('buildHistorySnapshot', () => {
  beforeEach(async () => {
    vi.resetAllMocks();
    const { fetchUsdToIdr } = await import('../exchange');
    (fetchUsdToIdr as ReturnType<typeof vi.fn>).mockResolvedValue({ rate: 16000, updatedAt: '2026-05-01' });
  });
  afterEach(() => vi.useRealTimers());

  it('returns empty rows and zero summary when no generations', async () => {
    const { getDb } = await import('@/app/lib/mongoClient');
    (getDb as ReturnType<typeof vi.fn>).mockResolvedValue(makeDb([], [], []));

    const { buildHistorySnapshot } = await import('../history');
    const snap = await buildHistorySnapshot();

    expect(snap.rows).toHaveLength(0);
    expect(snap.summary.todayIdr).toBe(0);
    expect(snap.summary.allTimeIdr).toBe(0);
    expect(snap.exchangeRate.usdToIdr).toBe(16000);
  });

  it('combines llm + asset costs and converts to IDR', async () => {
    const { getDb } = await import('@/app/lib/mongoClient');
    const genDocs = [{
      _id: 'gen1',
      product_identifier: 'Product A',
      createdAt: new Date('2026-05-01T10:00:00Z'),
      clips: [{ clipIndex: 0 }, { clipIndex: 1 }],
    }];
    const llmDocs = [{ _id: 'gen1', totalLlmCostUsd: 0.05 }];
    const assetDocs = [{ _id: 'gen1', totalAssetCostUsd: 0.05 }]; // 10 credits × $0.005

    (getDb as ReturnType<typeof vi.fn>).mockResolvedValue(makeDb(llmDocs, assetDocs, genDocs));

    const { buildHistorySnapshot } = await import('../history');
    const snap = await buildHistorySnapshot();

    expect(snap.rows).toHaveLength(1);
    const row = snap.rows[0];
    expect(row.generationId).toBe('gen1');
    expect(row.llmCostUsd).toBe(0.05);
    expect(row.assetCostUsd).toBe(0.05);
    expect(row.totalCostUsd).toBeCloseTo(0.10);
    expect(row.totalCostIdr).toBeCloseTo(0.10 * 16000);
    expect(row.clipCount).toBe(2);
  });

  it('summary todayIdr only counts rows from today', async () => {
    vi.setSystemTime(new Date('2026-05-01T12:00:00Z'));

    const { getDb } = await import('@/app/lib/mongoClient');
    const today = new Date('2026-05-01T08:00:00Z');
    const yesterday = new Date('2026-04-30T08:00:00Z');
    const genDocs = [
      { _id: 'gen1', product_identifier: 'A', createdAt: today, clips: [{}] },
      { _id: 'gen2', product_identifier: 'B', createdAt: yesterday, clips: [{}] },
    ];
    const llmDocs = [
      { _id: 'gen1', totalLlmCostUsd: 0.01 },
      { _id: 'gen2', totalLlmCostUsd: 0.01 },
    ];
    const assetDocs = [
      { _id: 'gen1', totalAssetCostUsd: 0.05 },
      { _id: 'gen2', totalAssetCostUsd: 0.05 },
    ];

    (getDb as ReturnType<typeof vi.fn>).mockResolvedValue(makeDb(llmDocs, assetDocs, genDocs));

    const { buildHistorySnapshot } = await import('../history');
    const snap = await buildHistorySnapshot();

    // gen1 today: (0.01 + 0.05) * 16000 = 960; gen2 yesterday
    expect(snap.summary.todayIdr).toBeCloseTo(0.06 * 16000);
    expect(snap.summary.allTimeIdr).toBeCloseTo(0.12 * 16000);
  });
});
