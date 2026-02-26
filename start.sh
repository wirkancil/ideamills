#!/bin/bash
# IdeaMill Simple Start Script

echo "🚀 Starting IdeaMill..."
echo ""

# Check if .env.local exists
if [ ! -f ".env.local" ]; then
    echo "⚠️  .env.local not found. Creating template..."
    cp .env.example .env.local 2>/dev/null || echo "NEXT_PUBLIC_SUPABASE_URL=\nSUPABASE_SERVICE_ROLE_KEY=\nNEXT_PUBLIC_GOOGLE_AI_KEY=\nOPENAI_API_KEY=" > .env.local
    echo "📝 Please edit .env.local with your credentials"
    exit 1
fi

# Ensure local directories exist for MongoDB
mkdir -p mongodb-data logs

# Start local MongoDB
echo "🍃 Starting local MongoDB..."
mongod --dbpath ./mongodb-data --logpath ./logs/mongo.log --port 27017 --bind_ip 127.0.0.1 &
MONGO_PID=$!

# Wait a bit for Mongo to start
sleep 3

# Start development server
echo "🔧 Starting development server (Network Accessible)..."
echo "   - Port: 3000"
echo "   - Local IPs:"
ifconfig | grep "inet " | grep -v 127.0.0.1 | awk '{print "     👉 http://" $2 ":3000"}'
npm run dev -- -H 0.0.0.0 -p 3000 &
DEV_PID=$!

# Wait a bit for dev server to start
sleep 3

# Start simple worker
echo "🔄 Starting simple worker..."
npm run worker &
WORKER_PID=$!

echo ""
echo "✅ IdeaMill is running!"
echo "   • MongoDB: localhost:27017 (Local Data)"
echo "   • Dev server: http://localhost:3000"
echo "   • Worker: Auto-processing jobs"
echo ""
echo "Press Ctrl+C to stop all services"

# Trap Ctrl+C to kill all processes
trap "echo ''; echo '🛑 Stopping services...'; kill $DEV_PID $WORKER_PID $MONGO_PID 2>/dev/null; exit" INT

# Wait for processes
wait
