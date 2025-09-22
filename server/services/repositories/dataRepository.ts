import { and, desc, eq, inArray, max, sql } from "drizzle-orm";
import type {
  FPLFixture,
  FPLPlayer,
  FPLTeam,
  PlayerAdvanced,
  StrategyModelSummary,
  StrategyPolicyMetadata,
  StrategyPolicyPayload,
  CausalInsight,
  PlayerSimulation
} from "@shared/schema";
import {
  analysisCache,
  cacheEntries,
  fixtureFeaturesLatest,
  playerFeaturesLatest,
  providerStatus,
  rawFbrefTeamStats,
  rawFplFixtures,
  rawFplPlayers,
  rawFplTeams,
  rawUnderstatPlayers,
  strategyModelEvaluations,
  strategyModels,
  causalInsights,
  playerSimulations,
  type FixtureFeaturesRow,
  type ProviderHealthStatus,
  type ProviderStatusRow,
  type StrategyModelEvaluationRow,
  type StrategyModelRow,
  type CausalInsightRow,
  type PlayerSimulationRow
} from "../../db/schema";
import { createDatabase, type AppDatabase } from "../../db/client";

export interface StrategyPolicyRecord {
  metadata: StrategyPolicyMetadata;
  payload: StrategyPolicyPayload;
}

export interface CreateCausalInsightInput {
  insightId: string;
  experimentKey: string;
  hypothesis: string;
  population?: Record<string, unknown> | null;
  timeWindowStart: Date;
  timeWindowEnd: Date;
  exposure: Record<string, unknown>;
  outcome: Record<string, unknown>;
  confounders?: Array<Record<string, unknown>>;
  effectEstimate?: Record<string, number>;
  tags?: string[];
  status?: 'draft' | 'ready' | 'published';
}

export interface ProviderStatusUpdate {
  status: ProviderHealthStatus;
  latencyMs?: number | null;
  lastSuccessAt?: Date | null;
  lastErrorAt?: Date | null;
  dataCurrencyMinutes?: number | null;
  details?: Record<string, unknown> | null;
}

export class DataRepository {
  private static instance: DataRepository;

  private constructor(private readonly db: AppDatabase) {}

  static getInstance(db?: AppDatabase): DataRepository {
    if (!DataRepository.instance) {
      DataRepository.instance = new DataRepository(db ?? createDatabase());
    }
    return DataRepository.instance;
  }

  static create(db: AppDatabase): DataRepository {
    return new DataRepository(db);
  }

  async upsertFplPlayers(players: FPLPlayer[], fetchedAt: Date = new Date()): Promise<void> {
    if (players.length === 0) return;

    await this.db.insert(rawFplPlayers)
      .values(players.map(player => ({
        playerId: player.id,
        payload: player,
        fetchedAt,
      })))
      .onConflictDoUpdate({
        target: rawFplPlayers.playerId,
        set: {
          payload: sql`excluded.payload`,
          fetchedAt: sql`excluded.fetched_at`,
        },
      });
  }

  async upsertFplTeams(teams: FPLTeam[], fetchedAt: Date = new Date()): Promise<void> {
    if (teams.length === 0) return;

    await this.db.insert(rawFplTeams)
      .values(teams.map(team => ({
        teamId: team.id,
        payload: team,
        fetchedAt,
      })))
      .onConflictDoUpdate({
        target: rawFplTeams.teamId,
        set: {
          payload: sql`excluded.payload`,
          fetchedAt: sql`excluded.fetched_at`,
        },
      });
  }

  async upsertFplFixtures(fixtures: FPLFixture[], fetchedAt: Date = new Date()): Promise<void> {
    if (fixtures.length === 0) return;

    await this.db.insert(rawFplFixtures)
      .values(fixtures.map(fixture => ({
        fixtureId: fixture.id,
        event: fixture.event,
        payload: fixture,
        fetchedAt,
      })))
      .onConflictDoUpdate({
        target: rawFplFixtures.fixtureId,
        set: {
          payload: sql`excluded.payload`,
          event: sql`excluded.event`,
          fetchedAt: sql`excluded.fetched_at`,
        },
      });
  }

