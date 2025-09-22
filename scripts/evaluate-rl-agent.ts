#!/usr/bin/env tsx
import process from "node:process";
import { DataRepository } from "../server/services/repositories/dataRepository";
import { StrategyModelRegistry } from "../server/services/strategyModelRegistry";
import type { StrategyPolicyPayload, StrategyPolicyMetadata } from "@shared/schema";

type FeatureKey = 'expectedPoints' | 'volatility' | 'minutesShare' | 'formTrend' | 'priceValue' | 'differentialEdge';
const FEATURE_KEYS: FeatureKey[] = ['expectedPoints', 'volatility', 'minutesShare', 'formTrend', 'priceValue', 'differentialEdge'];

interface EvaluateArgs {
  modelId?: string;
  episodes: number;
  sampleSize: number;
}

interface TrainingSample {
  id: number;
  features: Record<FeatureKey, number>;
  target: number;
}

function parseArgs(): EvaluateArgs {
  const defaults: EvaluateArgs = {
    episodes: 200,
    sampleSize: 15,
    modelId: undefined,
  };

  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case '--model':
      case '-m':
        defaults.modelId = args[++i];
        break;
      case '--episodes':
      case '-e':
        defaults.episodes = Number(args[++i] ?? defaults.episodes);
        break;
      case '--sample':
      case '-s':
        defaults.sampleSize = Number(args[++i] ?? defaults.sampleSize);
        break;
      default:
        console.warn(`Unknown argument ${arg}`);
    }
  }
  return defaults;
}

function extractFeatures(sample: TrainingSample, metadata: StrategyPolicyMetadata, payload: StrategyPolicyPayload) {
  return sample.features;
}

function scoreSample(sample: TrainingSample, metadata: StrategyPolicyMetadata, payload: StrategyPolicyPayload): number {
  const means = metadata.featureMeans ?? {};
  const std = metadata.featureStd ?? {};
  const weights = payload.featureWeights;
  let score = payload.bias;
  for (const key of FEATURE_KEYS) {
    const mean = means[key] ?? 0;
    const deviation = std[key] ?? 1;
    const value = sample.features[key];
    const normalised = deviation !== 0 ? (value - mean) / deviation : value - mean;
    score += (weights[key] ?? 0) * normalised;
  }
  return score / (payload.temperature ?? 1);
}

function computeMean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function computeStd(values: number[], mean: number): number {
  if (values.length === 0) return 0;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

(async () => {
  const args = parseArgs();
  const repository = DataRepository.getInstance();
  const registry = StrategyModelRegistry.getInstance();

  const policyRecord = args.modelId
    ? await repository.getStrategyModel(args.modelId)
    : await registry.getActivePolicy();

  if (!policyRecord) {
    console.error(args.modelId ? `Strategy model ${args.modelId} not found.` : 'No active strategy model available.');
    process.exit(1);
  }

  const { metadata, payload } = policyRecord;

  const players = await repository.getFplPlayers();
  const advanced = await repository.getPlayerFeatureBatch(players.map(player => player.id));
  const advancedMap = new Map(advanced.map(entry => [entry.playerId, entry]));

  const dataset: TrainingSample[] = players
    .map(player => {
      const adv = advancedMap.get(player.id);
      if (!adv) return null;

      const expectedPoints = adv.fixtureAdjustedXG + (adv.fixtureAdjustedXA ?? 0.5);
      const volatility = adv.volatility ?? 0;
      const minutesShare = adv.xMins ? Math.min(adv.xMins / 90, 1) : 1;
      const formTrend = adv.formTrend === 'rising' ? 1 : adv.formTrend === 'declining' ? -1 : 0;
      const priceValue = player.now_cost > 0 ? expectedPoints / (player.now_cost / 10) : expectedPoints;
      const differentialEdge = adv.role === 'nailed' ? 0.1 : adv.role === 'rotation' ? -0.1 : -0.25;

      return {
        id: player.id,
        features: {
          expectedPoints,
          volatility,
          minutesShare,
          formTrend,
          priceValue,
          differentialEdge,
        },
        target: player.total_points / Math.max(minutesShare * 38, 1),
      } satisfies TrainingSample;
    })
    .filter((item): item is TrainingSample => item !== null);

  if (dataset.length < 10) {
    console.error('Not enough data to evaluate policy.');
    process.exit(1);
  }

  const candidateRewards: number[] = [];
  const baselineRewards: number[] = [];
  let successCount = 0;

  for (let i = 0; i < args.episodes; i++) {
    const pool = dataset.slice().sort(() => Math.random() - 0.5).slice(0, args.sampleSize);

    const policySelection = pool
      .map(sample => ({ sample, score: scoreSample(sample, metadata, payload) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .reduce((sum, entry) => sum + entry.sample.target, 0);

    const baselineSelection = pool
      .map(sample => ({ sample, score: sample.features.expectedPoints }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .reduce((sum, entry) => sum + entry.sample.target, 0);

    candidateRewards.push(policySelection);
    baselineRewards.push(baselineSelection);
    if (policySelection >= baselineSelection) {
      successCount += 1;
    }
  }

  const rewardMean = computeMean(candidateRewards);
  const rewardStd = computeStd(candidateRewards, rewardMean);
  const baselineMean = computeMean(baselineRewards);
  const successRate = successCount / args.episodes;

  console.log('\n=== Strategy Policy Evaluation ===');
  console.log(`Model ID        : ${metadata.modelId}`);
  console.log(`Version         : ${metadata.version}`);
  console.log(`Episodes        : ${args.episodes}`);
  console.log(`Sample size     : ${args.sampleSize}`);
  console.log(`Reward (mean)   : ${rewardMean.toFixed(2)}`);
  console.log(`Reward (std)    : ${rewardStd.toFixed(2)}`);
  console.log(`Baseline (mean) : ${baselineMean.toFixed(2)}`);
  console.log(`Success rate    : ${(successRate * 100).toFixed(1)}%`);
  console.log(`Uplift          : ${(rewardMean - baselineMean).toFixed(2)} pts`);
})();
