#!/bin/bash

# Script to start the RFQ Aggregator locally (Backend + Frontend)

echo "🚀 Starting Options RFQ Aggregator (Improved)..."

# 1. Start Backend
echo "📡 Launching FastAPI Backend on :8001..."
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8001 &
BACKEND_PID=$!

# 2. Start Frontend
echo "💻 Launching Next.js Frontend on :3000..."
cd ../frontend
npm install
npm run dev &
FRONTEND_PID=$!

function cleanup {
  echo "🛑 Shutting down..."
  kill $BACKEND_PID
  kill $FRONTEND_PID
}

trap cleanup EXIT

echo "✅ System running!"
echo "Dashboard: http://localhost:3000"
echo "Backend: http://localhost:8001"

wait
