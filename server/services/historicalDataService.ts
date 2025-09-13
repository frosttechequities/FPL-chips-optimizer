/**
 * HistoricalDataService - Phase 2 Enhancement
 * 
 * Collects and processes historical FPL data for machine learning training.
 * Maintains historical performance data across multiple seasons for pattern recognition.
 */

import { FPLApiService } from './fplApi';
import { HistoricalPlayerData, MLModelPerformance } from '@shared/schema';

interface HistoricalDataProvider {
  fetchPlayerHistory(playerId: number, seasons: string[]): Promise<HistoricalPlayerData[]>;
  fetchSeasonData(season: string): Promise<any>;
}

class MockHistoricalDataProvider implements HistoricalDataProvider {
  async fetchPlayerHistory(playerId: number, seasons: string[]): Promise<HistoricalPlayerData[]> {
    // Mock historical data for demonstration
    return seasons.map(season => ({
      playerId,
      playerName: `Player ${playerId}`,
      season,
      gameweeks: Array.from({ length: 38 }, (_, i) => ({
        gameweek: i + 1,
        points: Math.max(0, Math.round(Math.random() * 15 + 2)), // 2-17 points
        minutes: Math.random() > 0.8 ? 0 : Math.round(Math.random() * 90 + 10), // 0 or 10-90 mins
        goals: Math.random() > 0.85 ? Math.floor(Math.random() * 3) : 0,
        assists: Math.random() > 0.9 ? Math.floor(Math.random() * 2) : 0,
        cleanSheets: Math.random() > 0.7 ? 1 : 0,
        saves: Math.floor(Math.random() * 8),
        penalties: Math.random() > 0.95 ? 1 : 0,
        yellowCards: Math.random() > 0.9 ? 1 : 0,
        redCards: Math.random() > 0.98 ? 1 : 0,
        ownGoals: Math.random() > 0.99 ? 1 : 0,
        price: 4.5 + Math.random() * 8, // £4.5-12.5m
        ownership: Math.random() * 50, // 0-50% ownership
        captaincy: Math.random() * 20, // 0-20% captaincy
        fixture: {
          opponent: `Team ${Math.floor(Math.random() * 20) + 1}`,
          isHome: Math.random() > 0.5,
          difficulty: Math.floor(Math.random() * 5) + 1
        }
      })),
      aggregatedStats: {
        totalPoints: 0, // Will be calculated
        avgPointsPerGame: 0,
        pointsPerMillion: 0,
        volatility: 0,
        consistency: 0
      }
    }));
  }

  async fetchSeasonData(season: string): Promise<any> {
    return {
      season,
      totalGameweeks: 38,
      avgPointsPerGameweek: 60,
      topScorer: { playerId: 1, points: 285 },
      metadata: {
        lastUpdated: new Date().toISOString()
      }
    };
  }
}

export class HistoricalDataService {
  private static instance: HistoricalDataService;
  private provider: HistoricalDataProvider;
  private cache = new Map<string, HistoricalPlayerData[]>();
  private cacheExpiry = new Map<string, number>();
  private readonly CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours

  private constructor() {
    // Use mock provider for development, real provider in production
    this.provider = new MockHistoricalDataProvider();
  }

  public static getInstance(): HistoricalDataService {
    if (!HistoricalDataService.instance) {
      HistoricalDataService.instance = new HistoricalDataService();
    }
    return HistoricalDataService.instance;
  }

  /**
   * Get historical data for multiple players across specified seasons
   */
  async getPlayersHistory(playerIds: number[], seasons: string[] = ['2023-24', '2022-23']): Promise<Map<number, HistoricalPlayerData[]>> {
    const results = new Map<number, HistoricalPlayerData[]>();

    for (const playerId of playerIds) {
      const cacheKey = `${playerId}_${seasons.join(',')}`;
      
      // Check cache first
      if (this.isCacheValid(cacheKey)) {
        const cached = this.cache.get(cacheKey);
        if (cached) {
          results.set(playerId, cached);
          continue;
        }
      }

      try {
        const history = await this.provider.fetchPlayerHistory(playerId, seasons);
        
        // Process and enrich the historical data
        const processedHistory = this.processHistoricalData(history);
        
        // Cache the results
        this.cache.set(cacheKey, processedHistory);
        this.cacheExpiry.set(cacheKey, Date.now() + this.CACHE_DURATION);
        
        results.set(playerId, processedHistory);
      } catch (error) {
        console.error(`Failed to fetch history for player ${playerId}:`, error);
        // Return empty history on error
        results.set(playerId, []);
      }
    }

    return results;
  }

  /**
   * Process raw historical data to calculate derived metrics
   */
  private processHistoricalData(rawData: HistoricalPlayerData[]): HistoricalPlayerData[] {
    return rawData.map(seasonData => {
      const gameweeks = seasonData.gameweeks;
      const playedGameweeks = gameweeks.filter(gw => gw.minutes > 0);
      
      if (playedGameweeks.length === 0) {
        return seasonData; // No data to process
      }

      // Calculate aggregated statistics
      const totalPoints = gameweeks.reduce((sum, gw) => sum + gw.points, 0);
      const avgPointsPerGame = playedGameweeks.length > 0 ? totalPoints / playedGameweeks.length : 0;
      const avgPrice = gameweeks.reduce((sum, gw) => sum + gw.price, 0) / gameweeks.length;
      const pointsPerMillion = avgPrice > 0 ? avgPointsPerGame / avgPrice : 0;

      // Calculate volatility (standard deviation of points)
      const pointsVariance = playedGameweeks.reduce((sum, gw) => {
        return sum + Math.pow(gw.points - avgPointsPerGame, 2);
      }, 0) / playedGameweeks.length;
      const volatility = Math.sqrt(pointsVariance);

      // Calculate consistency (inverse of coefficient of variation)
      const consistency = avgPointsPerGame > 0 ? 100 - (volatility / avgPointsPerGame * 100) : 0;

      return {
        ...seasonData,
        aggregatedStats: {
          totalPoints,
          avgPointsPerGame,
          pointsPerMillion,
          volatility,
          consistency: Math.max(0, Math.min(100, consistency))
        }
      };
    });
  }

