# Architecture - IdeaMill

Dokumentasi arsitektur teknis IdeaMill.

## 🏗️ High-Level Architecture

```
┌─────────────────┐
│   Browser UI    │
│  (Next.js App)  │
└────────┬────────┘
         │
         │ HTTP/JSON
         ▼
┌─────────────────────────────────┐
│     Next.js API Routes          │
│  - /api/upload                  │
│  - /api/generations             │
│  - /api/generations/[id]        │
└────────┬────────────────────────┘
         │
         ├─────────────────┬──────────────┐
         ▼                 ▼              ▼
┌──────────────┐  ┌─────────────┐  ┌──────────┐
│   Supabase   │  │   OpenAI    │  │  Gemini  │
│   Database   │  │   API       │  │   API    │
│  + Storage   │  │             │  │          │
│  + pgvector  │  │ - Vision    │  │ - Ideas  │
└──────────────┘  │ - Embedding │  │ - Script │
                  │ - Ideation  │  └──────────┘
                  │ - Scripting │
                  └─────────────┘
```

## 📊 Data Flow

### 1. Request Phase (Sync)

```
User Upload
    ↓
[POST /api/upload]
    ↓
Supabase Storage
    ↓ (returns signed URL)
[POST /api/generations]
    ↓
Create Generation record
    ↓
Trigger Worker (async)
    ↓
Return generationId
```

### 2. Processing Phase (Async Worker)

```
Worker picks up job
    ↓
L0: Vision Analysis (GPT-4o Vision)
    ├─ Product description → hash → productId
    └─ Model description → hash → modelId
    ↓ (10% progress)
L1: Ideation (GPT-4o/Gemini)
    └─ Generate 50 marketing angles
    ↓
L2: Embedding + Filtering
    ├─ Embed all 50 ideas (text-embedding-3-small)
    ├─ Query pgvector for duplicates
    ├─ Adaptive threshold (0.92 → 0.84)
    └─ Select 20 unique themes
    ↓ (35% progress)
L3: Script Generation
    ├─ For each theme: generate 5 scripts
    ├─ Parallel execution (p-limit: 4)
    └─ Validate with Zod schemas
    ↓ (75% progress)
L5: Visual Prompt Enrichment
    ├─ Chunk scripts (25 per batch)
    ├─ Add text_to_image prompts
    └─ Add image_to_video prompts
    ↓
Persist to Database
    ├─ Insert Scripts (100 rows)
    └─ Insert Scenes (~350 rows)
    ↓ (100% progress)
Status: succeeded ✓
```

### 3. Polling Phase

```
Browser polls /api/generations/:id
    ↓
Query Generation status
    ├─ If queued/running: return progress
    └─ If succeeded: return + paginated variations
    ↓
Display in UI
```

## 🗄️ Database Design

### Entity Relationship

```
Generations (1) ──▶ (N) Scripts ──▶ (N) Scenes
     │                                   │
     │                                   │
     │                             (3-4 per script)
     │
     └──▶ Products (N:1)
     └──▶ Models (N:1)

Ideas (memory pool)
     ├─ product_identifier
     ├─ idea_theme (text)
     └─ idea_vector (1536-dim)
```

### Indexes

1. **ideas_vec_idx**: IVFFLAT index for cosine similarity search
2. **ideas_prod_idx**: B-tree on product_identifier
3. **scripts_gen_idx**: B-tree on generation_id
4. **scenes_script_idx**: B-tree on script_id

### RPC Functions

#### `match_ideas()`

Semantic similarity search with adaptive scope:

```sql
match_ideas(
  query_vector: vector(1536),
  product_id: text,
  match_threshold: float,
  search_scope: 'product' | 'category' | 'global',
  top_k: int
)
```

Returns ideas above threshold sorted by similarity.

#### `get_generation_with_variations()`

Optimized fetch for generation + paginated variations with nested scenes:

```sql
get_generation_with_variations(
  gen_id: uuid,
  page_num: int,
  page_size: int
)
```

Returns JSONB with full hierarchical structure.

## 🔄 Worker Orchestration

### Concurrency Control

```typescript
import pLimit from 'p-limit';

const limit = pLimit(4); // Max 4 concurrent API calls

// Usage:
const results = await Promise.all(
  themes.map(theme => 
    limit(() => generateScript(theme))
  )
);
```

**Why 4?**
- OpenAI rate limit: ~10k requests/min
- Avoid 429 errors
- Balance speed vs stability

### Error Handling

```typescript
try {
  await runGeneration(id, payload);
} catch (error) {
  await updateGen(id, {
    status: 'failed',
    error: String(error)
  });
  // Log to monitoring system
}
```

