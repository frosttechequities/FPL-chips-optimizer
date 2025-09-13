import { PlayerAdvanced } from "@shared/schema";

// Provider interface for different stats APIs
export interface IStatsProvider {
  name: string;
  getPlayerAdvanced(playerId: number): Promise<PlayerAdvanced | null>;
  getPlayerAdvancedBatch(playerIds: number[]): Promise<PlayerAdvanced[]>;
  isAvailable(): Promise<boolean>;
}

// Mock provider for development and fallback
class MockStatsProvider implements IStatsProvider {
  name = "mock";

  async getPlayerAdvanced(playerId: number): Promise<PlayerAdvanced | null> {
    // Generate realistic mock stats based on player ID (deterministic for consistency)
    const seed = playerId % 1000;
    const position = this.inferPosition(playerId); // Infer from FPL data patterns
    
    // Different baseline stats by position
    let baseXG = 0.1;
    let baseXA = 0.1; 
    let baseXMins = 65;
    let volatility = 3.0;

    switch (position) {
      case 'FWD':
        baseXG = 0.4 + (seed % 20) / 100; // 0.4 to 0.6
        baseXA = 0.2 + (seed % 15) / 100;
        baseXMins = 70 + (seed % 20);
        volatility = 4.5 + (seed % 30) / 10;
        break;
      case 'MID':
        baseXG = 0.15 + (seed % 25) / 100;
        baseXA = 0.3 + (seed % 20) / 100;
        baseXMins = 75 + (seed % 15);
        volatility = 3.5 + (seed % 25) / 10;
        break;
      case 'DEF':
        baseXG = 0.05 + (seed % 10) / 100;
        baseXA = 0.1 + (seed % 15) / 100;
        baseXMins = 80 + (seed % 10);
        volatility = 2.5 + (seed % 20) / 10;
        break;
      case 'GK':
        baseXG = 0;
        baseXA = 0;
        baseXMins = 85 + (seed % 5);
        volatility = 2.0 + (seed % 15) / 10;
        break;
    }

    // Rotation risk assessment
    const role = baseXMins > 80 ? 'nailed' : baseXMins > 60 ? 'rotation' : 'benchwarmer';
    
    // Form trend (based on recent performance - mock)
    const trendSeed = (seed + 50) % 100;
    const formTrend = trendSeed > 70 ? 'rising' : trendSeed < 30 ? 'declining' : 'stable';

    return {
      playerId,
      xG: Math.round(baseXG * 100) / 100,
      xA: Math.round(baseXA * 100) / 100,
      xMins: Math.round(baseXMins),
      role: role as 'nailed' | 'rotation' | 'benchwarmer',
      volatility: Math.round(volatility * 10) / 10,
      formTrend: formTrend as 'rising' | 'stable' | 'declining',
      fixtureAdjustedXG: Math.round(baseXG * (1 + (seed % 20 - 10) / 100) * 100) / 100,
      fixtureAdjustedXA: Math.round(baseXA * (1 + (seed % 20 - 10) / 100) * 100) / 100,
      lastUpdated: new Date().toISOString()
    };
  }

  async getPlayerAdvancedBatch(playerIds: number[]): Promise<PlayerAdvanced[]> {
    return Promise.all(
      playerIds.map(id => this.getPlayerAdvanced(id)).filter(Boolean) as Promise<PlayerAdvanced>[]
    );
  }

  async isAvailable(): Promise<boolean> {
    return true;
  }

  private inferPosition(playerId: number): 'GK' | 'DEF' | 'MID' | 'FWD' {
    // Simple heuristic based on FPL player ID ranges (approximate)
    if (playerId <= 50) return 'GK';
    if (playerId <= 200) return 'DEF';
    if (playerId <= 400) return 'MID';
    return 'FWD';
  }
}

// Service class for advanced stats management
export class StatsService {
  private static instance: StatsService;
  private cache: Map<number, { data: PlayerAdvanced; timestamp: number }> = new Map();
  private readonly cacheExpiry = 60 * 60 * 1000; // 1 hour (stats change less frequently)
  private provider: IStatsProvider;

  constructor(provider?: IStatsProvider) {
    // Use environment variable to determine provider, fallback to mock
    const providerName = process.env.STATS_PROVIDER || 'mock';
    this.provider = provider || this.createProvider(providerName);
  }

