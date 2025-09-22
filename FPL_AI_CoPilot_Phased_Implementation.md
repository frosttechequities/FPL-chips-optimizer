# FPL AI Co-Pilot Phased Implementation Plan

This plan operationalises the "Re-architecting the FPL Co-Pilot" blueprint inside the current codebase. The team will ship the work in four blueprint-aligned phases, with phase gates enforced by automated and manual validation. Each phase lists objectives, concrete backlog items, observability requirements, test plans, and exit criteria. We will only progress when the exit criteria have passed and test automation is green.

## Guiding Principles
- Treat the blueprint’s four pillars (Data Foundation, Predictive Engine, Strategic Engine, Intelligence Layer) as the north star for prioritisation.
- Prefer real data over mocks; only fall back to synthetic data when a provider fails and log telemetry for the failure.
- Capture all external data in a structured warehouse (PostgreSQL via Drizzle ORM) to support reproducibility, auditability, and downstream modelling.
- Every new capability must expose diagnostics (timestamps, provider provenance, confidence scoring) that the UI and downstream services can surface.
- Maintain a rolling suite of integration tests and typed contracts (`shared/schema.ts`) so the client remains stable while back-end intelligence improves.

## Phase 1 - Data Foundation & Baseline Predictive Layer
**Objectives**
- Harden ingestion from the official FPL API and add resilient connectors for Understat and FBref (or nearest public advanced-stats sources).
- Persist raw and processed data in PostgreSQL using Drizzle instead of in-memory caches.
- Expose provider/ETL health endpoints and metrics so downstream services know when data is trustworthy.
- Ship a verifiable baseline predictive pipeline using transparent heuristic/ensemble models (OpenFPL-style XGBoost/Random Forest) with feature provenance.

**Backlog**
1. Introduce database schema migrations (`migrations/`) covering raw tables (`raw_fpl_players`, `raw_fpl_fixtures`, `raw_understat_players`, `raw_fbref_team_stats`) plus processed feature tables (`player_features_latest`, `fixture_features_latest`).
2. Replace `server/storage.ts` in-memory cache with Postgres-backed repository layer (`server/services/repositories/*`). Include caching TTL logic and background refresh.
3. Build ETL workers in `server/services/dataPipeline.ts` orchestrated via `node-cron` (later Prefect/Airflow-ready) to hydrate the raw tables and denormalised feature tables.
4. Formalise provider adapters under `server/services/providers/*` with retry, circuit breaker, and provenance metadata (`last_success_at`, `latency_ms`, `data_currency`).
5. Update `AnalysisEngine` to read from the repository layer and surface source freshness + confidence metrics through the API responses.
6. Stand up an initial OpenFPL baseline ensemble (`mlPredictionEngine`) that draws from persisted features and logs model versioning.
7. Expand `/api/providers/status` to pull real metrics from the repository + adapters (uptime, latest snapshot, row counts).
8. Add TypeScript integration tests (using Vitest) that exercise the ETL pipeline end-to-end with recorded fixtures and validate schema typing.

**Validation & Tooling**
- Local Postgres instance (via `.env.local` + docker-compose) or Neon connection for CI; migrations applied through `npm run db:push`.
- Automated checks: `npm run lint` (to add), `npm run check`, `npm run test:data-foundation` (new script running Vitest integration suite).
- Manual smoke: call `/api/providers/status` and `/api/analyze` against a fixture team ID; confirm response includes persisted data timestamps and confidence fields.

**Exit Criteria**
- All ETL pipelines can be executed from a single command (`npm run data:refresh`) and populate every target table.
- `/api/providers/status` reports non-mock providers with current timestamps; `/api/analyze` reads from Postgres without falling back to memory caches.
- Baseline ensemble predictions stored with version metadata and surfaced in API responses.
- Phase 1 test suite green in CI and locally.

## Phase 2 - Probabilistic Forecasting & Strategic Heuristics
**Objectives**
- Transition from point forecasts to probabilistic outputs via calibrated Monte Carlo simulations.
- Quantify player consistency (Coefficient of Variation) and integrate Effective Ownership heuristics.
- Deliver initial chip strategy heuristics and a rank-impact aware recommendation engine.

**Backlog**
1. Extend feature tables to store distribution parameters (mean, variance, skew) per player and fixture using persisted simulation results.
2. Upgrade `SimulationEngine` to consume external odds feed (TheOddsAPI or OddsJam) with fallback to bookmaker consensus scraping.
3. Implement Monte Carlo pipeline that draws from odds, xG/xA, expected minutes, and outputs per-player distributions stored in `player_simulations`.
4. Compute CV, upside/downside percentiles, and tag player archetypes (`template`, `differential`, `boom-bust`) in the repository.
5. Build Effective Ownership service combining official ownership %, transfer trends, and bookmaker sentiment; expose via `/api/effective-ownership`.
6. Enhance transfer planner to weigh expected rank delta using EO and risk metrics; include heuristics for chip timing windows.
7. Add scenario comparison endpoints (e.g., compare `captain` outcomes) powered by simulation data.
8. Integrate Vitest suites that validate distribution math (seeded RNG) and EO heuristics for representative players/fixtures.