  async upsertUnderstatPlayers(players: PlayerAdvanced[], provider = "understat", fetchedAt: Date = new Date()): Promise<void> {
    if (players.length === 0) return;

    await this.db.insert(rawUnderstatPlayers)
      .values(players.map(player => ({
        playerId: player.playerId,
        payload: player,
        fetchedAt,
        provider,
      })))
      .onConflictDoUpdate({
        target: rawUnderstatPlayers.playerId,
        set: {
          payload: sql`excluded.payload`,
          fetchedAt: sql`excluded.fetched_at`,
          provider: sql`excluded.provider`,
        },
      });
  }


  async upsertPlayerFeatureSnapshots(snapshots: PlayerAdvanced[], source: string, version?: string, fetchedAt: Date = new Date()): Promise<void> {
    if (snapshots.length === 0) return;

    await this.db.insert(playerFeaturesLatest)
      .values(snapshots.map(snapshot => ({
        playerId: snapshot.playerId,
        source,
        modelVersion: version,
        features: {
          xG: snapshot.xG,
          xA: snapshot.xA,
          xMins: snapshot.xMins,
          role: snapshot.role,
          volatility: snapshot.volatility,
          formTrend: snapshot.formTrend,
          fixtureAdjustedXG: snapshot.fixtureAdjustedXG,
          fixtureAdjustedXA: snapshot.fixtureAdjustedXA,
        },
        updatedAt: fetchedAt,
      })))
      .onConflictDoUpdate({
        target: playerFeaturesLatest.playerId,
        set: {
          source: sql`excluded.source`,
          modelVersion: sql`excluded.model_version`,
          features: sql`excluded.features`,
          updatedAt: sql`excluded.updated_at`,
        },
      });
  }

  async upsertFixtureFeatures(snapshots: FixtureFeaturesRow[]): Promise<void> {
    if (snapshots.length === 0) return;

    await this.db.insert(fixtureFeaturesLatest)
      .values(snapshots.map(snapshot => ({
        fixtureId: snapshot.fixtureId,
        provider: snapshot.provider,
        features: snapshot.features,
        updatedAt: snapshot.updatedAt ?? new Date(),
      })))
      .onConflictDoUpdate({
        target: fixtureFeaturesLatest.fixtureId,
        set: {
          provider: sql`excluded.provider`,
          features: sql`excluded.features`,
          updatedAt: sql`excluded.updated_at`,
        },
      });
  }

  async recordFbrefSnapshot(teamId: number, season: string, payload: Record<string, string | number | null>, fetchedAt: Date = new Date()): Promise<void> {
    await this.db.insert(rawFbrefTeamStats)
      .values({
        teamId,
        season,
        payload: {
          teamId,
          season,
          metrics: payload,
        },
        fetchedAt,
      })
      .onConflictDoUpdate({
        target: [rawFbrefTeamStats.teamId, rawFbrefTeamStats.season],
        set: {
          payload: sql`excluded.payload`,
          fetchedAt: sql`excluded.fetched_at`,
        },
      });
  }

  async getFplPlayers(): Promise<FPLPlayer[]> {
    const rows = await this.db.select().from(rawFplPlayers);
    return rows.map(row => row.payload);
  }

  async getFplTeams(): Promise<FPLTeam[]> {
    const rows = await this.db.select().from(rawFplTeams);
    return rows.map(row => row.payload);
  }

  async getFplFixtures(filter?: { events?: number[] }): Promise<FPLFixture[]> {
    let rows;
    if (filter?.events && filter.events.length > 0) {
      rows = await this.db
        .select()
        .from(rawFplFixtures)
        .where(inArray(rawFplFixtures.event, filter.events));
    } else {
      rows = await this.db.select().from(rawFplFixtures);
    }
    return rows.map(row => row.payload);
  }

  async getFixtureById(fixtureId: number): Promise<FPLFixture | null> {
    const rows = await this.db.select().from(rawFplFixtures).where(eq(rawFplFixtures.fixtureId, fixtureId)).limit(1);
    return rows[0]?.payload ?? null;
  }

