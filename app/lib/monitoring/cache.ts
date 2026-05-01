import type { MonitoringSnapshot } from './types';
import { buildSnapshot } from './aggregator';

const TTL_MS = 30_000;

let cached: MonitoringSnapshot | null = null;
let cachedAt: number | null = null;

export async function getCachedSnapshot(force = false): Promise<MonitoringSnapshot> {
  const now = Date.now();
  if (!force && cached && cachedAt !== null && now - cachedAt < TTL_MS) {
    return { ...cached, cachedAt: new Date(cachedAt).toISOString() };
  }
  const snap = await buildSnapshot();
  cached = snap;
  cachedAt = now;
  return snap;
}
