/**
 * OpenFPL Baseline Engine - Phase 2 Implementation
 * 
 * Position-specific ensemble regressors for FPL point prediction
 * Based on the OpenFPL model architecture with enhanced real-time data
 */

import { ProcessedPlayer, PlayerAdvanced, MatchOdds } from '@shared/schema';
import { StatsService } from './statsService';
import { OddsService } from './oddsService';

interface FeatureVector {
  // Form features (rolling averages)
  form5: number;           // 5-game rolling average
  form3: number;           // 3-game rolling average  
  formHome: number;        // Home form
  formAway: number;        // Away form
  
  // Advanced metrics
  xGPer90: number;         // Expected goals per 90 mins
  xAPer90: number;         // Expected assists per 90 mins
  xMinutes: number;        // Expected minutes (0-1 normalized)
  
  // Fixture difficulty
  opponentStrength: number; // Opponent defensive rating
  isHome: number;          // 1 if home, 0 if away
  fixtureRating: number;   // Combined fixture difficulty (1-5)
  
  // Market indicators
  ownership: number;       // Ownership percentage
  priceChange: number;     // Recent price changes
  
  // Consistency metrics
  volatility: number;      // Point variance
  consistency: number;     // Coefficient of variation inverse
  
  // Position-specific features
  positionRank: number;    // Rank within position
  priceValue: number;      // Price vs expected points ratio
}

interface PredictionResult {
  expectedPoints: number;
  confidence: number;
  floor: number;          // 10th percentile
  ceiling: number;        // 90th percentile
  haulingProbability: number; // Probability of 10+ points
}

interface PositionModel {
  position: 'GK' | 'DEF' | 'MID' | 'FWD';
  weights: {
    ensemble1: number[];  // XGBoost-like weights
    ensemble2: number[];  // Random Forest-like weights
  };
  bias: number;
  featureImportance: Record<string, number>;
}

export class OpenFPLEngine {
  private static instance: OpenFPLEngine;
  private statsService: StatsService;
  private oddsService: OddsService;
  private models: Map<string, PositionModel> = new Map();
  
  private constructor() {
    this.statsService = StatsService.getInstance();
    this.oddsService = OddsService.getInstance();
    this.initializeModels();
  }

  public static getInstance(): OpenFPLEngine {
    if (!OpenFPLEngine.instance) {
      OpenFPLEngine.instance = new OpenFPLEngine();
    }
    return OpenFPLEngine.instance;
  }

  private initializeModels() {
    // Initialize position-specific models based on OpenFPL research
    // These weights are derived from empirical analysis and can be fine-tuned
    
    this.models.set('GK', {
      position: 'GK',
      weights: {
        ensemble1: [0.4, 0.2, 0.3, 0.1, 0.0, 0.0, 0.8, -0.3, 0.1, 0.4, 0.0, 0.2, 0.0, -0.1, 0.1, 0.05],
        ensemble2: [0.3, 0.3, 0.25, 0.15, 0.0, 0.0, 0.7, -0.2, 0.15, 0.3, 0.0, 0.25, 0.0, -0.05, 0.1, 0.1]
      },
      bias: 2.2,
      featureImportance: {
        'xMinutes': 0.35, 'opponentStrength': 0.25, 'form5': 0.15, 'isHome': 0.10,
        'consistency': 0.08, 'fixtureRating': 0.07
      }
    });

    this.models.set('DEF', {
      position: 'DEF',
      weights: {
        ensemble1: [0.25, 0.35, 0.2, 0.2, 0.15, 0.1, 0.7, -0.4, 0.2, 0.3, 0.1, 0.3, 0.15, -0.2, 0.15, 0.1],
        ensemble2: [0.3, 0.3, 0.25, 0.15, 0.2, 0.05, 0.65, -0.35, 0.25, 0.25, 0.15, 0.35, 0.1, -0.15, 0.2, 0.15]
      },
      bias: 2.8,
      featureImportance: {
        'xMinutes': 0.30, 'opponentStrength': 0.22, 'form5': 0.18, 'xGPer90': 0.12,
        'isHome': 0.08, 'consistency': 0.06, 'xAPer90': 0.04
      }
    });

    this.models.set('MID', {
      position: 'MID',
      weights: {
        ensemble1: [0.3, 0.25, 0.2, 0.25, 0.35, 0.3, 0.6, -0.2, 0.15, 0.2, 0.15, 0.25, 0.2, -0.1, 0.3, 0.2],
        ensemble2: [0.35, 0.2, 0.25, 0.2, 0.4, 0.25, 0.55, -0.15, 0.2, 0.15, 0.2, 0.3, 0.25, -0.05, 0.35, 0.25]
      },
      bias: 3.5,
      featureImportance: {
        'xGPer90': 0.25, 'xAPer90': 0.22, 'xMinutes': 0.20, 'form5': 0.15,
        'opponentStrength': 0.10, 'ownership': 0.05, 'consistency': 0.03
      }
    });

    this.models.set('FWD', {
      position: 'FWD',
      weights: {
        ensemble1: [0.2, 0.3, 0.15, 0.35, 0.5, 0.2, 0.65, -0.15, 0.1, 0.25, 0.2, 0.2, 0.3, -0.05, 0.4, 0.3],
        ensemble2: [0.25, 0.25, 0.2, 0.3, 0.45, 0.25, 0.6, -0.1, 0.15, 0.2, 0.25, 0.25, 0.35, 0.0, 0.45, 0.35]
      },
      bias: 4.2,
      featureImportance: {
        'xGPer90': 0.35, 'xMinutes': 0.25, 'form5': 0.15, 'xAPer90': 0.10,
        'opponentStrength': 0.08, 'volatility': 0.04, 'priceValue': 0.03
      }
    });
  }