  async getPlayerAdvanced(playerId: number): Promise<PlayerAdvanced | null> {
    const rows = await this.db.select().from(rawUnderstatPlayers).where(eq(rawUnderstatPlayers.playerId, playerId)).limit(1);
    return rows[0]?.payload ?? null;
  }

  async getPlayerAdvancedBatch(playerIds: number[]): Promise<PlayerAdvanced[]> {
    if (playerIds.length === 0) return [];
    const rows = await this.db.select().from(rawUnderstatPlayers).where(inArray(rawUnderstatPlayers.playerId, playerIds));
    return rows.map(row => row.payload);
  }

  async getPlayerFeatureSnapshot(playerId: number): Promise<PlayerAdvanced | null> {
    const rows = await this.db.select().from(playerFeaturesLatest).where(eq(playerFeaturesLatest.playerId, playerId)).limit(1);
    if (!rows[0]) return null;

    const features = rows[0].features;
    return {
      playerId,
      xG: Number(features.xG) || 0,
      xA: Number(features.xA) || 0,
      xMins: Number(features.xMins) || 0,
      role: (features.role as PlayerAdvanced["role"]) ?? "rotation",
      volatility: Number(features.volatility) || 0,
      formTrend: (features.formTrend as PlayerAdvanced["formTrend"]) ?? "stable",
      fixtureAdjustedXG: Number(features.fixtureAdjustedXG) || 0,
      fixtureAdjustedXA: Number(features.fixtureAdjustedXA) || 0,
      lastUpdated: rows[0].updatedAt?.toISOString() ?? new Date().toISOString(),
    };
  }

  async getPlayerFeatureBatch(playerIds: number[]): Promise<PlayerAdvanced[]> {
    if (playerIds.length === 0) return [];
    const rows = await this.db.select().from(playerFeaturesLatest).where(inArray(playerFeaturesLatest.playerId, playerIds));
    return rows.map(row => ({
      playerId: row.playerId,
      xG: Number(row.features.xG) || 0,
      xA: Number(row.features.xA) || 0,
      xMins: Number(row.features.xMins) || 0,
      role: (row.features.role as PlayerAdvanced["role"]) ?? "rotation",
      volatility: Number(row.features.volatility) || 0,
      formTrend: (row.features.formTrend as PlayerAdvanced["formTrend"]) ?? "stable",
      fixtureAdjustedXG: Number(row.features.fixtureAdjustedXG) || 0,
      fixtureAdjustedXA: Number(row.features.fixtureAdjustedXA) || 0,
      lastUpdated: row.updatedAt?.toISOString() ?? new Date().toISOString(),
    }));
  }



  async upsertPlayerSimulation(simulation: PlayerSimulation): Promise<void> {
    await this.db.insert(playerSimulations)
      .values({
        playerId: simulation.playerId,
        generatedAt: new Date(simulation.generatedAt),
        runs: simulation.runs,
        meanPoints: simulation.meanPoints,
        medianPoints: simulation.medianPoints,
        p10: simulation.p10,
        p25: simulation.p25,
        p75: simulation.p75,
        p90: simulation.p90,
        standardDeviation: simulation.standardDeviation,
        haulProbability: simulation.haulProbability,
        floorProbability: simulation.floorProbability,
        ceilingProbability: simulation.ceilingProbability,
        captainEv: simulation.captainEV,
        coefficientOfVariation: simulation.coefficientOfVariation ?? null,
      })
      .onConflictDoUpdate({
        target: playerSimulations.playerId,
        set: {
          generatedAt: sql`excluded.generated_at`,
          runs: sql`excluded.runs`,
          meanPoints: sql`excluded.mean_points`,
          medianPoints: sql`excluded.median_points`,
          p10: sql`excluded.p10`,
          p25: sql`excluded.p25`,
          p75: sql`excluded.p75`,
          p90: sql`excluded.p90`,
          standardDeviation: sql`excluded.std_dev`,
          haulProbability: sql`excluded.haul_probability`,
          floorProbability: sql`excluded.floor_probability`,
          ceilingProbability: sql`excluded.ceiling_probability`,
          captainEv: sql`excluded.captain_ev`,
          coefficientOfVariation: sql`excluded.coefficient_variation`,
        },
      });
  }

