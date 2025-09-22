import { describe, expect, beforeEach, it, vi } from "vitest";
import type { ProcessedPlayer, AnalysisResult, StrategyPolicyMetadata, StrategyPolicyPayload } from "@shared/schema";
import { StrategyAgent } from "./strategyAgent";
import { StrategyModelRegistry } from "./strategyModelRegistry";

type FeatureKey = 'expectedPoints' | 'volatility' | 'minutesShare' | 'formTrend' | 'priceValue' | 'differentialEdge';
const FEATURE_KEYS: FeatureKey[] = ['expectedPoints', 'volatility', 'minutesShare', 'formTrend', 'priceValue', 'differentialEdge'];


function resetAgentSingleton() {
  Reflect.set(StrategyAgent as unknown as Record<string, unknown>, 'instance', undefined);
}

function buildPlayer(overrides: Partial<ProcessedPlayer> = {}): ProcessedPlayer {
  return {
    id: overrides.id ?? Math.floor(Math.random() * 10000),
    name: overrides.name ?? 'Player',
    position: overrides.position ?? 'MID',
    team: overrides.team ?? 'Team',
    price: overrides.price ?? 8,
    points: overrides.points ?? 120,
    teamId: overrides.teamId ?? 1,
    isStarter: overrides.isStarter ?? true,
    expectedPoints: overrides.expectedPoints ?? 6,
    rankUpsideScore: overrides.rankUpsideScore ?? 75,
    coefficientOfVariation: overrides.coefficientOfVariation ?? 1.1,
    effectiveOwnership: overrides.effectiveOwnership ?? {
      playerId: overrides.id ?? 1,
      totalOwnership: 15,
      topOwnership: 20,
      activeOwnership: 12,
      captaincy: 5,
      topCaptaincy: 7,
      effectiveOwnership: 25,
      topEffectiveOwnership: 30,
      ownershipTier: 'balanced',
      riskTier: 'steady'
    },
    advancedStats: overrides.advancedStats ?? {
      playerId: overrides.id ?? 1,
      xG: 0.4,
      xA: 0.3,
      xMins: 82,
      role: 'nailed',
      volatility: 1.2,
      formTrend: 'rising',
      fixtureAdjustedXG: 0.45,
      fixtureAdjustedXA: 0.3,
      lastUpdated: new Date().toISOString()
    },
    ...overrides,
  } as ProcessedPlayer;
}

function buildAnalysis(players: ProcessedPlayer[]): AnalysisResult {
  return {
    teamId: '1',
    teamName: 'Test',
    players,
    totalValue: 100,
    totalPoints: 1000,
    gameweeks: [],
    recommendations: [],
    budget: {
      bank: 0,
      teamValue: 100,
      freeTransfers: 2,
      nextDeadline: new Date().toISOString(),
      canAfford: {
        maxPlayerPrice: 12,
        benchUpgrades: [],
        starterUpgrades: []
      }
    },
    lastUpdated: new Date().toISOString(),
  } as unknown as AnalysisResult;
}

describe('StrategyAgent', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    resetAgentSingleton();
  });

  it('falls back to heuristics when no policy is available', async () => {
    vi.spyOn(StrategyModelRegistry, 'getInstance').mockReturnValue({
      getActivePolicy: vi.fn().mockResolvedValue(null),
    } as unknown as StrategyModelRegistry);

    const agent = StrategyAgent.getInstance();
    const analysis = buildAnalysis([
      buildPlayer({ id: 1, name: 'Alpha' }),
      buildPlayer({ id: 2, name: 'Beta', coefficientOfVariation: 1.5, rankUpsideScore: 60 }),
    ]);

    const recommendation = await agent.recommendTransfers({
      analysis,
      intentType: 'transfer_suggestions',
      focus: 'balanced'
    });

    expect(recommendation).not.toBeNull();
    expect(recommendation?.explanation.guardrails?.fallbackUsed).toBe(true);
    expect(recommendation?.narrative[1]).toContain('Alpha');
  });

  it('applies active policy when guardrails pass', async () => {
    const metadata: StrategyPolicyMetadata = {
      modelId: 'policy-test',
      version: 'v1',
      status: 'active',
      algorithm: 'ppo-lite-search',
      checksum: 'abc123',
      rewardMean: 60,
      rewardStd: 5,
      validationScore: 0.7,
      trainingEpisodes: 200,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      featureNames: FEATURE_KEYS,
      featureImportance: [],
      evaluationSeasons: [],
      driftIndicator: undefined,
      notes: 'test policy',
      featureMeans: FEATURE_KEYS.reduce((acc, key) => ({ ...acc, [key]: 0 }), {} as Record<FeatureKey, number>),
      featureStd: FEATURE_KEYS.reduce((acc, key) => ({ ...acc, [key]: 1 }), {} as Record<FeatureKey, number>),
      hyperparameters: { temperature: 1 },
      evaluation: {
        validationScore: 0.7,
        heuristicBaseline: 40,
        uplift: 5,
      },
    };

    const payload: StrategyPolicyPayload = {
      featureWeights: {
        expectedPoints: 1.2,
        volatility: -0.6,
        minutesShare: 0.4,
        formTrend: 0.3,
        priceValue: 0.5,
        differentialEdge: 0.4,
      },
      bias: 0,
      temperature: 1,
    };

    vi.spyOn(StrategyModelRegistry, 'getInstance').mockReturnValue({
      getActivePolicy: vi.fn().mockResolvedValue({ metadata, payload }),
      listModels: vi.fn(),
      recordEvaluation: vi.fn(),
      markModelStatus: vi.fn(),
    } as unknown as StrategyModelRegistry);

    const agent = StrategyAgent.getInstance();
    const analysis = buildAnalysis([
      buildPlayer({ id: 1, name: 'Alpha', expectedPoints: 7, rankUpsideScore: 80, coefficientOfVariation: 0.9 }),
      buildPlayer({ id: 2, name: 'Beta', expectedPoints: 5, rankUpsideScore: 65, coefficientOfVariation: 1.4 }),
      buildPlayer({ id: 3, name: 'Gamma', expectedPoints: 6, rankUpsideScore: 70, coefficientOfVariation: 1.1 })
    ]);

    const recommendation = await agent.recommendTransfers({
      analysis,
      intentType: 'transfer_suggestions',
      focus: 'attack'
    });

    expect(recommendation).not.toBeNull();
    expect(recommendation?.explanation.guardrails?.fallbackUsed).toBe(false);
    expect(recommendation?.explanation.policyVersion).toBe(metadata.version);
    expect(recommendation?.explanation.factors.length).toBeGreaterThan(0);
  });
});



