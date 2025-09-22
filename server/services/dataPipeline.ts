import cron, { type ScheduledTask } from "node-cron";
import type { FPLPlayer } from "@shared/schema";
import { FPLApiService } from "./fplApi";
import { StatsService } from "./statsService";
import { DataRepository } from "./repositories/dataRepository";
import type { ProviderCallMetadata } from './providers';

interface PipelineStats {
  trigger: "startup" | "manual" | "cron" | "stale-check";
  startedAt: Date;
  completedAt: Date;
  durationMs: number;
  playersIngested: number;
  fixturesIngested: number;
  advancedStatsIngested: number;
  status: "success" | "partial" | "failed";
  error?: string;
}

export class DataPipeline {
  private static instance: DataPipeline;
  private readonly repository: DataRepository;
  private readonly fplApi: FPLApiService;
  private readonly statsService: StatsService;
  private cronTask: ScheduledTask | null = null;
  private lastRun?: PipelineStats;

  private constructor(repository: DataRepository) {
    this.repository = repository;
    this.fplApi = FPLApiService.getInstance();
    this.statsService = StatsService.getInstance();
  }

  static getInstance(): DataPipeline {
    if (!DataPipeline.instance) {
      DataPipeline.instance = new DataPipeline(DataRepository.getInstance());
    }
    return DataPipeline.instance;
  }

  static create(repository: DataRepository): DataPipeline {
    return new DataPipeline(repository);
  }

  async initialise(): Promise<void> {
    if (process.env.DATA_PIPELINE_BOOTSTRAP !== "false") {
      await this.runFullRefresh("startup").catch(error => {
        console.error("[pipeline] Initial bootstrap failed", error);
      });
    }

    const schedule = process.env.DATA_PIPELINE_SCHEDULE;
    if (schedule) {
      this.startCron(schedule);
    }
  }

  async ensureFreshData(maxAgeMinutes: number = 60): Promise<void> {
    const freshness = await this.repository.getLatestFetchTimestamps();
    const now = Date.now();
    const maxAgeMs = maxAgeMinutes * 60 * 1000;
    const isStale = !freshness.players || now - freshness.players.getTime() > maxAgeMs;

    if (isStale) {
      await this.runFullRefresh("stale-check");
    }
  }

  getLastRun(): PipelineStats | undefined {
    return this.lastRun;
  }

  async runFullRefresh(trigger: PipelineStats["trigger"] = "manual"): Promise<PipelineStats> {
    const startedAt = new Date();
    let playersIngested = 0;
    let fixturesIngested = 0;
    let advancedStatsIngested = 0;
    let status: PipelineStats["status"] = "success";
    let errorMessage: string | undefined;

    console.log(`[pipeline] Running full refresh (trigger=${trigger})`);

    try {
      const players = await this.ingestFplBootstrap();
      playersIngested = players.length;

      fixturesIngested = await this.ingestFixtures();

      if (playersIngested > 0) {
        advancedStatsIngested = await this.ingestAdvancedStats(players);
      }

      this.lastRun = {
        trigger,
        startedAt,
        completedAt: new Date(),
        durationMs: Date.now() - startedAt.getTime(),
        playersIngested,
        fixturesIngested,
        advancedStatsIngested,
        status,
      };

      console.log(`[pipeline] Full refresh complete in ${this.lastRun.durationMs}ms`);
      return this.lastRun;
    } catch (error) {
      status = advancedStatsIngested > 0 || playersIngested > 0 ? "partial" : "failed";
      errorMessage = error instanceof Error ? error.message : String(error);
      console.error("[pipeline] Refresh failed", error);

      this.lastRun = {
        trigger,
        startedAt,
        completedAt: new Date(),
        durationMs: Date.now() - startedAt.getTime(),
        playersIngested,
        fixturesIngested,
        advancedStatsIngested,
        status,
        error: errorMessage,
      };

      throw error;
    }
  }

  private async ingestFplBootstrap(): Promise<FPLPlayer[]> {
    try {
      const bootstrap = await this.fplApi.getBootstrapData();
      await Promise.all([
        this.repository.upsertFplPlayers(bootstrap.elements, new Date()),
        this.repository.upsertFplTeams(bootstrap.teams, new Date()),
      ]);

      await this.updateProviderStatus('fpl-api', this.fplApi.getProviderMetadata(), {
        players: bootstrap.elements.length,
        teams: bootstrap.teams.length,
      });

      return bootstrap.elements;
    } catch (error) {
      await this.updateProviderStatus('fpl-api', this.fplApi.getProviderMetadata(), {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  private async ingestFixtures(): Promise<number> {
    try {
      const fixtures = await this.fplApi.getFixtures();
      await this.repository.upsertFplFixtures(fixtures, new Date());

      await this.updateProviderStatus('fpl-fixtures', this.fplApi.getProviderMetadata(), {
        fixtures: fixtures.length,
      });

      return fixtures.length;
    } catch (error) {
      await this.updateProviderStatus('fpl-fixtures', this.fplApi.getProviderMetadata(), {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  private async ingestAdvancedStats(players: FPLPlayer[]): Promise<number> {
    const providerName = process.env.STATS_PROVIDER || "mock";
    try {
      const playerIds = players.map(player => player.id);
      const stats = await this.statsService.getPlayerAdvancedBatch(playerIds);

      if (stats.length > 0) {
        const fetchedAt = new Date();
        await Promise.all([
          this.repository.upsertUnderstatPlayers(stats, providerName, fetchedAt),
          this.repository.upsertPlayerFeatureSnapshots(stats, providerName, undefined, fetchedAt),
        ]);
      }

      await this.updateProviderStatus('advanced-stats', this.statsService.getProviderMetadata(), {
        provider: providerName,
        players: stats.length,
      });

      return stats.length;
    } catch (error) {
      await this.updateProviderStatus('advanced-stats', this.statsService.getProviderMetadata(), {
        provider: providerName,
        error: error instanceof Error ? error.message : String(error),
      });
      console.warn("[pipeline] Advanced stats ingestion failed", error);
      return 0;
    }
  }

  private startCron(schedule: string): void {
    if (this.cronTask) {
      this.cronTask.stop();
    }

    const options = {
      scheduled: true,
      timezone: process.env.DATA_PIPELINE_TZ || "UTC",
    } satisfies { scheduled?: boolean; timezone?: string };

    this.cronTask = cron.schedule(schedule, () => {
      this.runFullRefresh("cron").catch(error => {
        console.error("[pipeline] Scheduled refresh failed", error);
      });
    }, options);

    console.log(`[pipeline] Scheduled refresh configured (${schedule})`);
  }

  private async updateProviderStatus(provider: string, metadata: ProviderCallMetadata | null, details?: Record<string, unknown>): Promise<void> {
    if (!this.repository) return;

    const update = {
      status: metadata?.status ?? 'degraded',
      latencyMs: metadata?.lastLatencyMs ?? null,
      lastSuccessAt: metadata?.lastSuccessAt ?? null,
      lastErrorAt: metadata?.lastErrorAt ?? null,
      dataCurrencyMinutes: metadata?.dataCurrencyMinutes ?? null,
      details: details ?? metadata?.extra ?? null,
    };

    await this.repository.upsertProviderStatus(provider, update);
  }
}