  async getPlayerSimulation(playerId: number): Promise<PlayerSimulation | null> {
    const rows = await this.db.select().from(playerSimulations).where(eq(playerSimulations.playerId, playerId)).limit(1);
    if (!rows[0]) return null;
    return this.mapPlayerSimulation(rows[0]);
  }

  async getPlayerSimulations(playerIds: number[]): Promise<PlayerSimulation[]> {
    if (playerIds.length === 0) return [];
    const rows = await this.db.select().from(playerSimulations).where(inArray(playerSimulations.playerId, playerIds));
    return rows.map(row => this.mapPlayerSimulation(row));
  }

  async upsertAnalysisResult(teamId: string, payload: Record<string, unknown>, updatedAt: Date = new Date()): Promise<void> {
    await this.db.insert(analysisCache)
      .values({ teamId, payload, updatedAt })
      .onConflictDoUpdate({
        target: analysisCache.teamId,
        set: {
          payload: sql`excluded.payload`,
          updatedAt: sql`excluded.updated_at`,
        },
      });
  }

  async getAnalysisResult(teamId: string): Promise<Record<string, unknown> | null> {
    const rows = await this.db.select().from(analysisCache).where(eq(analysisCache.teamId, teamId)).limit(1);
    return rows[0]?.payload ?? null;
  }

  async upsertCacheEntry(key: string, payload: Record<string, unknown> | null, updatedAt: Date = new Date()): Promise<void> {
    await this.db.insert(cacheEntries)
      .values({ cacheKey: key, payload, updatedAt })
      .onConflictDoUpdate({
        target: cacheEntries.cacheKey,
        set: {
          payload: sql`excluded.payload`,
          updatedAt: sql`excluded.updated_at`,
        },
      });
  }

  async getCacheEntry(key: string): Promise<{ payload: Record<string, unknown> | null; updatedAt: Date } | null> {
    const rows = await this.db.select().from(cacheEntries).where(eq(cacheEntries.cacheKey, key)).limit(1);
    if (!rows[0]) return null;
    return {
      payload: rows[0].payload ?? null,
      updatedAt: rows[0].updatedAt ?? new Date(),
    };
  }

  async clearCacheEntries(keys: string[]): Promise<void> {
    if (keys.length === 0) return;
    await this.db.delete(cacheEntries).where(inArray(cacheEntries.cacheKey, keys));
  }

  async upsertProviderStatus(provider: string, update: ProviderStatusUpdate): Promise<void> {
    const now = new Date();
    await this.db.insert(providerStatus)
      .values({
        provider,
        status: update.status,
        latencyMs: update.latencyMs ?? null,
        lastSuccessAt: update.lastSuccessAt ?? (update.status === "online" ? now : null),
        lastErrorAt: update.lastErrorAt ?? (update.status === "offline" ? now : null),
        dataCurrencyMinutes: update.dataCurrencyMinutes ?? null,
        details: update.details ?? null,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: providerStatus.provider,
        set: {
          status: sql`excluded.status`,
          latencyMs: sql`excluded.latency_ms`,
          lastSuccessAt: sql`COALESCE(excluded.last_success_at, ${providerStatus.lastSuccessAt})`,
          lastErrorAt: sql`COALESCE(excluded.last_error_at, ${providerStatus.lastErrorAt})`,
          dataCurrencyMinutes: sql`excluded.data_currency_minutes`,
          details: sql`excluded.details`,
          updatedAt: sql`excluded.updated_at`,
        },
      });
  }

  async getProviderStatuses(): Promise<ProviderStatusRow[]> {
    return this.db.select().from(providerStatus);
  }


