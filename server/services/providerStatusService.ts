import { OddsService } from "./oddsService";
import { StatsService } from "./statsService";
import { DataRepository } from "./repositories/dataRepository";
import { DataPipeline } from "./dataPipeline";

export interface ProviderStatusOverview {
  timestamp: string;
  providers: Array<{
    provider: string;
    status: string;
    latencyMs?: number;
    lastSuccessAt?: string;
    lastErrorAt?: string;
    dataCurrencyMinutes?: number;
    details?: Record<string, unknown> | null;
  }>;
  freshness: {
    players?: string;
    teams?: string;
    fixtures?: string;
    advancedStats?: string;
  };
  pipeline?: {
    trigger: string;
    startedAt: string;
    completedAt: string;
    durationMs: number;
    status: string;
    error?: string;
    playersIngested: number;
    fixturesIngested: number;
    advancedStatsIngested: number;
  } | null;
  auxiliary: {
    odds: ReturnType<OddsService["getProviderInfo"]>;
    stats: ReturnType<StatsService["getProviderInfo"]>;
  };
}

export class ProviderStatusService {
  private static instance: ProviderStatusService;
  private readonly repository: DataRepository | null;
  private readonly pipeline: DataPipeline | null;
  private readonly oddsService = OddsService.getInstance();
  private readonly statsService = StatsService.getInstance();

  private constructor() {
    this.repository = this.safeCreateRepository();
    this.pipeline = this.safeCreatePipeline();
  }

  static getInstance(): ProviderStatusService {
    if (!ProviderStatusService.instance) {
      ProviderStatusService.instance = new ProviderStatusService();
    }
    return ProviderStatusService.instance;
  }

  async getOverview(): Promise<ProviderStatusOverview> {
    const timestamp = new Date();

    const providers = await this.fetchProviderStatuses();
    const freshness = await this.fetchFreshness();
    const pipelineRun = this.pipeline?.getLastRun() ?? null;

    return {
      timestamp: timestamp.toISOString(),
      providers,
      freshness,
      pipeline: pipelineRun ? {
        trigger: pipelineRun.trigger,
        startedAt: pipelineRun.startedAt.toISOString(),
        completedAt: pipelineRun.completedAt.toISOString(),
        durationMs: pipelineRun.durationMs,
        status: pipelineRun.status,
        error: pipelineRun.error,
        playersIngested: pipelineRun.playersIngested,
        fixturesIngested: pipelineRun.fixturesIngested,
        advancedStatsIngested: pipelineRun.advancedStatsIngested,
      } : null,
      auxiliary: {
        odds: this.oddsService.getProviderInfo(),
        stats: this.statsService.getProviderInfo(),
      },
    };
  }

  private async fetchProviderStatuses(): Promise<ProviderStatusOverview["providers"]> {
    if (!this.repository) return [];
    const rows = await this.repository.getProviderStatuses();
    return rows.map(row => ({
      provider: row.provider,
      status: row.status,
      latencyMs: row.latencyMs ?? undefined,
      lastSuccessAt: row.lastSuccessAt?.toISOString(),
      lastErrorAt: row.lastErrorAt?.toISOString(),
      dataCurrencyMinutes: row.dataCurrencyMinutes ?? undefined,
      details: row.details ?? undefined,
    }));
  }

  private async fetchFreshness(): Promise<ProviderStatusOverview["freshness"]> {
    if (!this.repository) return {};
    const timestamps = await this.repository.getLatestFetchTimestamps();
    return {
      players: timestamps.players?.toISOString(),
      teams: timestamps.teams?.toISOString(),
      fixtures: timestamps.fixtures?.toISOString(),
      advancedStats: timestamps.advancedStats?.toISOString(),
    };
  }

  private safeCreateRepository(): DataRepository | null {
    try {
      return DataRepository.getInstance();
    } catch (error) {
      console.warn("[provider-status] Repository unavailable:", error instanceof Error ? error.message : error);
      return null;
    }
  }

  private safeCreatePipeline(): DataPipeline | null {
    try {
      return DataPipeline.getInstance();
    } catch (error) {
      console.warn("[provider-status] Pipeline unavailable:", error instanceof Error ? error.message : error);
      return null;
    }
  }
}
