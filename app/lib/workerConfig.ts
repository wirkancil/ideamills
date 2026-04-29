// Centralised worker concurrency constants.
// Referenced by both the worker process (poll.ts) and API routes (queue position, health).

export const STANDARD_CONCURRENCY = 2;   // heavy vision pipeline jobs (each calls ~8 LLMs in parallel)
export const STRUCTURED_CONCURRENCY = 6; // lightweight creativeIdea pipeline jobs (~3 LLMs in parallel)
export const MAX_TOTAL_CONCURRENCY = STANDARD_CONCURRENCY + STRUCTURED_CONCURRENCY;
export const MAX_QUEUE_DEPTH = 50;       // max pending jobs across all types before rejecting new submissions

// Pipeline constants used in runGeneration.ts
export const IDEATION_POOL_SIZE = 50;   // number of candidate ideas generated before embedding filter
export const UNIQUE_THEME_TARGET = 20;  // target unique themes after cosine dedup (similarity > 0.96)
export const SIMILARITY_THRESHOLD = 0.96; // cosine distance above which two themes are considered duplicates
export const SCRIPTS_PER_THEME = 5;    // llm.script5 generates ~5 scripts per theme
export const VISUAL_PROMPT_CHUNK = 25; // scripts per enrichVisualPrompts call (token budget ~12k)
export const SCENE_CHUNK_SIZE = 100;   // max scenes per MongoDB insertMany call