### Retry Strategy

For transient errors (429, 500):
- Exponential backoff: 500ms, 1s, 2s, 4s, 8s
- Max 5 retries
- Jitter to avoid thundering herd

## 🎨 Frontend Architecture

### Component Hierarchy

```
app/
├─ layout.tsx (root)
├─ page.tsx (home)
│   └─ InputForm
└─ generations/[id]/
    └─ page.tsx
        ├─ JobStatus
        └─ ResultsDisplay
            └─ Tabs → Scenes
```

### State Management

Simple React hooks + fetch:
- No Redux/Zustand needed
- SWR for polling (future enhancement)
- Local state for UI interactions

### API Client Pattern

```typescript
// Fetch wrapper with error handling
async function apiCall(endpoint: string, options?: RequestInit) {
  const res = await fetch(endpoint, options);
  if (!res.ok) {
    throw new Error(`API error: ${res.status}`);
  }
  return res.json();
}
```

## 🔐 Security

### API Key Protection

- **Server-side only**: Service role key never exposed to client
- **Client uses**: Anonymous key + RLS policies
- **Signed URLs**: Time-limited access to storage

### RLS Policies

```sql
-- Example: User can only see own generations
CREATE POLICY gen_tenant_isolation 
  ON Generations FOR SELECT
  USING (tenant_id = auth.uid());
```

### Input Validation

All requests validated with Zod:

```typescript
const schema = z.object({
  productImageUrl: z.string().url(),
  basicIdea: z.string().min(10),
  engine: z.enum(['gpt-4o', 'gemini-1.5-pro'])
});

schema.parse(request.body); // Throws if invalid
```

## 📈 Scalability Considerations

### Horizontal Scaling

- **Web tier**: Stateless Next.js → scale with load balancer
- **Worker tier**: Multiple workers consume from queue
- **Database**: Supabase auto-scales; consider read replicas

### Vertical Scaling

- **Database**: Upgrade Supabase plan for more connections
- **Worker**: Increase memory/CPU for faster processing

### Bottlenecks

1. **OpenAI rate limits**: Most critical; solved with queuing
2. **Database writes**: Batch inserts help; ~100 scripts + ~350 scenes per job
3. **pgvector query**: IVFFLAT index; tune `lists` parameter

## 🧪 Testing Strategy

### Unit Tests

```typescript
// Example: Test vector similarity
describe('cosineSimilarity', () => {
  it('should return 1 for identical vectors', () => {
    const v = [1, 0, 0];
    expect(cosineSimilarity(v, v)).toBe(1);
  });
});
```

### Integration Tests

Mock external APIs:
```typescript
jest.mock('../lib/adapters/openai', () => ({
  visionDescribeProduct: jest.fn(() => Promise.resolve(mockProduct))
}));
```

### End-to-End Tests

Use Playwright/Cypress:
```typescript
test('full generation flow', async ({ page }) => {
  await page.goto('/');
  await page.setInputFiles('input[type=file]', 'test.jpg');
  await page.fill('textarea', 'Test idea');
  await page.click('button[type=submit]');
  await expect(page).toHaveURL(/\/generations\/.+/);
});
```

## 📊 Observability

### Metrics to Track

1. **Request latency** (P50, P90, P99)
2. **API call counts** (by model, by step)
3. **Error rates** (by type: 4xx, 5xx, timeout)
4. **Cost per generation** (OpenAI tokens used)
5. **Uniqueness score** (avg similarity of selected themes)

### Logging

Structured logging with context:

```typescript
console.log({
  level: 'info',
  generationId: id,
  step: 'L2-embed',
  tokensUsed: 1500,
  latencyMs: 234
});
```

### Alerting

- Error rate > 5% for 5 minutes
- P95 latency > 10 minutes
- Queue depth > 50 jobs

## 🚀 Deployment

### Environment-specific Configs

| Environment | Worker | Queue | Database |
|-------------|--------|-------|----------|
| Development | In-process | None | Supabase Dev |
| Staging | BullMQ | Redis | Supabase Staging |
| Production | BullMQ | Redis Cluster | Supabase Pro |

### Blue-Green Deployment

1. Deploy new version (green)
2. Route 10% traffic to green
3. Monitor errors/latency
4. Gradually increase to 100%
5. Decommission blue

## 🔮 Future Enhancements

1. **Streaming responses**: Server-sent events for real-time progress
2. **Cost optimization**: Cache embeddings, reuse similar products
3. **Multi-language**: Support English, Spanish, etc.
4. **Fine-tuning**: Custom model for brand-specific style
5. **A/B testing**: Rank variations by predicted performance

---

Last updated: November 2025

