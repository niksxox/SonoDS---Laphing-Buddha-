#!/bin/bash
# ─────────────────────────────────────────────────────────────
# SonoDS — Start All Servers
# Run from project root: ./start.sh
# Ctrl+C to stop everything
# ─────────────────────────────────────────────────────────────

set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"

echo ""
echo "  ╔══════════════════════════════════════╗"
echo "  ║        SONODS — Starting Up          ║"
echo "  ╚══════════════════════════════════════╝"
echo ""

# ── 0. Build plugins if not already built ──
if [ ! -d "$ROOT/PlugInEffects/sonods-eq/apps/demo/dist" ]; then
  echo "  [0/3] Building SonoDS Plugins..."
  (cd "$ROOT/PlugInEffects/sonods-eq" && pnpm --filter @sonods/demo build) >/dev/null 2>&1
  (cd "$ROOT/PlugInEffects/sonods-compressor" && pnpm --filter @sonods/compressor-demo build) >/dev/null 2>&1
  (cd "$ROOT/PlugInEffects/sonods-saturator" && pnpm --filter @sonods/saturator-demo build) >/dev/null 2>&1
  (cd "$ROOT/PlugInEffects/sonods-gate" && pnpm --filter @sonods/gate-demo build) >/dev/null 2>&1
fi

# ── 1. Express static file server (port 3001) ──
echo "  [1/3] Starting Express server (port 3001)..."
cd "$ROOT/backend/express"
node server.js &
EXPRESS_PID=$!
echo "        PID: $EXPRESS_PID"

# ── 2. Flask API server (port 5000) ──
echo "  [2/3] Starting Flask server (port 5000)..."
cd "$ROOT/backend/flask"
PYTHONPATH="$ROOT/backend/flask" "$ROOT/backend/flask/venv/bin/python" app.py &
FLASK_PID=$!
echo "        PID: $FLASK_PID"

# ── 3. React frontend dev server (port 3000) ──
echo "  [3/3] Starting React frontend (port 3000)..."
cd "$ROOT/frontend"
npm start &
REACT_PID=$!
echo "        PID: $REACT_PID"

echo ""
echo "  ────────────────────────────────────────"
echo "  ✓ All servers starting!"
echo ""
echo "    Frontend:  http://localhost:3000"
echo "    Flask API: http://localhost:5000"
echo "    Express:   http://localhost:3001"
echo ""
echo "  Press Ctrl+C to stop all servers."
echo "  ────────────────────────────────────────"
echo ""

# Clean shutdown on Ctrl+C
cleanup() {
  echo ""
  echo "  Shutting down..."
  kill $EXPRESS_PID 2>/dev/null
  kill $FLASK_PID 2>/dev/null
  kill $REACT_PID 2>/dev/null
  wait 2>/dev/null
  echo "  ✓ All servers stopped."
}
trap cleanup EXIT INT TERM

# Wait for all background processes
wait
