# FPL Chip Strategy Architect

Personalized FPL chip timing and transfer planning based on your actual squad and upcoming fixtures. Live data from the official FPL API, clear recommendations in the UI, and a simple REST API under the hood.

## Quickstart

- Prerequisites: Node.js 20+
- Install: `npm install`
- Dev (API + Client on the same port): `npm run dev`
- Type-check: `npm run check`
- Build (client + bundled server): `npm run build`
- Start production server: `npm start`

Default port is `5000` (configurable via `PORT`).

## Environment

- `PORT` (optional): HTTP port. Defaults to `5000`.
- `DATABASE_URL` (optional): Only required if using Drizzle Kit migrations (not required for runtime).

## API Reference

Base URL is the same as the client (the Express server serves both).

- GET `/api/health`
  - Returns `{ status: "ok", timestamp }`.

- POST `/api/analyze`
  - Body: `{ teamId: string }` (numeric string)
  - Response: `AnalyzeTeamResponse` with:
    - `players`: processed 15-man squad
    - `gameweeks`: squad FDR timeline (next ~10 GWs)
    - `recommendations`: chip suggestions (wildcard, bench-boost, triple-captain, free-hit)
    - `budget`: bank, team value, free transfers, affordable upgrades
  - Example:
    ```bash
    curl -s http://localhost:5000/api/analyze \
      -H 'content-type: application/json' \
      -d '{"teamId":"1234567"}'
    ```

- POST `/api/transfer-plan`
  - Body: `{ teamId: string, chipType?: 'wildcard'|'bench-boost'|'triple-captain'|'free-hit', targetGameweek?: number, maxHits?: number, includeRiskyMoves?: boolean }`
  - Response: `PlanTransfersResponse` with up to 3 plans (conservative, aggressive, chip-optimized)
  - Example:
    ```bash
    curl -s http://localhost:5000/api/transfer-plan \
      -H 'content-type: application/json' \
      -d '{"teamId":"1234567", "chipType":"triple-captain", "maxHits":1}'
    ```

- POST `/api/cache/clear`
  - Clears in-memory FPL API cache. Useful during development.

## Caching

- FPL API responses: 5 minutes (in-memory, per-URL key).
- Analysis results: 15 minutes per team (`/api/analyze` checks and returns cached result if still fresh).

## Repository Layout

- `server/`
  - `index.ts`: Express setup, Vite dev middleware/static serving, error handling.
  - `routes.ts`: REST endpoints (health, analyze, transfer-plan, cache/clear).
  - `services/fplApi.ts`: Official FPL API wrapper with caching and helpers.
  - `services/analysisEngine.ts`: Builds squad, FDR timeline, and chip recommendations.
  - `services/transferEngine.ts`: Generates transfer plans (conservative, aggressive, chip-optimized).
  - `storage.ts`: In-memory caches for analysis and FPL objects.
  - `vite.ts`: Dev HMR and production file serving.
- `client/`
  - React app (Team ID input → analysis results → recommendations/details → transfer planning).
  - Tailwind theming via CSS variables; shadcn-style UI primitives.
- `shared/`
  - TypeScript models and Zod schemas for requests/responses and FPL data.

## Frontend UX

1. Enter your Team ID on the home page.
2. The app calls `/api/analyze` and shows:
   - Squad overview (value, points, position groups)
   - Fixture Difficulty chart for your entire squad
   - Chip recommendation cards + details modal
3. Optionally trigger `/api/transfer-plan` actions from the planner to see candidate moves.

## Development Notes

- TypeScript strict mode across client/server. Aliases `@` and `@shared` are configured in Vite/tsconfig.
- Logging: concise API logs for `/api/*` with response status + timing.
- No database required at runtime. `drizzle.config.ts` only matters if you add persistence later.

## Roadmap (What we will improve next)

- Free Hit planning: implement real single‑GW optimization instead of placeholder.
- Expected points: refine heuristics (incorporate upcoming fixture difficulty weighting).
- Currency formatting: replace mojibake (e.g., `A�`) with proper `£` formatting via `Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' })` or compact milllions (`£{value.toFixed(1)}m`).
- Documentation: keep this file aligned with behavior as features evolve.

If you’re running on Replit, this repo is configured to serve both API and client on the same port for a smooth DX.
