import { getDb } from '../mongoClient';

const ACQUIRE_POLL_MS = 200;
const ACQUIRE_TIMEOUT_MS = 5 * 60 * 1000; // give up after 5 min (LLM calls are long)

/**
 * Acquire one token from a named bucket. Blocks until a token is available.
 * All worker processes share the same MongoDB bucket — true distributed semaphore.
 */
export async function acquireToken(key: string, capacity: number): Promise<void> {
  const db = await getDb();
  const col = db.collection('llm_rate_limits');
  const deadline = Date.now() + ACQUIRE_TIMEOUT_MS;

  // Ensure bucket exists (upsert, never reduce existing tokens)
  await col.updateOne(
    { key },
    {
      $setOnInsert: { key, tokens: capacity, capacity, created_at: new Date() },
    },
    { upsert: true }
  );

  while (Date.now() < deadline) {
    // Atomic decrement — only succeeds when tokens > 0
    const result = await col.findOneAndUpdate(
      { key, tokens: { $gt: 0 } },
      { $inc: { tokens: -1 } },
      { returnDocument: 'after' }
    );

    if (result) return; // token acquired

    // No token available — wait and retry
    await sleep(ACQUIRE_POLL_MS);
  }

  throw new Error(`Rate limiter timeout: could not acquire token for "${key}" within ${ACQUIRE_TIMEOUT_MS}ms`);
}

/**
 * Release one token back to the bucket (capped at capacity).
 */
export async function releaseToken(key: string): Promise<void> {
  const db = await getDb();
  // Increment but never exceed capacity
  await db.collection('llm_rate_limits').findOneAndUpdate(
    { key },
    [
      {
        $set: {
          tokens: {
            $min: ['$capacity', { $add: ['$tokens', 1] }],
          },
        },
      },
    ]
  );
}

/**
 * Pre-register a bucket at startup so capacity is set correctly.
 * Safe to call multiple times — only sets capacity if the doc is being inserted.
 */
export async function initBucket(key: string, capacity: number): Promise<void> {
  const db = await getDb();
  await db.collection('llm_rate_limits').updateOne(
    { key },
    {
      $setOnInsert: { key, tokens: capacity, capacity, created_at: new Date() },
      $set: { capacity }, // always keep capacity field in sync
    },
    { upsert: true }
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
