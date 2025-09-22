#!/usr/bin/env tsx
import crypto from "node:crypto";
import process from "node:process";
import { DataRepository } from "../server/services/repositories/dataRepository";
import { StrategyModelRegistry } from "../server/services/strategyModelRegistry";
import type { StrategyPolicyMetadata, StrategyPolicyPayload } from "@shared/schema";

type FeatureKey = 'expectedPoints' | 'volatility' | 'minutesShare' | 'formTrend' | 'priceValue' | 'differentialEdge';

interface TrainArgs {
  episodes: number;
  candidates: number;
  activate: boolean;
  dryRun: boolean;
  note?: string;
}

interface TrainingSample {
  id: number;
  features: Record<FeatureKey, number>;
  target: number;
}

interface CandidatePolicy {
  payload: StrategyPolicyPayload;
  weights: Record<FeatureKey, number>;
  bias: number;
  temperature: number;
}

interface CandidateResult {
  candidate: CandidatePolicy;
  rewardMean: number;
  rewardStd: number;
  validationScore: number;
  baselineMean: number;
  uplift: number;
}

const FEATURE_KEYS: FeatureKey[] = ['expectedPoints', 'volatility', 'minutesShare', 'formTrend', 'priceValue', 'differentialEdge'];

function parseArgs(): TrainArgs {
  const defaults: TrainArgs = {
    episodes: 250,
    candidates: 25,
    activate: false,
    dryRun: false,
    note: undefined,
  };

  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case '--episodes':
      case '-e':
        defaults.episodes = Number(args[++i] ?? defaults.episodes);
        break;
      case '--candidates':
      case '-c':
        defaults.candidates = Number(args[++i] ?? defaults.candidates);
        break;
      case '--activate':
        defaults.activate = true;
        break;
      case '--dry-run':
        defaults.dryRun = true;
        break;
      case '--note':
        defaults.note = args[++i];
        break;
      default:
        console.warn(`Unrecognised argument ${arg}`);
    }
  }
  return defaults;
}

function randomNormal(mean = 0, stdDev = 1): number {
  const u = Math.random();
  const v = Math.random();
  const mag = Math.sqrt(-2.0 * Math.log(u));
  return mean + stdDev * mag * Math.cos(2 * Math.PI * v);
}

function computeMean(samples: number[]): number {
  if (samples.length === 0) return 0;
  return samples.reduce((sum, value) => sum + value, 0) / samples.length;
}

function computeStd(samples: number[], mean: number): number {
  if (samples.length === 0) return 0;
  const variance = samples.reduce((sum, value) => sum + (value - mean) ** 2, 0) / samples.length;
  return Math.sqrt(variance);
}

function buildFeatureStats(dataset: TrainingSample[]): { means: Record<FeatureKey, number>; std: Record<FeatureKey, number>; } {
  const means: Record<FeatureKey, number> = {} as Record<FeatureKey, number>;
  const std: Record<FeatureKey, number> = {} as Record<FeatureKey, number>;

  for (const key of FEATURE_KEYS) {
    const values = dataset.map(sample => sample.features[key]);
    const mean = computeMean(values);
    means[key] = mean;
    std[key] = computeStd(values, mean) || 1;
  }

  return { means, std };
}

function scorePlayer(features: Record<FeatureKey, number>, stats: { means: Record<FeatureKey, number>; std: Record<FeatureKey, number>; }, policy: CandidatePolicy): number {
  let score = policy.bias;
  for (const key of FEATURE_KEYS) {
    const weight = policy.weights[key] ?? 0;
    const mean = stats.means[key] ?? 0;
    const std = stats.std[key] ?? 1;
    const normalised = std !== 0 ? (features[key] - mean) / std : features[key] - mean;
    score += weight * normalised;
  }
  return score;
}

