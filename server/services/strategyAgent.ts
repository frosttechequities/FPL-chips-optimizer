import type {
  AnalysisResult,
  AIExplanation,
  FeatureContribution,
  ProcessedPlayer,
  StrategyPolicyMetadata,
  StrategyPolicyPayload
} from "@shared/schema";
import { EffectiveOwnershipEngine } from "./effectiveOwnershipEngine";
import { StrategyModelRegistry } from "./strategyModelRegistry";
import { rlMetrics } from "../telemetry/rlMetrics";
import type { StrategyPolicyRecord } from "./repositories/dataRepository";

interface StrategyContext {
  analysis: AnalysisResult;
  focus?: 'defence' | 'attack' | 'balanced';
  intentType: string;
}

interface StrategyRecommendation {
  narrative: string[];
  explanation: AIExplanation;
  followUps: string[];
}

type FeatureKey = 'expectedPoints' | 'volatility' | 'minutesShare' | 'formTrend' | 'priceValue' | 'differentialEdge';
type FormTrend = 'rising' | 'stable' | 'declining';

interface ScoredPlayer {
  player: ProcessedPlayer;
  score: number;
  probability: number;
  contributions: FeatureContribution[];
  features: Record<FeatureKey, number>;
}

const FEATURE_KEYS: FeatureKey[] = [
  'expectedPoints',
  'volatility',
  'minutesShare',
  'formTrend',
  'priceValue',
  'differentialEdge'
];

const MIN_POLICY_REWARD = 45;
const MIN_VALIDATION_SCORE = 0.55;
const MIN_CONFIDENCE_THRESHOLD = 0.45;
const MIN_FEATURE_SET = 3;
const DEFAULT_TEMPERATURE = 1.2;

export class StrategyAgent {
  private static instance: StrategyAgent;
  private readonly ownershipEngine = EffectiveOwnershipEngine.getInstance();
  private readonly modelRegistry = StrategyModelRegistry.getInstance();
  private lastPolicy: StrategyPolicyRecord | null = null;

  private constructor() {}

  static getInstance(): StrategyAgent {
    if (!StrategyAgent.instance) {
      StrategyAgent.instance = new StrategyAgent();
    }
    return StrategyAgent.instance;
  }

  async recommendTransfers(context: StrategyContext): Promise<StrategyRecommendation | null> {
    const players = context.analysis.players?.filter(player => player.isStarter) ?? [];
    if (players.length === 0) {
      return null;
    }

    const startedAt = Date.now();
    const policyRecord = await this.modelRegistry.getActivePolicy();
    this.lastPolicy = policyRecord;

    if (!policyRecord) {
      const recommendation = this.buildFallbackRecommendation(players, context, 'no-active-policy');
      rlMetrics.recordInference({
        modelId: undefined,
        confidence: recommendation.explanation.confidence,
        durationMs: Date.now() - startedAt,
        fallback: true,
        reason: 'no-active-policy'
      });
      return recommendation;
    }

    const { metadata, payload } = policyRecord;
    const guardrails: string[] = [];

    if (metadata.rewardMean < MIN_POLICY_REWARD) {
      guardrails.push('reward-below-threshold');
    }
    if ((metadata.evaluation?.validationScore ?? 1) < MIN_VALIDATION_SCORE) {
      guardrails.push('validation-score-low');
    }

    const scored = guardrails.length === 0
      ? this.scorePlayersWithPolicy(players, metadata, payload)
      : null;

    if (!scored || scored.length < MIN_FEATURE_SET) {
      const reason = guardrails[0] ?? 'insufficient-policy-signal';
      const recommendation = this.buildFallbackRecommendation(players, context, reason, metadata);
      rlMetrics.recordInference({
        modelId: metadata.modelId,
        confidence: recommendation.explanation.confidence,
        durationMs: Date.now() - startedAt,
        fallback: true,
        reason,
      });
      return recommendation;
    }

    const topCandidates = scored.slice(0, 5);
    const top = topCandidates[0];

    if (top.probability < MIN_CONFIDENCE_THRESHOLD) {
      const recommendation = this.buildFallbackRecommendation(players, context, 'policy-confidence-low', metadata, topCandidates);
      rlMetrics.recordInference({
        modelId: metadata.modelId,
        confidence: recommendation.explanation.confidence,
        durationMs: Date.now() - startedAt,
        fallback: true,
        reason: 'policy-confidence-low',
      });
      return recommendation;
    }

    const explanation = this.buildPolicyExplanation(topCandidates, metadata, payload, context);

    const narrative = [
      `Policy ${metadata.modelId} (${metadata.version}) shortlist:`,
      ...topCandidates.slice(0, 3).map(candidate => this.formatNarrativeLine(candidate, metadata, context))
    ];

    const followUps = [
      'Would you like a transfer plan based on these priorities?',
      'Should I compare these picks against pricing/ownership constraints?',
      'Do you want to inspect the policy explainability details?'
    ];

    rlMetrics.recordInference({
      modelId: metadata.modelId,
      confidence: explanation.confidence,
      durationMs: Date.now() - startedAt,
      fallback: false,
    });

    return {
      narrative,
      explanation,
      followUps
    };
  }

