-- Phase 3 strategy model registry
CREATE TABLE IF NOT EXISTS strategy_models (
  model_id TEXT PRIMARY KEY,
  version TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'staging',
  algorithm TEXT NOT NULL,
  checksum TEXT NOT NULL,
  reward_mean DOUBLE PRECISION NOT NULL,
  reward_std DOUBLE PRECISION,
  validation_score DOUBLE PRECISION,
  training_episodes INTEGER NOT NULL DEFAULT 0,
  feature_names JSONB NOT NULL,
  feature_means JSONB NOT NULL,
  feature_std JSONB,
  hyperparameters JSONB,
  policy JSONB NOT NULL,
  evaluation_summary JSONB,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS strategy_model_evaluations (
  evaluation_id TEXT PRIMARY KEY,
  model_id TEXT NOT NULL REFERENCES strategy_models(model_id),
  evaluated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  validation_score DOUBLE PRECISION NOT NULL,
  heuristic_baseline DOUBLE PRECISION,
  uplift DOUBLE PRECISION,
  reward_mean DOUBLE PRECISION NOT NULL,
  reward_std DOUBLE PRECISION,
  notes TEXT,
  metrics JSONB NOT NULL
);
