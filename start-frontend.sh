#!/bin/bash
# ─────────────────────────────────────────────────────────────
# Start ONLY the React frontend application (Port 3000)
# ─────────────────────────────────────────────────────────────
ROOT="$(cd "$(dirname "$0")" && pwd)"
echo "Starting React frontend on http://localhost:3000..."
cd "$ROOT/frontend"
npm start
