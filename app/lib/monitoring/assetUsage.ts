import { getDb } from '@/app/lib/mongoClient';
import type { AssetUsageEntry } from './types';

export async function logAssetUsage(entry: AssetUsageEntry): Promise<void> {
  try {
    const db = await getDb();
    await db.collection('asset_usage').insertOne(entry);
  } catch (err) {
    console.warn('[asset] failed to log usage:', (err as Error).message);
  }
}
