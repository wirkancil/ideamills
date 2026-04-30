import { MongoClient } from 'mongodb';

const mongoUri = process.env.MONGODB_URI;

if (!mongoUri) {
  throw new Error('MONGODB_URI is not set');
}

declare global {
  var mongoClientPromise: Promise<MongoClient> | undefined;
}

const clientPromise = global.mongoClientPromise ?? new MongoClient(mongoUri).connect();

global.mongoClientPromise = clientPromise;

export async function getDb() {
  const client = await clientPromise;
  const dbName = process.env.MONGODB_DB || 'ideamills';
  return client.db(dbName);
}

export async function closeDb() {
  if (global.mongoClientPromise) {
    const client = await global.mongoClientPromise;
    await client.close();
    global.mongoClientPromise = undefined;
  }
}

export async function ensureIndexes() {
  const db = await getDb();
  await Promise.all([
    // LLM usage tracking
    db.collection('llm_usage').createIndex({ jobId: 1, createdAt: -1 }),
    db.collection('llm_usage').createIndex({ layer: 1, model: 1 }),
    // Generations
    db.collection('Generations').createIndex({ status: 1, created_at: -1 }),
    db.collection('Generations').createIndex({ idempotency_key: 1 }, { unique: true, sparse: true }),
    db.collection('Generations').createIndex({ format_version: 1 }),
    // Job queue
    db.collection('JobQueue').createIndex({ status: 1, scheduled_at: 1 }),
    db.collection('JobQueue').createIndex({ generation_id: 1 }),
    // Rate limiter buckets
    db.collection('llm_rate_limits').createIndex({ key: 1 }, { unique: true }),
    // Worker stats for ETA calculation
    db.collection('worker_stats').createIndex({ completed_at: -1 }),
    // Script Library
    db.collection('ScriptLibrary').createIndex({ updated_at: -1 }),
    db.collection('ScriptLibrary').createIndex({ tags: 1 }),
    db.collection('ScriptLibrary').createIndex({ title: 'text' }),
  ]);
}
