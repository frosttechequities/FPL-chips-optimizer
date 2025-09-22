import { describe, expect, it, beforeEach, vi } from "vitest";
import { CausalEngine, type CausalExperimentConfig } from "./causalEngine";
import { DataRepository } from "./repositories/dataRepository";
import type { CausalInsight } from "@shared/schema";

function resetSingleton() {
  Reflect.set(CausalEngine as unknown as Record<string, unknown>, 'instance', undefined);
}

describe('CausalEngine', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    resetSingleton();
  });

  it('creates insight with aggregated population metrics', async () => {
    const players = [
      {
        id: 1,
        web_name: 'Alpha',
        element_type: 3,
        team: 10,
        now_cost: 75,
        total_points: 120,
        first_name: 'A',
        second_name: 'Player',
      },
      {
        id: 2,
        web_name: 'Beta',
        element_type: 4,
        team: 11,
        now_cost: 65,
        total_points: 90,
        first_name: 'B',
        second_name: 'Player',
      }
    ];

    const inserted: CausalInsight = {
      insightId: 'insight-123',
      experimentKey: 'manager-change',
      hypothesis: 'Test hypothesis',
      population: { sampleSize: 2 },
      timeWindowStart: new Date().toISOString(),
      timeWindowEnd: new Date().toISOString(),
      exposure: {},
      outcome: {},
      confounders: [],
      status: 'draft',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const insertSpy = vi.fn(async (input: any) => ({
      ...inserted,
      insightId: input.insightId,
      experimentKey: input.experimentKey,
      hypothesis: input.hypothesis,
      population: input.population,
      exposure: input.exposure,
      outcome: input.outcome,
      confounders: input.confounders,
      effectEstimate: input.effectEstimate,
      tags: input.tags,
      status: input.status,
    } satisfies CausalInsight));

    vi.spyOn(DataRepository, 'getInstance').mockReturnValue({
      getFplPlayers: vi.fn().mockResolvedValue(players),
      insertCausalInsight: insertSpy,
      listCausalInsights: vi.fn(),
    } as unknown as DataRepository);

    const engine = CausalEngine.getInstance();
    const config: CausalExperimentConfig = {
      insightId: 'insight-123',
      experimentKey: 'manager-change',
      hypothesis: 'Manager change boosts points.',
      population: { teamIds: [10, 11] },
      timeWindow: {
        start: new Date('2025-01-01T00:00:00Z'),
        end: new Date('2025-02-01T00:00:00Z'),
      },
      exposure: { label: 'Post-change period' },
      outcome: { metric: 'average_points' },
      confounders: [{ name: 'injury_burden', value: 'medium' }],
      tags: ['phase-4'],
    };

    const insight = await engine.createInsight(config);

    expect(insertSpy).toHaveBeenCalledTimes(1);
    const call = insertSpy.mock.calls[0][0];
    expect(call.population.sampleSize).toBe(2);
    expect(call.exposure.averageCost).toBeDefined();
    expect(call.outcome.averagePoints).toBeDefined();
    expect(insight.insightId).toBe('insight-123');
    expect(insight.population?.sampleSize).toBe(2);
    expect(insight.exposure.averageCost).toBeDefined();
    expect(insight.outcome.totalPoints).toBeDefined();
  });

  it('proxies listInsights to repository', async () => {
    const listSpy = vi.fn().mockResolvedValue([
      {
        insightId: 'x',
        experimentKey: 'exp',
        hypothesis: 'hyp',
        population: null,
        timeWindowStart: new Date().toISOString(),
        timeWindowEnd: new Date().toISOString(),
        exposure: {},
        outcome: {},
        status: 'draft',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      } satisfies CausalInsight,
    ]);

    vi.spyOn(DataRepository, 'getInstance').mockReturnValue({
      getFplPlayers: vi.fn().mockResolvedValue([]),
      insertCausalInsight: vi.fn(),
      listCausalInsights: listSpy,
    } as unknown as DataRepository);

    const engine = CausalEngine.getInstance();
    const results = await engine.listInsights({ status: 'draft' });

    expect(listSpy).toHaveBeenCalledWith({ status: 'draft' });
    expect(results).toHaveLength(1);
  });
});
