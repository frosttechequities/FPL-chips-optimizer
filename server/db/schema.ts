import { jsonb, integer, pgTable, text, timestamp, primaryKey, doublePrecision } from "drizzle-orm/pg-core";
import type {
  FPLFixture,
  FPLPlayer,
  FPLTeam,
  PlayerAdvanced,
  StrategyPolicyPayload
} from "@shared/schema";

export type ProviderHealthStatus =
  | "online"
  | "degraded"
  | "offline";

export const rawFplPlayers = pgTable("raw_fpl_players", {
  playerId: integer("player_id").primaryKey(),
  payload: jsonb("payload").$type<FPLPlayer>().notNull(),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
});

export const rawFplTeams = pgTable("raw_fpl_teams", {
  teamId: integer("team_id").primaryKey(),
  payload: jsonb("payload").$type<FPLTeam>().notNull(),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
});

export const rawFplFixtures = pgTable("raw_fpl_fixtures", {
  fixtureId: integer("fixture_id").primaryKey(),
  event: integer("event").notNull(),
  payload: jsonb("payload").$type<FPLFixture>().notNull(),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
});

export const rawUnderstatPlayers = pgTable("raw_understat_players", {
  playerId: integer("player_id").primaryKey(),
  payload: jsonb("payload").$type<PlayerAdvanced>().notNull(),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
  provider: text("provider").notNull().default("understat"),
});

export interface FbrefTeamPayload {
  teamId: number;
  season: string;
  metrics: Record<string, number | string | null>;
}

export const rawFbrefTeamStats = pgTable("raw_fbref_team_stats", {
  teamId: integer("team_id").notNull(),
  season: text("season").notNull(),
  payload: jsonb("payload").$type<FbrefTeamPayload>().notNull(),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  pk: primaryKey(table.teamId, table.season),
}));

export interface PlayerFeatureSnapshot {
  playerId: number;
  source: string;
  version?: string;
  metrics: Record<string, number | string | boolean>;
}

