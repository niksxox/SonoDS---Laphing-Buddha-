#!/bin/bash
# ─────────────────────────────────────────────────────────────
# Start ONLY the Express static file server (Port 3001)
# ─────────────────────────────────────────────────────────────
ROOT="$(cd "$(dirname "$0")" && pwd)"
echo "Starting Express static server on http://localhost:3001..."
cd "$ROOT/backend/express"
node server.js
