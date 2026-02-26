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
3.  Start the services (MongoDB + Next.js + Worker):
    ```bash
    ./start.sh
    ```