  private scorePlayersWithPolicy(
    players: ProcessedPlayer[],
    metadata: StrategyPolicyMetadata,
    payload: StrategyPolicyPayload
  ): ScoredPlayer[] {
    const featureMeans = metadata.featureMeans ?? {};
    const featureStd = metadata.featureStd ?? {};
    const weights = payload.featureWeights;
    const temperature = payload.temperature ?? DEFAULT_TEMPERATURE;
    const scored: ScoredPlayer[] = [];

    for (const player of players) {
      const features = this.extractFeatures(player);
      const normalised: Record<FeatureKey, number> = {} as Record<FeatureKey, number>;
      let score = payload.bias;
      const contributions: FeatureContribution[] = [];

      for (const feature of FEATURE_KEYS) {
        const value = features[feature];
        const mean = featureMeans[feature] ?? 0;
        const std = featureStd[feature] ?? 1;
        const weight = weights[feature] ?? 0;
        const normalisedValue = std && Number.isFinite(std) && std !== 0
          ? (value - mean) / std
          : value - mean;
        normalised[feature] = normalisedValue;
        const contribution = weight * normalisedValue;
        score += contribution;
        contributions.push({
          feature,
          value,
          baseline: mean,
          contribution,
          weight,
          impact: contribution >= 0 ? 'positive' : 'negative',
          description: this.describeContribution(feature, value, mean)
        });
      }

      if (!Number.isFinite(score)) {
        continue;
      }

      scored.push({
        player,
        score,
        probability: 0,
        contributions,
        features,
      });
    }

    if (scored.length === 0) {
      return [];
    }

    const scaledScores = scored.map(entry => entry.score / temperature);
    const maxScore = Math.max(...scaledScores);
    const expScores = scaledScores.map(value => Math.exp(value - maxScore));
    const expSum = expScores.reduce((acc, value) => acc + value, 0);

    scored.forEach((entry, index) => {
      entry.probability = expScores[index] / (expSum || 1);
    });

    return scored.sort((a, b) => b.probability - a.probability);
  }

  private extractFeatures(player: ProcessedPlayer): Record<FeatureKey, number> {
    const ownership = player.effectiveOwnership ?? this.ownershipEngine.getOwnershipSnapshot(player);
    const expectedPoints = player.simOutcome?.meanPoints
      ?? player.expectedPoints
      ?? player.mlPrediction?.predictedPoints
      ?? (player.points / Math.max(player.price, 1));

    const volatility = player.coefficientOfVariation
      ?? player.simOutcome?.standardDeviation
      ?? player.advancedStats?.volatility
      ?? 0;

    const minutesShare = player.advancedStats?.xMins
      ? Math.min(player.advancedStats.xMins / 90, 1)
      : 1;

    const formTrend = this.mapFormTrend(player.advancedStats?.formTrend);

    const priceValue = player.price > 0 ? expectedPoints / player.price : expectedPoints;
    const differentialEdge = 1 - (ownership.effectiveOwnership / 100);

    return {
      expectedPoints: Number.isFinite(expectedPoints) ? expectedPoints : 0,
      volatility: Number.isFinite(volatility) ? volatility : 0,
      minutesShare: Number.isFinite(minutesShare) ? minutesShare : 0,
      formTrend,
      priceValue: Number.isFinite(priceValue) ? priceValue : 0,
      differentialEdge: Number.isFinite(differentialEdge) ? differentialEdge : 0,
    };
  }

