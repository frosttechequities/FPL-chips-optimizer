# AI Co-Pilot 100-Query Test Plan

## Phase 1 - Preparation
- Confirm `/api/chat` endpoint reachable in local dev (port 5000) and server logging enabled.
- Curate 100 distinct prompts covering squad analysis, transfers, chip strategy, fixtures, player comparisons, injuries, and general FPL tactics.
- Categorise prompts into balanced buckets (for example 30 analysis, 20 transfer, 15 chip timing, 15 fixtures, 10 comparisons, 10 general strategy).
- Build or update an automated harness that iterates prompts, captures raw responses, latency, and HTTP status.
- Define evaluation rubric (accuracy, realism, actionable detail, hallucination check, tone) and logging schema for manual scoring.

## Phase 2 - Execution
- Launch dev server with fresh data pipeline run (record start and end timestamps).
- Run harness against `/api/chat`, spacing requests to avoid rate limiting (for example 0.75 to 1 second delay).
- Persist detailed results: prompt, category, timestamp, response body, error traces if any.
- Flag anomalous responses automatically (for example missing success flag, empty message, currency glyph issues).

## Phase 3 - Analysis and Reporting
- Score each response using rubric; annotate failures or low-confidence answers.
- Quantify pass and fail counts per category and overall success rate.
- Summarise recurring issues (hallucinated transfers, stale data, formatting errors, latency spikes).
- Recommend remediation actions (prompt-engineering tweaks, fallback logic adjustments, data refresh).
- Deliver consolidated findings and raw logs to repository (for example `/logs/ai-copilot-tests/`).

## Deliverables
1. Automated test harness script.
2. Structured JSON or CSV log of 100 test responses.
3. Summary report noting pass rate, key issues, and next steps.