**Validation & Tooling**
- Automated: `npm run test:probabilistic` covering simulation math, heuristics, and API contract responses.
- Manual: Inspect Monte Carlo summaries via API, verify percentile outputs make sense for known players, confirm EO endpoints align with stored data.

**Exit Criteria**
- Simulation data persisted for upcoming six gameweeks with configurable run counts.
- API responses include probabilistic descriptors (p10/p90, CV, archetype) and rank-aware recommendations.
- Tests and static analysis pass; manual spot-checks confirm qualitative accuracy.

## Phase 3 - Strategic Engine (RL) & Explainability Layer
**Objectives**
- Train a PPO-based reinforcement learning agent on the high-fidelity simulator to optimise multi-week strategy (transfers, captaincy, chip usage).
- Wrap the agent in an explainable decision layer (SHAP/LIME) to justify recommendations.
- Provide conversational reasoning via the AI co-pilot with transparent provenance and risk commentary.

**Backlog**
1. Construct an offline training pipeline (`scripts/train-rl-agent.ts`) that replays historical seasons from the warehouse to generate state/action datasets.
2. Implement PPO agent using `@pettingzoo` + `rl-algorithms` (or custom) with modular state representation (squad, bank, chip inventory, EO, fixtures).
3. Version agent artifacts and surface metadata via `/api/strategy/models` (training date, validation score, policy checksum).
4. Integrate RL outputs into the recommendation flow with guardrails (fallback to heuristics when confidence below threshold).
5. Layer SHAP explanations over both ML models and RL decisions, generating natural language summaries (force plot -> textual narrative).
6. Extend `AICopilotService` to include reasoning traces, confidence, and actionable alternatives.
7. Expand testing: offline unit tests for policy evaluation, golden file tests for SHAP outputs, contract tests for chat endpoint responses.
8. Instrument training and inference metrics (latency, convergence, reward trends) exported via logging/metrics hooks.

**Implementation Milestones**
1. Historical season curation & simulator calibration: Backfill 2018-2023 campaigns, normalise scoring rules, and validate the sim reproduces actual chip usage and point totals.
2. Curriculum training loops & hyperparameter sweeps: Parameterise PPO configs under `configs/rl/`, schedule ablation runs (reward shaping, action masking), and persist results for comparison.
3. Policy evaluation & release gating: Build offline leaderboard using holdout seasons, compute uplift vs heuristics, and require significance before promoting a policy.
4. Explainability integration: Wrap `mlPredictionEngine` and PPO policies with a shared SHAP service that precomputes background datasets and caches top reason codes.
5. Copilot rollout & change management: Expose RL-driven recommendations behind a feature flag, capture feedback loops from beta users, and define rollback levers (policy pinning).

**Data & Feature Considerations**
- State vector must encode squad composition, bank, price change deltas, chip inventory, fixture difficulty, EO forecasts, and injury/news signals.
- Action space covers transfers, captaincy, starting XI tweaks, and chip plays; enforce deadline-aware masking so invalid moves are pruned.
- Reward shaping combines weekly points, rank delta, and penalises excessive hits; tune coefficients per competition tier (OR vs mini-league).

**Observability & Ops**
- Emit training metrics (reward, entropy, KL divergence) and inference latency to Prometheus via `server/telemetry/rlMetrics.ts`.
- Store policy checkpoints, SHAP baselines, and evaluation reports in object storage with immutable version tags.
- Add alerting for stale policies, divergence spikes, or failed explainability jobs using existing PagerDuty hooks.

**Validation & Tooling**
- Automated regression suite `npm run test:strategy` covering policy evaluation, guardrail fallbacks, and chat schema contracts.
- Automated benchmarking via `scripts/evaluate-rl-agent.ts --compare heuristics` to quantify uplift vs baseline heuristics.
- Manual review of RL recommendation justifications to ensure clarity, policy safety, and alignment with stored provenance.
- Shadow mode run in staging for one gameweek to ensure stability before enabling for all users.

**Exit Criteria**
- PPO agent achieves predefined reward target on validation seasons, logs metadata, and passes drift checks against the latest season.
- `/api/analyze` and `/api/chat` responses include explainability payloads with SHAP-derived narratives and cite policy version + feature provenance.
- Copilot **beta** flag flipped on with monitored rollback path after shadow evaluation.
- Tests green; fallback logic proven by forcing low-confidence scenario and verifying heuristic hand-off.

## Phase 4 - Advanced Intelligence (Causal, Generative, Graph-Based)
**Objectives**
- Introduce causal inference for intervention analysis (e.g., managerial changes) feeding feature engineering.
- Generate counterfactual scenarios and creative strategies via generative models (VAE/GAN) and surface them through the co-pilot.
- Model team cohesion and player interactions with graph neural networks; integrate embeddings into predictive stack.

