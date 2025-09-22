import type { StrategyModelSummary, StrategyPolicyMetadata, StrategyPolicyPayload } from "@shared/schema";
import { DataRepository, type StrategyPolicyRecord } from "./repositories/dataRepository";
import { rlMetrics } from "../telemetry/rlMetrics";

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

type StrategyStatus = StrategyModelSummary['status'];

export class StrategyModelRegistry {
  private static instance: StrategyModelRegistry;
  private readonly repository: DataRepository;
  private cache: { record: StrategyPolicyRecord; fetchedAt: number } | null = null;

  private constructor(repository: DataRepository) {
    this.repository = repository;
  }

  static getInstance(): StrategyModelRegistry {
    if (!StrategyModelRegistry.instance) {
      StrategyModelRegistry.instance = new StrategyModelRegistry(DataRepository.getInstance());
    }
    return StrategyModelRegistry.instance;
  }

  async getActivePolicy(forceRefresh = false): Promise<StrategyPolicyRecord | null> {
    const now = Date.now();
    if (!forceRefresh && this.cache && (now - this.cache.fetchedAt) < CACHE_TTL_MS) {
      return this.cache.record;
    }

    const record = await this.repository.getActiveStrategyModel();
    if (!record) {
      this.cache = null;
      return null;
    }

    this.cache = { record, fetchedAt: now };
    return record;
  }

  async refreshActivePolicy(): Promise<StrategyPolicyRecord | null> {
    return this.getActivePolicy(true);
  }

  async listModels(statuses?: StrategyStatus[]): Promise<StrategyModelSummary[]> {
    if (statuses && statuses.length === 0) {
      return [];
    }
    return this.repository.listStrategyModels(statuses);
  }

  async markModelStatus(modelId: string, status: StrategyStatus): Promise<void> {
    await this.repository.updateStrategyModelStatus(modelId, status);
    if (status === 'active') {
      // Demote previously active models
      const current = await this.repository.listStrategyModels(['active']);
      const demote = current.filter(model => model.modelId !== modelId);
      await Promise.all(demote.map(model => this.repository.updateStrategyModelStatus(model.modelId, 'archived')));
      await this.refreshActivePolicy();
    } else if (this.cache?.record.metadata.modelId === modelId) {
      this.cache = null;
    }
  }

  async recordEvaluation(params: {
    evaluationId: string;
    modelId: string;
    validationScore: number;
    heuristicBaseline?: number;
    uplift?: number;
    rewardMean: number;
    rewardStd?: number;
    notes?: string;
    metrics: Record<string, number | string>;
  }): Promise<void> {
    await this.repository.recordStrategyEvaluation(params);
    rlMetrics.recordTraining({
      modelId: params.modelId,
      rewardMean: params.rewardMean,
      rewardStd: params.rewardStd,
      validationScore: params.validationScore,
      episodes: params.metrics['episodes'] && typeof params.metrics['episodes'] === 'number'
        ? Number(params.metrics['episodes'])
        : params.metrics['episodes'] && typeof params.metrics['episodes'] === 'string'
          ? Number(params.metrics['episodes'])
          : 0,
      status: 'staging'
    });
  }

  getCachedMetadata(): StrategyPolicyMetadata | null {
    return this.cache?.record.metadata ?? null;
  }

  getCachedPayload(): StrategyPolicyPayload | null {
    return this.cache?.record.payload ?? null;
  }

  clearCache(): void {
    this.cache = null;
  }
}
