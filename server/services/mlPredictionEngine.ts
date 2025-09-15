/**
 * MLPredictionEngine - Phase 2 Enhancement
 * 
 * Machine Learning prediction engine for FPL player performance.
 * Uses historical data and current form to predict future points with confidence intervals.
 */

import { HistoricalDataService } from './historicalDataService';
import { StatsService } from './statsService';
import { OddsService } from './oddsService';
import { OpenFPLEngine } from './openFPLEngine';
import { MonteCarloEngine } from './monteCarloEngine';
import { MLPrediction, MLModelPerformance, ProcessedPlayer } from '@shared/schema';

interface MLModel {
  predict(features: number[]): { prediction: number; confidence: number };
  predictBatch(featuresArray: number[][]): Array<{ prediction: number; confidence: number }>;
  getFeatureImportance(): Record<string, number>;
}

// Simple linear regression model for demonstration
class LinearRegressionModel implements MLModel {
  private weights: number[] = [
    0.35, // form factor
    0.28, // fixture difficulty (inverse)
    0.15, // price factor
    0.10, // ownership factor
    0.25, // historical performance
    0.20, // volatility adjustment
    0.12, // consistency bonus
    -0.08, // injury/rotation risk
  ];
  private bias = 2.1; // baseline points expectation

  predict(features: number[]): { prediction: number; confidence: number } {
    // Linear combination of features
    const rawPrediction = features.reduce((sum, feature, index) => {
      return sum + feature * (this.weights[index] || 0);
    }, this.bias);

    // Apply bounds (0-20 points realistic range)
    const prediction = Math.max(0, Math.min(20, rawPrediction));
    
    // Calculate confidence based on feature stability
    const featureVariance = features.reduce((sum, feature) => sum + Math.pow(feature - 0.5, 2), 0) / features.length;
    const confidence = Math.max(30, Math.min(95, 85 - featureVariance * 100));

    return { prediction, confidence };
  }

  predictBatch(featuresArray: number[][]): Array<{ prediction: number; confidence: number }> {
    return featuresArray.map(features => this.predict(features));
  }

  getFeatureImportance(): Record<string, number> {
    const featureNames = [
      'form', 'fixtures', 'price', 'ownership', 'historical', 
      'volatility', 'consistency', 'riskFactors'
    ];
    
    const importance: Record<string, number> = {};
    this.weights.forEach((weight, index) => {
      if (featureNames[index]) {
        importance[featureNames[index]] = Math.abs(weight);
      }
    });
    
    return importance;
  }
}

// Ensemble model combining multiple approaches
class EnsembleModel implements MLModel {
  private models = [
    new LinearRegressionModel(),
    // Could add more models: RandomForest, XGBoost, etc.
  ];

  predict(features: number[]): { prediction: number; confidence: number } {
    const predictions = this.models.map(model => model.predict(features));
    
    // Weighted average of predictions
    const avgPrediction = predictions.reduce((sum, pred) => sum + pred.prediction, 0) / predictions.length;
    const avgConfidence = predictions.reduce((sum, pred) => sum + pred.confidence, 0) / predictions.length;
    
    // Adjust confidence based on model agreement
    const variance = predictions.reduce((sum, pred) => sum + Math.pow(pred.prediction - avgPrediction, 2), 0) / predictions.length;
    const adjustedConfidence = Math.max(20, avgConfidence - variance * 5);

    return { 
      prediction: avgPrediction, 
      confidence: adjustedConfidence 
    };
  }

  predictBatch(featuresArray: number[][]): Array<{ prediction: number; confidence: number }> {
    return featuresArray.map(features => this.predict(features));
  }

  getFeatureImportance(): Record<string, number> {
    // Average feature importance across all models
    const allImportance = this.models.map(model => model.getFeatureImportance());
    const features = Object.keys(allImportance[0] || {});
    
    const avgImportance: Record<string, number> = {};
    for (const feature of features) {
      avgImportance[feature] = allImportance.reduce((sum, importance) => 
        sum + (importance[feature] || 0), 0) / allImportance.length;
    }
    
    return avgImportance;
  }
}

