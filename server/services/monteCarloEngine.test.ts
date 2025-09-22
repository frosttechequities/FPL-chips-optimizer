import { describe, expect, it } from "vitest";
import { MonteCarloEngine } from "./monteCarloEngine";

function resetSingleton() {
  Reflect.set(MonteCarloEngine as unknown as Record<string, unknown>, 'instance', undefined);
}

describe('MonteCarloEngine statistics', () => {
  it('calculates percentile and probability metadata', () => {
    resetSingleton();
    const engine = MonteCarloEngine.getInstance();
    const stats = (engine as unknown as { calculateStatistics(id: number, runs: number[]): any }).calculateStatistics(1, [1, 2, 5, 10, 15, 20]);

    expect(stats.percentiles.p10).toBeDefined();
    expect(stats.percentiles.p25).toBeDefined();
    expect(stats.percentiles.p50).toBeDefined();
    expect(stats.percentiles.p75).toBeDefined();
    expect(stats.percentiles.p90).toBeDefined();
    expect(stats.haulingProbability).toBeGreaterThanOrEqual(0);
    expect(stats.ceilingProbability).toBeGreaterThanOrEqual(0);
    expect(stats.floorProbability).toBeGreaterThanOrEqual(0);
    expect(stats.runs).toBe(engine.getSimulationRuns());
  });
});
