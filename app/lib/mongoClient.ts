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
    // Job queue — composite index for per-type dequeue
    db.collection('JobQueue').createIndex({ status: 1, job_type: 1, scheduled_at: 1 }),
    db.collection('JobQueue').createIndex({ status: 1, scheduled_at: 1 }),
    db.collection('JobQueue').createIndex({ generation_id: 1 }),
    // Scripts
    db.collection('Scripts').createIndex({ generation_id: 1 }),
    db.collection('Scripts').createIndex({ generation_id: 1, idx: 1 }),
    // Scenes
    db.collection('Scenes').createIndex({ script_id: 1 }),
    db.collection('Scenes').createIndex({ script_id: 1, order: 1 }),
    // Ideas
    db.collection('Ideas').createIndex({ generation_id: 1 }),
    // Products & Models (upserted by worker)
    db.collection('Products').createIndex({ product_identifier: 1 }, { unique: true }),
    db.collection('Models').createIndex({ model_identifier: 1 }, { unique: true }),
    // Rate limiter buckets
    db.collection('llm_rate_limits').createIndex({ key: 1 }, { unique: true }),
    // Worker stats for ETA calculation
    db.collection('worker_stats').createIndex({ job_type: 1, completed_at: -1 }),
  ]);
}