export class MLPredictionEngine {
  private static instance: MLPredictionEngine;
  private model: MLModel;
  private historicalDataService: HistoricalDataService;
  private statsService: StatsService;
  private oddsService: OddsService;
  private openFPLEngine: OpenFPLEngine;
  private monteCarloEngine: MonteCarloEngine;
  private cache = new Map<string, MLPrediction>();
  private cacheExpiry = new Map<string, number>();
  private readonly CACHE_DURATION = 30 * 60 * 1000; // 30 minutes for enhanced predictions

  private constructor() {
    this.model = new EnsembleModel(); // Use ensemble for better accuracy
    this.historicalDataService = HistoricalDataService.getInstance();
    this.statsService = StatsService.getInstance();
    this.oddsService = OddsService.getInstance();
    this.openFPLEngine = OpenFPLEngine.getInstance();
    this.monteCarloEngine = MonteCarloEngine.getInstance();
  }

  public static getInstance(): MLPredictionEngine {
    if (!MLPredictionEngine.instance) {
      MLPredictionEngine.instance = new MLPredictionEngine();
    }
    return MLPredictionEngine.instance;
  }

  /**
   * Generate ML predictions for a list of players
   */
  async predictPlayers(players: ProcessedPlayer[], gameweeks: number = 5): Promise<MLPrediction[]> {
    const predictions: MLPrediction[] = [];

    // Get historical data for all players
    const playerIds = players.map(p => p.id);
    const historyMap = await this.historicalDataService.getPlayersHistory(playerIds, ['2023-24', '2022-23']);
    
    // Get advanced stats for context
    const advancedStatsList = await this.statsService.getPlayerAdvancedBatch(playerIds);
    const advancedStatsMap = new Map(advancedStatsList.map(stats => [stats.playerId, stats]));

    for (const player of players) {
      const cacheKey = `${player.id}_${gameweeks}_${Date.now() - (Date.now() % (30 * 60 * 1000))}`; // 30min cache buckets
      
      // Check cache first
      if (this.isCacheValid(cacheKey)) {
        const cached = this.cache.get(cacheKey);
        if (cached) {
          predictions.push(cached);
          continue;
        }
      }

      try {
        const prediction = await this.predictSinglePlayer(player, historyMap.get(player.id) || [], advancedStatsMap.get(player.id), gameweeks);
        
        // Cache the prediction
        this.cache.set(cacheKey, prediction);
        this.cacheExpiry.set(cacheKey, Date.now() + this.CACHE_DURATION);
        
        predictions.push(prediction);
      } catch (error) {
        console.error(`ML prediction failed for player ${player.id}:`, error);
        
        // Fallback to simple prediction
        const fallbackPrediction = this.createFallbackPrediction(player, gameweeks);
        predictions.push(fallbackPrediction);
      }
    }

    return predictions;
  }