  /**
   * Get training features for ML model from historical data
   */
  async getTrainingFeatures(playerIds: number[], targetGameweeks: number = 5): Promise<Array<{
    playerId: number;
    features: number[];
    target: number; // actual points scored in target period
    metadata: any;
  }>> {
    const historyMap = await this.getPlayersHistory(playerIds);
    const trainingData: Array<any> = [];

    for (const [playerId, history] of Array.from(historyMap.entries())) {
      for (const seasonData of history) {
        const gameweeks = seasonData.gameweeks;
        
        // Create sliding window training examples
        for (let i = 10; i < gameweeks.length - targetGameweeks; i++) {
          const lookbackWindow = gameweeks.slice(i - 10, i); // Look at previous 10 gameweeks
          const targetWindow = gameweeks.slice(i, i + targetGameweeks); // Predict next 5 gameweeks

          const features = this.extractFeatures(lookbackWindow, seasonData);
          const target = targetWindow.reduce((sum: number, gw: any) => sum + gw.points, 0) / targetGameweeks;

          trainingData.push({
            playerId,
            features,
            target,
            metadata: {
              season: seasonData.season,
              startGameweek: i,
              endGameweek: i + targetGameweeks,
              position: this.inferPosition(seasonData),
              avgPrice: lookbackWindow.reduce((sum, gw) => sum + gw.price, 0) / lookbackWindow.length
            }
          });
        }
      }
    }

    return trainingData;
  }

  /**
   * Extract ML features from gameweek data
   */
  private extractFeatures(gameweeks: any[], seasonData: HistoricalPlayerData): number[] {
    const recentGames = gameweeks.slice(-5); // Last 5 games
    const allGames = gameweeks;

    return [
      // Form features (recent performance)
      recentGames.reduce((sum, gw) => sum + gw.points, 0) / recentGames.length, // avg recent points
      recentGames.reduce((sum, gw) => sum + gw.minutes, 0) / recentGames.length, // avg recent minutes
      recentGames.filter(gw => gw.points > 6).length / recentGames.length, // recent return rate
      
      // Season features (overall performance)
      allGames.reduce((sum: number, gw: any) => sum + gw.points, 0) / allGames.length, // avg season points
      allGames.reduce((sum, gw) => sum + gw.minutes, 0) / allGames.length, // avg season minutes
      seasonData.aggregatedStats.volatility, // volatility
      seasonData.aggregatedStats.consistency, // consistency
      
      // Price and ownership features
      recentGames[recentGames.length - 1]?.price || 0, // current price
      recentGames[recentGames.length - 1]?.ownership || 0, // current ownership
      
      // Fixture difficulty (simplified)
      recentGames.reduce((sum, gw) => sum + gw.fixture.difficulty, 0) / recentGames.length, // avg recent FDR
      
      // Goal/assist potential
      allGames.reduce((sum, gw) => sum + gw.goals, 0) / allGames.length, // avg goals
      allGames.reduce((sum, gw) => sum + gw.assists, 0) / allGames.length, // avg assists
    ];
  }

  /**
   * Infer player position from historical data
   */
  private inferPosition(seasonData: HistoricalPlayerData): string {
    const gameweeks = seasonData.gameweeks;
    const avgGoals = gameweeks.reduce((sum, gw) => sum + gw.goals, 0) / gameweeks.length;
    const avgSaves = gameweeks.reduce((sum, gw) => sum + gw.saves, 0) / gameweeks.length;
    const avgCleanSheets = gameweeks.reduce((sum, gw) => sum + gw.cleanSheets, 0) / gameweeks.length;

    if (avgSaves > 1) return 'GK';
    if (avgCleanSheets > 0.3) return 'DEF';
    if (avgGoals > 0.2) return 'FWD';
    return 'MID';
  }

  /**
   * Get model performance metrics
   */
  async getModelPerformance(): Promise<MLModelPerformance[]> {
    // Mock performance data - in real implementation, this would track actual model performance
    return [
      {
        modelId: 'points-predictor-v1',
        modelType: 'regression',
        accuracy: 0.73,
        precision: 0.71,
        recall: 0.69,
        f1Score: 0.70,
        lastTrained: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
        trainingDataSize: 15420,
        features: ['form', 'fixtures', 'price', 'ownership', 'historical', 'position', 'volatility'],
        validationResults: {
          meanAbsoluteError: 2.1,
          rootMeanSquareError: 3.2,
          r2Score: 0.67
        }
      }
    ];
  }

  /**
   * Check if cached data is still valid
   */
  private isCacheValid(key: string): boolean {
    const expiry = this.cacheExpiry.get(key);
    return expiry ? Date.now() < expiry : false;
  }

  /**
   * Clear all cached data
   */
  public clearCache(): void {
    this.cache.clear();
    this.cacheExpiry.clear();
    console.log('Historical data cache cleared');
  }

  /**
   * Get provider information for debugging
   */
  public getProviderInfo(): { name: string; available: boolean } {
    return {
      name: 'mock-historical-data',
      available: true
    };
  }
}