**Backlog**
1. Stand up causal dataset builder that captures exposures, outcomes, and confounders in `causal_insights` with experiment metadata (hypothesis, population, time window).
2. Implement intervention analysis service using Bayesian Structural Time Series and DoWhy pipelines to estimate uplift; expose run coordination in `server/services/causalEngine.ts`.
3. Deliver counterfactual scenario engine that replays historical squads, runs Monte Carlo adjustments, and serves results via `/api/scenarios/counterfactual` with cached narratives.
4. Spin up generative strategy lab (diffusion or VAE) producing chip/team proposals under budget and formation constraints, logging risk-reward metrics per sample.
5. Construct graph intelligence pipeline ingesting event and passing data, building player-team graphs, and training GNN embeddings persisted in `graph_embeddings` and the feature store.
6. Fuse causal, generative, and graph signals into ML/RL stacks via feature store updates, strategy model registry versioning, and guardrail thresholds for policy promotion.
7. Upgrade co-pilot and API contracts to surface causal findings, counterfactual narratives, and generative suggestions with provenance, confidence, and safety notes.
8. Expand evaluation harness with backtests, fairness checks, and automated reports comparing advanced intelligence outputs against baselines.

**Implementation Milestones**
1. Causal data foundation: normalise exposures/outcomes, create experiment CLI (`scripts/causal-runner.ts`), and document a hypotheses catalogue.
2. Counterfactual experience service: launch `/api/scenarios/counterfactual` with caching, narrative templates, and guardrails for invalid inputs.
3. Generative strategy lab: train VAE/diffusion models, build constraint evaluation, and publish suggestion feeds to the co-pilot.
4. Graph embedding pipeline: schedule feature extraction workers, train GNN or Node2Vec models, and register embeddings in the feature store.
5. Unified rollout: stage advanced signals into ML/RL, update policy registry, and run canary or A/B gates before general release.

**Data & Feature Considerations**
- Track interventions with identifiers (manager changes, tactical shifts) aligned to outcome windows; capture confounders such as injuries and schedule density.
- Counterfactual scenarios need consistent state snapshots (squad, bank, chips) plus seeded randomness for reproducibility.
- Graph features should distinguish player-player and player-team edges with temporal decay and competition weighting.

**Observability & Ops**
- Emit causal experiment metrics (uplift, confidence intervals, overlap scores) and counterfactual latency via Prometheus-friendly hooks.
- Log generative model provenance (dataset hashes, checkpoint IDs) and monitor rejection rates from constraint checks.
- Monitor GNN training and inference (epoch loss, embedding drift) and alert on stale embeddings or missing event feeds.

**Validation & Tooling**
- Automated suite `npm run test:advanced-intel` covering causal engine unit tests, counterfactual replay snapshots, generative constraint checks, and graph embedding sanity.
- Scenario notebook pack in `notebooks/advanced-intel/` for manual inspection of interventions, counterfactuals, and generative outputs.
- Offline evaluation script (`scripts/evaluate-advanced-intel.ts`) comparing uplift vs baseline heuristics and tracking fairness metrics.
- Manual QA: review top causal studies, run counterfactual queries through the co-pilot, and inspect generative suggestions for realism.

**Exit Criteria**
- Causal experiments demonstrate statistically significant uplift and are catalogued with reproducible configs and diagnostics.
- `/api/scenarios/counterfactual` returns deterministic narratives for seeded runs; co-pilot surfaces causal/generative insights with provenance.
- GNN-enhanced features and generative suggestions deliver agreed KPI improvement (for example +x% rank gain) in A/B or offline tests with guardrails active.
- Advanced intelligence monitoring dashboards stay green for one gameweek, and fallback pathways are documented and rehearsed.


## Cross-Cutting Enablers
- **Observability**: structured logging (`pino`), metrics export (Prometheus-friendly), and alerting on provider failure, stale data, or ML drift.
- **Configuration**: use `.env` templates for provider keys and toggles; document fallback behaviour in README.
- **Security & Compliance**: rate-limit external calls, respect provider ToS, and secure API keys via secrets management.
- **Documentation**: maintain `docs/` with data schema ERD, pipeline diagrams, and runbooks; update `README.md` after each phase.

## Test Ladder & Scripts
| Phase | Scripts | Coverage |
|-------|---------|----------|
| 1 | `npm run check`, `npm run test:data-foundation`, manual `/api/providers/status` smoke | ETL + repository correctness |
| 2 | Phase 1 scripts + `npm run test:probabilistic`, manual EO/simulation sanity | Monte Carlo, EO heuristics, transfer planner |
| 3 | Prior scripts + `npm run test:strategy`, `scripts/evaluate-rl-agent.ts` | RL policy, explainability, chat contract |
| 4 | Prior scripts + `npm run test:advanced-intel`, bespoke notebooks | Causal studies, generative scenarios, GNN embeddings |

## Next Actions
1. Execute Phase 1 backlog starting with database migrations and repository refactor.
2. Wire up automated tests and data health checks to gate phase completion.
3. After Phase 1 sign-off, iterate sequentially through Phases 2-4 using this document as the authoritative roadmap.

