# Technical Specifications: IdeaMills

**Version**: 1.0.0
**Date**: 2026-02-26
**Status**: Active Development

## 1. System Overview

IdeaMills is a Next.js-based AI creative platform designed to automate the pre-production workflow for video marketing. It leverages Large Language Models (LLMs) for creative ideation and scriptwriting, and Image Generation Models for visual storyboarding.

The system is architected as a **monorepo** containing both the web application (Next.js) and a background worker (Node.js/TypeScript), sharing a common MongoDB database.

---

## 2. Technology Stack

### 2.1 Core Framework
*   **Frontend/Backend**: Next.js 15 (App Router)
*   **Language**: TypeScript (Strict Mode)
*   **Runtime**: Node.js (v18+)
*   **Styling**: Tailwind CSS, Lucide React icons, shadcn/ui components.

### 2.2 Database & Storage
*   **Primary DB**: MongoDB (v6+)
    *   **Collections**: `Generations`, `Products`, `Models`, `JobQueue`.
*   **File Storage**: MongoDB GridFS (for storing generated images and assets locally).

### 2.3 AI Services (Adapters)
*   **LLM (Logic & Text)**:
    *   **OpenAI**: `gpt-5.2` (Custom internal model ID) / `gpt-4o`
    *   **Google**: `gemini-2.5-flash`
*   **Image Generation**:
    *   **OpenAI**: DALL-E 3 (via API)
*   **Vision/Analysis**:
    *   **OpenAI**: GPT-4 Vision (for product image analysis)

---

## 3. Detailed Data Flow

### 3.1 Phase 1: Input & Asset Ingestion

**User Action**: User fills `InputForm.tsx` and optionally uploads images.

1.  **Image Upload (`/api/upload`)**:
    *   **Input**: `FormData` containing image file.
    *   **Process**:
        *   Validates file type (JPG/PNG) and size.
        *   Converts to Buffer.
        *   Streams to **MongoDB GridFS**.
    *   **Output**: Returns a signed/accessible URL (e.g., `/api/images/{id}`).

2.  **Image Analysis (`/api/analyze-images`)**:
    *   **Input**: Image URL from step 1.
    *   **Process**:
        *   Calls OpenAI Vision API.
        *   Extracts: Brand, Category, Form Factor, Color Scheme, Target Audience.
    *   **Output**: JSON object pre-filling the form fields.

3.  **Creative Ideation (`/api/generate-creative-ideas`)**:
    *   **Input**: Product Context, Target Audience, Platform.
    *   **Process**:
        *   LLM Prompting: Generates 3 distinct angles (e.g., "Emotional", "Feature-led", "Trend-based").
    *   **Output**: List of `basicIdea` objects.

### 3.2 Phase 2: Job Dispatch & Queueing

**User Action**: User selects an idea and clicks "Generate".

1.  **Job Submission (`/api/generations`)**:
    *   **Payload**: `GenerationRequest` (Product details, selected idea, images, engine preference).
    *   **Validation**: Zod schema check.
    *   **Idempotency**: Generates `idempotency_key` (hash of payload) to prevent duplicate jobs.
    *   **DB Insert**: Creates `Generations` document with status `queued`.
    *   **Queue Insert**: Adds entry to `JobQueue` collection.

### 3.3 Phase 3: Background Worker Execution

**Process**: `worker/poll.ts` (Continuous Loop)

1.  **Polling Strategy**:
    *   Interval: 2000ms (2s).
    *   Concurrency: Max 4 active jobs.
    *   Mechanism: `findOneAndUpdate` on `JobQueue` to atomically lock a job (`status: processing`).

2.  **Execution Logic (`worker/runGeneration.ts`)**:

    *   **Step A: Context Enrichment**:
        *   If product images exist, re-analyzes them using Vision API to get "Cinematographer's Notes" (lighting, texture).
        *   Updates `Products` and `Models` collections with this metadata.

    *   **Step B: Director's Script Generation**:
        *   **Model**: GPT-5.2 / GPT-4o.
        *   **Prompt**: Complex system prompt requiring a JSON response.
        *   **Output Structure**:
            *   `general_tone_mood`
            *   `timeline_breakdown`: Array of 30s split into 3s chunks (0-3s, 3-6s, etc.).
            *   **Narrative Arc**: Hook -> Problem -> Solution -> CTA.
            *   **Fields per chunk**: `visual`, `audio_dialogue`, `text_overlay`, `transition`.

    *   **Step C: Storyboard Prompt Engineering**:
        *   Parses the `timeline_breakdown`.
        *   For each key scene (Hook, Solution, CTA), constructs a DALL-E 3 optimized prompt.
        *   **Optimization**: Injects `product_description` (visual anchors) + `style_preset` + `lighting_notes`.

    *   **Step D: Parallel Image Generation**:
        *   **Tool**: `p-limit` (concurrency limit: 8).
        *   **Action**: Calls DALL-E 3 API for all scenes in parallel.
        *   **Fallback**: If generation fails, retries up to 3 times.

    *   **Step E: Asset Persistence**:
        *   Downloads generated images from OpenAI URL (temporary).
        *   Uploads to **MongoDB GridFS** (permanent).
        *   Updates `scenes[i].text_to_image` with local GridFS URL.

    *   **Step F: Finalization**:
        *   Updates `Generations` document: `status: succeeded`, `progress: 100`.
        *   Removes job from `JobQueue`.

### 3.4 Phase 4: Delivery

1.  **Status Polling (`/api/generations/[id]`)**:
    *   Frontend polls every 3-5s.
    *   Returns progress % and current status.

2.  **Rendering**:
    *   `GenerationView`: Displays the "Director's Script" alongside generated Storyboard images.
    *   Images are served via `/api/images/[id]` which streams from GridFS.

---

## 4. Database Schema (Key Collections)

### 4.1 Generations
```json
{
  "_id": "ObjectId",
  "idempotency_key": "string (hash)",
  "status": "queued | processing | succeeded | failed",
  "product_identifier": "string",
  "engine": "gpt-5.2 | gemini-2.5-flash",
  "product_image_url": "string",
  "variations": [
    {
      "id": "var_001",
      "theme": "string",
      "directors_script": {
        "timeline_breakdown": [...]
      },
      "scenes": [
        {
          "struktur": "Hook",
          "visual_idea": "...",
          "text_to_image": "gridfs_url_..."
        }
      ]
    }
  ],
  "created_at": "ISODate"
}
```

### 4.2 JobQueue
```json
{
  "_id": "ObjectId",
  "generation_id": "string",
  "payload": "object",
  "status": "pending | processing | failed",
  "created_at": "ISODate",
  "locked_at": "ISODate"
}
```

---

## 5. Security & Performance

*   **Environment Variables**: Managed via `.env.local` (API Keys not committed).
*   **Rate Limiting**: Worker concurrency limits (Max 4) prevent hitting OpenAI rate limits.
*   **Image Optimization**: Sharp (if needed) for resizing before GridFS storage.
*   **Network**:
    *   Dev server binds to `0.0.0.0` for LAN access.
    *   `next.config.js` allows specific `allowedDevOrigins` for cross-device testing.

## 6. Future Roadmap (To-Be)
*   **Video Generation**: Integration with Luma/Runway APIs using the generated images as keyframes.
*   **Auth**: Adding NextAuth for user management.
*   **SaaS Features**: Credit system and billing.