  public static getInstance(): StatsService {
    if (!StatsService.instance) {
      StatsService.instance = new StatsService();
    }
    return StatsService.instance;
  }

  private createProvider(providerName: string): IStatsProvider {
    switch (providerName.toLowerCase()) {
      case 'mock':
      default:
        return new MockStatsProvider();
      // Future providers can be added here:
      // case 'understat':
      //   return new UnderstatProvider(process.env.UNDERSTAT_API_KEY!);
      // case 'fbref':
      //   return new FBRefProvider(process.env.FBREF_API_KEY!);
    }
  }

  async getPlayerAdvanced(playerId: number): Promise<PlayerAdvanced | null> {
    // Check cache first
    const cached = this.cache.get(playerId);
    const now = Date.now();
    
    if (cached && (now - cached.timestamp) < this.cacheExpiry) {
      return cached.data;
    }

    try {
      const stats = await this.provider.getPlayerAdvanced(playerId);
      if (stats) {
        this.cache.set(playerId, { data: stats, timestamp: now });
      }
      return stats;
    } catch (error) {
      console.error(`Stats Service Error for player ${playerId}:`, error);
      return null;
    }
  }

  async getPlayerAdvancedBatch(playerIds: number[]): Promise<PlayerAdvanced[]> {
    const now = Date.now();
    const uncachedIds: number[] = [];
    const results: PlayerAdvanced[] = [];

    // Check cache for each player
    for (const playerId of playerIds) {
      const cached = this.cache.get(playerId);
      if (cached && (now - cached.timestamp) < this.cacheExpiry) {
        results.push(cached.data);
      } else {
        uncachedIds.push(playerId);
      }
    }

    // Fetch uncached data
    if (uncachedIds.length > 0) {
      try {
        const freshStats = await this.provider.getPlayerAdvancedBatch(uncachedIds);
        freshStats.forEach(stats => {
          this.cache.set(stats.playerId, { data: stats, timestamp: now });
          results.push(stats);
        });
      } catch (error) {
        console.error('Batch Stats Service Error:', error);
      }
    }

    return results;
  }

  // Calculate historical volatility from FPL data (fallback if not provided by stats)
  static calculateVolatility(gameweekScores: number[]): number {
    if (gameweekScores.length < 3) return 0;
    
    const mean = gameweekScores.reduce((sum, score) => sum + score, 0) / gameweekScores.length;
    const variance = gameweekScores.reduce((sum, score) => sum + Math.pow(score - mean, 2), 0) / gameweekScores.length;
    
    return Math.round(Math.sqrt(variance) * 10) / 10;
  }

  // Calculate form trend from recent performance
  static calculateFormTrend(recentScores: number[]): 'rising' | 'stable' | 'declining' {
    if (recentScores.length < 4) return 'stable';
    
    const firstHalf = recentScores.slice(0, Math.floor(recentScores.length / 2));
    const secondHalf = recentScores.slice(Math.floor(recentScores.length / 2));
    
    const firstAvg = firstHalf.reduce((sum, score) => sum + score, 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((sum, score) => sum + score, 0) / secondHalf.length;
    
    const improvement = secondAvg - firstAvg;
    
    if (improvement > 1.5) return 'rising';
    if (improvement < -1.5) return 'declining';
    return 'stable';
  }

  // Enhance basic player stats with fixture adjustments
  adjustStatsForFixtures(stats: PlayerAdvanced, upcomingFDR: number[]): PlayerAdvanced {
    if (upcomingFDR.length === 0) return stats;
    
    const avgFDR = upcomingFDR.reduce((sum, fdr) => sum + fdr, 0) / upcomingFDR.length;
    
    // Better fixtures (lower FDR) = higher adjusted stats
    const adjustment = (3.5 - avgFDR) * 0.15; // -0.225 to +0.375 multiplier
    
    return {
      ...stats,
      fixtureAdjustedXG: Math.max(0, Math.round((stats.xG * (1 + adjustment)) * 100) / 100),
      fixtureAdjustedXA: Math.max(0, Math.round((stats.xA * (1 + adjustment)) * 100) / 100),
      lastUpdated: new Date().toISOString()
    };
  }

  // Clear cache
  clearCache(): void {
    this.cache.clear();
  }

  // Get provider info
  getProviderInfo(): { name: string; cached: number } {
    return {
      name: this.provider.name,
      cached: this.cache.size
    };
  }
}