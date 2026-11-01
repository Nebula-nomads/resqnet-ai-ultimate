# RESQNET AI - how to run (Windows)

You need TWO terminals open at the same time: one for the backend, one for the frontend.
Prereqs: Python 3.10+ and Node.js 18+ (check: `python --version`, `node --version`).

## Terminal 1 - Backend (API on http://127.0.0.1:8000)

    cd backend
    python -m venv .venv
    .\.venv\Scripts\python.exe -m pip install -r requirements.txt
    .\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000

Check: open http://127.0.0.1:8000/health -> {"status":"ok"}   (API docs: /docs)
IMPORTANT: run it from the `backend` folder (NOT from backend\app).

## Terminal 2 - Frontend (UI on http://localhost:5173)

    cd frontend
    npm install
    npm run dev

Open http://localhost:5173 in the browser (internet needed for the map tiles).

## What the frontend is now

A dark "tactical intelligence" command centre (React + TS + Vite + Tailwind + React Query + Axios + React Leaflet + Recharts + Framer Motion + Lucide).
The backend is unchanged. Pages: Overview, Live Operations, Incident Reports (AI submission), Intelligence Analysis,
Geographical Monitoring, Resource Recommendations, Simulation Lab, Resolved Incidents, Settings.

Optional: copy `frontend/.env.example` to `frontend/.env` to point at a different backend URL.
After `npm install` you can run `npm run typecheck` to type-check the project.

## Quick demo

Click a Simulation button (flood / earthquake / fire / infrastructure) or submit a report.
Optional: put GEMINI_API_KEY=... in backend\.env to enable Gemini.
Without it, a rule-based parser is used (works fine for a demo).