  /**
   * Enhanced ML prediction using OpenFPL baseline and Monte Carlo simulation
   */
  private async predictSinglePlayer(
    player: ProcessedPlayer, 
    history: any[], 
    advancedStats: any,
    gameweeks: number
  ): Promise<MLPrediction> {
    try {
      // Get baseline fixtures for prediction
      const fixtures = [{ team_h: player.teamId, team_a: 1, difficulty: 3 }]; // Simplified fixture
      
      // Get OpenFPL baseline prediction
      const openFPLPrediction = await this.openFPLEngine.predictPlayer(player, fixtures, advancedStats);
      
      // Get Monte Carlo simulation results
      const monteCarloResult = await this.monteCarloEngine.simulatePlayer(player, fixtures, advancedStats);
      
      // Calculate player consistency (Coefficient of Variation)
      const consistency = this.calculatePlayerConsistency(player, history);
      
      // Get legacy ML features
      const features = await this.extractMLFeatures(player, history, advancedStats);
      const legacyPrediction = this.model.predict(features);
      
      // Create enhanced ensemble prediction
      const ensemble = this.createEnhancedEnsemble(
        openFPLPrediction,
        monteCarloResult,
        legacyPrediction,
        consistency
      );
      
      // Adjust for multiple gameweeks
      const totalPrediction = ensemble.expectedPoints * gameweeks;
      
      return {
        playerId: player.id,
        predictedPoints: totalPrediction,
        confidence: ensemble.confidence,
        floor: ensemble.floor * gameweeks,
        ceiling: ensemble.ceiling * gameweeks,
        modelVersion: 'enhanced-ensemble-v3.0',
        features: {
          ...ensemble.features,
          form: features[0] || 0,
          fixtures: features[1] || 0,
          price: features[2] || 0,
          ownership: features[3] || 0,
          historical: features[4] || 0,
        },
        lastUpdated: new Date().toISOString()
      };
    } catch (error) {
      console.error(`Enhanced prediction failed for player ${player.id}, falling back to legacy:`, error);
      
      // Fallback to legacy prediction
      const features = await this.extractMLFeatures(player, history, advancedStats);
      const { prediction, confidence } = this.model.predict(features);
      
      return {
        playerId: player.id,
        predictedPoints: prediction * gameweeks,
        confidence,
        floor: Math.max(0, prediction * gameweeks - 2),
        ceiling: prediction * gameweeks + 3,
        modelVersion: 'legacy-fallback-v1.0',
        features: {
          form: features[0] || 0,
          fixtures: features[1] || 0,
          price: features[2] || 0,
          ownership: features[3] || 0,
          historical: features[4] || 0,
        },
        lastUpdated: new Date().toISOString()
      };
    }
  }
  
  private createEnhancedEnsemble(
    openFPLPrediction: any,
    monteCarloResult: any,
    legacyPrediction: any,
    consistency: any
  ): any {
    // Weighted ensemble of predictions
    const predictions = [
      { prediction: openFPLPrediction.expectedPoints, confidence: openFPLPrediction.confidence, weight: 0.4 },
      { prediction: monteCarloResult.expectedPoints, confidence: 85, weight: 0.35 },
      { prediction: legacyPrediction.prediction, confidence: legacyPrediction.confidence, weight: 0.25 }
    ];
    
    const weightedPrediction = predictions.reduce((sum, pred) => sum + (pred.prediction * pred.weight), 0);
    
    // Enhanced confidence calculation
    const modelAgreement = this.calculateModelAgreement(predictions.map(p => p.prediction));
    const consistencyBonus = consistency.isConsistent ? 10 : 0;
    const overallConfidence = Math.min(95, 65 + modelAgreement * 25 + consistencyBonus);
    
    return {
      expectedPoints: Math.round(weightedPrediction * 100) / 100,
      confidence: Math.round(overallConfidence),
      floor: monteCarloResult.percentiles?.p10 || Math.max(0, weightedPrediction - 2),
      ceiling: monteCarloResult.percentiles?.p90 || Math.min(20, weightedPrediction + 4),
      features: {
        consistency: consistency.coefficientOfVariation,
        haulingProbability: monteCarloResult.haulingProbability,
        playerArchetype: consistency.archetype,
        openFPLConfidence: openFPLPrediction.confidence,
        monteCarloStdDev: monteCarloResult.standardDeviation
      }
    };
  }
  