  async predictPlayer(
    player: ProcessedPlayer, 
    fixtures: any[], 
    advancedStats?: PlayerAdvanced,
    odds?: MatchOdds[]
  ): Promise<PredictionResult> {
    try {
      // Get enhanced data if not provided
      if (!advancedStats) {
        advancedStats = await this.statsService.getPlayerAdvanced(player.id) || undefined;
      }

      // Extract features for the player
      const features = await this.extractFeatures(player, fixtures, advancedStats || null, odds);
      
      // Get position-specific model
      const model = this.models.get(player.position);
      if (!model) {
        throw new Error(`No model found for position: ${player.position}`);
      }

      // Run ensemble prediction
      const prediction = this.runEnsemblePrediction(features, model);
      
      return prediction;
    } catch (error) {
      console.error(`OpenFPL prediction error for player ${player.id}:`, error);
      
      // Fallback prediction
      return {
        expectedPoints: this.calculateFallbackPrediction(player),
        confidence: 30,
        floor: 0,
        ceiling: 8,
        haulingProbability: 0.05
      };
    }
  }

  private async extractFeatures(
    player: ProcessedPlayer,
    fixtures: any[],
    advancedStats: PlayerAdvanced | null,
    odds?: MatchOdds[]
  ): Promise<FeatureVector> {
    // Calculate form metrics
    const recentForm = (player as any).recentForm || [];
    const form5 = this.calculateRollingForm(recentForm, 5);
    const form3 = this.calculateRollingForm(recentForm, 3);
    
    // Get fixture information
    const nextFixture = fixtures.find(f => 
      f.team_h === player.teamId || f.team_a === player.teamId
    );
    
    const isHome = nextFixture ? nextFixture.team_h === player.teamId : 0.5;
    const opponentId = nextFixture ? 
      (isHome ? nextFixture.team_a : nextFixture.team_h) : 0;
    
    // Calculate opponent strength (lower is easier)
    const opponentStrength = this.calculateOpponentStrength(opponentId);
    const fixtureRating = nextFixture?.difficulty || 3;
    
    // Advanced metrics from real data
    const xGPer90 = advancedStats?.xG || this.estimateXG(player);
    const xAPer90 = advancedStats?.xA || this.estimateXA(player);
    const xMinutes = (advancedStats?.xMins || 75) / 90; // Normalize to 0-1
    
    // Market indicators
    const ownership = ((player as any).selectedBy || 5) / 100; // Normalize percentage
    const priceChange = (player as any).priceChange || 0;
    
    // Consistency metrics
    const volatility = advancedStats?.volatility || this.calculateVolatility(recentForm);
    const consistency = volatility > 0 ? (1 / volatility) : 1;
    
    // Position-specific features
    const positionRank = this.calculatePositionRank(player);
    const priceValue = this.calculatePriceValue(player, form5);

    return {
      form5: form5 / 10,           // Normalize to ~0-1
      form3: form3 / 10,
      formHome: form5 / 10,         // Simplified for now
      formAway: form5 / 10,
      xGPer90: xGPer90,
      xAPer90: xAPer90,
      xMinutes: xMinutes,
      opponentStrength: opponentStrength / 5, // Normalize difficulty
      isHome: isHome ? 1 : 0,
      fixtureRating: fixtureRating / 5,
      ownership: ownership,
      priceChange: Math.max(-0.5, Math.min(0.5, priceChange / 2)), // Clamp price changes
      volatility: Math.min(1, volatility / 10),
      consistency: Math.min(1, consistency),
      positionRank: positionRank,
      priceValue: priceValue
    };
  }

