import crypto from "node:crypto";
import type { CausalInsight } from "@shared/schema";
import { DataRepository } from "./repositories/dataRepository";

export interface CausalExperimentConfig {
  insightId?: string;
  experimentKey: string;
  hypothesis: string;
  population?: {
    teamIds?: number[];
    positions?: Array<'GK' | 'DEF' | 'MID' | 'FWD'>;
    season?: string;
    notes?: string;
  };
  timeWindow: {
    start: Date;
    end: Date;
  };
  exposure: Record<string, unknown> & { name?: string };
  outcome: Record<string, unknown> & { name?: string };
  confounders?: Array<Record<string, unknown>>;
  effectEstimate?: Record<string, number>;
  tags?: string[];
  status?: 'draft' | 'ready' | 'published';
}

interface AggregatedPopulationMetrics {
  sampleSize: number;
  averagePoints: number;
  totalPoints: number;
  averageCost: number;
}

export class CausalEngine {
  private static instance: CausalEngine;
  private readonly repository: DataRepository;

  private constructor(repository: DataRepository) {
    this.repository = repository;
  }

  static getInstance(): CausalEngine {
    if (!CausalEngine.instance) {
      CausalEngine.instance = new CausalEngine(DataRepository.getInstance());
    }
    return CausalEngine.instance;
  }

  async createInsight(config: CausalExperimentConfig): Promise<CausalInsight> {
    const players = await this.repository.getFplPlayers();
    const filtered = this.filterPopulation(players, config.population);
    const metrics = this.aggregatePopulation(filtered);

    const experimentPopulation: Record<string, unknown> = {
      ...(config.population ?? {}),
      sampleSize: metrics.sampleSize,
    };

    const exposurePayload = {
      ...config.exposure,
      sampleSize: metrics.sampleSize,
      averageCost: Number(metrics.averageCost.toFixed(2)),
    } as Record<string, unknown>;

    const outcomePayload = {
      ...config.outcome,
      totalPoints: Number(metrics.totalPoints.toFixed(2)),
      averagePoints: Number(metrics.averagePoints.toFixed(2)),
    } as Record<string, unknown>;

    const insightId = config.insightId ?? crypto.randomUUID();

    return this.repository.insertCausalInsight({
      insightId,
      experimentKey: config.experimentKey,
      hypothesis: config.hypothesis,
      population: experimentPopulation,
      timeWindowStart: config.timeWindow.start,
      timeWindowEnd: config.timeWindow.end,
      exposure: exposurePayload,
      outcome: outcomePayload,
      confounders: config.confounders,
      effectEstimate: config.effectEstimate,
      tags: config.tags,
      status: config.status ?? 'draft',
    });
  }

  listInsights(filter?: Parameters<DataRepository['listCausalInsights']>[0]) {
    return this.repository.listCausalInsights(filter);
  }

  private filterPopulation(players: Awaited<ReturnType<DataRepository['getFplPlayers']>>, population?: CausalExperimentConfig['population']) {
    if (!population) {
      return players;
    }

    return players.filter(player => {
      const teamMatch = population.teamIds ? population.teamIds.includes(player.team) : true;
      const positionMatch = population.positions ? population.positions.includes(this.mapElementToPosition(player.element_type)) : true;
      return teamMatch && positionMatch;
    });
  }

  private aggregatePopulation(players: Awaited<ReturnType<DataRepository['getFplPlayers']>>): AggregatedPopulationMetrics {
    const sampleSize = players.length;
    if (sampleSize === 0) {
      return {
        sampleSize: 0,
        averagePoints: 0,
        totalPoints: 0,
        averageCost: 0,
      };
    }

    const totals = players.reduce((acc, player) => {
      acc.points += player.total_points;
      acc.cost += player.now_cost / 10;
      return acc;
    }, { points: 0, cost: 0 });

    return {
      sampleSize,
      totalPoints: totals.points,
      averagePoints: totals.points / sampleSize,
      averageCost: totals.cost / sampleSize,
    };
  }

  private mapElementToPosition(elementType: number): 'GK' | 'DEF' | 'MID' | 'FWD' {
    switch (elementType) {
      case 1:
        return 'GK';
      case 2:
        return 'DEF';
      case 3:
        return 'MID';
      default:
        return 'FWD';
    }
  }
}
