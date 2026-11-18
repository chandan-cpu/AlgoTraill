# AlgoTrail — personal DSA tracker

A responsive Next.js + TypeScript app running on Node.js, with a Python FastAPI backend and PostgreSQL database. Includes a 32-week roadmap, curated starter problems, status tracking, bookmarks, notes, revision scheduling, progress charts, JSON export, and a 25-minute focus timer.

## Run the complete stack

Install/start Docker Desktop using Linux containers, then run in this directory:

```powershell
Copy-Item .env.example .env
# Edit .env and choose your local database password.
docker compose up --build -d
```

- App: http://localhost:3000
- FastAPI documentation: http://localhost:8000/docs
- Health: http://localhost:8000/api/health

PostgreSQL data lives in the `postgres_data` Docker volume. `docker compose down` stops the stack and preserves progress. Adding `-v` deletes the database volume, so avoid that unless you intend to reset all database data.

This is a **single-user local application**. Ports bind to loopback only. Authentication and per-user isolation are not implemented; add those before publishing it to the internet. Sites hosting cannot run this FastAPI/PostgreSQL stack directly.

## Frontend development / immediate browser-only preview

Requires Node.js 22 or newer.

```powershell
cd frontend
npm ci
npm run dev
```

Open http://127.0.0.1:3000. If the API is unavailable when the page loads, an explicit **Browser-only mode** banner appears. Progress then saves to this browser's localStorage. Database data and browser data are separate; there is no automatic migration or synchronization. Once the API is running, refresh to use database storage. Use Export to download the active progress as JSON. Export is a backup file; an import UI is not included.

When the API was connected at load time, later write failures are shown as errors instead of silently switching to browser storage.

## Backend development

Requires Python 3.12+ and a PostgreSQL server. Either provide `DATABASE_URL=postgresql+psycopg://...` or the separate `DB_HOST`, `DB_USER`, `DB_PASSWORD`, and `DB_NAME` environment variables. Separate variables handle passwords containing URL-special characters.

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
$env:DB_HOST = 'localhost'
$env:DB_USER = 'dsa'
$env:DB_PASSWORD = 'your-local-password'
$env:DB_NAME = 'dsa_tracker'
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Next.js proxies `/api/*` to FastAPI. Its default target is `http://127.0.0.1:8000`; `API_INTERNAL_URL` overrides the destination when Next.js is built or starts in development. Docker builds use `http://api:8000`.

## Verification

```powershell
# frontend directory
npm run build
npm run typecheck
# backend directory
.\.venv\Scripts\python.exe -m pytest -q
```

API tests use isolated SQLite databases to check application behavior without requiring Docker. They do not replace integration testing against PostgreSQL. Application startup creates tables and idempotently seeds starter problems; schema migrations are not included yet.

## Usage notes

- Problem checkboxes mark completion. Status menus also support In progress and Revisit.
- Click a problem name to write notes and schedule reviews in 1, 7, or 30 days, or on a custom date.
- Revision lists overdue/due problems and those explicitly marked Revisit. Reschedule or clear the date after reviewing; change Revisit status when appropriate.
- The focus timer uses an absolute deadline so background tabs do not lose time. Save a completed session to add it to focus totals. Reloading resets an unsaved timer.
- Streaks count local calendar days with a currently solved problem or saved focus session. A streak remains active through yesterday until today's work is done.
- The weekly target is 10 solved problems in the trailing seven calendar days.
- The starter collection is a curated learning plan, **not the complete official Striver sheet**. Starter links open the official sheet; custom problems can link directly to any HTTP(S) practice page.
- The frontend and backend contain identical `seed.json` files. Keep these synchronized when editing the starter curriculum.
- Fonts load from Google Fonts when available and fall back to system sans-serif offline.

## Project layout

```text
frontend/app/        Next.js interface and styles
frontend/lib/       Starter curriculum
backend/app/        FastAPI routes, database models, seed data
backend/tests/      API behavior tests
compose.yaml        Node.js, FastAPI, and PostgreSQL services
```
