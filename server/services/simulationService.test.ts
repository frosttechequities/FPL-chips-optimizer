import { describe, expect, it, beforeEach, vi } from "vitest";
import type { ProcessedPlayer } from "@shared/schema";
import { SimulationService } from "./simulationService";
import { DataRepository } from "./repositories/dataRepository";
import { MonteCarloEngine } from "./monteCarloEngine";

function resetSingleton(): void {
  Reflect.set(SimulationService as unknown as Record<string, unknown>, 'instance', undefined);
}

describe('SimulationService', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    resetSingleton();
  });

  it('simulates and persists player summaries', async () => {
    const player: ProcessedPlayer = {
      id: 1,
      name: 'Test Mid',
      position: 'MID',
      team: 'TST',
      price: 7.5,
      points: 100,
      teamId: 1,
    };

    const fixtures = [{ playerId: 1, gameweek: 1, hasFixture: true, fdr: 3, isHome: true }];

    const repositoryStub = {
      upsertPlayerSimulation: vi.fn(async () => undefined),
    } as unknown as DataRepository;

    const simulationResult = {
      playerId: 1,
      simulations: [4, 6, 10],
      expectedPoints: 6,
      median: 6,
      mode: 6,
      standardDeviation: 2,
      percentiles: { p10: 4, p25: 5, p50: 6, p75: 7, p90: 9 },
      haulingProbability: 0.2,
      ceilingProbability: 0.1,
      floorProbability: 0.05,
      captainEV: 12,
      consistency: 2,
      coefficientOfVariation: 0.33,
      runs: 1000,
    };

    const engineStub = {
      simulatePlayer: vi.fn(async () => simulationResult),
      getSimulationRuns: vi.fn(() => 1000),
    } as unknown as MonteCarloEngine;

    vi.spyOn(DataRepository, 'getInstance').mockReturnValue(repositoryStub);
    vi.spyOn(MonteCarloEngine, 'getInstance').mockReturnValue(engineStub);

    const service = SimulationService.getInstance();
    const summary = await service.simulateAndPersist(player, fixtures);

    expect(engineStub.simulatePlayer).toHaveBeenCalledWith(player, fixtures, undefined, undefined);
    expect(repositoryStub.upsertPlayerSimulation).toHaveBeenCalledWith(expect.objectContaining({
      playerId: 1,
      meanPoints: 6,
      p25: 5,
      p75: 7,
      haulProbability: 0.2,
      ceilingProbability: 0.1,
      floorProbability: 0.05,
    }));
    expect(summary.medianPoints).toBe(6);
    expect(summary.captainEV).toBe(12);
  });
});