  private calculatePlayerConsistency(player: ProcessedPlayer, history: any[]): any {
    const recentHistory = history.find(h => h.season === '2023-24');
    const recentGameweeks = recentHistory?.gameweeks?.slice(-10) || [];
    
    if (recentGameweeks.length < 5) {
      return {
        coefficientOfVariation: 0.5,
        isConsistent: false,
        archetype: 'unknown'
      };
    }
    
    const points = recentGameweeks.map((gw: any) => gw.points || 0);
    const mean = points.reduce((sum: number, p: number) => sum + p, 0) / points.length;
    const variance = points.reduce((sum: number, p: number) => sum + Math.pow(p - mean, 2), 0) / points.length;
    const standardDeviation = Math.sqrt(variance);
    
    const coefficientOfVariation = mean > 0 ? standardDeviation / mean : 1;
    
    let archetype = 'balanced';
    if (coefficientOfVariation < 0.3) {
      archetype = 'consistent';
    } else if (coefficientOfVariation > 0.7) {
      archetype = 'explosive';
    }
    
    return {
      coefficientOfVariation: Math.round(coefficientOfVariation * 1000) / 1000,
      isConsistent: coefficientOfVariation < 0.5,
      archetype,
      mean: Math.round(mean * 100) / 100,
      standardDeviation: Math.round(standardDeviation * 100) / 100
    };
  }
  
  private calculateModelAgreement(predictions: number[]): number {
    if (predictions.length < 2) return 0.5;
    
    const mean = predictions.reduce((sum, pred) => sum + pred, 0) / predictions.length;
    const variance = predictions.reduce((sum, pred) => sum + Math.pow(pred - mean, 2), 0) / predictions.length;
    const standardDeviation = Math.sqrt(variance);
    
    return Math.max(0, 1 - (standardDeviation / 5));
  }

  /**
   * Extract normalized features for ML model
   */
  private async extractMLFeatures(player: ProcessedPlayer, history: any[], advancedStats: any): Promise<number[]> {
    const currentSeason = history.find(h => h.season === '2023-24');
    const recentGameweeks = currentSeason?.gameweeks.slice(-10) || [];
    
    // Form factor (0-1)
    const recentPoints = recentGameweeks.length > 0 
      ? recentGameweeks.reduce((sum: number, gw: any) => sum + gw.points, 0) / recentGameweeks.length 
      : player.points;
    const formFactor = Math.min(1, recentPoints / 10); // Normalize to 0-1
    
    // Fixture difficulty factor (0-1, lower FDR = higher factor)
    const recentFDR = recentGameweeks.length > 0 
      ? recentGameweeks.reduce((sum: number, gw: any) => sum + gw.fixture.difficulty, 0) / recentGameweeks.length 
      : 3;
    const fixtureFactor = (6 - recentFDR) / 5; // Invert and normalize
    
    // Price efficiency factor (0-1)
    const priceEfficiency = Math.min(1, recentPoints / (player.price || 1));
    
    // Ownership factor (0-1)
    const ownershipFactor = Math.min(1, (recentGameweeks[recentGameweeks.length - 1]?.ownership || 10) / 50);
    
    // Historical performance factor (0-1)
    const historicalFactor = currentSeason 
      ? Math.min(1, currentSeason.aggregatedStats.avgPointsPerGame / 8)
      : formFactor;
    
    // Volatility adjustment (0-1)
    const volatilityFactor = currentSeason 
      ? Math.max(0, 1 - (currentSeason.aggregatedStats.volatility / 10))
      : 0.5;
    
    // Consistency bonus (0-1)
    const consistencyFactor = currentSeason 
      ? currentSeason.aggregatedStats.consistency / 100
      : 0.5;
    
    // Risk adjustment (0-1, higher risk = lower factor)
    const riskFactor = advancedStats 
      ? Math.max(0, 1 - (advancedStats.volatility || 0))
      : 0.7;

    return [
      formFactor,
      fixtureFactor,
      priceEfficiency,
      ownershipFactor,
      historicalFactor,
      volatilityFactor,
      consistencyFactor,
      riskFactor
    ];
  }