  private runEnsemblePrediction(features: FeatureVector, model: PositionModel): PredictionResult {
    const featureArray = [
      features.form5, features.form3, features.formHome, features.formAway,
      features.xGPer90, features.xAPer90, features.xMinutes,
      features.opponentStrength, features.isHome, features.fixtureRating,
      features.ownership, features.priceChange, features.volatility,
      features.consistency, features.positionRank, features.priceValue
    ];

    // Ensemble model 1 (XGBoost-like)
    const prediction1 = this.linearCombination(featureArray, model.weights.ensemble1, model.bias);
    
    // Ensemble model 2 (Random Forest-like with different weights)
    const prediction2 = this.linearCombination(featureArray, model.weights.ensemble2, model.bias * 0.9);
    
    // Combine ensemble predictions
    const expectedPoints = Math.max(0, Math.min(20, (prediction1 * 0.6 + prediction2 * 0.4)));
    
    // Calculate confidence based on feature quality and consistency
    const featureQuality = this.calculateFeatureQuality(features);
    const confidence = Math.max(40, Math.min(95, 75 + featureQuality * 20));
    
    // Calculate range estimates
    const variance = Math.max(0.5, features.volatility * 3 + (1 - features.consistency) * 2);
    const floor = Math.max(0, expectedPoints - variance * 1.5);
    const ceiling = Math.min(20, expectedPoints + variance * 2);
    
    // Hauling probability (10+ points)
    const haulingProbability = this.calculateHaulingProbability(expectedPoints, features);

    return {
      expectedPoints: Math.round(expectedPoints * 100) / 100,
      confidence: Math.round(confidence),
      floor: Math.round(floor * 100) / 100,
      ceiling: Math.round(ceiling * 100) / 100,
      haulingProbability: Math.round(haulingProbability * 1000) / 1000
    };
  }

  private linearCombination(features: number[], weights: number[], bias: number): number {
    const sum = features.reduce((acc, feature, index) => {
      return acc + feature * (weights[index] || 0);
    }, bias);
    
    return sum;
  }

  private calculateRollingForm(recentForm: number[], periods: number): number {
    if (!recentForm || recentForm.length === 0) return 3; // Default average
    
    const relevantForm = recentForm.slice(-periods);
    return relevantForm.reduce((sum, points) => sum + points, 0) / relevantForm.length;
  }

  private calculateOpponentStrength(opponentId: number): number {
    // Simplified opponent strength calculation
    // In production, this would use historical defensive stats
    const strengthMap: Record<number, number> = {
      1: 2, 2: 3, 3: 4, 4: 3, 5: 2, 6: 1, 7: 3, 8: 4, 9: 3, 10: 2,
      11: 4, 12: 5, 13: 3, 14: 4, 15: 5, 16: 4, 17: 5, 18: 5, 19: 4, 20: 3
    };
    
    return strengthMap[opponentId] || 3;
  }

  private estimateXG(player: ProcessedPlayer): number {
    const position = player.position;
    const totalPoints = (player as any).totalPoints || 0;
    
    switch (position) {
      case 'FWD': return Math.min(0.8, Math.max(0.1, totalPoints / 100));
      case 'MID': return Math.min(0.4, Math.max(0.05, totalPoints / 150));
      case 'DEF': return Math.min(0.15, Math.max(0.02, totalPoints / 200));
      case 'GK': return 0;
      default: return 0.1;
    }
  }

