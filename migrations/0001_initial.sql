-- FPL AI Co-Pilot Phase 1 schema
CREATE TABLE IF NOT EXISTS raw_fpl_players (
  player_id INTEGER PRIMARY KEY,
  payload JSONB NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS raw_fpl_teams (
  team_id INTEGER PRIMARY KEY,
  payload JSONB NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS raw_fpl_fixtures (
  fixture_id INTEGER PRIMARY KEY,
  event INTEGER NOT NULL,
  payload JSONB NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS raw_understat_players (
  player_id INTEGER PRIMARY KEY,
  payload JSONB NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  provider TEXT NOT NULL DEFAULT 'understat'
);

CREATE TABLE IF NOT EXISTS raw_fbref_team_stats (
  team_id INTEGER NOT NULL,
  season TEXT NOT NULL,
  payload JSONB NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (team_id, season)
);

CREATE TABLE IF NOT EXISTS player_features_latest (
  player_id INTEGER PRIMARY KEY,
  source TEXT NOT NULL,
  model_version TEXT,
  features JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS fixture_features_latest (
  fixture_id INTEGER PRIMARY KEY,
  provider TEXT NOT NULL,
  features JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS analysis_cache (
  team_id TEXT PRIMARY KEY,
  payload JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cache_entries (
  cache_key TEXT PRIMARY KEY,
  payload JSONB,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS provider_status (
  provider TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  latency_ms INTEGER,
  last_success_at TIMESTAMPTZ,
  last_error_at TIMESTAMPTZ,
  data_currency_minutes INTEGER,
  details JSONB,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
