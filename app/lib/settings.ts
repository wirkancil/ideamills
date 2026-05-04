import { getDb } from './mongoClient';

export async function getSetting(key: string): Promise<string | null> {
  const db = await getDb();
  const doc = await db.collection('Settings').findOne({ key });
  return doc?.value ?? null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  const db = await getDb();
  await db.collection('Settings').updateOne(
    { key },
    { $set: { key, value, updated_at: new Date() } },
    { upsert: true }
  );
}
