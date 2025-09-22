CREATE TABLE IF NOT EXISTS causal_insights (
  insight_id TEXT PRIMARY KEY,
  experiment_key TEXT NOT NULL,
  hypothesis TEXT NOT NULL,
  population JSONB,
  time_window_start TIMESTAMPTZ NOT NULL,
  time_window_end TIMESTAMPTZ NOT NULL,
  exposure JSONB NOT NULL,
  outcome JSONB NOT NULL,
  confounders JSONB,
  effect_estimate JSONB,
  tags JSONB,
  status TEXT NOT NULL DEFAULT 'draft',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS causal_insights_experiment_idx ON causal_insights (experiment_key);
CREATE INDEX IF NOT EXISTS causal_insights_status_idx ON causal_insights (status);
