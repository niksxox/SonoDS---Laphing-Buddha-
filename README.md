# SonoDS — Next-Gen AI Stem Mixer & DAW

SonoDS is an intelligent multitrack audio mixing platform. It analyzes uploaded stems, classifies instrument roles, applies professional mixing rules, refines mixes via LLM reasoning, enforces safe deviation bounds, and renders DSP audio using `pedalboard`.

---

## 🚀 How to Run the App (Super Easy Way)

You **do NOT** need to activate any virtual environments manually or worry about `pip`/`venv` issues! 

From the main project directory (`sonoweb2026`), simply run:

### Option A: Run Everything with One Command (Recommended)

```bash
./start.sh
```
This launches all 3 required services at once:
- **React Frontend**: [http://localhost:3000](http://localhost:3000)
- **Flask API Backend**: [http://localhost:5000](http://localhost:5000)
- **Express Static Server**: [http://localhost:3001](http://localhost:3001)

Press `Ctrl+C` in your terminal anytime to gracefully stop all 3 servers.

---

### Option B: Run Services in Separate Terminals

If you prefer to run each server in its own terminal window:

1. **Flask API Server** (Port 5000):
   ```bash
   ./start-flask.sh
   ```

2. **Express Static Server** (Port 3001):
   ```bash
   ./start-express.sh
   ```

3. **React Frontend** (Port 3000):
   ```bash
   ./start-frontend.sh
   ```

---

## 🛠 Manual Command Reference (If Not Using Helper Scripts)

If you ever need to manually activate the virtual environment or run raw commands:

### Backend (Flask - Python)
```bash
cd backend/flask

# Activate Python Virtual Environment
source venv/bin/activate

# Run Flask API Server
PYTHONPATH=. python app.py
```

### Backend (Express - Node)
```bash
cd backend/express
node server.js
```

### Frontend (React)
```bash
cd frontend
npm start
```

---

## 🧪 Running Backend Unit & Integration Tests

To run the complete test suite (125+ tests covering analysis, classification, rules engine, LLM reasoning, safety pipeline, rendering, and API endpoints):

```bash
cd backend/flask
./venv/bin/python -m pytest -v tests/
```

---

## 📁 System Architecture Overview

- **`frontend/`**: React single-page app with Web Audio API, dynamic DAW mixing console, and Luna AI companion.
- **`backend/flask/`**: 
  - `analysis/`: Multitrack audio analysis (loudness, dynamic range, spectral energy, masking).
  - `classify/`: Heuristic + filename stem classifier.
  - `grouping/`: Session bus routing logic.
  - `rules/`: Baseline mixing rules engine.
  - `llm_mixer/`: Structured AI parameter adjustment engine.
  - `safety/`: Parameter clamping & safe range calculator.
  - `render/`: Spotify `pedalboard` DSP audio rendering engine.
- **`backend/express/`**: Static audio file server serving rendered stems and mixes.


 ./start.sh    