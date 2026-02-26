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