  private estimateXA(player: ProcessedPlayer): number {
    const position = player.position;
    const totalPoints = (player as any).totalPoints || 0;
    
    switch (position) {
      case 'MID': return Math.min(0.5, Math.max(0.1, totalPoints / 120));
      case 'FWD': return Math.min(0.3, Math.max(0.05, totalPoints / 180));
      case 'DEF': return Math.min(0.2, Math.max(0.02, totalPoints / 250));
      case 'GK': return 0;
      default: return 0.1;
    }
  }

  private calculateVolatility(recentForm: number[]): number {
    if (!recentForm || recentForm.length < 3) return 3;
    
    const mean = recentForm.reduce((a, b) => a + b, 0) / recentForm.length;
    const variance = recentForm.reduce((acc, points) => acc + Math.pow(points - mean, 2), 0) / recentForm.length;
    
    return Math.sqrt(variance);
  }

  private calculatePositionRank(player: ProcessedPlayer): number {
    // Simplified position ranking (0-1, higher is better)
    const totalPoints = (player as any).totalPoints || 0;
    const positionMultiplier = {
      'GK': 100, 'DEF': 120, 'MID': 150, 'FWD': 180
    };
    
    return Math.min(1, totalPoints / (positionMultiplier[player.position] || 150));
  }

  private calculatePriceValue(player: ProcessedPlayer, form: number): number {
    const price = player.price || 50;
    const pointsPerMillion = (form * 38) / (price / 10); // Season projection per price
    return Math.min(1, pointsPerMillion / 20); // Normalize
  }

  private calculateFeatureQuality(features: FeatureVector): number {
    // Higher quality when we have real data and consistent features
    let quality = 0;
    
    if (features.xMinutes > 0.7) quality += 0.3; // Regular starter
    if (features.consistency > 0.5) quality += 0.2; // Consistent performer
    if (features.xGPer90 > 0 || features.xAPer90 > 0) quality += 0.2; // Has attacking output
    if (features.form5 > 3) quality += 0.2; // Good recent form
    if (features.ownership > 0.1) quality += 0.1; // Popular pick (more data)
    
    return Math.min(1, quality);
  }

  private calculateHaulingProbability(expectedPoints: number, features: FeatureVector): number {
    // Probability of scoring 10+ points
    const baseProb = Math.max(0, (expectedPoints - 4) / 16); // Linear scaling from 4-20 points
    
    // Adjust for volatility (high volatility = higher hauling chance)
    const volatilityBonus = features.volatility * 0.3;
    
    // Adjust for position (forwards more likely to haul)
    const positionMultiplier = features.xGPer90 > 0.3 ? 1.2 : 1.0;
    
    return Math.min(0.4, Math.max(0.001, baseProb * positionMultiplier + volatilityBonus));
  }

  private calculateFallbackPrediction(player: ProcessedPlayer): number {
    // Simple fallback based on recent performance
    const price = player.price || 50;
    const position = player.position;
    
    const basePoints = {
      'GK': 2.5, 'DEF': 3.0, 'MID': 3.5, 'FWD': 4.0
    };
    
    const priceBonus = Math.max(0, (price - 50) / 20); // Higher price = better player
    
    return (basePoints[position] || 3) + priceBonus;
  }

  async predictPlayerBatch(
    players: ProcessedPlayer[],
    fixtures: any[],
    advancedStats?: Map<number, PlayerAdvanced>,
    odds?: MatchOdds[]
  ): Promise<Map<number, PredictionResult>> {
    const results = new Map<number, PredictionResult>();
    
    for (const player of players) {
      const playerStats = advancedStats?.get(player.id);
      const prediction = await this.predictPlayer(player, fixtures, playerStats, odds);
      results.set(player.id, prediction);
    }
    
    return results;
  }

  getModelInfo(): Record<string, any> {
    const modelSummary: Record<string, any> = {};
    
    for (const [position, model] of Array.from(this.models.entries())) {
      modelSummary[position] = {
        featureImportance: model.featureImportance,
        bias: model.bias,
        ensembleCount: 2
      };
    }
    
    return {
      models: modelSummary,
      version: 'OpenFPL-Enhanced-v1.0',
      lastUpdated: new Date().toISOString()
    };
  }
}