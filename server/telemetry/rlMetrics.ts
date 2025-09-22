import type { StrategyModelSummary } from "@shared/schema";

interface InferenceMetric {
  timestamp: string;
  modelId?: string;
  confidence: number;
  durationMs: number;
  fallback: boolean;
  reason?: string;
}

interface TrainingMetric {
  timestamp: string;
  modelId: string;
  rewardMean: number;
  rewardStd?: number;
  validationScore?: number;
  episodes: number;
  status: StrategyModelSummary['status'];
}

interface MetricsSnapshot {
  lastInference?: InferenceMetric;
  lastTraining?: TrainingMetric;
  inferenceHistory: InferenceMetric[];
  trainingHistory: TrainingMetric[];
}

const HISTORY_LIMIT = 20;

export class RLMetrics {
  private inferenceHistory: InferenceMetric[] = [];
  private trainingHistory: TrainingMetric[] = [];

  recordInference(metric: Omit<InferenceMetric, 'timestamp'>): void {
    const entry: InferenceMetric = {
      ...metric,
      timestamp: new Date().toISOString()
    };
    this.inferenceHistory.unshift(entry);
    if (this.inferenceHistory.length > HISTORY_LIMIT) {
      this.inferenceHistory = this.inferenceHistory.slice(0, HISTORY_LIMIT);
    }
  }

  recordTraining(metric: Omit<TrainingMetric, 'timestamp'>): void {
    const entry: TrainingMetric = {
      ...metric,
      timestamp: new Date().toISOString()
    };
    this.trainingHistory.unshift(entry);
    if (this.trainingHistory.length > HISTORY_LIMIT) {
      this.trainingHistory = this.trainingHistory.slice(0, HISTORY_LIMIT);
    }
  }

  getSnapshot(): MetricsSnapshot {
    return {
      lastInference: this.inferenceHistory[0],
      lastTraining: this.trainingHistory[0],
      inferenceHistory: [...this.inferenceHistory],
      trainingHistory: [...this.trainingHistory]
    };
  }

  clear(): void {
    this.inferenceHistory = [];
    this.trainingHistory = [];
  }
}

export const rlMetrics = new RLMetrics();