  async insertCausalInsight(input: CreateCausalInsightInput): Promise<CausalInsight> {
    const [row] = await this.db.insert(causalInsights)
      .values({
        insightId: input.insightId,
        experimentKey: input.experimentKey,
        hypothesis: input.hypothesis,
        population: input.population ?? null,
        timeWindowStart: input.timeWindowStart,
        timeWindowEnd: input.timeWindowEnd,
        exposure: input.exposure,
        outcome: input.outcome,
        confounders: input.confounders ?? null,
        effectEstimate: input.effectEstimate ?? null,
        tags: input.tags ?? null,
        status: input.status ?? 'draft',
      })
      .onConflictDoUpdate({
        target: causalInsights.insightId,
        set: {
          experimentKey: sql`excluded.experiment_key`,
          hypothesis: sql`excluded.hypothesis`,
          population: sql`excluded.population`,
          timeWindowStart: sql`excluded.time_window_start`,
          timeWindowEnd: sql`excluded.time_window_end`,
          exposure: sql`excluded.exposure`,
          outcome: sql`excluded.outcome`,
          confounders: sql`excluded.confounders`,
          effectEstimate: sql`excluded.effect_estimate`,
          tags: sql`excluded.tags`,
          status: sql`excluded.status`,
          updatedAt: sql`NOW()`
        },
      })
      .returning();

    return this.mapCausalInsight(row);
  }

  async listCausalInsights(filter?: { experimentKey?: string; status?: CausalInsight['status']; limit?: number }): Promise<CausalInsight[]> {
    const conditions = [];
    if (filter?.experimentKey) {
      conditions.push(eq(causalInsights.experimentKey, filter.experimentKey));
    }
    if (filter?.status) {
      conditions.push(eq(causalInsights.status, filter.status));
    }

    const baseQuery = this.db.select().from(causalInsights);
    const conditioned = conditions.length > 0 ? baseQuery.where(and(...conditions)) : baseQuery;
    const limited = filter?.limit ? conditioned.limit(filter.limit) : conditioned;
    const rows = await limited.orderBy(desc(causalInsights.updatedAt));
    return rows.map(row => this.mapCausalInsight(row));
  }

  async listStrategyModels(statuses?: StrategyModelSummary['status'][]): Promise<StrategyModelSummary[]> {
    const rows = statuses && statuses.length > 0
      ? await this.db
          .select()
          .from(strategyModels)
          .where(inArray(strategyModels.status, statuses as StrategyModelRow['status'][]))
          .orderBy(desc(strategyModels.updatedAt))
      : await this.db
          .select()
          .from(strategyModels)
          .orderBy(desc(strategyModels.updatedAt));

    return rows.map(row => this.mapStrategyModelRow(row));
  }

  async getStrategyModel(modelId: string): Promise<StrategyPolicyRecord | null> {
    const rows = await this.db.select().from(strategyModels)
      .where(eq(strategyModels.modelId, modelId))
      .limit(1);
    if (!rows[0]) return null;
    return this.mapStrategyPolicyRecord(rows[0]);
  }

  async getActiveStrategyModel(): Promise<StrategyPolicyRecord | null> {
    const rows = await this.db.select().from(strategyModels)
      .where(eq(strategyModels.status, 'active'))
      .orderBy(desc(strategyModels.updatedAt))
      .limit(1);
    if (!rows[0]) return null;
    return this.mapStrategyPolicyRecord(rows[0]);
  }