export const playerFeaturesLatest = pgTable("player_features_latest", {
  playerId: integer("player_id").primaryKey(),
  source: text("source").notNull(),
  modelVersion: text("model_version"),
  features: jsonb("features").$type<PlayerFeatureSnapshot["metrics"]>().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export interface FixtureFeatureSnapshot {
  fixtureId: number;
  provider: string;
  metrics: Record<string, number | string | boolean>;
}

export const fixtureFeaturesLatest = pgTable("fixture_features_latest", {
  fixtureId: integer("fixture_id").primaryKey(),
  provider: text("provider").notNull(),
  features: jsonb("features").$type<FixtureFeatureSnapshot["metrics"]>().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const playerSimulations = pgTable("player_simulations", {
  playerId: integer("player_id").primaryKey(),
  generatedAt: timestamp("generated_at", { withTimezone: true }).notNull().defaultNow(),
  runs: integer("runs").notNull(),
  meanPoints: doublePrecision("mean_points").notNull(),
  medianPoints: doublePrecision("median_points").notNull(),
  p10: doublePrecision("p10").notNull(),
  p25: doublePrecision("p25").notNull(),
  p75: doublePrecision("p75").notNull(),
  p90: doublePrecision("p90").notNull(),
  standardDeviation: doublePrecision("std_dev").notNull(),
  haulProbability: doublePrecision("haul_probability").notNull(),
  floorProbability: doublePrecision("floor_probability").notNull(),
  ceilingProbability: doublePrecision("ceiling_probability").notNull(),
  captainEv: doublePrecision("captain_ev").notNull(),
  coefficientOfVariation: doublePrecision("coefficient_variation"),
});

export const analysisCache = pgTable("analysis_cache", {
  teamId: text("team_id").primaryKey(),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const cacheEntries = pgTable("cache_entries", {
  cacheKey: text("cache_key").primaryKey(),
  payload: jsonb("payload").$type<Record<string, unknown> | null>(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const providerStatus = pgTable("provider_status", {
  provider: text("provider").primaryKey(),
  status: text("status").$type<ProviderHealthStatus>().notNull(),
  latencyMs: integer("latency_ms"),
  lastSuccessAt: timestamp("last_success_at", { withTimezone: true }),
  lastErrorAt: timestamp("last_error_at", { withTimezone: true }),
  dataCurrencyMinutes: integer("data_currency_minutes"),
  details: jsonb("details").$type<Record<string, unknown> | null>(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const causalInsights = pgTable("causal_insights", {
  insightId: text("insight_id").primaryKey(),
  experimentKey: text("experiment_key").notNull(),
  hypothesis: text("hypothesis").notNull(),
  population: jsonb("population").$type<Record<string, unknown> | null>(),
  timeWindowStart: timestamp("time_window_start", { withTimezone: true }).notNull(),
  timeWindowEnd: timestamp("time_window_end", { withTimezone: true }).notNull(),
  exposure: jsonb("exposure").$type<Record<string, unknown>>().notNull(),
  outcome: jsonb("outcome").$type<Record<string, unknown>>().notNull(),
  confounders: jsonb("confounders").$type<Record<string, unknown>[] | null>(),
  effectEstimate: jsonb("effect_estimate").$type<Record<string, number> | null>(),
  tags: jsonb("tags").$type<string[] | null>(),
  status: text("status").notNull().default("draft"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const strategyModels = pgTable("strategy_models", {
  modelId: text("model_id").primaryKey(),
  version: text("version").notNull(),
  status: text("status").$type<'active' | 'staging' | 'archived'>().notNull().default("staging"),
  algorithm: text("algorithm").notNull(),
  checksum: text("checksum").notNull(),
  rewardMean: doublePrecision("reward_mean").notNull(),
  rewardStd: doublePrecision("reward_std"),
  validationScore: doublePrecision("validation_score"),
  trainingEpisodes: integer("training_episodes").notNull().default(0),
  featureNames: jsonb("feature_names").$type<string[]>().notNull(),
  featureMeans: jsonb("feature_means").$type<Record<string, number>>().notNull(),
  featureStd: jsonb("feature_std").$type<Record<string, number> | null>(),
  hyperparameters: jsonb("hyperparameters").$type<Record<string, number | string> | null>(),
  policy: jsonb("policy").$type<StrategyPolicyPayload>().notNull(),
  evaluationSummary: jsonb("evaluation_summary").$type<Record<string, number | string> | null>(),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const strategyModelEvaluations = pgTable("strategy_model_evaluations", {
  evaluationId: text("evaluation_id").primaryKey(),
  modelId: text("model_id").notNull().references(() => strategyModels.modelId),
  evaluatedAt: timestamp("evaluated_at", { withTimezone: true }).notNull().defaultNow(),
  validationScore: doublePrecision("validation_score").notNull(),
  heuristicBaseline: doublePrecision("heuristic_baseline"),
  uplift: doublePrecision("uplift"),
  rewardMean: doublePrecision("reward_mean").notNull(),
  rewardStd: doublePrecision("reward_std"),
  notes: text("notes"),
  metrics: jsonb("metrics").$type<Record<string, number | string>>().notNull(),
});


export type RawFplPlayer = typeof rawFplPlayers.$inferSelect;
export type RawFplTeam = typeof rawFplTeams.$inferSelect;
export type RawFplFixture = typeof rawFplFixtures.$inferSelect;
export type RawUnderstatPlayer = typeof rawUnderstatPlayers.$inferSelect;
export type PlayerFeaturesRow = typeof playerFeaturesLatest.$inferSelect;
export type FixtureFeaturesRow = typeof fixtureFeaturesLatest.$inferSelect;
export type PlayerSimulationRow = typeof playerSimulations.$inferSelect;
export type ProviderStatusRow = typeof providerStatus.$inferSelect;
export type CausalInsightRow = typeof causalInsights.$inferSelect;

export type StrategyModelRow = typeof strategyModels.$inferSelect;
export type StrategyModelEvaluationRow = typeof strategyModelEvaluations.$inferSelect;