function evaluateCandidate(
  dataset: TrainingSample[],
  stats: { means: Record<FeatureKey, number>; std: Record<FeatureKey, number>; },
  candidate: CandidatePolicy,
  episodes: number
): CandidateResult {
  const candidateRewards: number[] = [];
  const baselineRewards: number[] = [];
  let successCount = 0;

  for (let i = 0; i < episodes; i++) {
    const samplePool = dataset.slice().sort(() => Math.random() - 0.5).slice(0, 15);

    const candidateScores = samplePool
      .map(sample => ({ sample, score: scorePlayer(sample.features, stats, candidate) / (candidate.temperature || 1) }))
      .sort((a, b) => b.score - a.score);

    const baselineScores = samplePool
      .map(sample => ({ sample, score: sample.features.expectedPoints }))
      .sort((a, b) => b.score - a.score);

    const candidateReward = candidateScores.slice(0, 3).reduce((sum, entry) => sum + entry.sample.target, 0);
    const baselineReward = baselineScores.slice(0, 3).reduce((sum, entry) => sum + entry.sample.target, 0);

    candidateRewards.push(candidateReward);
    baselineRewards.push(baselineReward);
    if (candidateReward >= baselineReward) {
      successCount += 1;
    }
  }

  const rewardMean = computeMean(candidateRewards);
  const rewardStd = computeStd(candidateRewards, rewardMean);
  const baselineMean = computeMean(baselineRewards);
  const validationScore = successCount / episodes;
  const uplift = rewardMean - baselineMean;

  return {
    candidate,
    rewardMean,
    rewardStd,
    validationScore,
    baselineMean,
    uplift,
  };
}

function makeCandidate(): CandidatePolicy {
  const baseWeights: Record<FeatureKey, number> = {
    expectedPoints: 1.2,
    volatility: -0.7,
    minutesShare: 0.4,
    formTrend: 0.35,
    priceValue: 0.6,
    differentialEdge: 0.5,
  };
  const weights: Record<FeatureKey, number> = {} as Record<FeatureKey, number>;
  for (const key of FEATURE_KEYS) {
    weights[key] = baseWeights[key] + randomNormal(0, 0.35);
  }
  const bias = randomNormal(0, 0.25);
  const temperature = Math.min(1.8, Math.max(0.6, 1 + randomNormal(0, 0.2)));

  return {
    payload: {
      featureWeights: weights,
      bias,
      temperature,
    },
    weights,
    bias,
    temperature,
  };
}