  private mapFormTrend(trend?: FormTrend): number {
    if (trend === 'rising') return 1;
    if (trend === 'declining') return -1;
    return 0;
  }

  private describeContribution(feature: FeatureKey, value: number, baseline: number): string {
    switch (feature) {
      case 'expectedPoints':
        return `Expected points ${value.toFixed(2)} vs baseline ${baseline.toFixed(2)}`;
      case 'volatility':
        return `Risk profile (CV) ${value.toFixed(2)}${baseline ? `, baseline ${baseline.toFixed(2)}` : ''}`;
      case 'minutesShare':
        return `Projected minutes ${(value * 90).toFixed(0)} vs baseline ${(baseline * 90).toFixed(0)}`;
      case 'formTrend':
        return value > 0 ? 'Form trending upward' : value < 0 ? 'Form trending downward' : 'Form stable';
      case 'priceValue':
        return `Value ratio ${value.toFixed(2)} pts per million`;
      case 'differentialEdge':
        return `Differential edge ${(value * 100).toFixed(1)}% vs field`;
      default:
        return 'Policy driver';
    }
  }

  private buildPolicyExplanation(
    candidates: ScoredPlayer[],
    metadata: StrategyPolicyMetadata,
    payload: StrategyPolicyPayload,
    context: StrategyContext
  ): AIExplanation {
    const top = candidates[0];
    const alternatives = candidates.slice(1, 4).map(candidate => `${candidate.player.name} (${(candidate.probability * 100).toFixed(1)}%)`);
    const std = metadata.rewardStd ?? 0;

    const reasoningTrace = [
      { step: 'load-policy', detail: `Loaded policy ${metadata.modelId} (${metadata.algorithm}) trained over ${metadata.trainingEpisodes} episodes with reward mean ${metadata.rewardMean.toFixed(2)}.` },
      { step: 'feature-normalisation', detail: `Evaluated ${candidates.length} starters using features ${FEATURE_KEYS.join(', ')} and temperature ${(payload.temperature ?? DEFAULT_TEMPERATURE).toFixed(2)}.` },
      { step: 'candidate-selection', detail: `Top candidate ${top.player.name} carries ${(top.probability * 100).toFixed(1)}% selection probability given ${this.focusSummary(context)} focus.` }
    ];

    return {
      title: 'Policy-Guided Transfer Recommendation',
      summary: `${top.player.name} leads the policy shortlist with ${(top.probability * 100).toFixed(1)}% confidence.`,
      confidence: Math.round(top.probability * 100),
      policyVersion: metadata.version,
      provenance: {
        modelId: metadata.modelId,
        algorithm: metadata.algorithm,
        trainedAt: metadata.updatedAt,
        validationScore: metadata.evaluation?.validationScore,
        rewardMean: metadata.rewardMean,
        checksum: metadata.checksum,
      },
      guardrails: {
        fallbackUsed: false,
      },
      reasoningTrace,
      factors: top.contributions.sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution)).slice(0, 5),
      confidenceIntervals: std ? {
        lower: Number((metadata.rewardMean - std).toFixed(2)),
        upper: Number((metadata.rewardMean + std).toFixed(2))
      } : undefined,
      alternatives
    };
  }

  private focusSummary(context: StrategyContext): string {
    switch (context.focus) {
      case 'attack':
        return 'attacking';
      case 'defence':
        return 'defensive';
      default:
        return 'balanced';
    }
  }

  private formatNarrativeLine(candidate: ScoredPlayer, metadata: StrategyPolicyMetadata, context: StrategyContext): string {
    const ownership = candidate.player.effectiveOwnership ?? this.ownershipEngine.getOwnershipSnapshot(candidate.player);
    const keyDrivers = candidate.contributions
      .sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution))
      .slice(0, 2)
      .map(contribution => `${contribution.feature} ${(contribution.contribution >= 0 ? '+' : '')}${contribution.contribution.toFixed(2)}`)
      .join(', ');

    return `${candidate.player.name} (${candidate.player.position}) — policy ${(candidate.probability * 100).toFixed(1)}% ` +
      `confidence, EO ${ownership.effectiveOwnership.toFixed(1)}%, drivers: ${keyDrivers}`;
  }

  private buildFallbackRecommendation(
    players: ProcessedPlayer[],
    context: StrategyContext,
    reason: string,
    metadata?: StrategyPolicyMetadata,
    candidates?: ScoredPlayer[]
  ): StrategyRecommendation {
    const ranked = [...players]
      .sort((a, b) => (b.rankUpsideScore ?? 0) - (a.rankUpsideScore ?? 0))
      .slice(0, 3);

    const narrativeLines = ranked.map(player => {
      const ownership = player.effectiveOwnership ?? this.ownershipEngine.getOwnershipSnapshot(player);
      const risk = player.coefficientOfVariation ?? player.simOutcome?.standardDeviation ?? 0;
      return `${player.name} (${player.position}) — upside ${(player.rankUpsideScore ?? 0).toFixed(1)}, risk ${risk.toFixed(2)}, EO ${ownership.effectiveOwnership.toFixed(1)}%`;
    });

    const explanation: AIExplanation = {
      title: 'Heuristic Strategy Recommendation',
      summary: 'Fallback heuristics prioritise high-upside starters with manageable risk.',
      confidence: 60,
      guardrails: {
        fallbackUsed: true,
        reason,
      },
      reasoningTrace: [
        { step: 'guardrail', detail: 'Policy guardrail triggered, reverting to heuristics.' },
        { step: 'focus', detail: `Focus: ${this.focusSummary(context)} using rank upside ordering.` }
      ],
      factors: ranked.map(player => {
        const ownership = player.effectiveOwnership ?? this.ownershipEngine.getOwnershipSnapshot(player);
        const value = player.rankUpsideScore ?? 0;
        return {
          feature: player.name,
          value,
          baseline: 0,
          contribution: value,
          weight: 1,
          impact: value >= 0 ? 'positive' : 'negative',
          description: this.describePlayerFallback(player, ownership)
        };
      }),
      alternatives: candidates?.slice(0, 3).map(entry => entry.player.name) ?? undefined,
      policyVersion: metadata?.version,
      provenance: metadata ? {
        modelId: metadata.modelId,
        algorithm: metadata.algorithm,
        trainedAt: metadata.updatedAt,
        validationScore: metadata.evaluation?.validationScore,
        rewardMean: metadata.rewardMean,
        checksum: metadata.checksum,
      } : undefined,
    };

    return {
      narrative: [
        'Heuristic shortlist:',
        ...narrativeLines
      ],
      explanation,
      followUps: [
        'Would you like to refresh once the policy retrains?',
        'Need a comparison between these heuristic picks and policy candidates?',
        'Should I draft a transfer plan using these fallback targets?'
      ]
    };
  }

  private describePlayerFallback(
    player: ProcessedPlayer,
    ownership: ReturnType<EffectiveOwnershipEngine['getOwnershipSnapshot']>
  ): string {
    const parts: string[] = [];
    if (player.rankUpsideScore !== undefined) {
      parts.push(`Rank upside score ${(player.rankUpsideScore).toFixed(1)}`);
    }
    if (player.coefficientOfVariation !== undefined) {
      parts.push(`Volatility ${(player.coefficientOfVariation).toFixed(2)}`);
    }
    parts.push(`Effective ownership ${ownership.effectiveOwnership.toFixed(1)}%`);
    return parts.join(', ');
  }

  getMetadata() {
    if (!this.lastPolicy) {
      return {
        policy: 'heuristic-fallback',
        version: '0.0.0',
        trainedEpochs: 0,
        notes: 'No active strategy model; heuristic fallback in use.'
      };
    }

    const metadata = this.lastPolicy.metadata;
    return {
      policy: metadata.modelId,
      version: metadata.version,
      trainedEpochs: metadata.trainingEpisodes,
      notes: `Reward mean ${metadata.rewardMean.toFixed(2)} (${metadata.status})`
    };
  }
}
