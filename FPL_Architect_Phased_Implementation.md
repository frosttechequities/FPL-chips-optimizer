FPL Architect: Phased Implementation Plan
========================================

Goal
----
Adopt the constitutional master prompt and upgrade the AI co‑pilot into a robust, rank‑maximizing FPL strategist with principled data ingestion, probabilistic reasoning, and explainable outputs.

Phase 1 – Prompt Constitution & Wiring (This PR)
-----------------------------------------------
- Add master prompt document (`MASTER_PROMPT_FPL_Architect.md`).
- Implement `MasterPromptService` to load, cache, and hot‑reload the master prompt.
- Integrate into `OpenRouterService.buildFPLSystemPrompt` so master prompt is the base layer, augmented with live FPL context.
- Add config flag/env (`USE_MASTER_PROMPT=1`) to toggle new prompt.
- Deliver minimal tests and smoke validation via `/api/chat`.

Phase 2 – Data Mandate Instrumentation
--------------------------------------
- Add bookmaker odds ingestion interface and caching layer (provider abstraction with mock in dev).
- Integrate advanced metrics (Understat/FBref) adapters; normalize to shared schema (npxG, xA, xGC, SoT, key passes).
- Extend analysis pipeline to compute expected minutes from news/lineups (plausible proxy + manual override field).
- Add game‑state aware weighting utilities.

Phase 3 – Probabilistic Engine & Archetyping
--------------------------------------------
- Implement Monte Carlo scoring simulation (per‑player distributions) combining odds + xG/xA + minutes priors.
- Compute historical CV (std/mean) and label consistent vs explosive archetypes.
- Expose distribution summaries and CV to the LLM as structured context.

Phase 4 – Strategic Optimization (ERV)
--------------------------------------
- Implement ERV function factoring predicted distributions and Effective Ownership (EO).
- Mini‑league analyzer: fetch rivals’ squads, compute overlap/differentials, propose shield/sword mixes.
- Chip strategy optimizer considering fixture clusters, blanks/doubles, and squad structure.

Phase 5 – Output Protocol & XAI
-------------------------------
- Standardize AI response format (summary, probabilities, actions, risks, data notes).
- Add explanation generator (feature contributions; SHAP‑style qualitative summaries based on inputs).
- Add counterfactual explorer endpoints for what‑if scenarios.

Non‑Goals (Now)
---------------
- Full external data scraping. Use adapters with plug‑in contracts; begin with mocks.
- End‑to‑end ML training pipelines; start with calibrated heuristics and simulation.

Success Criteria
----------------
- Responses follow the constitution, reference probabilities/ranges, and disclose assumptions.
- Rank‑aware recommendations (ERV) with shield/sword framing where relevant.
- No hallucinated stats; graceful degradation when feeds are missing.