async function main() {
  const args = parseArgs();
  const registry = StrategyModelRegistry.getInstance();

  const players = await repository.getFplPlayers();
  if (players.length === 0) {
    console.error('No player data available. Run data pipeline first.');
    process.exit(1);
  }

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
      const priceValue = player.now_cost > 0 ? (expectedPoints / (player.now_cost / 10)) : expectedPoints;
      const differentialEdge = adv.role === 'nailed' ? 0.1 : adv.role === 'rotation' ? -0.1 : -0.25;

      const sample: TrainingSample = {
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
      };

      return sample;
    })
    .filter((sample): sample is TrainingSample => sample !== null);

  if (dataset.length < 25) {
    console.error('Insufficient dataset for training. Need at least 25 samples.');
    process.exit(1);
  }

  const stats = buildFeatureStats(dataset);

  const results: CandidateResult[] = [];
  for (let i = 0; i < args.candidates; i++) {
    const candidate = makeCandidate();
    const result = evaluateCandidate(dataset, stats, candidate, args.episodes);
    results.push(result);
  }

  results.sort((a, b) => b.rewardMean - a.rewardMean);
  const best = results[0];

  const modelId = `policy-${Date.now()}`;
  const versionSuffix = args.activate ? 'prod' : 'staging';
  const version = `v${new Date().toISOString().slice(0, 10)}-${versionSuffix}`;

  const payload: StrategyPolicyPayload = best.candidate.payload;
  const checksum = crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex').slice(0, 32);

  const rewardMean = Number.isFinite(best.rewardMean) ? Number(best.rewardMean.toFixed(2)) : 0;
  const rewardStd = Number.isFinite(best.rewardStd) ? Number(best.rewardStd.toFixed(2)) : 0;
  const validationScore = Number.isFinite(best.validationScore) ? Number(best.validationScore.toFixed(3)) : 0;
  const baselineMean = Number.isFinite(best.baselineMean) ? Number(best.baselineMean.toFixed(2)) : 0;
  const uplift = Number.isFinite(best.uplift) ? Number(best.uplift.toFixed(2)) : 0;

  const metadata: StrategyPolicyMetadata = {
    modelId,
    version,
    status: args.activate ? 'active' : 'staging',
    algorithm: 'ppo-lite-search',
    checksum,
    rewardMean,
    rewardStd,
    validationScore,
    trainingEpisodes: args.episodes,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    featureNames: FEATURE_KEYS,
    featureImportance: FEATURE_KEYS.map(feature => ({ feature, weight: payload.featureWeights[feature] ?? 0 })),
    evaluationSeasons: [],
    driftIndicator: undefined,
    notes: args.note ?? 'Auto-generated policy from PPO-lite random search.',
    featureMeans: stats.means,
    featureStd: stats.std,
    hyperparameters: {
      temperature: payload.temperature,
      bias: payload.bias,
    },
    evaluation: {
      validationScore,
      heuristicBaseline: baselineMean,
      uplift,
    },
  };

  const evaluationSummary: Record<string, number | string> = {
    episodes: args.episodes,
    datasetSize: dataset.length,
  };
  if (metadata.evaluation?.validationScore !== undefined) {
    evaluationSummary.validationScore = metadata.evaluation.validationScore;
  }
  if (metadata.evaluation?.heuristicBaseline !== undefined) {
    evaluationSummary.heuristicBaseline = metadata.evaluation.heuristicBaseline;
  }
  if (metadata.evaluation?.uplift !== undefined) {
    evaluationSummary.uplift = metadata.evaluation.uplift;
  }

  console.log('\n=== Strategy Policy Training Summary ===');
  console.log(`Model ID        : ${metadata.modelId}`);
  console.log(`Version         : ${metadata.version}`);
  console.log(`Reward (mean)   : ${metadata.rewardMean}`);
  console.log(`Reward (std)    : ${metadata.rewardStd}`);
  console.log(`Baseline mean   : ${best.baselineMean.toFixed(2)}`);
  console.log(`Uplift          : ${best.uplift.toFixed(2)}`);
  console.log(`Validation score: ${(metadata.validationScore ?? 0).toFixed(3)}`);
  console.log(`Episodes        : ${metadata.trainingEpisodes}`);
  console.log(`Temperature     : ${(payload.temperature ?? 1).toFixed(2)}`);
  console.log(`Bias            : ${payload.bias.toFixed(2)}`);
  console.log(`Weights         :`);
  FEATURE_KEYS.forEach(key => {
    console.log(`  - ${key}: ${payload.featureWeights[key].toFixed(3)}`);
  });

  if (args.dryRun) {
    console.log('\nDry run enabled. Metadata and payload not persisted.');
    return;
  }

  await repository.upsertStrategyModel(metadata, payload, evaluationSummary);

  await registry.recordEvaluation({
    evaluationId: `eval-${metadata.modelId}`,
    modelId: metadata.modelId,
    validationScore: metadata.validationScore ?? 0,
    heuristicBaseline: metadata.evaluation?.heuristicBaseline,
    uplift: metadata.evaluation?.uplift,
    rewardMean: metadata.rewardMean,
    rewardStd: metadata.rewardStd,
    notes: args.note,
    metrics: evaluationSummary,
  });

  if (args.activate) {
    await registry.markModelStatus(metadata.modelId, 'active');
  }

  console.log('\nPolicy saved successfully.');
  if (args.activate) {
    console.log('Model activated as current strategy policy.');
  }
})();
