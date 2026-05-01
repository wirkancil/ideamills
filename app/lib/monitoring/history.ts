import { getDb } from '../mongoClient';
import { fetchUsdToIdr } from './exchange';
import type { GenerationCostRow, HistorySnapshot } from './types';

export async function buildHistorySnapshot(): Promise<HistorySnapshot> {
  const [db, { rate: usdToIdr, updatedAt: rateUpdatedAt }] = await Promise.all([
    getDb(),
    fetchUsdToIdr(),
  ]);

  const [genDocs, llmAgg, assetAgg] = await Promise.all([
    db.collection('Generations').find({}, {
      projection: { _id: 1, product_identifier: 1, created_at: 1, createdAt: 1, clips: 1, source: 1 },
    }).toArray(),

    db.collection('llm_usage').aggregate([
      { $match: { generationId: { $ne: null, $exists: true }, costUsd: { $ne: null } } },
      { $group: { _id: '$generationId', totalLlmCostUsd: { $sum: '$costUsd' } } },
    ]).toArray(),

    db.collection('asset_usage').aggregate([
      { $group: { _id: '$generationId', totalAssetCostUsd: { $sum: '$costUsd' } } },
    ]).toArray(),
  ]);

  const llmMap = new Map<string, number>(
    llmAgg.map((d) => [String(d._id), d.totalLlmCostUsd ?? 0]),
  );

  const assetMap = new Map<string, number>(
    assetAgg.map((d) => [String(d._id), d.totalAssetCostUsd ?? 0]),
  );

  const todayPrefix = new Date().toISOString().slice(0, 10);
  let todayIdr = 0;
  let sevenDaysIdr = 0;
  let allTimeIdr = 0;
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

  const rows: GenerationCostRow[] = genDocs.map((gen) => {
    const id = String(gen._id);
    const llmCostUsd = llmMap.get(id) ?? 0;
    const assetCostUsd = assetMap.get(id) ?? 0;
    const totalCostUsd = llmCostUsd + assetCostUsd;
    const totalCostIdr = Math.round(totalCostUsd * usdToIdr);
    const clipCount = Array.isArray(gen.clips) ? gen.clips.length : 0;
    const costPerClipIdr = clipCount > 0 ? Math.round(totalCostIdr / clipCount) : 0;
    const createdAt: Date = gen.created_at ?? gen.createdAt ?? new Date(0);
    const createdAtStr = createdAt instanceof Date ? createdAt.toISOString() : String(createdAt);

    allTimeIdr += totalCostIdr;
    if (createdAtStr.startsWith(todayPrefix)) todayIdr += totalCostIdr;
    if (createdAt instanceof Date && createdAt.getTime() >= sevenDaysAgo) sevenDaysIdr += totalCostIdr;

    return {
      generationId: id,
      productIdentifier: gen.product_identifier ?? 'Unknown',
      source: (gen.source as 'quick' | 'studio') ?? null,
      createdAt: createdAtStr,
      clipCount,
      llmCostUsd,
      assetCostUsd,
      totalCostUsd,
      totalCostIdr,
      costPerClipIdr,
    };
  });

  rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return {
    rows,
    summary: { todayIdr, sevenDaysIdr, allTimeIdr },
    exchangeRate: { usdToIdr, source: 'frankfurter.app', updatedAt: rateUpdatedAt },
    generatedAt: new Date().toISOString(),
  };
}