  /**
   * Calculate risk factors for a player
   */
  private calculateRiskFactors(player: ProcessedPlayer, history: any[], advancedStats: any): {
    injuryRisk: number;
    rotationRisk: number;
    priceDrop: number;
  } {
    const currentSeason = history.find(h => h.season === '2023-24');
    const recentGameweeks = currentSeason?.gameweeks.slice(-10) || [];
    
    // Injury risk based on recent minutes and historical patterns
    const avgMinutes = recentGameweeks.length > 0 
      ? recentGameweeks.reduce((sum: number, gw: any) => sum + gw.minutes, 0) / recentGameweeks.length 
      : 60;
    const injuryRisk = Math.max(0, Math.min(1, (90 - avgMinutes) / 90));
    
    // Rotation risk based on playing time consistency and role
    const minutesVariance = recentGameweeks.length > 1 
      ? recentGameweeks.reduce((sum: number, gw: any) => sum + Math.pow(gw.minutes - avgMinutes, 2), 0) / recentGameweeks.length
      : 0;
    const rotationRisk = advancedStats?.role === 'rotation' ? 0.6 : Math.min(0.8, minutesVariance / 1000);
    
    // Price drop risk based on form and ownership
    const formTrend = recentGameweeks.length >= 5 
      ? (recentGameweeks.slice(-3).reduce((s: number, gw: any) => s + gw.points, 0) / 3) -
        (recentGameweeks.slice(0, 3).reduce((s: number, gw: any) => s + gw.points, 0) / 3)
      : 0;
    const priceDrop = formTrend < -2 ? 0.7 : Math.max(0, 0.3 - formTrend / 10);

    return {
      injuryRisk: Math.round(injuryRisk * 100) / 100,
      rotationRisk: Math.round(rotationRisk * 100) / 100,
      priceDrop: Math.round(priceDrop * 100) / 100
    };
  }

  /**
   * Create fallback prediction when ML fails
   */
  private createFallbackPrediction(player: ProcessedPlayer, gameweeks: number): MLPrediction {
    const basicPrediction = (player.expectedPoints || player.points || 2) * gameweeks;
    
    return {
      playerId: player.id,
      predictedPoints: basicPrediction,
      confidence: 40, // Low confidence for fallback
      modelVersion: 'fallback-v1.0',
      features: {
        form: 0.5,
        fixtures: 0.5,
        price: 0.5,
        ownership: 0.5,
        historical: 0.5,
      },
      riskFactors: {
        injuryRisk: 0.3,
        rotationRisk: 0.4,
        priceDrop: 0.2
      },
      lastUpdated: new Date().toISOString()
    };
  }

  /**
   * Get model performance metrics
   */
  async getModelPerformance(): Promise<MLModelPerformance[]> {
    return this.historicalDataService.getModelPerformance();
  }

  /**
   * Get feature importance for the current model
   */
  getFeatureImportance(): Record<string, number> {
    return this.model.getFeatureImportance();
  }

  /**
   * Retrain model with new data (placeholder for future implementation)
   */
  async retrainModel(newData?: any[]): Promise<void> {
    console.log('Model retraining triggered - not implemented in current version');
    // In a real implementation, this would:
    // 1. Fetch latest historical data
    // 2. Prepare training features and targets
    // 3. Train new model weights
    // 4. Validate model performance
    // 5. Replace current model if performance improves
  }

  /**
   * Check if cached prediction is still valid
   */
  private isCacheValid(key: string): boolean {
    const expiry = this.cacheExpiry.get(key);
    return expiry ? Date.now() < expiry : false;
  }

  /**
   * Clear prediction cache
   */
  public clearCache(): void {
    this.cache.clear();
    this.cacheExpiry.clear();
    console.log('ML prediction cache cleared');
  }

  /**
   * Get engine information for debugging
   */
  public getEngineInfo(): { 
    modelType: string; 
    available: boolean; 
    cacheSize: number;
    featureCount: number;
  } {
    return {
      modelType: 'ensemble',
      available: true,
      cacheSize: this.cache.size,
      featureCount: Object.keys(this.model.getFeatureImportance()).length
    };
  }
}