#!/bin/bash
# ─────────────────────────────────────────────────────────────
# Start ONLY the Flask backend API server (Port 5000)
# Uses the built-in virtual environment directly.
# ─────────────────────────────────────────────────────────────
ROOT="$(cd "$(dirname "$0")" && pwd)"
echo "Starting Flask API server on http://localhost:5000..."
cd "$ROOT/backend/flask"
PYTHONPATH="$ROOT/backend/flask" "$ROOT/backend/flask/venv/bin/python" app.py
