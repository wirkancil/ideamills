# IdeaMills Environment Variables Documentation

This project uses environment variables to configure external services (OpenAI, Gemini, MongoDB, etc.).

**IMPORTANT:**
*   **DO NOT** commit `.env` or `.env.local` files to the repository.
*   Create a `.env.local` file in the root directory based on the template below.
*   Get the actual API keys from the project administrator or respective service dashboards.

## Required Variables

Create a file named `.env.local` and fill in the following values:

```bash
# ===================================
# OpenAI Configuration (REQUIRED)
# ===================================
# Get from: https://platform.openai.com/api-keys
OPENAI_API_KEY=sk-...
OPENAI_EMBED_MODEL=text-embedding-3-small

# ===================================
# Google Gemini Configuration (OPTIONAL)
# ===================================
# Get from: https://aistudio.google.com/app/apikey
GEMINI_API_KEY=AIza...

# ===================================
# Supabase Configuration (DEPRECATED - MIGRATED TO MONGODB)
# ===================================
# Kept for legacy reference if needed, but project now uses MongoDB
NEXT_PUBLIC_SUPABASE_URL=https://...
SUPABASE_SERVICE_ROLE_KEY=...
SUPABASE_ANON_KEY=...
SUPABASE_STORAGE_BUCKET=ideamill

# ===================================
# Database Configuration (REQUIRED)
# ===================================
# Local MongoDB instance (run via ./start.sh)
MONGODB_URI=mongodb://localhost:27017/ideamills

# ===================================
# Queue Configuration
# ===================================
# Redis is optional as we use MongoDB for queueing now
REDIS_URL=redis://localhost:6379
QUEUE_CONCURRENCY=4
```

## How to Set Up

1.  Copy the example above into a new file named `.env.local`.
2.  Replace the placeholder values (`sk-...`, `AIza...`) with real credentials.
3.  Run the development server:
    ```bash
    npm run dev
    ```