  async upsertStrategyModel(metadata: StrategyPolicyMetadata, payload: StrategyPolicyPayload, evaluationSummary?: Record<string, number | string> | null): Promise<StrategyModelRow> {
    const now = new Date();
    let summary = evaluationSummary ?? null;
    if (!summary && metadata.evaluation) {
      const candidate: Record<string, number | string> = {};
      if (typeof metadata.evaluation.validationScore === 'number') {
        candidate.validationScore = metadata.evaluation.validationScore;
      }
      if (typeof metadata.evaluation.heuristicBaseline === 'number') {
        candidate.heuristicBaseline = metadata.evaluation.heuristicBaseline;
      }
      if (typeof metadata.evaluation.uplift === 'number') {
        candidate.uplift = metadata.evaluation.uplift;
      }
      summary = Object.keys(candidate).length > 0 ? candidate : null;
    }

    const [row] = await this.db.insert(strategyModels)
      .values({
        modelId: metadata.modelId,
        version: metadata.version,
        status: metadata.status,
        algorithm: metadata.algorithm,
        checksum: metadata.checksum,
        rewardMean: metadata.rewardMean,
        rewardStd: metadata.rewardStd ?? null,
        validationScore: metadata.validationScore ?? null,
        trainingEpisodes: metadata.trainingEpisodes,
        featureNames: metadata.featureNames,
        featureMeans: metadata.featureMeans,
        featureStd: metadata.featureStd ?? null,
        hyperparameters: metadata.hyperparameters ?? null,
        policy: payload,
        evaluationSummary: summary,
        notes: metadata.notes ?? null,
        createdAt: metadata.createdAt ? new Date(metadata.createdAt) : now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: strategyModels.modelId,
        set: {
          version: sql`excluded.version`,
          status: sql`excluded.status`,
          algorithm: sql`excluded.algorithm`,
          checksum: sql`excluded.checksum`,
          rewardMean: sql`excluded.reward_mean`,
          rewardStd: sql`excluded.reward_std`,
          validationScore: sql`excluded.validation_score`,
          trainingEpisodes: sql`excluded.training_episodes`,
          featureNames: sql`excluded.feature_names`,
          featureMeans: sql`excluded.feature_means`,
          featureStd: sql`excluded.feature_std`,
          hyperparameters: sql`excluded.hyperparameters`,
          policy: sql`excluded.policy`,
          evaluationSummary: sql`excluded.evaluation_summary`,
          notes: sql`excluded.notes`,
          updatedAt: sql`excluded.updated_at`,
        },
      })
      .returning();

    return row;
  }

  async updateStrategyModelStatus(modelId: string, status: StrategyModelSummary['status']): Promise<void> {
    await this.db.update(strategyModels)
      .set({
        status: status as StrategyModelRow['status'],
        updatedAt: new Date(),
      })
      .where(eq(strategyModels.modelId, modelId));
  }

  async recordStrategyEvaluation(input: {
    evaluationId: string;
    modelId: string;
    validationScore: number;
    heuristicBaseline?: number;
    uplift?: number;
    rewardMean: number;
    rewardStd?: number;
    notes?: string;
    metrics: Record<string, number | string>;
  }): Promise<StrategyModelEvaluationRow> {
    const [row] = await this.db.insert(strategyModelEvaluations)
      .values({
        evaluationId: input.evaluationId,
        modelId: input.modelId,
        validationScore: input.validationScore,
        heuristicBaseline: input.heuristicBaseline ?? null,
        uplift: input.uplift ?? null,
        rewardMean: input.rewardMean,
        rewardStd: input.rewardStd ?? null,
        notes: input.notes ?? null,
        metrics: input.metrics,
      })
      .onConflictDoNothing()
      .returning();

    if (!row) {
      const existing = await this.db.select().from(strategyModelEvaluations)
        .where(eq(strategyModelEvaluations.evaluationId, input.evaluationId))
        .limit(1);
      if (existing[0]) {
        return existing[0];
      }
    }

    return row!;
  }

  async getLatestStrategyEvaluation(modelId: string): Promise<StrategyModelEvaluationRow | null> {
    const rows = await this.db.select().from(strategyModelEvaluations)
      .where(eq(strategyModelEvaluations.modelId, modelId))
      .orderBy(desc(strategyModelEvaluations.evaluatedAt))
      .limit(1);
    return rows[0] ?? null;
  }

  private mapPlayerSimulation(row: PlayerSimulationRow): PlayerSimulation {
    return {
      playerId: row.playerId,
      generatedAt: row.generatedAt?.toISOString() ?? new Date().toISOString(),
      runs: row.runs,
      meanPoints: row.meanPoints,
      medianPoints: row.medianPoints,
      p10: row.p10,
      p25: row.p25,
      p75: row.p75,
      p90: row.p90,
      standardDeviation: row.standardDeviation,
      haulProbability: row.haulProbability,
      floorProbability: row.floorProbability,
      ceilingProbability: row.ceilingProbability,
      captainEV: row.captainEv,
      coefficientOfVariation: row.coefficientOfVariation ?? undefined,
    };
  }

