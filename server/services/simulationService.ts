import { ProcessedPlayer, PlayerSimulation } from "@shared/schema";
import { MonteCarloEngine } from "./monteCarloEngine";
import { DataRepository } from "./repositories/dataRepository";

export class SimulationService {
  private static instance: SimulationService;
  private readonly engine: MonteCarloEngine;
  private readonly repository: DataRepository;

  private constructor(repository: DataRepository) {
    this.engine = MonteCarloEngine.getInstance();
    this.repository = repository;
  }

  static getInstance(): SimulationService {
    if (!SimulationService.instance) {
      SimulationService.instance = new SimulationService(DataRepository.getInstance());
    }
    return SimulationService.instance;
  }

  async simulateAndPersist(
    player: ProcessedPlayer,
    fixtures: any[],
    context: { advancedStats?: any; odds?: any[] } = {}
  ): Promise<PlayerSimulation> {
    const result = await this.engine.simulatePlayer(player, fixtures, context.advancedStats, context.odds);

    const simulation: PlayerSimulation = {
      playerId: player.id,
      generatedAt: new Date().toISOString(),
      runs: result.runs,
      meanPoints: result.expectedPoints,
      medianPoints: result.median,
      p10: result.percentiles.p10,
      p25: result.percentiles.p25,
      p75: result.percentiles.p75,
      p90: result.percentiles.p90,
      standardDeviation: result.standardDeviation,
      haulProbability: result.haulingProbability,
      floorProbability: result.floorProbability,
      ceilingProbability: result.ceilingProbability,
      captainEV: result.captainEV,
      coefficientOfVariation: result.coefficientOfVariation,
    };

    await this.repository.upsertPlayerSimulation(simulation);
    return simulation;
  }
}
