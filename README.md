FPL Chip Strategy Architect
===========================

Personalized Fantasy Premier League (FPL) chip timing and transfer planning based on your actual squad and upcoming fixtures. Live data from the official FPL API, clear recommendations in the UI, and a simple REST API under the hood.

Quickstart
- Install: `npm install`
- Dev (HMR): `npm run dev` (or `npm run dev:open` on Windows to auto-open)
- Build: `npm run build`
- Start: `npm start` (or `npm run start:open` on Windows to auto-open)

API
- GET `/api/health` – health check
- POST `/api/analyze` – body `{ teamId: string }`
- POST `/api/transfer-plan` – body `{ teamId: string, chipType?, targetGameweek?, maxHits?, includeRiskyMoves? }`

Scripts
- `dev`, `start` are cross‑platform via `cross-env`
- Windows helpers: `dev:open`, `start:open` (PowerShell scripts under `scripts/`)

CI
GitHub Actions workflow runs type‑check and build on Node 20.

License
MIT