  private mapStrategyModelRow(row: StrategyModelRow): StrategyModelSummary {
    const policy = row.policy as StrategyPolicyPayload | null;
    const featureImportance = policy
      ? Object.entries(policy.featureWeights)
          .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
          .map(([feature, weight]) => ({ feature, weight }))
      : undefined;

    const evaluationSummary = row.evaluationSummary ?? {};
    const evaluationSeasons = Array.isArray((evaluationSummary as Record<string, unknown>).evaluationSeasons)
      ? (evaluationSummary as Record<string, unknown>).evaluationSeasons as string[]
      : undefined;
    const driftRaw = (evaluationSummary as Record<string, unknown>).drift;

    return {
      modelId: row.modelId,
      version: row.version,
      status: row.status,
      algorithm: row.algorithm,
      checksum: row.checksum,
      rewardMean: row.rewardMean,
      rewardStd: row.rewardStd ?? undefined,
      validationScore: row.validationScore ?? undefined,
      trainingEpisodes: row.trainingEpisodes,
      createdAt: row.createdAt ? row.createdAt.toISOString() : new Date().toISOString(),
      updatedAt: row.updatedAt ? row.updatedAt.toISOString() : new Date().toISOString(),
      featureNames: row.featureNames ?? [],
      featureImportance,
      evaluationSeasons,
      driftIndicator: typeof driftRaw === 'number' ? driftRaw : undefined,
      notes: row.notes ?? undefined,
    };
  }

  private mapStrategyPolicyRecord(row: StrategyModelRow): StrategyPolicyRecord {
    return {
      metadata: this.mapStrategyModelMetadata(row),
      payload: row.policy as StrategyPolicyPayload,
    };
  }

  private mapCausalInsight(row: CausalInsightRow): CausalInsight {
    return {
      insightId: row.insightId,
      experimentKey: row.experimentKey,
      hypothesis: row.hypothesis,
      population: row.population ?? null,
      timeWindowStart: row.timeWindowStart?.toISOString() ?? new Date().toISOString(),
      timeWindowEnd: row.timeWindowEnd?.toISOString() ?? new Date().toISOString(),
      exposure: row.exposure ?? {},
      outcome: row.outcome ?? {},
      confounders: row.confounders ?? undefined,
      effectEstimate: row.effectEstimate ?? undefined,
      tags: row.tags ?? undefined,
      status: (row.status ?? 'draft') as CausalInsight['status'],
      createdAt: row.createdAt?.toISOString() ?? new Date().toISOString(),
      updatedAt: row.updatedAt?.toISOString() ?? new Date().toISOString(),
    };
  }

  private mapStrategyModelMetadata(row: StrategyModelRow): StrategyPolicyMetadata {
    const summary = this.mapStrategyModelRow(row);
    const evaluationSummary = row.evaluationSummary ?? {};

    const evaluation = {
      validationScore: typeof evaluationSummary["validationScore"] === 'number' ? Number(evaluationSummary["validationScore"]) : undefined,
      heuristicBaseline: typeof evaluationSummary["heuristicBaseline"] === 'number' ? Number(evaluationSummary["heuristicBaseline"]) : undefined,
      uplift: typeof evaluationSummary["uplift"] === 'number' ? Number(evaluationSummary["uplift"]) : undefined,
    };
    const hasEvaluation = Object.values(evaluation).some(value => typeof value === 'number');

    return {
      ...summary,
      featureMeans: row.featureMeans ?? {},
      featureStd: row.featureStd ?? undefined,
      hyperparameters: row.hyperparameters ?? undefined,
      evaluation: hasEvaluation ? evaluation : undefined,
    };
  }

  async getLatestFetchTimestamps(): Promise<Record<string, Date | null>> {
    const [players, teams, fixtures, understat] = await Promise.all([
      this.db.select({ ts: max(rawFplPlayers.fetchedAt) }).from(rawFplPlayers),
      this.db.select({ ts: max(rawFplTeams.fetchedAt) }).from(rawFplTeams),
      this.db.select({ ts: max(rawFplFixtures.fetchedAt) }).from(rawFplFixtures),
      this.db.select({ ts: max(rawUnderstatPlayers.fetchedAt) }).from(rawUnderstatPlayers),
    ]);

    return {
      players: players[0]?.ts ?? null,
      teams: teams[0]?.ts ?? null,
      fixtures: fixtures[0]?.ts ?? null,
      advancedStats: understat[0]?.ts ?? null,
    };
  }
}

