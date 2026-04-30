#!/bin/bash
# IdeaMill Start Script
# Stops existing processes (mongod, next dev, worker) lalu start ulang fresh.

set -e

echo "🚀 Starting IdeaMill..."
echo ""

# ------------------------------------------------------------
# 1. Pre-flight check — pastikan .env.local ada dan critical vars ter-set
# ------------------------------------------------------------

if [ ! -f ".env.local" ]; then
    echo "⚠️  .env.local tidak ditemukan. Membuat template minimal..."
    cat > .env.local <<'EOF'
# MongoDB
MONGODB_URI=mongodb://localhost:27017
MONGODB_DB=ideamills
MONGODB_BUCKET=images

# OpenRouter (LLM provider — chat completions, vision, ideation, expand)
OPENROUTER_API_KEY=
OPENROUTER_REFERER=https://ideamills.app

# useapi.net (image generation via Imagen + video generation via Veo Google Flow)
USEAPI_TOKEN=
USEAPI_GOOGLE_EMAIL=

# Storage path (default ./storage relative to project root)
# STORAGE_PATH=./storage
EOF
    echo "📝 Edit .env.local dengan credentials Anda, lalu jalankan ulang script ini."
    exit 1
fi

# Validate critical env vars
missing=()
for var in MONGODB_URI OPENROUTER_API_KEY USEAPI_TOKEN USEAPI_GOOGLE_EMAIL; do
    val=$(grep "^${var}=" .env.local | cut -d= -f2- | tr -d '"' | tr -d "'" | xargs)
    if [ -z "$val" ]; then
        missing+=("$var")
    fi
done

if [ ${#missing[@]} -gt 0 ]; then
    echo "❌ Critical env vars belum di-set di .env.local:"
    for v in "${missing[@]}"; do
        echo "   • $v"
    done
    echo ""
    echo "Edit .env.local dan lengkapi vars di atas sebelum lanjut."
    exit 1
fi

# ------------------------------------------------------------
# 2. Stop existing processes (kalau ada)
# ------------------------------------------------------------

echo "🛑 Stopping existing processes (kalau ada)..."

# Kill worker (tsx worker/poll.ts)
WORKER_PIDS=$(pgrep -f "tsx.*worker/poll" 2>/dev/null || true)
if [ -n "$WORKER_PIDS" ]; then
    echo "   • Killing worker PIDs: $WORKER_PIDS"
    kill $WORKER_PIDS 2>/dev/null || true
    sleep 1
fi

# Kill next dev server
NEXT_PIDS=$(pgrep -f "next-server\|next dev" 2>/dev/null || true)
if [ -n "$NEXT_PIDS" ]; then
    echo "   • Killing Next.js PIDs: $NEXT_PIDS"
    kill $NEXT_PIDS 2>/dev/null || true
    sleep 1
fi

# Kill local mongod (only if listening on our port)
MONGO_PIDS=$(pgrep -f "mongod.*--port 27017" 2>/dev/null || true)
if [ -n "$MONGO_PIDS" ]; then
    echo "   • Killing local MongoDB PIDs: $MONGO_PIDS"
    kill $MONGO_PIDS 2>/dev/null || true
    sleep 1
fi

echo "   ✅ Cleanup selesai"
echo ""

# ------------------------------------------------------------
# 3. Start services
# ------------------------------------------------------------

mkdir -p mongodb-data logs storage/images storage/videos

echo "🍃 Starting local MongoDB..."
mongod --dbpath ./mongodb-data --logpath ./logs/mongo.log --port 27017 --bind_ip 127.0.0.1 &
MONGO_PID=$!
sleep 3

echo "🔧 Starting development server (Network Accessible)..."
echo "   • Port: 3000"
echo "   • Local IPs:"
ifconfig | grep "inet " | grep -v 127.0.0.1 | awk '{print "     👉 http://" $2 ":3000"}'
npm run dev -- -H 0.0.0.0 -p 3000 &
DEV_PID=$!
sleep 3

echo "🔄 Starting worker..."
npm run worker &
WORKER_PID=$!

echo ""
echo "✅ IdeaMills is running!"
echo "   • MongoDB:    localhost:27017"
echo "   • Dev server: http://localhost:3000"
echo "   • Worker:     auto-processing jobs"
echo ""
echo "Press Ctrl+C untuk stop semua services"

# Trap Ctrl+C — kill semua child processes
trap "echo ''; echo '🛑 Stopping services...'; kill $DEV_PID $WORKER_PID $MONGO_PID 2>/dev/null; exit" INT

wait
